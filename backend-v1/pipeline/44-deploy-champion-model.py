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
# 1. Audit compatible model reports.
# 2. Apply production governance gates.
# 3. Select the best valid champion.
# 4. Recover the exact champion feature contract.
# 5. Recover champion training parameters when available.
# 6. Retrain the champion on 100% of its source data.
# 7. Replay canonical history using the Step 40B EWMA rules.
# 8. Build final live team state.
# 9. Save deployment artifacts atomically.
# 10. Validate the complete deployment contract.
#
# CANONICAL EWMA
# --------------
# fast   = 0.35
# medium = 0.20
# slow   = 0.08
#
# Medium track uses the original untagged names.
#
# Example:
#   home_ewma_pts
#   away_ewma_pts
#
# Fast:
#   home_ewma_fast_pts
#   away_ewma_fast_pts
#
# Slow:
#   home_ewma_slow_pts
#   away_ewma_slow_pts
#
# SAFETY
# ------
# - No final-test population is used for selection.
# - Candidate must already have a PASS report.
# - Champion feature list is authoritative.
# - Canonical target classes are enforced.
# - Duplicate source match IDs are rejected.
# - Duplicate feature names are rejected.
# - Source data is validated before training.
# - Deployment artifacts are written atomically.
# - Live history is replayed chronologically.
# - JSON state is JSON-safe.
# ============================================================

warnings.filterwarnings("ignore")


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
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
# GOVERNANCE
# ============================================================

MIN_ACCURACY = 48.0
MIN_MACRO_F1 = 38.0
MIN_DRAW_RECALL = 10.0

RANDOM_STATE = 42


# ============================================================
# CANONICAL STEP 40B EWMA CONFIGURATION
# ============================================================

EWMA_ALPHAS = {
    "fast": 0.35,
    "medium": 0.20,
    "slow": 0.08
}

EWMA_STAT_KEYS = [
    "pts",
    "gd",
    "gf",
    "ga"
]

EWMA_TRACKS = [
    "fast",
    "medium",
    "slow"
]


# ============================================================
# TARGET CLASSES
# ============================================================

EXPECTED_LABELS = [
    "AWAY_WIN",
    "DRAW",
    "HOME_WIN"
]


# ============================================================
# DEFAULT XGBOOST PARAMETERS
# ============================================================

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
# UTILITY
# ============================================================

def safe_float(value):
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
    value = safe_float(value)

    if value is None:
        return None

    if 0.0 <= value <= 1.0:
        return value * 100.0

    return value


def nested_get(obj, paths):
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
    if isinstance(obj, dict):

        for key in wanted_keys:
            if key in obj:
                return obj[key]

        for value in obj.values():
            result = find_key_recursive(
                value,
                wanted_keys
            )

            if result is not None:
                return result

    elif isinstance(obj, list):

        for value in obj:
            result = find_key_recursive(
                value,
                wanted_keys
            )

            if result is not None:
                return result

    return None


def get_metric(
    report,
    percent_keys,
    decimal_keys=None
):
    decimal_keys = decimal_keys or []

    value = find_key_recursive(
        report,
        percent_keys
    )

    if value is not None:
        return normalize_percent(value)

    value = find_key_recursive(
        report,
        decimal_keys
    )

    if value is not None:
        return normalize_percent(value)

    return None


def get_draw_recall(report):
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


def get_pipeline_step(
    report,
    report_file
):
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
    if not source_file:
        return None

    source_file = str(
        source_file
    ).strip()

    if os.path.isabs(source_file):

        if os.path.exists(source_file):
            return os.path.abspath(source_file)

        return None

    candidates = [
        os.path.join(
            BASE_DIR,
            source_file
        ),
        os.path.abspath(source_file)
    ]

    for candidate in candidates:

        if os.path.exists(candidate):
            return os.path.abspath(candidate)

    return None


def get_feature_columns(report):
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


def get_target_column(report):
    value = find_key_recursive(
        report,
        [
            "target_column",
            "target"
        ]
    )

    if value is None:
        return "target"

    return str(value)


def get_feature_version(
    source_file,
    feature_columns
):
    source_lower = str(
        source_file or ""
    ).lower()

    if "features_v4" in source_lower:
        return "features_v4"

    if "features_v3" in source_lower:
        return "features_v3"

    fast_present = any(
        "_ewma_fast_" in c
        for c in feature_columns
    )

    slow_present = any(
        "_ewma_slow_" in c
        for c in feature_columns
    )

    if fast_present or slow_present:
        return "multi_alpha_ewma"

    return "legacy"


def detect_required_ewma_tracks(
    feature_columns
):
    features = set(feature_columns)

    medium_markers = {
        "home_ewma_pts",
        "away_ewma_pts",
        "home_ewma_gd",
        "away_ewma_gd",
        "home_ewma_gf",
        "away_ewma_gf",
        "home_ewma_ga",
        "away_ewma_ga",

        "home_ewma_home_pts",
        "away_ewma_away_pts",
        "home_ewma_home_gd",
        "away_ewma_away_gd",
        "home_ewma_home_gf",
        "away_ewma_away_gf",
        "home_ewma_home_ga",
        "away_ewma_away_ga"
    }

    required = set()

    if features.intersection(
        medium_markers
    ):
        required.add("medium")

    if any(
        "_ewma_fast_" in feature
        for feature in feature_columns
    ):
        required.add("fast")

    if any(
        "_ewma_slow_" in feature
        for feature in feature_columns
    ):
        required.add("slow")

    return [
        track
        for track in EWMA_TRACKS
        if track in required
    ]


def validate_feature_contract(
    feature_columns
):
    if not feature_columns:
        raise RuntimeError(
            "Champion feature contract is empty."
        )

    if len(feature_columns) != len(
        set(feature_columns)
    ):
        duplicates = sorted(
            {
                feature
                for feature in feature_columns
                if feature_columns.count(feature) > 1
            }
        )

        raise RuntimeError(
            "Champion feature contract contains "
            f"duplicate columns: {duplicates}"
        )

    for feature in feature_columns:

        if not isinstance(feature, str):
            raise RuntimeError(
                "Champion feature names must be strings."
            )

        if not feature.strip():
            raise RuntimeError(
                "Champion feature contract contains "
                "an empty feature name."
            )

    return True


def champion_score(metrics):
    return (
        metrics["accuracy"] * 0.50
        + metrics["macro_f1"] * 0.30
        + metrics["draw_recall"] * 0.20
    )


# ============================================================
# XGBOOST PARAMETER RECOVERY
# ============================================================

def normalize_xgb_params(params):
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

        if isinstance(value, np.generic):
            value = value.item()

        if value is None:
            continue

        clean[key] = value

    return clean


def get_model_parameters(report):
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

            clean = normalize_xgb_params(
                value
            )

            if clean:
                return clean

    value = find_key_recursive(
        report,
        [
            "parameters",
            "params",
            "hyperparameters"
        ]
    )

    if isinstance(value, dict):

        clean = normalize_xgb_params(
            value
        )

        if clean:
            return clean

    return {}


# ============================================================
# CANDIDATE AUDIT
# ============================================================

def audit_candidates():

    print(
        "[1/5] Auditing candidate models..."
    )

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

        basename = os.path.basename(
            report_file
        )

        try:

            with open(
                report_file,
                "r",
                encoding="utf-8"
            ) as f:
                report = json.load(f)

            status = str(
                report.get(
                    "status",
                    ""
                )
            ).upper()

            if status != "PASS":

                skipped_candidates.append(
                    {
                        "file": basename,
                        "reason": f"status={status}"
                    }
                )

                continue

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

            draw_recall = get_draw_recall(
                report
            )

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

            target_column = get_target_column(
                report
            )

            missing_metadata = []

            if accuracy is None:
                missing_metadata.append("accuracy")

            if macro_f1 is None:
                missing_metadata.append("macro_f1")

            if draw_recall is None:
                missing_metadata.append("draw_recall")

            if not feature_columns:
                missing_metadata.append("features")

            if not source_file:
                missing_metadata.append("source")

            if missing_metadata:

                reason = (
                    "missing required metadata: "
                    + ", ".join(missing_metadata)
                )

                print(
                    f"   ⚠️ SKIPPED: {pipeline_step} "
                    f"({model_type}) - {reason}"
                )

                skipped_candidates.append(
                    {
                        "file": basename,
                        "pipeline_step": pipeline_step,
                        "reason": reason
                    }
                )

                continue

            validate_feature_contract(
                feature_columns
            )

            required_ewma_tracks = (
                detect_required_ewma_tracks(
                    feature_columns
                )
            )

            feature_version = (
                get_feature_version(
                    source_file,
                    feature_columns
                )
            )

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
                "target_column": target_column,
                "feature_version": feature_version,
                "required_ewma_tracks": (
                    required_ewma_tracks
                ),
                "accuracy": accuracy,
                "macro_f1": macro_f1,
                "draw_recall": draw_recall,
                "score": score,
                "report_file": os.path.abspath(
                    report_file
                ),
                "model_parameters": (
                    model_parameters
                ),
                "parameter_source": (
                    "report"
                    if model_parameters
                    else "deployment_fallback"
                )
            }

            valid_candidates.append(
                candidate
            )

            tracks_note = (
                ", ".join(
                    required_ewma_tracks
                )
                if required_ewma_tracks
                else "none"
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
                f"Features: {feature_version} | "
                f"EWMA: {tracks_note} | "
                f"{parameter_note}"
            )

        except Exception as exc:

            print(
                f"   ⚠️ Could not parse "
                f"{basename}: {exc}"
            )

            skipped_candidates.append(
                {
                    "file": basename,
                    "reason": str(exc)
                }
            )

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

    return (
        valid_candidates,
        skipped_candidates
    )


# ============================================================
# CHAMPION SELECTION
# ============================================================

def select_champion(
    valid_candidates
):

    print(
        "\n[2/5] Selecting Champion..."
    )

    valid_candidates.sort(
        key=lambda item: (
            item["score"],
            item["accuracy"],
            item["macro_f1"],
            item["draw_recall"]
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
        f"      Feature Ver.: "
        f"{champion['feature_version']}"
    )

    print(
        f"      Features:     "
        f"{len(champion['features'])} columns"
    )

    tracks_display = (
        ", ".join(
            champion["required_ewma_tracks"]
        )
        if champion["required_ewma_tracks"]
        else "none"
    )

    print(
        f"      EWMA Tracks:  "
        f"{tracks_display}"
    )

    print(
        f"      Parameters:   "
        f"{champion['parameter_source']}"
    )

    return champion


# ============================================================
# ATOMIC JSON
# ============================================================

def atomic_json_dump(
    data,
    target_file
):
    os.makedirs(
        os.path.dirname(target_file),
        exist_ok=True
    )

    temp_file = (
        target_file
        + ".tmp"
    )

    with open(
        temp_file,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            data,
            f,
            indent=2,
            allow_nan=False
        )

    os.replace(
        temp_file,
        target_file
    )


# ============================================================
# TRAIN CHAMPION
# ============================================================

def train_champion(
    champion
):

    print(
        "\n[3/5] Training Champion "
        "on 100% of canonical source data..."
    )

    source_file = champion[
        "source_file"
    ]

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
        f"   ↳ Source rows: {len(df):,}"
    )

    target_column = champion.get(
        "target_column",
        "target"
    )

    if target_column not in df.columns:
        raise RuntimeError(
            "Champion source is missing target column: "
            + target_column
        )

    feature_columns = champion[
        "features"
    ]

    missing_features = [
        feature
        for feature in feature_columns
        if feature not in df.columns
    ]

    if missing_features:
        raise RuntimeError(
            "Missing required champion features: "
            + str(missing_features)
        )

    validate_feature_contract(
        feature_columns
    )

    # --------------------------------------------------------
    # MATCH ID INTEGRITY
    # --------------------------------------------------------

    if "zokascore_match_id" in df.columns:

        if df[
            "zokascore_match_id"
        ].isna().any():

            raise RuntimeError(
                "Champion source contains missing "
                "zokascore_match_id values."
            )

        if df[
            "zokascore_match_id"
        ].duplicated().any():

            raise RuntimeError(
                "Champion source contains duplicate "
                "zokascore_match_id values."
            )

    # --------------------------------------------------------
    # TRAINING DATA
    # --------------------------------------------------------

    working = df[
        feature_columns + [target_column]
    ].copy()

    source_rows = len(working)

    working = working.replace(
        [np.inf, -np.inf],
        np.nan
    )

    working = working.dropna(
        subset=(
            feature_columns
            + [target_column]
        )
    ).reset_index(
        drop=True
    )

    dropped = (
        source_rows
        - len(working)
    )

    if dropped:

        print(
            f"   ⚠️ Dropped {dropped:,} rows "
            f"containing invalid training data."
        )

    if len(working) == 0:
        raise RuntimeError(
            "No valid training rows remain."
        )

    X = working[
        feature_columns
    ].astype(
        np.float64
    )

    y_raw = working[
        target_column
    ].astype(
        str
    ).str.strip()

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

    le.fit(
        EXPECTED_LABELS
    )

    y = le.transform(
        y_raw
    )

    if list(le.classes_) != EXPECTED_LABELS:
        raise RuntimeError(
            "Unexpected label encoder ordering: "
            + str(list(le.classes_))
        )

    label_mapping = {
        str(index): str(label)
        for index, label in enumerate(
            le.classes_
        )
    }

    atomic_json_dump(
        label_mapping,
        LABEL_MAPPING_FILE
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

    forbidden_param_keys = {
        "objective",
        "num_class",
        "random_state",
        "n_jobs",
        "eval_metric",
        "tree_method"
    }

    for key in list(params.keys()):

        if key in forbidden_param_keys:
            del params[key]

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
        f"\n   ↳ Fitting on {len(X):,} matches..."
    )

    model.fit(
        X,
        y,
        sample_weight=sample_weights
    )

    # --------------------------------------------------------
    # MODEL CONTRACT
    # --------------------------------------------------------

    actual_feature_count = getattr(
        model,
        "n_features_in_",
        None
    )

    if actual_feature_count != len(
        feature_columns
    ):
        raise RuntimeError(
            "Champion model feature count does not "
            "match feature contract."
        )

    model_feature_names = getattr(
        model,
        "feature_names_in_",
        None
    )

    if model_feature_names is not None:

        model_feature_names = [
            str(x)
            for x in model_feature_names
        ]

        expected_feature_names = [
            str(x)
            for x in feature_columns
        ]

        if model_feature_names != expected_feature_names:
            raise RuntimeError(
                "XGBoost feature-name contract does not "
                "match champion feature order."
            )

    # --------------------------------------------------------
    # ATOMIC MODEL SAVE
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
        "   ✅ Champion model saved:"
    )

    print(
        f"      {CHAMPION_MODEL_FILE}"
    )

    # --------------------------------------------------------
    # FEATURE SCHEMA
    # --------------------------------------------------------

    feature_schema = {
        "pipeline_step": "44",
        "champion_pipeline_step": (
            champion["pipeline_step"]
        ),
        "feature_version": (
            champion["feature_version"]
        ),
        "source_file": source_file,
        "target_column": target_column,
        "feature_count": len(
            feature_columns
        ),
        "features": feature_columns,
        "target_classes": EXPECTED_LABELS,
        "training_rows": int(len(X)),
        "source_rows": int(len(df)),
        "dropped_invalid_rows": int(dropped),
        "required_ewma_tracks": (
            champion["required_ewma_tracks"]
        ),
        "ewma_configuration": EWMA_ALPHAS,
        "model_parameters": params
    }

    atomic_json_dump(
        feature_schema,
        FEATURE_SCHEMA_FILE
    )

    print(
        "   ✅ Feature contract saved:"
    )

    print(
        f"      {FEATURE_SCHEMA_FILE}"
    )

    return (
        model,
        params,
        len(X)
    )


# ============================================================
# EWMA STATE
# ============================================================

def create_ewma_track_state():
    """
    JSON-safe equivalent of the Step 40B state.

    Structure:

    {
        "overall": {
            "pts": ...,
            "gd": ...,
            "gf": ...,
            "ga": ...
        },
        "home": {...},
        "away": {...}
    }
    """

    state = {}

    for venue in [
        "overall",
        "home",
        "away"
    ]:

        state[venue] = {}

        for stat in EWMA_STAT_KEYS:

            initial = (
                1.0
                if stat in (
                    "pts",
                    "gf",
                    "ga"
                )
                else 0.0
            )

            state[venue][stat] = initial

    return state


def create_team_state():

    state = {
        "elo": 1500.0,
        "matches": 0,
        "home_matches": 0,
        "away_matches": 0,
        "ewma": {}
    }

    for track in EWMA_TRACKS:

        state["ewma"][track] = (
            create_ewma_track_state()
        )

    return state


def ewma_update(
    previous,
    current,
    alpha
):
    return (
        alpha * current
        + (1.0 - alpha) * previous
    )


def update_team_ewma(
    team_state,
    track,
    overall_values,
    venue,
    alpha
):
    ewma_state = team_state[
        "ewma"
    ][
        track
    ]

    for stat in EWMA_STAT_KEYS:

        current = overall_values[
            stat
        ]

        ewma_state[
            "overall"
        ][
            stat
        ] = ewma_update(
            ewma_state[
                "overall"
            ][
                stat
            ],
            current,
            alpha
        )

        ewma_state[
            venue
        ][
            stat
        ] = ewma_update(
            ewma_state[
                venue
            ][
                stat
            ],
            current,
            alpha
        )


# ============================================================
# FEATURE NAME HELPER
# ============================================================

def get_model_side_feature_name(
    side,
    alpha_label,
    stat,
    venue=None
):
    parts = [
        side,
        "ewma"
    ]

    if alpha_label != "medium":
        parts.append(alpha_label)

    if venue:
        parts.append(venue)

    parts.append(stat)

    return "_".join(parts)


# ============================================================
# LIVE STATE REPLAY
# ============================================================

def replay_history(
    champion
):

    print(
        "\n[4/5] Replaying canonical history "
        "using Step 40B EWMA definitions..."
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
        column
        for column in required_columns
        if column not in master_df.columns
    ]

    if missing:
        raise RuntimeError(
            "master_with_elo.csv is missing "
            f"required replay columns: {missing}"
        )

    # --------------------------------------------------------
    # MATCH ID INTEGRITY
    # --------------------------------------------------------

    if master_df[
        "zokascore_match_id"
    ].isna().any():

        raise RuntimeError(
            "Canonical master contains missing "
            "zokascore_match_id values."
        )

    if master_df[
        "zokascore_match_id"
    ].duplicated().any():

        raise RuntimeError(
            "Canonical master contains duplicate "
            "zokascore_match_id values."
        )

    # --------------------------------------------------------
    # DATE
    # --------------------------------------------------------

    master_df["date"] = pd.to_datetime(
        master_df["date"],
        errors="coerce"
    )

    # --------------------------------------------------------
    # NUMERIC CONVERSION
    # --------------------------------------------------------

    numeric_columns = [
        "home_score",
        "away_score",
        "home_elo_pre",
        "away_elo_pre",
        "home_elo_delta",
        "away_elo_delta"
    ]

    for column in numeric_columns:

        master_df[column] = pd.to_numeric(
            master_df[column],
            errors="coerce"
        )

    master_df = master_df.dropna(
        subset=[
            "date",
            "home_team_id",
            "away_team_id",
            "home_score",
            "away_score",
            "home_elo_pre",
            "away_elo_pre",
            "home_elo_delta",
            "away_elo_delta"
        ]
    ).copy()

    if master_df.empty:
        raise RuntimeError(
            "Canonical replay contains zero valid matches."
        )

    if master_df[
        numeric_columns
    ].isna().any().any():

        raise RuntimeError(
            "Canonical replay contains invalid numeric values."
        )

    # --------------------------------------------------------
    # DETERMINISTIC CHRONOLOGY
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # TEAM STATES
    # --------------------------------------------------------

    team_states = {}

    def get_state(team_id):

        team_id = str(team_id)

        if team_id not in team_states:

            team_states[
                team_id
            ] = create_team_state()

        return team_states[
            team_id
        ]

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

        if home_id == away_id:
            raise RuntimeError(
                "Canonical replay contains a match where "
                f"home and away team IDs are identical: "
                f"{home_id}"
            )

        home_state = get_state(
            home_id
        )

        away_state = get_state(
            away_id
        )

        # ----------------------------------------------------
        # ELO
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

        if home_score < 0 or away_score < 0:
            raise RuntimeError(
                "Negative score detected during replay."
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
        # CURRENT MATCH VALUES
        # ----------------------------------------------------

        home_values = {
            "pts": home_points,
            "gd": home_score - away_score,
            "gf": home_score,
            "ga": away_score
        }

        away_values = {
            "pts": away_points,
            "gd": away_score - home_score,
            "gf": away_score,
            "ga": home_score
        }

        # ----------------------------------------------------
        # STEP 40B MULTI-ALPHA UPDATE
        # ----------------------------------------------------

        for track in EWMA_TRACKS:

            alpha = EWMA_ALPHAS[
                track
            ]

            update_team_ewma(
                team_state=home_state,
                track=track,
                overall_values=home_values,
                venue="home",
                alpha=alpha
            )

            update_team_ewma(
                team_state=away_state,
                track=track,
                overall_values=away_values,
                venue="away",
                alpha=alpha
            )

        # ----------------------------------------------------
        # MATCH COUNTERS
        # ----------------------------------------------------

        home_state[
            "matches"
        ] += 1

        away_state[
            "matches"
        ] += 1

        home_state[
            "home_matches"
        ] += 1

        away_state[
            "away_matches"
        ] += 1

    # --------------------------------------------------------
    # FINAL STATE VALIDATION
    # --------------------------------------------------------

    if not team_states:
        raise RuntimeError(
            "History replay produced zero team states."
        )

    for team_id, state in team_states.items():

        if not np.isfinite(
            state["elo"]
        ):
            raise RuntimeError(
                "Non-finite ELO detected for team: "
                + str(team_id)
            )

        for track in EWMA_TRACKS:

            ewma_state = state[
                "ewma"
            ][
                track
            ]

            for venue in [
                "overall",
                "home",
                "away"
            ]:

                for stat in EWMA_STAT_KEYS:

                    value = ewma_state[
                        venue
                    ][
                        stat
                    ]

                    if not np.isfinite(value):
                        raise RuntimeError(
                            "Non-finite EWMA state detected: "
                            f"team={team_id}, "
                            f"track={track}, "
                            f"venue={venue}, "
                            f"stat={stat}"
                        )

    # --------------------------------------------------------
    # ATOMIC SAVE
    # --------------------------------------------------------

    atomic_json_dump(
        team_states,
        LIVE_STATE_FILE
    )

    print(
        f"   ✅ Live state for "
        f"{len(team_states):,} teams saved:"
    )

    print(
        f"      {LIVE_STATE_FILE}"
    )

    print(
        "   🔒 EWMA tracks: "
        + ", ".join(EWMA_TRACKS)
    )

    print(
        f"      fast   = {EWMA_ALPHAS['fast']}"
    )

    print(
        f"      medium = {EWMA_ALPHAS['medium']}"
    )

    print(
        f"      slow   = {EWMA_ALPHAS['slow']}"
    )

    return team_states


# ============================================================
# LIVE STATE CONTRACT
# ============================================================

def validate_live_state_contract(
    champion,
    team_states
):

    required_tracks = champion[
        "required_ewma_tracks"
    ]

    if not required_tracks:

        print(
            "   ℹ️ Champion does not require EWMA "
            "tracks in its feature contract."
        )

        return

    for team_id, state in team_states.items():

        if "ewma" not in state:
            raise RuntimeError(
                "Live state missing EWMA container "
                f"for team {team_id}."
            )

        for track in required_tracks:

            if track not in state["ewma"]:
                raise RuntimeError(
                    "Live state missing required EWMA "
                    f"track '{track}' for team {team_id}."
                )

            ewma_state = state[
                "ewma"
            ][
                track
            ]

            for venue in [
                "overall",
                "home",
                "away"
            ]:

                if venue not in ewma_state:
                    raise RuntimeError(
                        "Live state missing EWMA venue: "
                        f"team={team_id}, "
                        f"track={track}, "
                        f"venue={venue}"
                    )

                for stat in EWMA_STAT_KEYS:

                    if stat not in ewma_state[
                        venue
                    ]:

                        raise RuntimeError(
                            "Live state missing EWMA field: "
                            f"team={team_id}, "
                            f"track={track}, "
                            f"venue={venue}, "
                            f"stat={stat}"
                        )

    print(
        "   ✅ Live state contains all EWMA "
        "tracks required by champion."
    )


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
            "rows": int(training_rows),
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
            "ewma_tracks": EWMA_TRACKS,
            "ewma_alpha": EWMA_ALPHAS,
            "required_champion_tracks": (
                champion[
                    "required_ewma_tracks"
                ]
            ),
            "replay_source": os.path.abspath(
                MASTER_FILE
            )
        },

        "feature_contract": {
            "feature_version": (
                champion[
                    "feature_version"
                ]
            ),
            "source_file": (
                champion[
                    "source_file"
                ]
            ),
            "feature_count": len(
                champion["features"]
            ),
            "features": champion[
                "features"
            ],
            "target_column": champion.get(
                "target_column",
                "target"
            ),
            "target_classes": EXPECTED_LABELS
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

        "deployment_integrity": {
            "canonical_ewma_definition": "STEP_40B",
            "no_feature_recalculation": True,
            "feature_contract_is_authoritative": True,
            "live_state_replayed_chronologically": True,
            "json_safe_live_state": True
        },

        "deployed_at": pd.Timestamp.now().isoformat()
    }

    atomic_json_dump(
        manifest,
        CHAMPION_MANIFEST_FILE
    )

    print(
        "   ✅ Manifest saved:"
    )

    print(
        f"      {CHAMPION_MANIFEST_FILE}"
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

    # --------------------------------------------------------
    # FILES
    # --------------------------------------------------------

    checks.append(
        (
            "Champion model exists",
            os.path.isfile(
                CHAMPION_MODEL_FILE
            )
        )
    )

    checks.append(
        (
            "Label mapping exists",
            os.path.isfile(
                LABEL_MAPPING_FILE
            )
        )
    )

    checks.append(
        (
            "Feature schema exists",
            os.path.isfile(
                FEATURE_SCHEMA_FILE
            )
        )
    )

    checks.append(
        (
            "Live state exists",
            os.path.isfile(
                LIVE_STATE_FILE
            )
        )
    )

    checks.append(
        (
            "Deployment manifest exists",
            os.path.isfile(
                CHAMPION_MANIFEST_FILE
            )
        )
    )

    # --------------------------------------------------------
    # MODEL FEATURE COUNT
    # --------------------------------------------------------

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
            actual_features == expected_features
        )
    )

    # --------------------------------------------------------
    # MODEL FEATURE ORDER
    # --------------------------------------------------------

    model_feature_names = getattr(
        model,
        "feature_names_in_",
        None
    )

    if model_feature_names is not None:

        model_feature_names = [
            str(x)
            for x in model_feature_names
        ]

        checks.append(
            (
                "Model feature order matches contract",
                model_feature_names
                == [
                    str(x)
                    for x in champion["features"]
                ]
            )
        )

    # --------------------------------------------------------
    # TRAINING
    # --------------------------------------------------------

    checks.append(
        (
            "Training population > 0",
            training_rows > 0
        )
    )

    # --------------------------------------------------------
    # TEAM STATE
    # --------------------------------------------------------

    checks.append(
        (
            "Live team state > 0",
            len(team_states) > 0
        )
    )

    # --------------------------------------------------------
    # LABEL MAPPING
    # --------------------------------------------------------

    label_mapping_valid = False

    try:

        with open(
            LABEL_MAPPING_FILE,
            "r",
            encoding="utf-8"
        ) as f:

            mapping = json.load(f)

        expected_mapping = {
            "0": "AWAY_WIN",
            "1": "DRAW",
            "2": "HOME_WIN"
        }

        label_mapping_valid = (
            mapping == expected_mapping
        )

    except Exception:
        label_mapping_valid = False

    checks.append(
        (
            "Label mapping is canonical",
            label_mapping_valid
        )
    )

    # --------------------------------------------------------
    # FEATURE SCHEMA
    # --------------------------------------------------------

    feature_schema_valid = False

    try:

        with open(
            FEATURE_SCHEMA_FILE,
            "r",
            encoding="utf-8"
        ) as f:

            schema = json.load(f)

        feature_schema_valid = (
            schema.get("feature_count")
            == expected_features
            and schema.get("features")
            == champion["features"]
            and schema.get("target_classes")
            == EXPECTED_LABELS
            and schema.get("target_column")
            == champion.get(
                "target_column",
                "target"
            )
        )

    except Exception:
        feature_schema_valid = False

    checks.append(
        (
            "Feature schema matches champion",
            feature_schema_valid
        )
    )

    # --------------------------------------------------------
    # LIVE STATE
    # --------------------------------------------------------

    live_state_contract_valid = True

    try:

        with open(
            LIVE_STATE_FILE,
            "r",
            encoding="utf-8"
        ) as f:

            saved_live_state = json.load(f)

        if not isinstance(
            saved_live_state,
            dict
        ):
            live_state_contract_valid = False

        if len(saved_live_state) != len(
            team_states
        ):
            live_state_contract_valid = False

        required_tracks = champion[
            "required_ewma_tracks"
        ]

        for team_id, state in saved_live_state.items():

            if not isinstance(
                state,
                dict
            ):
                live_state_contract_valid = False
                break

            if "ewma" not in state:
                live_state_contract_valid = False
                break

            for track in required_tracks:

                if track not in state["ewma"]:
                    live_state_contract_valid = False
                    break

                ewma_state = state[
                    "ewma"
                ][
                    track
                ]

                for venue in [
                    "overall",
                    "home",
                    "away"
                ]:

                    if venue not in ewma_state:
                        live_state_contract_valid = False
                        break

                    for stat in EWMA_STAT_KEYS:

                        if stat not in ewma_state[
                            venue
                        ]:
                            live_state_contract_valid = False
                            break

    except Exception:
        live_state_contract_valid = False

    checks.append(
        (
            "Live EWMA state matches champion contract",
            live_state_contract_valid
        )
    )

    # --------------------------------------------------------
    # MANIFEST
    # --------------------------------------------------------

    manifest_valid = False

    try:

        with open(
            CHAMPION_MANIFEST_FILE,
            "r",
            encoding="utf-8"
        ) as f:

            manifest = json.load(f)

        manifest_valid = (
            manifest.get("status")
            == "DEPLOYED"
            and manifest.get(
                "pipeline_step"
            )
            == "44"
            and manifest.get(
                "deployment_integrity",
                {}
            ).get(
                "canonical_ewma_definition"
            )
            == "STEP_40B"
        )

    except Exception:
        manifest_valid = False

    checks.append(
        (
            "Deployment manifest is valid",
            manifest_valid
        )
    )

    # --------------------------------------------------------
    # REPORT
    # --------------------------------------------------------

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

            failed.append(name)

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

    print(
        " STEP 40B MULTI-ALPHA LIVE CONTRACT"
    )

    print("=" * 60)

    print()

    os.makedirs(
        MODELS_DIR,
        exist_ok=True
    )

    # --------------------------------------------------------
    # CANONICAL CONFIG
    # --------------------------------------------------------

    print(
        "🔒 Canonical EWMA configuration:"
    )

    print(
        f"   fast   = {EWMA_ALPHAS['fast']}"
    )

    print(
        f"   medium = {EWMA_ALPHAS['medium']}"
    )

    print(
        f"   slow   = {EWMA_ALPHAS['slow']}"
    )

    print()

    # --------------------------------------------------------
    # 1. AUDIT
    # --------------------------------------------------------

    (
        valid_candidates,
        skipped_candidates
    ) = audit_candidates()

    # --------------------------------------------------------
    # 2. SELECT CHAMPION
    # --------------------------------------------------------

    champion = select_champion(
        valid_candidates
    )

    champion_tracks_display = (
        ", ".join(
            champion["required_ewma_tracks"]
        )
        if champion["required_ewma_tracks"]
        else "none"
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
            + str(
                champion["source_file"]
            )
        )

    print(
        "\n   🔎 Champion source verified:"
    )

    print(
        f"      {source_path}"
    )

    print(
        "\n   🔎 Feature version:"
    )

    print(
        f"      {champion['feature_version']}"
    )

    print(
        "\n   🔎 Required EWMA tracks:"
    )

    print(
        f"      {champion_tracks_display}"
    )

    # --------------------------------------------------------
    # 3. TRAIN
    # --------------------------------------------------------

    (
        model,
        model_params,
        training_rows
    ) = train_champion(
        champion
    )

    # --------------------------------------------------------
    # 4. REPLAY
    # --------------------------------------------------------

    team_states = replay_history(
        champion
    )

    validate_live_state_contract(
        champion,
        team_states
    )

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
        f"📐 Feature version: "
        f"{champion['feature_version']}"
    )

    print(
        f"⚡ EWMA tracks:      "
        f"{champion_tracks_display}"
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
        "📁 Label mapping:"
    )

    print(
        f"   {LABEL_MAPPING_FILE}"
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

    print()

    print("=" * 60)

    print(
        "🔒 ZOKASCORE V2 champion deployment is "
        "internally validated."
    )

    print(
        "🔒 Step 40B is the canonical EWMA definition."
    )

    print(
        "🔒 Historical training and live-state replay "
        "share the same multi-alpha semantics."
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()