import os
import json
import math
from typing import Dict, Any

import pandas as pd
import xgboost as xgb

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
import uvicorn


# ============================================================
# ZOKASCORE V2 - ML PREDICTION API
#
# PURPOSE:
#   Single inference service for:
#
#       1X2
#       O/U 0.5
#       O/U 1.5
#       O/U 2.5
#       O/U 3.5
#       BTTS
#
# PROTECTED:
#       Pipeline 41 1X2 champion
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_DIR = os.path.join(
    "data",
    "ml"
)

EWMA_STATE_FILE = os.path.join(
    MODEL_DIR,
    "ewma_state.json"
)


# ============================================================
# FEATURE CONTRACT
# ============================================================

FEATURE_COLUMNS = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

    "home_ewma_points",
    "away_ewma_points",

    "home_ewma_gd",
    "away_ewma_gd",

    "home_ewma_gf",
    "away_ewma_gf",

    "home_ewma_ga",
    "away_ewma_ga",

    "home_ewma_home_points",
    "away_ewma_away_points",

    "home_ewma_home_gd",
    "away_ewma_away_gd",

    "home_ewma_home_gf",
    "away_ewma_away_gf",

    "home_ewma_home_ga",
    "away_ewma_away_ga",

    "home_matches_before",
    "away_matches_before",

    "home_home_matches_before",
    "away_away_matches_before"
]


# ============================================================
# EXPLICIT MODEL REGISTRY
#
# DO NOT blindly load every market_*.json file.
# ============================================================

MODEL_DEFINITIONS = {

    "1x2": {
        "model": "zokascore_v2_model.json",
        "mapping": "label_mapping.json",
        "description": "Pipeline 41 1X2 Champion"
    },

    "ou_0_5": {
        "model": "market_ou_0_5_model.json",
        "mapping": "market_ou_0_5_label_mapping.json",
        "description": "Over/Under 0.5 Goals"
    },

    "ou_1_5": {
        "model": "market_ou_1_5_model.json",
        "mapping": "market_ou_1_5_label_mapping.json",
        "description": "Over/Under 1.5 Goals"
    },

    "ou_2_5": {
        "model": "market_ou_2_5_model.json",
        "mapping": "market_ou_2_5_label_mapping.json",
        "description": "Over/Under 2.5 Goals"
    },

    "ou_3_5": {
        "model": "market_ou_3_5_model.json",
        "mapping": "market_ou_3_5_label_mapping.json",
        "description": "Over/Under 3.5 Goals"
    },

    "btts": {
        "model": "market_btts_model.json",
        "mapping": "market_btts_label_mapping.json",
        "description": "Both Teams To Score"
    }
}


# ============================================================
# EXPECTED CLASSES
# ============================================================

EXPECTED_CLASSES = {

    "1x2": {
        "HOME_WIN",
        "DRAW",
        "AWAY_WIN"
    },

    "ou_0_5": {
        "OVER",
        "UNDER"
    },

    "ou_1_5": {
        "OVER",
        "UNDER"
    },

    "ou_2_5": {
        "OVER",
        "UNDER"
    },

    "ou_3_5": {
        "OVER",
        "UNDER"
    },

    "btts": {
        "YES",
        "NO"
    }
}


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="ZOKASCORE V2 ML Engine",
    version="2.0.0",
    description=(
        "ZOKASCORE unified football prediction engine "
        "for 1X2, O/U and BTTS markets."
    )
)


# ============================================================
# GLOBAL STATE
# ============================================================

ewma_state: Dict[str, Dict[str, Any]] = {}

model_registry: Dict[str, Dict[str, Any]] = {}

engine_status = {
    "ready": False,
    "models_loaded": 0,
    "teams_loaded": 0
}


# ============================================================
# HELPERS
# ============================================================

def artifact_path(filename: str) -> str:
    return os.path.join(
        MODEL_DIR,
        filename
    )


def require_file(path: str, description: str):
    if not os.path.isfile(path):
        raise RuntimeError(
            f"{description} not found: {path}"
        )

    if os.path.getsize(path) <= 0:
        raise RuntimeError(
            f"{description} is empty: {path}"
        )


def validate_mapping(
    market_name: str,
    mapping: Dict[str, Any]
):
    if not mapping:
        raise RuntimeError(
            f"{market_name}: empty label mapping."
        )

    classes = set(
        str(value)
        for value in mapping.values()
    )

    expected = EXPECTED_CLASSES.get(
        market_name
    )

    if expected is None:
        raise RuntimeError(
            f"No expected class definition for "
            f"{market_name}"
        )

    if classes != expected:
        raise RuntimeError(
            f"{market_name}: invalid classes. "
            f"Expected {sorted(expected)}, "
            f"got {sorted(classes)}"
        )


def load_model_artifact(
    market_name: str,
    definition: Dict[str, str]
):
    model_file = artifact_path(
        definition["model"]
    )

    mapping_file = artifact_path(
        definition["mapping"]
    )

    require_file(
        model_file,
        f"{market_name} model"
    )

    require_file(
        mapping_file,
        f"{market_name} mapping"
    )

    model = xgb.XGBClassifier()

    model.load_model(
        model_file
    )

    with open(
        mapping_file,
        "r",
        encoding="utf-8"
    ) as f:
        mapping = json.load(f)

    validate_mapping(
        market_name,
        mapping
    )

    # Verify the model can expose probabilities.
    if not hasattr(
        model,
        "predict_proba"
    ):
        raise RuntimeError(
            f"{market_name}: model does not "
            "support probability inference."
        )

    return {
        "model": model,
        "mapping": mapping,
        "model_file": model_file,
        "mapping_file": mapping_file,
        "description": definition["description"]
    }


def build_features(
    home_state: Dict[str, Any],
    away_state: Dict[str, Any]
) -> pd.DataFrame:

    required_home = [
        "elo",
        "overall_points",
        "overall_gd",
        "overall_gf",
        "overall_ga",
        "home_points",
        "home_gd",
        "home_gf",
        "home_ga",
        "matches_played",
        "home_matches_played"
    ]

    required_away = [
        "elo",
        "overall_points",
        "overall_gd",
        "overall_gf",
        "overall_ga",
        "away_points",
        "away_gd",
        "away_gf",
        "away_ga",
        "matches_played",
        "away_matches_played"
    ]

    missing_home = [
        key
        for key in required_home
        if key not in home_state
    ]

    missing_away = [
        key
        for key in required_away
        if key not in away_state
    ]

    if missing_home:
        raise ValueError(
            "Home team state missing fields: "
            + ", ".join(missing_home)
        )

    if missing_away:
        raise ValueError(
            "Away team state missing fields: "
            + ", ".join(missing_away)
        )


    home_elo = float(
        home_state["elo"]
    )

    away_elo = float(
        away_state["elo"]
    )


    features = {

        "home_elo_pre":
            home_elo,

        "away_elo_pre":
            away_elo,

        "elo_diff":
            home_elo - away_elo,


        "home_ewma_points":
            float(home_state["overall_points"]),

        "away_ewma_points":
            float(away_state["overall_points"]),


        "home_ewma_gd":
            float(home_state["overall_gd"]),

        "away_ewma_gd":
            float(away_state["overall_gd"]),


        "home_ewma_gf":
            float(home_state["overall_gf"]),

        "away_ewma_gf":
            float(away_state["overall_gf"]),


        "home_ewma_ga":
            float(home_state["overall_ga"]),

        "away_ewma_ga":
            float(away_state["overall_ga"]),


        "home_ewma_home_points":
            float(home_state["home_points"]),

        "away_ewma_away_points":
            float(away_state["away_points"]),


        "home_ewma_home_gd":
            float(home_state["home_gd"]),

        "away_ewma_away_gd":
            float(away_state["away_gd"]),


        "home_ewma_home_gf":
            float(home_state["home_gf"]),

        "away_ewma_away_gf":
            float(away_state["away_gf"]),


        "home_ewma_home_ga":
            float(home_state["home_ga"]),

        "away_ewma_away_ga":
            float(away_state["away_ga"]),


        "home_matches_before":
            float(home_state["matches_played"]),

        "away_matches_before":
            float(away_state["matches_played"]),


        "home_home_matches_before":
            float(home_state["home_matches_played"]),

        "away_away_matches_before":
            float(away_state["away_matches_played"])
    }


    # --------------------------------------------------------
    # FINITE VALUE CHECK
    # --------------------------------------------------------

    for key, value in features.items():

        if not math.isfinite(value):
            raise ValueError(
                f"Non-finite feature: "
                f"{key}={value}"
            )


    # --------------------------------------------------------
    # EXACT FEATURE ORDER
    # --------------------------------------------------------

    X_live = pd.DataFrame(
        [features],
        columns=FEATURE_COLUMNS
    )

    return X_live


def run_market_prediction(
    market_name: str,
    X_live: pd.DataFrame
):

    registry_entry = model_registry.get(
        market_name
    )

    if registry_entry is None:
        raise RuntimeError(
            f"Model not loaded: {market_name}"
        )

    model = registry_entry["model"]
    mapping = registry_entry["mapping"]

    probabilities = model.predict_proba(
        X_live
    )[0]

    if len(probabilities) != len(mapping):
        raise RuntimeError(
            f"{market_name}: probability/mapping "
            "size mismatch."
        )


    output = {}

    for index, probability in enumerate(
        probabilities
    ):

        label = mapping.get(
            str(index)
        )

        if label is None:
            raise RuntimeError(
                f"{market_name}: missing mapping "
                f"for class index {index}."
            )

        probability = float(
            probability
        )

        if not math.isfinite(
            probability
        ):
            raise RuntimeError(
                f"{market_name}: non-finite "
                "probability."
            )

        output[label] = probability


    total = sum(
        output.values()
    )

    if not math.isfinite(total) or total <= 0:
        raise RuntimeError(
            f"{market_name}: invalid probability sum."
        )


    # Defensive normalization.
    output = {
        label: probability / total
        for label, probability
        in output.items()
    }


    pick = max(
        output,
        key=output.get
    )


    return {
        "probabilities": output,
        "pick": pick,
        "pick_probability": output[pick]
    }


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
def load_artifacts():

    global ewma_state
    global model_registry
    global engine_status


    print()
    print("🧠 ZOKASCORE V2 - ML ENGINE")
    print("=" * 60)


    # --------------------------------------------------------
    # MODEL DIRECTORY
    # --------------------------------------------------------

    if not os.path.isdir(
        MODEL_DIR
    ):
        raise RuntimeError(
            f"ML model directory not found: "
            f"{MODEL_DIR}"
        )


    # --------------------------------------------------------
    # LOAD EWMA/ELO STATE
    # --------------------------------------------------------

    print(
        "\n⚙️ Loading live ELO/EWMA state..."
    )

    require_file(
        EWMA_STATE_FILE,
        "EWMA state"
    )

    with open(
        EWMA_STATE_FILE,
        "r",
        encoding="utf-8"
    ) as f:
        ewma_state = json.load(f)


    if not isinstance(
        ewma_state,
        dict
    ):
        raise RuntimeError(
            "EWMA state must be a JSON object."
        )


    print(
        f"   ✅ Loaded state for "
        f"{len(ewma_state):,} teams."
    )


    # --------------------------------------------------------
    # LOAD ALL APPROVED MODELS
    # --------------------------------------------------------

    print(
        "\n⚙️ Loading approved prediction models..."
    )

    model_registry = {}


    for market_name, definition in (
        MODEL_DEFINITIONS.items()
    ):

        print(
            f"   Loading {market_name.upper()}..."
        )

        model_registry[
            market_name
        ] = load_model_artifact(
            market_name,
            definition
        )

        print(
            f"      ✅ "
            f"{definition['description']}"
        )


    # --------------------------------------------------------
    # FINAL REGISTRY CHECK
    # --------------------------------------------------------

    expected_markets = set(
        MODEL_DEFINITIONS.keys()
    )

    loaded_markets = set(
        model_registry.keys()
    )

    if loaded_markets != expected_markets:

        missing = (
            expected_markets
            - loaded_markets
        )

        raise RuntimeError(
            "Model registry incomplete. "
            f"Missing: {sorted(missing)}"
        )


    engine_status = {
        "ready": True,
        "models_loaded": len(
            model_registry
        ),
        "teams_loaded": len(
            ewma_state
        )
    }


    print()
    print(
        f"✅ ML Engine ready."
    )

    print(
        f"   Models loaded: "
        f"{len(model_registry)}"
    )

    print(
        f"   Teams loaded: "
        f"{len(ewma_state):,}"
    )

    print(
        "   Markets: "
        + ", ".join(
            sorted(model_registry.keys())
        )
    )

    print(
        "=" * 60
    )
    print()


# ============================================================
# HEALTH ENDPOINT
# ============================================================

@app.get("/health")
def health():

    return {
        "engine": "ZOKASCORE_V2",
        "status": (
            "ready"
            if engine_status["ready"]
            else "not_ready"
        ),
        "models_loaded":
            engine_status["models_loaded"],
        "teams_loaded":
            engine_status["teams_loaded"],
        "markets":
            list(model_registry.keys())
    }


# ============================================================
# PREDICTION ENDPOINT
# ============================================================

@app.get("/predict")
def predict(
    home: str = Query(
        ...,
        min_length=1
    ),
    away: str = Query(
        ...,
        min_length=1
    )
):

    if not engine_status["ready"]:
        raise HTTPException(
            status_code=503,
            detail="ML engine is not ready."
        )


    home = str(home).strip()
    away = str(away).strip()


    if not home or not away:
        raise HTTPException(
            status_code=400,
            detail="Home and Away team IDs are required."
        )


    if home == away:
        raise HTTPException(
            status_code=400,
            detail=(
                "Home and Away teams "
                "cannot be the same."
            )
        )


    # --------------------------------------------------------
    # TEAM LOOKUP
    # --------------------------------------------------------

    home_state = ewma_state.get(
        home
    )

    away_state = ewma_state.get(
        away
    )


    if home_state is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Home team {home} "
                "not found in ML state."
            )
        )


    if away_state is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Away team {away} "
                "not found in ML state."
            )
        )


    # --------------------------------------------------------
    # FEATURE CONSTRUCTION
    # --------------------------------------------------------

    try:

        X_live = build_features(
            home_state,
            away_state
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Feature construction failed: "
                f"{exc}"
            )
        )


    # --------------------------------------------------------
    # INFERENCE
    # --------------------------------------------------------

    markets = {}


    try:

        for market_name in (
            MODEL_DEFINITIONS.keys()
        ):

            markets[
                market_name
            ] = run_market_prediction(
                market_name,
                X_live
            )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Model inference failed: "
                f"{exc}"
            )
        )


    # --------------------------------------------------------
    # STATE SUMMARY
    # --------------------------------------------------------

    home_elo = float(
        home_state["elo"]
    )

    away_elo = float(
        away_state["elo"]
    )


    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {
        "engine": "ZOKASCORE_V2",
        "version": "2.0.0",
        "status": "live_inference",

        "match": {
            "home_team_id": home,
            "away_team_id": away
        },

        "state": {
            "home_elo": home_elo,
            "away_elo": away_elo,
            "elo_diff":
                home_elo - away_elo
        },

        "markets": markets,

        "features": {
            key: float(
                X_live.iloc[0][key]
            )
            for key in FEATURE_COLUMNS
        }
    }


# ============================================================
# SERVER
# ============================================================

if __name__ == "__main__":

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )