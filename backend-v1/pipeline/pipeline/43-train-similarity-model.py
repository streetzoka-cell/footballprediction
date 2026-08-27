import os
import json
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    balanced_accuracy_score,
    f1_score,
    log_loss
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight


# ============================================================
# ZOKASCORE V2 — STEP 43
# ELO + EWMA SIGNAL FUSION & SIMILARITY
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ml",
    "features_v3.csv"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "models"
)

REPORT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "processed"
)

MODEL_FILE = os.path.join(
    OUTPUT_DIR,
    "xgboost_similarity_v1.joblib"
)

REPORT_FILE = os.path.join(
    REPORT_DIR,
    "xgboost_similarity_model_report.json"
)

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80


# ============================================================
# REFERENCE MODELS
# ============================================================

BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23
XGB_BALANCED_ACCURACY = 48.17
XGB_NATURAL_ACCURACY = 51.50
XGB_EWMA_ACCURACY = 48.19
XGB_RELATIVE_ACCURACY = 47.66
XGB_COMBINED_ACCURACY = 48.25


# ============================================================
# RAW FEATURES FROM STEP 40
# ============================================================

RAW_FEATURES = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

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
]


# ============================================================
# ENGINEERED FEATURES
# ============================================================
#
# IMPORTANT:
# Step 40 already contains "elo_diff".
# Therefore we do NOT create a duplicate "elo_diff_signed".
#
# This keeps the experiment deterministic and avoids feeding
# mathematically identical ELO signals into the model twice.
# ============================================================

ENGINEERED_FEATURES = [

    # --------------------------------------------------------
    # Signed differences
    # --------------------------------------------------------

    "form_diff",
    "gd_diff",
    "venue_form_diff",
    "venue_gd_diff",

    # --------------------------------------------------------
    # ELO × form interaction
    # --------------------------------------------------------

    "elo_form_conflict",
    "venue_elo_form_conflict",

    # --------------------------------------------------------
    # Absolute similarity gaps
    # --------------------------------------------------------

    "elo_gap_abs",
    "form_gap_abs",
    "gd_gap_abs",
    "venue_form_gap_abs",
    "venue_gd_gap_abs",

    # --------------------------------------------------------
    # Attack / defense similarity
    # --------------------------------------------------------

    "attack_gap_abs",
    "defense_gap_abs"
]


FEATURE_COLUMNS = RAW_FEATURES + ENGINEERED_FEATURES


LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]


# ============================================================
# JSON SERIALIZATION SAFETY
# ============================================================

def json_safe(value):
    """
    Convert NumPy / pandas scalar types into native Python
    types so json.dump() cannot fail on np.float32, np.int64,
    np.bool_, etc.
    """

    if isinstance(value, dict):
        return {
            str(k): json_safe(v)
            for k, v in value.items()
        }

    if isinstance(value, list):
        return [
            json_safe(v)
            for v in value
        ]

    if isinstance(value, tuple):
        return [
            json_safe(v)
            for v in value
        ]

    if isinstance(value, np.ndarray):
        return [
            json_safe(v)
            for v in value.tolist()
        ]

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        return float(value)

    if isinstance(value, np.bool_):
        return bool(value)

    if pd.isna(value):
        return None

    return value


# ============================================================
# FEATURE ENGINEERING
# ============================================================

def engineer_features(data):
    """
    Generate deterministic row-local pre-match features.

    No target/result information is used.
    """

    # --------------------------------------------------------
    # Signed form differences
    # --------------------------------------------------------

    data["form_diff"] = (
        data["home_ewma_pts"]
        - data["away_ewma_pts"]
    )

    data["gd_diff"] = (
        data["home_ewma_gd"]
        - data["away_ewma_gd"]
    )

    data["venue_form_diff"] = (
        data["home_ewma_home_pts"]
        - data["away_ewma_away_pts"]
    )

    data["venue_gd_diff"] = (
        data["home_ewma_home_gd"]
        - data["away_ewma_away_gd"]
    )

    # --------------------------------------------------------
    # ELO × form interaction
    # --------------------------------------------------------

    data["elo_form_conflict"] = (
        data["elo_diff"]
        * data["form_diff"]
    )

    data["venue_elo_form_conflict"] = (
        data["elo_diff"]
        * data["venue_form_diff"]
    )

    # --------------------------------------------------------
    # Absolute similarity gaps
    # --------------------------------------------------------

    data["elo_gap_abs"] = (
        data["elo_diff"]
        .abs()
    )

    data["form_gap_abs"] = (
        data["home_ewma_pts"]
        - data["away_ewma_pts"]
    ).abs()

    data["gd_gap_abs"] = (
        data["home_ewma_gd"]
        - data["away_ewma_gd"]
    ).abs()

    data["venue_form_gap_abs"] = (
        data["home_ewma_home_pts"]
        - data["away_ewma_away_pts"]
    ).abs()

    data["venue_gd_gap_abs"] = (
        data["home_ewma_home_gd"]
        - data["away_ewma_away_gd"]
    ).abs()

    # --------------------------------------------------------
    # Attack similarity
    # --------------------------------------------------------

    data["attack_gap_abs"] = (
        data["home_ewma_gf"]
        - data["away_ewma_gf"]
    ).abs()

    # --------------------------------------------------------
    # Defensive similarity
    # --------------------------------------------------------

    data["defense_gap_abs"] = (
        data["home_ewma_ga"]
        - data["away_ewma_ga"]
    ).abs()

    return data


# ============================================================
# MAIN PIPELINE
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 43")
    print(" ELO + EWMA SIGNAL FUSION & SIMILARITY")
    print("=" * 60)
    print()

    # ========================================================
    # 1. CHECK SOURCE
    # ========================================================

    print("[1/8] Checking Step 40 feature dataset...")

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Feature dataset not found:\n{FEATURES_FILE}"
        )

    print("   ✅ Step 40 feature dataset found.")

    # ========================================================
    # 2. LOAD FEATURES
    # ========================================================

    print("\n[2/8] Loading features...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(
            f"POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {len(df):,}."
        )

    print(
        f"   ↳ Rows loaded: {len(df):,}"
    )

    # ========================================================
    # 3. VALIDATE SOURCE
    # ========================================================

    print("\n[3/8] Validating raw source dataset...")

    required_columns = (
        RAW_FEATURES
        + [
            "match_id",
            "date",
            "target"
        ]
    )

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        raise RuntimeError(
            f"Missing required columns: {missing}"
        )

    # --------------------------------------------------------
    # Match ID integrity
    # --------------------------------------------------------

    if df["match_id"].isna().any():
        raise RuntimeError(
            "Match IDs contain missing values."
        )

    if df["match_id"].duplicated().any():
        raise RuntimeError(
            "Match IDs are duplicated."
        )

    # --------------------------------------------------------
    # Date integrity
    # --------------------------------------------------------

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    if df["date"].isna().any():
        raise RuntimeError(
            "Invalid dates found."
        )

    # --------------------------------------------------------
    # Numeric integrity
    # --------------------------------------------------------

    for col in RAW_FEATURES:

        df[col] = pd.to_numeric(
            df[col],
            errors="coerce"
        )

        if df[col].isna().any():
            raise RuntimeError(
                f"{col} contains invalid/missing values."
            )

    # --------------------------------------------------------
    # Target integrity
    # --------------------------------------------------------

    invalid_targets = (
        set(df["target"].unique())
        - set(LABELS)
    )

    if invalid_targets:
        raise RuntimeError(
            f"Invalid target values: {invalid_targets}"
        )

    print(
        "   ✅ Structural, numeric, identity, "
        "and target integrity verified."
    )

    # ========================================================
    # 4. CHRONOLOGICAL SPLIT
    # ========================================================

    print(
        "\n[4/8] Preparing deterministic "
        "chronological split..."
    )

    df = df.sort_values(
        by=["date", "match_id"],
        kind="mergesort"
    ).reset_index(drop=True)

    split_idx = int(
        len(df) * TRAIN_RATIO
    )

    train_df = df.iloc[
        :split_idx
    ].copy()

    test_df = df.iloc[
        split_idx:
    ].copy()

    print(
        f"   ↳ Training: "
        f"{len(train_df):,} matches "
        f"(Through "
        f"{train_df.iloc[-1]['date'].date()})"
    )

    print(
        f"   ↳ Testing:  "
        f"{len(test_df):,} matches "
        f"(From "
        f"{test_df.iloc[0]['date'].date()})"
    )

    # ========================================================
    # 5. ENGINEER FEATURES
    # ========================================================

    print(
        "\n[5/8] Engineering similarity & "
        "interaction features..."
    )

    train_df = engineer_features(
        train_df
    )

    test_df = engineer_features(
        test_df
    )

    # --------------------------------------------------------
    # Verify engineered features
    # --------------------------------------------------------

    for col in ENGINEERED_FEATURES:

        if col not in train_df.columns:
            raise RuntimeError(
                f"Engineered feature missing: {col}"
            )

        if col not in test_df.columns:
            raise RuntimeError(
                f"Engineered feature missing: {col}"
            )

        if not np.isfinite(
            train_df[col].to_numpy(
                dtype=float
            )
        ).all():

            raise RuntimeError(
                f"Non-finite values found in "
                f"training feature: {col}"
            )

        if not np.isfinite(
            test_df[col].to_numpy(
                dtype=float
            )
        ).all():

            raise RuntimeError(
                f"Non-finite values found in "
                f"testing feature: {col}"
            )

    X_train = train_df[
        FEATURE_COLUMNS
    ].astype(float)

    X_test = test_df[
        FEATURE_COLUMNS
    ].astype(float)

    y_train_raw = (
        train_df["target"]
        .astype(str)
    )

    y_test_raw = (
        test_df["target"]
        .astype(str)
    )

    print(
        f"   ↳ Raw features:       "
        f"{len(RAW_FEATURES)}"
    )

    print(
        f"   ↳ Engineered features:"
        f" {len(ENGINEERED_FEATURES)}"
    )

    print(
        f"   ↳ Total features:     "
        f"{len(FEATURE_COLUMNS)}"
    )

    print(
        "   ✅ Similarity features generated "
        "from pre-match information only."
    )

    # ========================================================
    # 6. TARGET ENCODING
    # ========================================================

    print(
        "\n[6/8] Encoding targets "
        "(fit on train only)..."
    )

    le = LabelEncoder()

    y_train = le.fit_transform(
        y_train_raw
    )

    y_test = le.transform(
        y_test_raw
    )

    print("   ↳ Target mapping:")

    for index, label in enumerate(
        le.classes_
    ):
        print(
            f"      {index} → {label}"
        )

    # ========================================================
    # 7. TRAIN XGBOOST
    # ========================================================

    print(
        "\n[7/8] Training XGBoost "
        "(Balanced + Similarity Features)..."
    )

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )

    model = xgb.XGBClassifier(

        objective="multi:softprob",

        num_class=3,

        n_estimators=300,

        learning_rate=0.05,

        max_depth=6,

        min_child_weight=3,

        subsample=0.85,

        colsample_bytree=0.85,

        gamma=0.0,

        reg_alpha=0.0,

        reg_lambda=1.0,

        random_state=42,

        n_jobs=-1,

        eval_metric="mlogloss",

        tree_method="hist"
    )

    model.fit(
        X_train,
        y_train,
        sample_weight=sample_weights
    )

    print(
        "   ✅ Model trained."
    )

    # ========================================================
    # 8. EVALUATE + SAVE
    # ========================================================

    print(
        "\n[8/8] Evaluating and saving artifacts..."
    )

    y_pred = model.predict(
        X_test
    )

    y_prob = model.predict_proba(
        X_test
    )

    y_test_str = le.inverse_transform(
        y_test
    )

    y_pred_str = le.inverse_transform(
        y_pred
    )

    # --------------------------------------------------------
    # Metrics
    # --------------------------------------------------------

    accuracy = accuracy_score(
        y_test_str,
        y_pred_str
    )

    balanced_accuracy = (
        balanced_accuracy_score(
            y_test_str,
            y_pred_str
        )
    )

    macro_f1 = f1_score(
        y_test_str,
        y_pred_str,
        average="macro"
    )

    weighted_f1 = f1_score(
        y_test_str,
        y_pred_str,
        average="weighted"
    )

    logloss = log_loss(
        y_test,
        y_prob,
        labels=np.arange(
            len(le.classes_)
        )
    )

    # --------------------------------------------------------
    # Differences vs reference models
    # --------------------------------------------------------

    accuracy_percent = accuracy * 100

    diff_baseline = (
        accuracy_percent
        - BASELINE_ACCURACY
    )

    diff_elo = (
        accuracy_percent
        - ELO_ONLY_ACCURACY
    )

    diff_xgb_bal = (
        accuracy_percent
        - XGB_BALANCED_ACCURACY
    )

    diff_xgb_nat = (
        accuracy_percent
        - XGB_NATURAL_ACCURACY
    )

    diff_xgb_ewma = (
        accuracy_percent
        - XGB_EWMA_ACCURACY
    )

    diff_xgb_rel = (
        accuracy_percent
        - XGB_RELATIVE_ACCURACY
    )

    diff_xgb_com = (
        accuracy_percent
        - XGB_COMBINED_ACCURACY
    )

    # --------------------------------------------------------
    # Classification metrics
    # --------------------------------------------------------

    report = classification_report(
        y_test_str,
        y_pred_str,
        labels=LABELS,
        output_dict=True,
        zero_division=0
    )

    cm = confusion_matrix(
        y_test_str,
        y_pred_str,
        labels=LABELS
    )

    # --------------------------------------------------------
    # Feature importances
    # --------------------------------------------------------

    importances = model.feature_importances_

    importances_dict = {
        feature: float(importance)
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
    }

    # --------------------------------------------------------
    # Signal groups
    # --------------------------------------------------------

    elo_features = [
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff",
        "elo_form_conflict",
        "venue_elo_form_conflict",
        "elo_gap_abs"
    ]

    ewma_features = [
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
        "away_ewma_away_ga",
        "form_diff",
        "gd_diff",
        "venue_form_diff",
        "venue_gd_diff",
        "form_gap_abs",
        "gd_gap_abs",
        "venue_form_gap_abs",
        "venue_gd_gap_abs",
        "attack_gap_abs",
        "defense_gap_abs"
    ]

    elo_feature_importance = sum(
        importances_dict.get(
            feature,
            0.0
        )
        for feature in elo_features
    )

    ewma_feature_importance = sum(
        importances_dict.get(
            feature,
            0.0
        )
        for feature in ewma_features
    )

    relative_non_elo_features = [
        feature
        for feature in ENGINEERED_FEATURES
        if feature not in [
            "elo_form_conflict",
            "venue_elo_form_conflict",
            "elo_gap_abs"
        ]
    ]

    relative_non_elo_importance = sum(
        importances_dict.get(
            feature,
            0.0
        )
        for feature in relative_non_elo_features
    )

    # ========================================================
    # CREATE DIRECTORIES
    # ========================================================

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORT_DIR,
        exist_ok=True
    )

    # ========================================================
    # SAVE MODEL ATOMICALLY
    # ========================================================

    temp_model = MODEL_FILE + ".tmp"

    joblib.dump(
        model,
        temp_model
    )

    os.replace(
        temp_model,
        MODEL_FILE
    )

    # ========================================================
    # MODEL REPORT
    # ========================================================

    model_report = {

        "pipeline_step": "43",

        "status": "PASS",

        "source": (
            "data/ml/features_v3.csv"
        ),

        "population": {

            "total_rows": EXPECTED_ROWS,

            "training_rows": len(
                train_df
            ),

            "testing_rows": len(
                test_df
            ),

            "train_ratio": TRAIN_RATIO
        },

        "date_range": {

            "training_through":
                train_df.iloc[-1]["date"]
                .strftime("%Y-%m-%d"),

            "testing_from":
                test_df.iloc[0]["date"]
                .strftime("%Y-%m-%d")
        },

        "features": {

            "raw": RAW_FEATURES,

            "engineered":
                ENGINEERED_FEATURES,

            "total":
                FEATURE_COLUMNS
        },

        "target": "target",

        "target_classes": LABELS,

        "model": {

            "type":
                "XGBoostClassifier "
                "(ELO + EWMA Signal Fusion "
                "& Similarity)",

            "n_estimators": 300,

            "max_depth": 6,

            "learning_rate": 0.05,

            "min_child_weight": 3,

            "subsample": 0.85,

            "colsample_bytree": 0.85,

            "gamma": 0.0,

            "reg_alpha": 0.0,

            "reg_lambda": 1.0,

            "objective":
                "multi:softprob",

            "sample_weight":
                "balanced "
                "(calculated from "
                "training set only)"
        },

        "evaluation": {

            "accuracy":
                float(accuracy),

            "accuracy_percent":
                float(accuracy_percent),

            "balanced_accuracy":
                float(balanced_accuracy),

            "macro_f1":
                float(macro_f1),

            "weighted_f1":
                float(weighted_f1),

            "log_loss":
                float(logloss),

            "baseline_accuracy_percent":
                float(BASELINE_ACCURACY),

            "elo_only_accuracy_percent":
                float(ELO_ONLY_ACCURACY),

            "xgb_balanced_accuracy_percent":
                float(XGB_BALANCED_ACCURACY),

            "xgb_natural_accuracy_percent":
                float(XGB_NATURAL_ACCURACY),

            "xgb_ewma_accuracy_percent":
                float(XGB_EWMA_ACCURACY),

            "xgb_relative_accuracy_percent":
                float(XGB_RELATIVE_ACCURACY),

            "xgb_combined_accuracy_percent":
                float(XGB_COMBINED_ACCURACY),

            "difference_vs_baseline_pp":
                float(diff_baseline),

            "difference_vs_elo_only_pp":
                float(diff_elo),

            "difference_vs_xgb_balanced_pp":
                float(diff_xgb_bal),

            "difference_vs_xgb_natural_pp":
                float(diff_xgb_nat),

            "difference_vs_xgb_ewma_pp":
                float(diff_xgb_ewma),

            "difference_vs_xgb_relative_pp":
                float(diff_xgb_rel),

            "difference_vs_xgb_combined_pp":
                float(diff_xgb_com),

            "classification_report":
                json_safe(report),

            "confusion_matrix":
                cm.tolist(),

            "feature_importances":
                json_safe(importances_dict),

            "signal_contribution": {

                "elo_features":
                    float(
                        elo_feature_importance
                    ),

                "elo_features_percent":
                    float(
                        elo_feature_importance
                        * 100
                    ),

                "ewma_features":
                    float(
                        ewma_feature_importance
                    ),

                "ewma_features_percent":
                    float(
                        ewma_feature_importance
                        * 100
                    ),

                "relative_non_elo_features":
                    float(
                        relative_non_elo_importance
                    ),

                "relative_non_elo_features_percent":
                    float(
                        relative_non_elo_importance
                        * 100
                    )
            }
        },

        "leakage_control": {

            "chronological_split":
                True,

            "same_day_order":
                "date + match_id",

            "target_mapping_applied_after_split":
                True,

            "sample_weights_from_train_only":
                True,

            "feature_engineering_applied_after_split":
                True,

            "features_use_target":
                False,

            "features_use_future_results":
                False,

            "source_dataset_modified":
                False
        },

        "output": MODEL_FILE
    }

    # ========================================================
    # FINAL JSON SAFETY PASS
    # ========================================================

    model_report = json_safe(
        model_report
    )

    # ========================================================
    # SAVE REPORT ATOMICALLY
    # ========================================================

    temp_report = REPORT_FILE + ".tmp"

    with open(
        temp_report,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            model_report,
            f,
            indent=2,
            allow_nan=False
        )

    os.replace(
        temp_report,
        REPORT_FILE
    )

    # ========================================================
    # CONSOLE OUTPUT
    # ========================================================

    print()
    print("=" * 60)
    print(" STEP 43 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"🎯 Accuracy:              "
        f"{accuracy_percent:.2f}%"
    )

    print(
        f"⚖️ Balanced Accuracy:     "
        f"{balanced_accuracy * 100:.2f}%"
    )

    print(
        f"🧠 Macro F1:              "
        f"{macro_f1 * 100:.2f}%"
    )

    print(
        f"📊 Weighted F1:           "
        f"{weighted_f1 * 100:.2f}%"
    )

    print(
        f"📉 Log Loss:              "
        f"{logloss:.4f}"
    )

    # ========================================================
    # REFERENCE MODELS
    # ========================================================

    print()
    print("📊 Reference Models")
    print("-" * 60)

    print(
        f"   Original baseline:     "
        f"{BASELINE_ACCURACY:.2f}%"
    )

    print(
        f"   ELO-only:              "
        f"{ELO_ONLY_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (Balanced):    "
        f"{XGB_BALANCED_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (Natural):     "
        f"{XGB_NATURAL_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (EWMA):        "
        f"{XGB_EWMA_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (Relative):    "
        f"{XGB_RELATIVE_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (Combined):    "
        f"{XGB_COMBINED_ACCURACY:.2f}%"
    )

    # ========================================================
    # COMPARISONS
    # ========================================================

    print()
    print("🚀 Model Comparison")
    print("-" * 60)

    print(
        f"   vs XGBoost (Combined): "
        f"{diff_xgb_com:+.2f} pp"
    )

    print(
        f"   vs XGBoost (EWMA):     "
        f"{diff_xgb_ewma:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Relative): "
        f"{diff_xgb_rel:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Balanced): "
        f"{diff_xgb_bal:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Natural):  "
        f"{diff_xgb_nat:+.2f} pp"
    )

    print(
        f"   vs ELO-only:           "
        f"{diff_elo:+.2f} pp"
    )

    print(
        f"   vs Original baseline:  "
        f"{diff_baseline:+.2f} pp"
    )

    # ========================================================
    # CLASSIFICATION REPORT
    # ========================================================

    print()
    print("📋 Classification Report")
    print("-" * 60)

    print(
        classification_report(
            y_test_str,
            y_pred_str,
            labels=LABELS,
            zero_division=0
        )
    )

    # ========================================================
    # CONFUSION MATRIX
    # ========================================================

    print("🧩 Confusion Matrix")
    print("-" * 60)

    print(
        f"{'':>12}"
        f"{'HOME_WIN':>12}"
        f"{'DRAW':>12}"
        f"{'AWAY_WIN':>12}"
    )

    for i, label in enumerate(LABELS):

        print(
            f"{label:>12}"
            f"{cm[i, 0]:>12,}"
            f"{cm[i, 1]:>12,}"
            f"{cm[i, 2]:>12,}"
        )

    # ========================================================
    # FEATURE IMPORTANCE
    # ========================================================

    print()
    print("🧠 Top 15 Feature Importances")
    print("-" * 60)

    importance_rows = sorted(
        zip(
            FEATURE_COLUMNS,
            importances
        ),
        key=lambda x: x[1],
        reverse=True
    )

    for rank, (
        feature,
        importance
    ) in enumerate(
        importance_rows[:15],
        start=1
    ):

        print(
            f"   {rank:>2}. "
            f"{feature:<32} "
            f"{importance * 100:>7.2f}%"
        )

    # ========================================================
    # SIGNAL CONTRIBUTION
    # ========================================================

    print()
    print("🧠 Signal Contribution")
    print("-" * 60)

    print(
        f"   ELO features:           "
        f"{elo_feature_importance * 100:.2f}%"
    )

    print(
        f"   EWMA features:          "
        f"{ewma_feature_importance * 100:.2f}%"
    )

    print(
        f"   Relative non-ELO:       "
        f"{relative_non_elo_importance * 100:.2f}%"
    )

    # ========================================================
    # ARTIFACT PATHS
    # ========================================================

    print()
    print(
        f"📁 Model:               "
        f"{MODEL_FILE}"
    )

    print(
        f"📁 Report:              "
        f"{REPORT_FILE}"
    )

    # ========================================================
    # INTEGRITY STATEMENTS
    # ========================================================

    print()

    print(
        "🔒 Step 40 feature dataset was NOT modified."
    )

    print(
        "🔒 Features are strictly pre-match."
    )

    print(
        "🔒 Chronological split enforced."
    )

    print(
        "🔒 Target encoder fitted on training data only."
    )

    print(
        "🔒 Sample weights derived strictly "
        "from training data."
    )

    print(
        "🔒 Similarity features are deterministic "
        "row-local transforms."
    )

    print(
        "🔒 No future match results entered the model."
    )

    print(
        f"🔒 Exact population preserved: "
        f"{EXPECTED_ROWS:,}."
    )

    print(
        "🔒 JSON report passed NumPy-safe serialization."
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()