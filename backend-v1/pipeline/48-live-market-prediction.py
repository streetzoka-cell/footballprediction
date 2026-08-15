import os
import json
import math
import pandas as pd
import xgboost as xgb

# ============================================================
# ZOKASCORE V2 - PIPELINE 48
# UNIFIED LIVE MARKET PREDICTION ENGINE
# ============================================================

MODEL_DIR = os.path.join("data", "ml")

# ------------------------------------------------------------
# ARTIFACTS
# ------------------------------------------------------------

MODEL_1X2 = os.path.join(
    MODEL_DIR, "zokascore_v2_model.json"
)
MAP_1X2 = os.path.join(
    MODEL_DIR, "label_mapping.json"
)

MODEL_OU = os.path.join(
    MODEL_DIR, "market_ou_2_5_model.json"
)
MAP_OU = os.path.join(
    MODEL_DIR, "market_ou_2_5_label_mapping.json"
)

MODEL_BTTS = os.path.join(
    MODEL_DIR, "market_btts_model.json"
)
MAP_BTTS = os.path.join(
    MODEL_DIR, "market_btts_label_mapping.json"
)

EWMA_STATE_FILE = os.path.join(
    MODEL_DIR, "ewma_state.json"
)

# ------------------------------------------------------------
# EXACT PIPELINE 41 FEATURE CONTRACT
# ------------------------------------------------------------

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

EXPECTED_FEATURE_COUNT = 23

# ------------------------------------------------------------
# TEST MATCH
# ------------------------------------------------------------

HOME_TEAM_ID = "11"
AWAY_TEAM_ID = "418"

# ============================================================
# HELPERS
# ============================================================

def require_file(path, description):
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"{description} not found: {path}"
        )


def load_json(path, description):
    require_file(path, description)

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{description} contains invalid JSON: {path}"
        ) from exc


def validate_mapping(mapping, required_labels, name):
    if not isinstance(mapping, dict):
        raise ValueError(
            f"{name} must be a JSON object."
        )

    values = set(mapping.values())

    missing = set(required_labels) - values

    if missing:
        raise ValueError(
            f"{name} missing labels: {sorted(missing)}"
        )

    expected_indices = {"0", "1"}

    if set(mapping.keys()) != expected_indices and len(mapping) != 3:
        raise ValueError(
            f"{name} has unexpected class mapping: {mapping}"
        )


def probability_dict(probabilities, mapping):
    result = {}

    for i, probability in enumerate(probabilities):
        key = str(i)

        if key not in mapping:
            raise ValueError(
                f"Probability index {i} missing from label mapping."
            )

        value = float(probability)

        if not math.isfinite(value):
            raise ValueError(
                f"Non-finite probability for class {mapping[key]}."
            )

        result[mapping[key]] = value

    total = sum(result.values())

    if not math.isfinite(total) or total <= 0:
        raise ValueError(
            "Invalid probability distribution."
        )

    # Normalize defensively against tiny floating-point drift.
    result = {
        label: value / total
        for label, value in result.items()
    }

    return result


def validate_team_state(state, team_id, venue):
    required = [
        "elo",
        "overall_points",
        "overall_gd",
        "overall_gf",
        "overall_ga",
        "matches_played"
    ]

    if venue == "home":
        required.extend([
            "home_points",
            "home_gd",
            "home_gf",
            "home_ga",
            "home_matches_played"
        ])

    elif venue == "away":
        required.extend([
            "away_points",
            "away_gd",
            "away_gf",
            "away_ga",
            "away_matches_played"
        ])

    missing = [
        key for key in required
        if key not in state
    ]

    if missing:
        raise ValueError(
            f"Team {team_id} state missing fields: {missing}"
        )

    for key in required:
        value = state[key]

        if not isinstance(value, (int, float)):
            raise ValueError(
                f"Team {team_id} field '{key}' is not numeric."
            )

        if not math.isfinite(float(value)):
            raise ValueError(
                f"Team {team_id} field '{key}' is not finite."
            )


# ============================================================
# START
# ============================================================

print(
    "🧠 ZOKASCORE V2 - Pipeline 48: "
    "Unified Live Market Prediction"
)
print("=" * 60)
print()

# ============================================================
# 1. ARTIFACT VALIDATION
# ============================================================

print("🔍 Checking deployment artifacts...")

required_artifacts = [
    (MODEL_1X2, "Pipeline 41 1X2 champion"),
    (MAP_1X2, "1X2 label mapping"),
    (MODEL_OU, "O/U 2.5 model"),
    (MAP_OU, "O/U 2.5 label mapping"),
    (MODEL_BTTS, "BTTS model"),
    (MAP_BTTS, "BTTS label mapping"),
    (EWMA_STATE_FILE, "live ELO/EWMA state")
]

for path, description in required_artifacts:
    require_file(path, description)
    print(f"   ✅ {description}: {path}")

# ============================================================
# 2. LOAD MODELS
# ============================================================

print("\n⚙️ Loading prediction models...")

model_1x2 = xgb.XGBClassifier()
model_1x2.load_model(MODEL_1X2)

print("   ✅ Pipeline 41 1X2 champion loaded.")

model_ou = xgb.XGBClassifier()
model_ou.load_model(MODEL_OU)

print("   ✅ O/U 2.5 model loaded.")

model_btts = xgb.XGBClassifier()
model_btts.load_model(MODEL_BTTS)

print("   ✅ BTTS model loaded.")

# ============================================================
# 3. LOAD STATE + LABEL MAPPINGS
# ============================================================

print("\n⚙️ Loading live state and mappings...")

ewma_state = load_json(
    EWMA_STATE_FILE,
    "Live ELO/EWMA state"
)

map_1x2 = load_json(
    MAP_1X2,
    "1X2 label mapping"
)

map_ou = load_json(
    MAP_OU,
    "O/U 2.5 label mapping"
)

map_btts = load_json(
    MAP_BTTS,
    "BTTS label mapping"
)

validate_mapping(
    map_1x2,
    ["HOME_WIN", "DRAW", "AWAY_WIN"],
    "1X2 mapping"
)

validate_mapping(
    map_ou,
    ["OVER", "UNDER"],
    "O/U mapping"
)

validate_mapping(
    map_btts,
    ["YES", "NO"],
    "BTTS mapping"
)

print(
    f"   ✅ Loaded state for "
    f"{len(ewma_state):,} teams."
)

print("   ✅ All label mappings validated.")

# ============================================================
# 4. MATCH
# ============================================================

print("\n⚽ MATCH")
print("-" * 60)
print(f"   Home: Team {HOME_TEAM_ID}")
print(f"   Away: Team {AWAY_TEAM_ID}")

if HOME_TEAM_ID == AWAY_TEAM_ID:
    raise ValueError(
        "Home and away team IDs cannot be identical."
    )

# ============================================================
# 5. RETRIEVE TEAM STATES
# ============================================================

home_state = ewma_state.get(HOME_TEAM_ID)
away_state = ewma_state.get(AWAY_TEAM_ID)

if home_state is None:
    raise ValueError(
        f"Home team {HOME_TEAM_ID} "
        "not found in ewma_state.json"
    )

if away_state is None:
    raise ValueError(
        f"Away team {AWAY_TEAM_ID} "
        "not found in ewma_state.json"
    )

validate_team_state(
    home_state,
    HOME_TEAM_ID,
    "home"
)

validate_team_state(
    away_state,
    AWAY_TEAM_ID,
    "away"
)

print("\n📦 TEAM STATES")
print("-" * 60)

print(
    f"   Home ELO: {home_state['elo']:.2f} | "
    f"Matches: {home_state['matches_played']}"
)

print(
    f"   Away ELO: {away_state['elo']:.2f} | "
    f"Matches: {away_state['matches_played']}"
)

# ============================================================
# 6. CONSTRUCT EXACT MODEL FEATURES
# ============================================================

home_elo = float(home_state["elo"])
away_elo = float(away_state["elo"])

features = {
    "home_elo_pre": home_elo,
    "away_elo_pre": away_elo,
    "elo_diff": home_elo - away_elo,

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

if len(features) != EXPECTED_FEATURE_COUNT:
    raise ValueError(
        f"Feature count mismatch: "
        f"{len(features)} vs expected "
        f"{EXPECTED_FEATURE_COUNT}"
    )

missing_features = [
    feature
    for feature in FEATURE_COLUMNS
    if feature not in features
]

if missing_features:
    raise ValueError(
        f"Missing features: {missing_features}"
    )

X_live = pd.DataFrame(
    [features],
    columns=FEATURE_COLUMNS
)

if X_live.shape != (1, EXPECTED_FEATURE_COUNT):
    raise ValueError(
        f"Unexpected live feature shape: "
        f"{X_live.shape}"
    )

if not X_live.map(lambda value: math.isfinite(float(value))).all().all():
    raise ValueError(
        "Live feature vector contains "
        "non-finite values."
    )

print("\n🧩 FEATURES")
print("-" * 60)
print(
    f"   ✅ Generated {len(features)} / "
    f"{EXPECTED_FEATURE_COUNT} features"
)
print("   ✅ Feature order matches Pipeline 41")
print("   ✅ All values finite")

# ============================================================
# 7. MODEL INFERENCE
# ============================================================

print("\n⚡ Running unified model inference...")

prob_1x2 = model_1x2.predict_proba(X_live)[0]
prob_ou = model_ou.predict_proba(X_live)[0]
prob_btts = model_btts.predict_proba(X_live)[0]

# ============================================================
# 8. MAP PROBABILITIES
# ============================================================

res_1x2 = probability_dict(
    prob_1x2,
    map_1x2
)

res_ou = probability_dict(
    prob_ou,
    map_ou
)

res_btts = probability_dict(
    prob_btts,
    map_btts
)

# ============================================================
# 9. DETERMINE PICKS
# ============================================================

pick_1x2 = max(
    res_1x2,
    key=res_1x2.get
)

pick_ou = max(
    res_ou,
    key=res_ou.get
)

pick_btts = max(
    res_btts,
    key=res_btts.get
)

# ============================================================
# 10. DISPLAY
# ============================================================

print("\n" + "=" * 60)
print("📊 ZOKASCORE V2 UNIFIED PREDICTION")
print("=" * 60)

print("\n🏆 1X2")
print(
    f"   🏠 HOME WIN: "
    f"{res_1x2['HOME_WIN'] * 100:5.1f}%"
)
print(
    f"   🤝 DRAW:     "
    f"{res_1x2['DRAW'] * 100:5.1f}%"
)
print(
    f"   ✈️ AWAY WIN: "
    f"{res_1x2['AWAY_WIN'] * 100:5.1f}%"
)
print(
    f"   🎯 PICK: {pick_1x2}"
)

print("\n⚽ OVER / UNDER 2.5")
print(
    f"   🔼 OVER:  "
    f"{res_ou['OVER'] * 100:5.1f}%"
)
print(
    f"   🔽 UNDER: "
    f"{res_ou['UNDER'] * 100:5.1f}%"
)
print(
    f"   🎯 PICK: {pick_ou}"
)

print("\n🥅 BTTS")
print(
    f"   ✅ YES: "
    f"{res_btts['YES'] * 100:5.1f}%"
)
print(
    f"   ❌ NO:  "
    f"{res_btts['NO'] * 100:5.1f}%"
)
print(
    f"   🎯 PICK: {pick_btts}"
)

# ============================================================
# 11. UNIFIED API-READY OUTPUT
# ============================================================

unified_output = {
    "engine": "ZOKASCORE_V2",
    "pipeline": "48",
    "status": "live_inference",

    "match": {
        "home_team_id": HOME_TEAM_ID,
        "away_team_id": AWAY_TEAM_ID
    },

    "state": {
        "home_elo": round(home_elo, 4),
        "away_elo": round(away_elo, 4),
        "elo_diff": round(
            home_elo - away_elo,
            4
        )
    },

    "markets": {
        "1x2": {
            "probabilities": {
                key: round(value, 6)
                for key, value in res_1x2.items()
            },
            "pick": pick_1x2,
            "pick_probability": round(
                res_1x2[pick_1x2],
                6
            )
        },

        "over_under_2_5": {
            "probabilities": {
                key: round(value, 6)
                for key, value in res_ou.items()
            },
            "pick": pick_ou,
            "pick_probability": round(
                res_ou[pick_ou],
                6
            )
        },

        "btts": {
            "probabilities": {
                key: round(value, 6)
                for key, value in res_btts.items()
            },
            "pick": pick_btts,
            "pick_probability": round(
                res_btts[pick_btts],
                6
            )
        }
    },

    "features": {
        key: float(value)
        for key, value in features.items()
    }
}

print("\n" + "=" * 60)
print("📦 API-READY JSON")
print("=" * 60)
print(
    json.dumps(
        unified_output,
        indent=2
    )
)

print("\n" + "=" * 60)
print("✅ PIPELINE 48 COMPLETE")
print("=" * 60)
print(
    "🔒 Pipeline 41 remains untouched."
)
print(
    "🧠 1X2 + O/U 2.5 + BTTS "
    "inference completed."
)
print(
    "🚀 Ready for backend integration."
)
print("=" * 60)