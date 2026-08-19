import os
import json
import glob
import joblib
import warnings

import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight


# ============================================================
# ZOKASCORE V2 — STEP 44
# CHAMPION GATE & 100% DEPLOYMENT
#
# PURPOSE
# -------
# 1. Audit all compatible model reports.
# 2. Apply production governance gates.
# 3. Select the best valid champion.
# 4. Recover the champion's actual feature contract.
# 5. Recover the champion's training parameters when available.
# 6. Retrain the selected champion on 100% of its source data.
# 7. Replay canonical history to build final live team state.
# 8. Save an immutable deployment manifest.
#
# IMPORTANT
# ---------
# This step does NOT modify Step 40 features.
# It does NOT use the final test population for model selection.
# It only deploys a candidate that already has a forensic report.
# ============================================================


warnings.filterwarnings("ignore")


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

MODELS_DIR = os.path.join(
    BASE_DIR,
    "data",
    "models"
)

REPORTS_DIR = os.path.join(
    BASE_DIR,
    "data",
    "processed"
)

MASTER_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "master_with_elo.csv"
)

CHAMPION_MODEL_FILE = os.path.join(
    MODELS_DIR,
    "champion_model.joblib"
)

CHAMPION_MANIFEST_FILE = os.path.join(
    MODELS_DIR,
    "champion_manifest.json"
)

LIVE_STATE_FILE = os.path.join(
    MODELS_DIR,
    "live_team_state.json"
)

LABEL_MAPPING_FILE = os.path.join(
    MODELS_DIR,
    "label_mapping.json"
)

FEATURE_SCHEMA_FILE = os.path.join(
    MODELS_DIR,
    "champion_feature_schema.json"
)


# ============================================================
# GOVERNANCE GATES
# ============================================================

MIN_ACCURACY = 48.0
MIN_MACRO_F1 = 38.0
MIN_DRAW_RECALL = 10.0

RANDOM_STATE = 42

# Must match the historical feature-state construction.
EWMA_ALPHA = 0.20


# ============================================================
# EXPECTED CLASS ORDER
# ============================================================

EXPECTED_LABELS = [
    "AWAY_WIN",
    "DRAW",
    "HOME_WIN"
]


# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def safe_float(value):
    """
    Convert numeric-like values to float.

    Returns None when conversion is impossible.
    """
    if value is None:
        return None

    try:
        if isinstance(value, bool):
            return None

        value = float(value)

        if not np.isfinite(value):
            return None

        return value

    except Exception:
        return None


def normalize_percent(value):
    """
    Normalize a metric to percentage units.

    Examples:
        48.19 -> 48.19
        0.4819 -> 48.19

    Values already above 1 are assumed to be percentages.
    """
    value = safe_float(value)

    if value is None:
        return None

    if 0.0 <= value <= 1.0:
        return value * 100.0

    return value


def nested_get(obj, paths):
    """
    Try multiple nested dictionary paths.

    Example:
        nested_get(
            report,
            [
                ("evaluation", "accuracy_percent"),
                ("metrics", "accuracy")
            ]
        )
    """
    for path in paths:

        current = obj

        try:
            for key in path:
                if not isinstance(current, dict):
                    raise KeyError

                current = current[key]

            if current is not None:
                return current

        except Exception:
            continue

    return None


def find_key_recursive(obj, wanted_keys):
    """
    Recursively search a JSON-compatible object for one of
    the requested keys.

    This is intentionally conservative:
    it returns the first exact key match.
    """
    if isinstance(obj, dict):

        for key in wanted_keys:
            if key in obj:
                return obj[key]

        for value in obj.values():
            result = find_key_recursive(value, wanted_keys)

            if result is not None:
                return result

    elif isinstance(obj, list):

        for value in obj:
            result = find_key_recursive(value, wanted_keys)

            if result is not None:
                return result

    return None


def get_metric(report, percent_keys, decimal_keys=None):
    """
    Retrieve a metric from several possible report schemas.
    """
    decimal_keys = decimal_keys or []

    # First prefer explicit percentage fields.
    value = find_key_recursive(
        report,
        percent_keys
    )

    if value is not None:
        return normalize_percent(value)

    # Then try generic metric fields.
    value = find_key_recursive(
        report,
        decimal_keys
    )

    if value is not None:
        return normalize_percent(value)

    return None


def get_draw_recall(report):
    """
    Supports multiple classification report layouts.
    """

    # Common schema:
    # evaluation -> classification_report -> DRAW -> recall

    value = nested_get(
        report,
        [
            (
                "evaluation",
                "classification_report",
                "DRAW",
                "recall"
            ),
            (
                "evaluation",
                "classification_report",
                "draw",
                "recall"
            ),
            (
                "classification_report",
                "DRAW",
                "recall"
            ),
            (
                "classification_report",
                "draw",
                "recall"
            )
        ]
    )

    if value is not None:
        return normalize_percent(value)

    # Alternative explicit fields.
    value = find_key_recursive(
        report,
        [
            "draw_recall_percent",
            "DRAW_recall_percent",
            "draw_recall",
            "DRAW_recall"
        ]
    )

    if value is not None:
        return normalize_percent(value)

    return None


def get_pipeline_step(report, report_file):
    """
    Recover pipeline step from the report.
    """
    value = find_key_recursive(
        report,
        [
            "pipeline_step",
            "step",
            "pipeline"
        ]
    )

    if value is None:
        return os.path.splitext(
            os.path.basename(report_file)
        )[0]

    return str(value)


def get_model_type(report):
    """
    Recover model type.
    """
    value = nested_get(
        report,
        [
            ("model", "type"),
            ("model", "model_type"),
            ("model_type",),
            ("type",)
        ]
    )

    if value is None:
        return "UNKNOWN"

    return str(value)


def get_source_file(report):
    """
    Recover the feature source path.
    """
    value = nested_get(
        report,
        [
            ("source",),
            ("source_file",),
            ("features_file",),
            ("feature_file",),
            ("dataset", "source"),
            ("data", "source")
        ]
    )

    if value is None:
        value = find_key_recursive(
            report,
            [
                "source",
                "source_file",
                "features_file",
                "feature_file"
            ]
        )

    if value is None:
        return None

    return str(value)


def resolve_source_path(source_file):
    """
    Resolve source path robustly.

    Supports:
        data/ml/features_v3.csv
        ./data/ml/features_v3.csv
        absolute Windows paths
    """

    if not source_file:
        return None

    source_file = str(source_file).strip()

    # Absolute path.
    if os.path.isabs(source_file):

        if os.path.exists(source_file):
            return os.path.abspath(source_file)

        return None

    # Relative to project root.
    candidate = os.path.join(
        BASE_DIR,
        source_file
    )

    if os.path.exists(candidate):
        return os.path.abspath(candidate)

    # Relative path may already include backend-v1.
    candidate = os.path.abspath(source_file)

    if os.path.exists(candidate):
        return candidate

    return None


def get_feature_columns(report):
    """
    Recover the exact feature contract from the report.
    """

    candidates = [
        nested_get(
            report,
            [("features",)]
        ),
        nested_get(
            report,
            [("feature_columns",)]
        ),
        nested_get(
            report,
            [("model", "features")]
        ),
        nested_get(
            report,
            [("model", "feature_columns")]
        )
    ]

    for value in candidates:

        if isinstance(value, list):

            cleaned = [
                str(x)
                for x in value
                if x is not None
            ]

            if cleaned:
                return cleaned

    # Recursive fallback.
    value = find_key_recursive(
        report,
        [
            "feature_columns",
            "features"
        ]
    )

    if isinstance(value, list):

        cleaned = [
            str(x)
            for x in value
            if x is not None
        ]

        if cleaned:
            return cleaned

    return None


def extract_classification_report(report):
    """
    Return classification report if present.
    """
    value = nested_get(
        report,
        [
            ("evaluation", "classification_report"),
            ("classification_report",)
        ]
    )

    if isinstance(value, dict):
        return value

    return None


def champion_score(metrics):
    """
    Production governance score.

    50% Accuracy
    30% Macro F1
    20% Draw Recall
    """

    return (
        metrics["accuracy"] * 0.50
        + metrics["macro_f1"] * 0.30
        + metrics["draw_recall"] * 0.20
    )


# ============================================================
# XGBOOST PARAMETER RECOVERY
# ============================================================

def normalize_xgb_params(params):
    """
    Keep only XGBoost classifier parameters that are safe
    and meaningful for our deployment.

    Unknown report metadata is ignored.
    """

    if not isinstance(params, dict):
        return {}

    allowed = {
        "n_estimators",
        "learning_rate",
        "max_depth",
        "min_child_weight",
        "subsample",
        "colsample_bytree",
        "gamma",
        "reg_alpha",
        "reg_lambda",
        "max_delta_step",
        "max_leaves",
        "grow_policy",
        "booster"
    }

    clean = {}

    for key, value in params.items():

        if key not in allowed:
            continue

        # Convert NumPy values.
        if isinstance(value, np.generic):
            value = value.item()

        # Ignore None.
        if value is None:
            continue

        clean[key] = value

    return clean


def get_model_parameters(report):
    """
    Recover model parameters from common report structures.

    If the report contains the exact parameters used by the
    candidate, those are preferred.

    Otherwise return {} and Step 44 will use the documented
    deployment fallback.
    """

    possible_paths = [
        ("model", "parameters"),
        ("model", "params"),
        ("model", "hyperparameters"),
        ("parameters",),
        ("params",),
        ("hyperparameters",)
    ]

    for path in possible_paths:

        value = nested_get(
            report,
            [path]
        )

        if isinstance(value, dict):

            clean = normalize_xgb_params(value)

            if clean:
                return clean

    # Recursive fallback.
    value = find_key_recursive(
        report,
        [
            "parameters",
            "params",
            "hyperparameters"
        ]
    )

    if isinstance(value, dict):

        clean = normalize_xgb_params(value)

        if clean:
            return clean

    return {}


# ============================================================
# DEPLOYMENT FALLBACK
# ============================================================

# This is only used if a legacy report does not contain
# recoverable model parameters.
#
# IMPORTANT:
# A report with exact parameters will override these.
#
DEFAULT_XGB_PARAMS = {
    "n_estimators": 300,
    "learning_rate": 0.05,
    "max_depth": 6,
    "min_child_weight": 3,
    "subsample": 0.85,
    "colsample_bytree": 0.85,
    "gamma": 0.0,
    "reg_alpha": 0.0,
    "reg_lambda": 1.0
}


# ============================================================
# CANDIDATE AUDIT
# ============================================================

def audit_candidates():

    print("[1/5] Auditing candidate models...")

    report_files = sorted(
        glob.glob(
            os.path.join(
                REPORTS_DIR,
                "*_model_report.json"
            )
        )
    )

    if not report_files:
        raise RuntimeError(
            "No model reports found in: "
            + REPORTS_DIR
        )

    valid_candidates = []
    skipped_candidates = []

    for report_file in report_files:

        basename = os.path.basename(report_file)

        try:

            with open(
                report_file,
                "r",
                encoding="utf-8"
            ) as f:
                report = json.load(f)

            status = str(
                report.get("status", "")
            ).upper()

            if status != "PASS":

                skipped_candidates.append({
                    "file": basename,
                    "reason": f"status={status}"
                })

                continue

            # ------------------------------------------------
            # METRICS
            # ------------------------------------------------

            accuracy = get_metric(
                report,
                percent_keys=[
                    "accuracy_percent"
                ],
                decimal_keys=[
                    "accuracy"
                ]
            )

            macro_f1 = get_metric(
                report,
                percent_keys=[
                    "macro_f1_percent",
                    "macro_f1_percentage"
                ],
                decimal_keys=[
                    "macro_f1"
                ]
            )

            draw_recall = get_draw_recall(report)

            pipeline_step = get_pipeline_step(
                report,
                report_file
            )

            model_type = get_model_type(
                report
            )

            source_file = get_source_file(
                report
            )

            feature_columns = get_feature_columns(
                report
            )

            model_parameters = get_model_parameters(
                report
            )

            # ------------------------------------------------
            # STRUCTURAL VALIDATION
            # ------------------------------------------------

            missing_metadata = []

            if accuracy is None:
                missing_metadata.append(
                    "accuracy"
                )

            if macro_f1 is None:
                missing_metadata.append(
                    "macro_f1"
                )

            if draw_recall is None:
                missing_metadata.append(
                    "draw_recall"
                )

            if not feature_columns:
                missing_metadata.append(
                    "features"
                )

            if not source_file:
                missing_metadata.append(
                    "source"
                )

            if missing_metadata:

                reason = (
                    "missing required metadata: "
                    + ", ".join(missing_metadata)
                )

                print(
                    f"   ⚠️ SKIPPED: {pipeline_step} "
                    f"({model_type}) - {reason}"
                )

                skipped_candidates.append({
                    "file": basename,
                    "pipeline_step": pipeline_step,
                    "reason": reason
                })

                continue

            # ------------------------------------------------
            # GOVERNANCE GATE
            # ------------------------------------------------

            if (
                accuracy < MIN_ACCURACY
                or macro_f1 < MIN_MACRO_F1
                or draw_recall < MIN_DRAW_RECALL
            ):

                print(
                    f"   ❌ REJECTED: {pipeline_step} "
                    f"({model_type}) - "
                    f"Acc: {accuracy:.2f}% | "
                    f"MacroF1: {macro_f1:.2f}% | "
                    f"DrawR: {draw_recall:.2f}%"
                )

                continue

            score = champion_score(
                {
                    "accuracy": accuracy,
                    "macro_f1": macro_f1,
                    "draw_recall": draw_recall
                }
            )

            candidate = {
                "pipeline_step": pipeline_step,
                "model_type": model_type,
                "features": feature_columns,
                "source_file": source_file,
                "accuracy": accuracy,
                "macro_f1": macro_f1,
                "draw_recall": draw_recall,
                "score": score,
                "report_file": os.path.abspath(
                    report_file
                ),
                "model_parameters": model_parameters,
                "parameter_source": (
                    "report"
                    if model_parameters
                    else "deployment_fallback"
                )
            }

            valid_candidates.append(
                candidate
            )

            parameter_note = (
                "exact params"
                if model_parameters
                else "fallback params"
            )

            print(
                f"   ✅ PASS: {pipeline_step} "
                f"({model_type}) - "
                f"Acc: {accuracy:.2f}% | "
                f"MacroF1: {macro_f1:.2f}% | "
                f"DrawR: {draw_recall:.2f}% | "
                f"Score: {score:.4f} | "
                f"{parameter_note}"
            )

        except Exception as e:

            print(
                f"   ⚠️ Could not parse "
                f"{basename}: {e}"
            )

            skipped_candidates.append({
                "file": basename,
                "reason": str(e)
            })

    print()
    print(
        f"   Candidate reports discovered: "
        f"{len(report_files)}"
    )

    print(
        f"   Governance-valid candidates: "
        f"{len(valid_candidates)}"
    )

    print(
        f"   Skipped/incompatible reports: "
        f"{len(skipped_candidates)}"
    )

    if not valid_candidates:

        raise RuntimeError(
            "NO PRODUCTION CHAMPION PASSED "
            "THE ZOKASCORE V2 QUALITY GATE."
        )

    return valid_candidates, skipped_candidates


# ============================================================
# CHAMPION SELECTION
# ============================================================

def select_champion(valid_candidates):

    print("\n[2/5] Selecting Champion...")

    # Highest governance score wins.
    #
    # Tie-breakers:
    #   1. Accuracy
    #   2. Macro F1
    #   3. Draw recall
    #
    valid_candidates.sort(
        key=lambda x: (
            x["score"],
            x["accuracy"],
            x["macro_f1"],
            x["draw_recall"]
        ),
        reverse=True
    )

    champion = valid_candidates[0]

    print(
        f"   🏆 CHAMPION SELECTED: "
        f"{champion['pipeline_step']} "
        f"({champion['model_type']})"
    )

    print(
        f"      Accuracy:     "
        f"{champion['accuracy']:.2f}%"
    )

    print(
        f"      Macro F1:     "
        f"{champion['macro_f1']:.2f}%"
    )

    print(
        f"      DRAW Recall:  "
        f"{champion['draw_recall']:.2f}%"
    )

    print(
        f"      Score:        "
        f"{champion['score']:.4f}"
    )

    print(
        f"      Source Data:  "
        f"{champion['source_file']}"
    )

    print(
        f"      Features:     "
        f"{len(champion['features'])} columns"
    )

    print(
        f"      Parameters:   "
        f"{champion['parameter_source']}"
    )

    return champion


# ============================================================
# TRAIN CHAMPION
# ============================================================

def train_champion(champion):

    print(
        "\n[3/5] Training Champion "
        "on 100% of canonical source data..."
    )

    source_file = champion["source_file"]

    features_path = resolve_source_path(
        source_file
    )

    if not features_path:

        raise RuntimeError(
            "Champion source file could not be resolved: "
            + str(source_file)
        )

    print(
        f"   ↳ Source: {features_path}"
    )

    df = pd.read_csv(
        features_path,
        low_memory=False
    )

    print(
        f"   ↳ Rows: {len(df):,}"
    )

    # --------------------------------------------------------
    # BASIC DATA VALIDATION
    # --------------------------------------------------------

    required_columns = [
        "target"
    ]

    missing_base = [
        col
        for col in required_columns
        if col not in df.columns
    ]

    if missing_base:

        raise RuntimeError(
            "Champion source is missing required "
            f"columns: {missing_base}"
        )

    feature_columns = champion["features"]

    missing_features = [
        f
        for f in feature_columns
        if f not in df.columns
    ]

    if missing_features:

        raise RuntimeError(
            "Missing required features for champion "
            f"deployment: {missing_features}"
        )

    # --------------------------------------------------------
    # REMOVE INVALID ROWS
    # --------------------------------------------------------

    working = df[
        feature_columns + ["target"]
    ].copy()

    before = len(working)

    working = working.dropna(
        subset=feature_columns + ["target"]
    ).reset_index(drop=True)

    dropped = before - len(working)

    if dropped:

        print(
            f"   ⚠️ Dropped {dropped:,} rows "
            f"containing invalid champion data."
        )

    if len(working) == 0:

        raise RuntimeError(
            "No valid training rows remain "
            "after validation."
        )

    X = working[
        feature_columns
    ].astype(np.float64)

    y_raw = working[
        "target"
    ].astype(str)

    # --------------------------------------------------------
    # TARGET VALIDATION
    # --------------------------------------------------------

    unexpected_labels = sorted(
        set(y_raw.unique())
        - set(EXPECTED_LABELS)
    )

    if unexpected_labels:

        raise RuntimeError(
            "Unexpected target labels found: "
            + str(unexpected_labels)
        )

    # --------------------------------------------------------
    # LABEL ENCODING
    # --------------------------------------------------------

    le = LabelEncoder()

    # Force canonical class order.
    le.fit(EXPECTED_LABELS)

    y = le.transform(
        y_raw
    )

    if list(le.classes_) != EXPECTED_LABELS:

        raise RuntimeError(
            "Unexpected label encoder ordering: "
            + str(list(le.classes_))
        )

    label_mapping = {
        str(i): str(cls)
        for i, cls in enumerate(
            le.classes_
        )
    }

    os.makedirs(
        MODELS_DIR,
        exist_ok=True
    )

    with open(
        LABEL_MAPPING_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            label_mapping,
            f,
            indent=2
        )

    print(
        f"   ✅ Label mapping saved: "
        f"{LABEL_MAPPING_FILE}"
    )

    # --------------------------------------------------------
    # CLASS BALANCING
    # --------------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y
    )

    # --------------------------------------------------------
    # MODEL PARAMETERS
    # --------------------------------------------------------

    params = DEFAULT_XGB_PARAMS.copy()

    report_params = champion.get(
        "model_parameters",
        {}
    )

    if report_params:
        params.update(
            report_params
        )

    print(
        "\n   XGBoost deployment parameters:"
    )

    for key in sorted(params):

        print(
            f"      {key}: {params[key]}"
        )

    # --------------------------------------------------------
    # MODEL
    # --------------------------------------------------------

    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=3,

        random_state=RANDOM_STATE,
        n_jobs=-1,

        eval_metric="mlogloss",
        tree_method="hist",

        **params
    )

    print(
        "\n   ↳ Fitting on "
        f"{len(X):,} matches..."
    )

    model.fit(
        X,
        y,
        sample_weight=sample_weights
    )

    # --------------------------------------------------------
    # MODEL CONTRACT VALIDATION
    # --------------------------------------------------------

    if hasattr(
        model,
        "n_features_in_"
    ):

        if model.n_features_in_ != len(
            feature_columns
        ):

            raise RuntimeError(
                "Champion model feature count "
                "does not match feature contract."
            )

    # --------------------------------------------------------
    # SAVE MODEL ATOMICALLY
    # --------------------------------------------------------

    temp_model = (
        CHAMPION_MODEL_FILE
        + ".tmp"
    )

    joblib.dump(
        model,
        temp_model
    )

    os.replace(
        temp_model,
        CHAMPION_MODEL_FILE
    )

    print(
        f"   ✅ Champion model saved to:"
        f"\n      {CHAMPION_MODEL_FILE}"
    )

    # --------------------------------------------------------
    # SAVE FEATURE CONTRACT
    # --------------------------------------------------------

    feature_schema = {
        "pipeline_step": "44",
        "champion_pipeline_step": champion[
            "pipeline_step"
        ],
        "source_file": source_file,
        "feature_count": len(
            feature_columns
        ),
        "features": feature_columns,
        "target_classes": EXPECTED_LABELS,
        "training_rows": int(
            len(X)
        ),
        "dropped_invalid_rows": int(
            dropped
        ),
        "model_parameters": params
    }

    with open(
        FEATURE_SCHEMA_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            feature_schema,
            f,
            indent=2
        )

    print(
        f"   ✅ Feature contract saved to:"
        f"\n      {FEATURE_SCHEMA_FILE}"
    )

    return model, params, len(X)


# ============================================================
# LIVE STATE REPLAY
# ============================================================

def replay_history():

    print(
        "\n[4/5] Replaying canonical history "
        "to extract final live state..."
    )

    if not os.path.exists(
        MASTER_FILE
    ):

        raise RuntimeError(
            "Canonical master file not found: "
            + MASTER_FILE
        )

    master_df = pd.read_csv(
        MASTER_FILE,
        low_memory=False
    )

    required_columns = [
        "date",
        "zokascore_match_id",
        "home_team_id",
        "away_team_id",
        "home_score",
        "away_score",
        "home_elo_pre",
        "away_elo_pre",
        "home_elo_delta",
        "away_elo_delta"
    ]

    missing = [
        col
        for col in required_columns
        if col not in master_df.columns
    ]

    if missing:

        raise RuntimeError(
            "master_with_elo.csv is missing "
            f"required replay columns: {missing}"
        )

    master_df["date"] = pd.to_datetime(
        master_df["date"],
        errors="coerce"
    )

    master_df = master_df.dropna(
        subset=[
            "date",
            "home_team_id",
            "away_team_id",
            "home_score",
            "away_score"
        ]
    ).copy()

    # Deterministic chronological replay.
    master_df = master_df.sort_values(
        by=[
            "date",
            "zokascore_match_id"
        ],
        kind="mergesort"
    ).reset_index(
        drop=True
    )

    print(
        f"   ↳ Replay matches: "
        f"{len(master_df):,}"
    )

    ALPHA = EWMA_ALPHA

    team_states = {}

    def get_state(team_id):

        team_id = str(team_id)

        if team_id not in team_states:

            team_states[team_id] = {

                # --------------------------------------------
                # ELO
                # --------------------------------------------

                "elo": 1500.0,

                # --------------------------------------------
                # OVERALL EWMA
                # --------------------------------------------

                "ewma_points": 1.0,
                "ewma_gd": 0.0,
                "ewma_gf": 1.0,
                "ewma_ga": 1.0,

                # --------------------------------------------
                # HOME EWMA
                # --------------------------------------------

                "ewma_home_points": 1.0,
                "ewma_home_gd": 0.0,
                "ewma_home_gf": 1.0,
                "ewma_home_ga": 1.0,

                # --------------------------------------------
                # AWAY EWMA
                # --------------------------------------------

                "ewma_away_points": 1.0,
                "ewma_away_gd": 0.0,
                "ewma_away_gf": 1.0,
                "ewma_away_ga": 1.0,

                # --------------------------------------------
                # MATCH COUNTERS
                # --------------------------------------------

                "matches_played": 0,
                "home_matches_played": 0,
                "away_matches_played": 0
            }

        return team_states[team_id]

    def ewma(
        previous,
        current
    ):

        return (
            ALPHA * current
            + (1.0 - ALPHA) * previous
        )

    # --------------------------------------------------------
    # REPLAY
    # --------------------------------------------------------

    for row in master_df.itertuples(
        index=False
    ):

        home_id = str(
            row.home_team_id
        )

        away_id = str(
            row.away_team_id
        )

        home_state = get_state(
            home_id
        )

        away_state = get_state(
            away_id
        )

        # ----------------------------------------------------
        # PRE-MATCH ELO + DELTA = POST-MATCH ELO
        # ----------------------------------------------------

        home_state["elo"] = (
            float(row.home_elo_pre)
            + float(row.home_elo_delta)
        )

        away_state["elo"] = (
            float(row.away_elo_pre)
            + float(row.away_elo_delta)
        )

        # ----------------------------------------------------
        # SCORE
        # ----------------------------------------------------

        home_score = int(
            row.home_score
        )

        away_score = int(
            row.away_score
        )

        # ----------------------------------------------------
        # RESULT POINTS
        # ----------------------------------------------------

        if home_score > away_score:

            home_points = 3
            away_points = 0

        elif home_score < away_score:

            home_points = 0
            away_points = 3

        else:

            home_points = 1
            away_points = 1

        # ----------------------------------------------------
        # OVERALL HOME
        # ----------------------------------------------------

        home_state["ewma_points"] = ewma(
            home_state["ewma_points"],
            home_points
        )

        home_state["ewma_gd"] = ewma(
            home_state["ewma_gd"],
            home_score - away_score
        )

        home_state["ewma_gf"] = ewma(
            home_state["ewma_gf"],
            home_score
        )

        home_state["ewma_ga"] = ewma(
            home_state["ewma_ga"],
            away_score
        )

        # ----------------------------------------------------
        # OVERALL AWAY
        # ----------------------------------------------------

        away_state["ewma_points"] = ewma(
            away_state["ewma_points"],
            away_points
        )

        away_state["ewma_gd"] = ewma(
            away_state["ewma_gd"],
            away_score - home_score
        )

        away_state["ewma_gf"] = ewma(
            away_state["ewma_gf"],
            away_score
        )

        away_state["ewma_ga"] = ewma(
            away_state["ewma_ga"],
            home_score
        )

        # ----------------------------------------------------
        # HOME VENUE STATE
        # ----------------------------------------------------

        home_state["ewma_home_points"] = ewma(
            home_state["ewma_home_points"],
            home_points
        )

        home_state["ewma_home_gd"] = ewma(
            home_state["ewma_home_gd"],
            home_score - away_score
        )

        home_state["ewma_home_gf"] = ewma(
            home_state["ewma_home_gf"],
            home_score
        )

        home_state["ewma_home_ga"] = ewma(
            home_state["ewma_home_ga"],
            away_score
        )

        # ----------------------------------------------------
        # AWAY VENUE STATE
        # ----------------------------------------------------

        away_state["ewma_away_points"] = ewma(
            away_state["ewma_away_points"],
            away_points
        )

        away_state["ewma_away_gd"] = ewma(
            away_state["ewma_away_gd"],
            away_score - home_score
        )

        away_state["ewma_away_gf"] = ewma(
            away_state["ewma_away_gf"],
            away_score
        )

        away_state["ewma_away_ga"] = ewma(
            away_state["ewma_away_ga"],
            home_score
        )

        # ----------------------------------------------------
        # COUNTERS
        # ----------------------------------------------------

        home_state[
            "matches_played"
        ] += 1

        away_state[
            "matches_played"
        ] += 1

        home_state[
            "home_matches_played"
        ] += 1

        away_state[
            "away_matches_played"
        ] += 1

    # --------------------------------------------------------
    # VALIDATE STATES
    # --------------------------------------------------------

    if not team_states:

        raise RuntimeError(
            "History replay produced zero team states."
        )

    # --------------------------------------------------------
    # ATOMIC JSON SAVE
    # --------------------------------------------------------

    temp_state = (
        LIVE_STATE_FILE
        + ".tmp"
    )

    with open(
        temp_state,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            team_states,
            f,
            indent=2,
            allow_nan=False
        )

    os.replace(
        temp_state,
        LIVE_STATE_FILE
    )

    print(
        f"   ✅ Live state for "
        f"{len(team_states):,} teams saved to:"
        f"\n      {LIVE_STATE_FILE}"
    )

    return team_states


# ============================================================
# MANIFEST
# ============================================================

def save_manifest(
    champion,
    skipped_candidates,
    model_params,
    training_rows,
    team_states
):

    print(
        "\n[5/5] Saving deployment manifest..."
    )

    manifest = {

        "pipeline_step": "44",

        "status": "DEPLOYED",

        "deployment_contract": {
            "model_file": os.path.abspath(
                CHAMPION_MODEL_FILE
            ),
            "feature_schema_file": os.path.abspath(
                FEATURE_SCHEMA_FILE
            ),
            "label_mapping_file": os.path.abspath(
                LABEL_MAPPING_FILE
            ),
            "live_state_file": os.path.abspath(
                LIVE_STATE_FILE
            )
        },

        "champion_details": champion,

        "training": {
            "rows": int(
                training_rows
            ),
            "feature_count": len(
                champion["features"]
            ),
            "features": champion[
                "features"
            ],
            "model_parameters": model_params
        },

        "live_state": {
            "team_count": len(
                team_states
            ),
            "ewma_alpha": EWMA_ALPHA,
            "replay_source": os.path.abspath(
                MASTER_FILE
            )
        },

        "governance_gates": {
            "min_accuracy_percent": MIN_ACCURACY,
            "min_macro_f1_percent": MIN_MACRO_F1,
            "min_draw_recall_percent": MIN_DRAW_RECALL
        },

        "audit": {
            "skipped_reports": skipped_candidates
        },

        "target_labels": EXPECTED_LABELS,

        "deployed_at": pd.Timestamp.now(
        ).isoformat()
    }

    temp_manifest = (
        CHAMPION_MANIFEST_FILE
        + ".tmp"
    )

    with open(
        temp_manifest,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            manifest,
            f,
            indent=2,
            allow_nan=False
        )

    os.replace(
        temp_manifest,
        CHAMPION_MANIFEST_FILE
    )

    print(
        f"   ✅ Manifest saved to:"
        f"\n      {CHAMPION_MANIFEST_FILE}"
    )

    return manifest


# ============================================================
# FINAL DEPLOYMENT VALIDATION
# ============================================================

def final_validation(
    champion,
    model,
    training_rows,
    team_states
):

    print(
        "\n🔒 FINAL DEPLOYMENT VALIDATION"
    )

    checks = []

    # Model exists.
    checks.append(
        (
            "Champion model exists",
            os.path.exists(
                CHAMPION_MODEL_FILE
            )
        )
    )

    # Label mapping exists.
    checks.append(
        (
            "Label mapping exists",
            os.path.exists(
                LABEL_MAPPING_FILE
            )
        )
    )

    # Feature schema exists.
    checks.append(
        (
            "Feature schema exists",
            os.path.exists(
                FEATURE_SCHEMA_FILE
            )
        )
    )

    # Live state exists.
    checks.append(
        (
            "Live state exists",
            os.path.exists(
                LIVE_STATE_FILE
            )
        )
    )

    # Manifest exists.
    checks.append(
        (
            "Deployment manifest exists",
            os.path.exists(
                CHAMPION_MANIFEST_FILE
            )
        )
    )

    # Model feature count.
    expected_features = len(
        champion["features"]
    )

    actual_features = getattr(
        model,
        "n_features_in_",
        None
    )

    checks.append(
        (
            "Model feature count matches",
            actual_features
            == expected_features
        )
    )

    # Training population.
    checks.append(
        (
            "Training population > 0",
            training_rows > 0
        )
    )

    # Team state.
    checks.append(
        (
            "Live team state > 0",
            len(team_states) > 0
        )
    )

    failed = []

    for name, passed in checks:

        if passed:

            print(
                f"   ✅ {name}"
            )

        else:

            print(
                f"   ❌ {name}"
            )

            failed.append(
                name
            )

    if failed:

        raise RuntimeError(
            "FINAL DEPLOYMENT VALIDATION FAILED: "
            + ", ".join(failed)
        )

    print(
        "\n   ✅ ALL DEPLOYMENT CHECKS PASSED"
    )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(
        " ZOKASCORE V2 — STEP 44"
    )
    print(
        " CHAMPION GATE & 100% DEPLOYMENT"
    )
    print("=" * 60)
    print()

    os.makedirs(
        MODELS_DIR,
        exist_ok=True
    )

    # --------------------------------------------------------
    # 1. AUDIT
    # --------------------------------------------------------

    valid_candidates, skipped_candidates = (
        audit_candidates()
    )

    # --------------------------------------------------------
    # 2. CHAMPION
    # --------------------------------------------------------

    champion = select_champion(
        valid_candidates
    )

    # --------------------------------------------------------
    # SOURCE VALIDATION
    # --------------------------------------------------------

    source_path = resolve_source_path(
        champion["source_file"]
    )

    if not source_path:

        raise RuntimeError(
            "Selected champion source file "
            "does not exist: "
            + str(champion["source_file"])
        )

    print(
        f"\n   🔎 Champion source verified:"
        f"\n      {source_path}"
    )

    # --------------------------------------------------------
    # 3. TRAIN 100%
    # --------------------------------------------------------

    model, model_params, training_rows = (
        train_champion(
            champion
        )
    )

    # --------------------------------------------------------
    # 4. LIVE STATE
    # --------------------------------------------------------

    team_states = replay_history()

    # --------------------------------------------------------
    # 5. MANIFEST
    # --------------------------------------------------------

    save_manifest(
        champion=champion,
        skipped_candidates=skipped_candidates,
        model_params=model_params,
        training_rows=training_rows,
        team_states=team_states
    )

    # --------------------------------------------------------
    # FINAL VALIDATION
    # --------------------------------------------------------

    final_validation(
        champion=champion,
        model=model,
        training_rows=training_rows,
        team_states=team_states
    )

    # --------------------------------------------------------
    # COMPLETE
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print(
        "✅ STEP 44 COMPLETE: DEPLOYMENT PASS"
    )
    print("=" * 60)

    print(
        f"🏆 Champion:       "
        f"{champion['pipeline_step']}"
    )

    print(
        f"🎯 Accuracy:        "
        f"{champion['accuracy']:.2f}%"
    )

    print(
        f"🧠 Macro F1:        "
        f"{champion['macro_f1']:.2f}%"
    )

    print(
        f"🎯 DRAW Recall:     "
        f"{champion['draw_recall']:.2f}%"
    )

    print(
        f"📊 Training rows:   "
        f"{training_rows:,}"
    )

    print(
        f"🧩 Features:        "
        f"{len(champion['features'])}"
    )

    print(
        f"🌍 Team states:     "
        f"{len(team_states):,}"
    )

    print(
        f"⚙️ Params source:   "
        f"{champion['parameter_source']}"
    )

    print()
    print(
        "📁 Champion:"
    )
    print(
        f"   {CHAMPION_MODEL_FILE}"
    )

    print(
        "📁 Feature contract:"
    )
    print(
        f"   {FEATURE_SCHEMA_FILE}"
    )

    print(
        "📁 Live state:"
    )
    print(
        f"   {LIVE_STATE_FILE}"
    )

    print(
        "📁 Manifest:"
    )
    print(
        f"   {CHAMPION_MANIFEST_FILE}"
    )

    print("=" * 60)
    print(
        "🔒 ZOKASCORE V2 champion deployment is "
        "internally validated."
    )
    print("=" * 60)


if __name__ == "__main__":
    run()