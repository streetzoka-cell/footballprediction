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
# ZOKASCORE V2 — STEP 41
# EWMA XGBOOST MODEL TRAINING
#
# Purpose:
#   Train a leakage-controlled XGBoost classifier using:
#   - Pre-match ELO signals
#   - Chronological EWMA team performance signals
#   - Venue-specific EWMA signals
#
# Input:
#   data/ml/features_v3.csv
#
# Output:
#   data/models/xgboost_ewma_v1.joblib
#   data/processed/xgboost_ewma_model_report.json
#
# Design principles:
#   - Chronological train/test split
#   - No future information
#   - Sample weights calculated from training data only
#   - Target encoder fitted on training data only
#   - Exact population preservation
#   - Atomic artifact writes
# ============================================================


# ============================================================
# PATHS / CONFIGURATION
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
    "xgboost_ewma_v1.joblib"
)

REPORT_FILE = os.path.join(
    REPORT_DIR,
    "xgboost_ewma_model_report.json"
)

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80
RANDOM_STATE = 42

# Reference models
BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23
XGB_BALANCED_ACCURACY = 48.17
XGB_NATURAL_ACCURACY = 51.50


# ============================================================
# FEATURES
# ============================================================

FEATURE_COLUMNS = [
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
    "away_ewma_away_ga",

    "home_matches_before",
    "away_matches_before",

    "home_home_matches_before",
    "away_away_matches_before"
]

LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]

IDENTITY_COLUMNS = [
    "match_id",
    "date",
    "target"
]


# ============================================================
# HELPERS
# ============================================================

def atomic_joblib_dump(obj, output_file):
    temp_file = output_file + ".tmp"
    joblib.dump(obj, temp_file)
    os.replace(temp_file, output_file)


def atomic_json_dump(obj, output_file):
    temp_file = output_file + ".tmp"

    with open(
        temp_file,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            obj,
            f,
            indent=2
        )

    os.replace(
        temp_file,
        output_file
    )


def validate_feature_dataset(df):
    required = (
        FEATURE_COLUMNS
        + IDENTITY_COLUMNS
    )

    missing = [
        column
        for column in required
        if column not in df.columns
    ]

    if missing:
        raise RuntimeError(
            f"Missing required columns: {missing}"
        )

    # Match identity
    if df["match_id"].isna().any():
        raise RuntimeError(
            "Match IDs contain missing values."
        )

    if df["match_id"].duplicated().any():
        raise RuntimeError(
            "Duplicate match IDs detected."
        )

    # Dates
    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    if df["date"].isna().any():
        raise RuntimeError(
            "Invalid dates detected."
        )

    # Numeric features
    for column in FEATURE_COLUMNS:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        if df[column].isna().any():
            raise RuntimeError(
                f"{column} contains missing/invalid values."
            )

        if not np.isfinite(
            df[column].to_numpy(dtype=float)
        ).all():
            raise RuntimeError(
                f"{column} contains non-finite values."
            )

    # Targets
    invalid_targets = (
        set(df["target"].dropna().unique())
        - set(LABELS)
    )

    if invalid_targets:
        raise RuntimeError(
            f"Invalid target values detected: "
            f"{sorted(invalid_targets)}"
        )

    if df["target"].isna().any():
        raise RuntimeError(
            "Target contains missing values."
        )

    return df


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 41: EWMA XGBOOST TRAINING")
    print("=" * 60)
    print()

    # ========================================================
    # [1/9] CHECK SOURCE
    # ========================================================

    print("[1/9] Checking Step 40 feature dataset...")

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Step 40 feature dataset not found:\n"
            f"{FEATURES_FILE}"
        )

    print("   ✅ Step 40 feature dataset found.")

    # ========================================================
    # [2/9] LOAD
    # ========================================================

    print("\n[2/9] Loading features...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(
            "POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {len(df):,}."
        )

    print(
        f"   ↳ Rows loaded: {len(df):,}"
    )

    # ========================================================
    # [3/9] VALIDATE
    # ========================================================

    print("\n[3/9] Validating Step 40 feature dataset...")

    df = validate_feature_dataset(df)

    print(
        "   ✅ Structural, numeric, identity, "
        "and target integrity verified."
    )

    # ========================================================
    # [4/9] DETERMINISTIC CHRONOLOGICAL SPLIT
    # ========================================================

    print(
        "\n[4/9] Preparing deterministic "
        "chronological split..."
    )

    df = df.sort_values(
        by=[
            "date",
            "match_id"
        ],
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

    if len(train_df) + len(test_df) != EXPECTED_ROWS:
        raise RuntimeError(
            "Train/test population mismatch."
        )

    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(
        f"   ↳ Training: {len(train_df):,} matches "
        f"(Through {train_end_date.date()})"
    )

    print(
        f"   ↳ Testing:  {len(test_df):,} matches "
        f"(From {test_start_date.date()})"
    )

    # ========================================================
    # [5/9] PREPARE MATRICES + TARGET ENCODING
    # ========================================================

    print(
        "\n[5/9] Preparing training and test matrices..."
    )

    X_train = train_df[
        FEATURE_COLUMNS
    ].astype(float)

    X_test = test_df[
        FEATURE_COLUMNS
    ].astype(float)

    y_train_raw = train_df[
        "target"
    ].astype(str)

    y_test_raw = test_df[
        "target"
    ].astype(str)

    print(
        "   ↳ Fitting target encoder on training data only..."
    )

    le = LabelEncoder()

    y_train = le.fit_transform(
        y_train_raw
    )

    # Verify every test class exists in training.
    unknown_test_classes = (
        set(y_test_raw.unique())
        - set(le.classes_)
    )

    if unknown_test_classes:
        raise RuntimeError(
            "Test set contains target classes "
            "not present in training: "
            f"{unknown_test_classes}"
        )

    y_test = le.transform(
        y_test_raw
    )

    print(
        "   ↳ Target mapping:"
    )

    for index, label in enumerate(
        le.classes_
    ):
        print(
            f"      {index} → {label}"
        )

    # ========================================================
    # [6/9] BALANCED SAMPLE WEIGHTS
    # ========================================================

    print(
        "\n[6/9] Calculating balanced sample weights..."
    )

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )

    print(
        "   ✅ Weights calculated from "
        "training data only."
    )

    # ========================================================
    # [7/9] TRAIN XGBOOST
    # ========================================================

    print(
        "\n[7/9] Training XGBoost "
        "(Balanced + EWMA)..."
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

        random_state=RANDOM_STATE,
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
    # [8/9] EVALUATION
    # ========================================================

    print(
        "\n[8/9] Evaluating on unseen "
        "chronological test data..."
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

    accuracy = accuracy_score(
        y_test_str,
        y_pred_str
    )

    balanced_accuracy = balanced_accuracy_score(
        y_test_str,
        y_pred_str
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

    # ========================================================
    # COMPARISON
    # ========================================================

    accuracy_percent = accuracy * 100

    diff_baseline = (
        accuracy_percent
        - BASELINE_ACCURACY
    )

    diff_elo = (
        accuracy_percent
        - ELO_ONLY_ACCURACY
    )

    diff_xgb_balanced = (
        accuracy_percent
        - XGB_BALANCED_ACCURACY
    )

    diff_xgb_natural = (
        accuracy_percent
        - XGB_NATURAL_ACCURACY
    )

    # ========================================================
    # CLASSIFICATION
    # ========================================================

    classification = classification_report(
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

    importances = model.feature_importances_

    # ========================================================
    # SIGNAL CONTRIBUTION
    # ========================================================

    elo_features = {
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff"
    }

    elo_importance = sum(
        importance
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
        if feature in elo_features
    )

    ewma_importance = sum(
        importance
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
        if feature not in elo_features
    )

    # ========================================================
    # FEATURE IMPORTANCE MAP
    # ========================================================

    feature_importances = dict(
        zip(
            FEATURE_COLUMNS,
            importances.tolist()
        )
    )

    # ========================================================
    # [9/9] SAVE ARTIFACTS
    # ========================================================

    print(
        "\n[9/9] Saving model and report..."
    )

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORT_DIR,
        exist_ok=True
    )

    # Save model + encoder together.
    model_artifact = {
        "model": model,
        "label_encoder": le,
        "feature_columns": FEATURE_COLUMNS,
        "target_classes": LABELS,
        "pipeline_step": "41"
    }

    atomic_joblib_dump(
        model_artifact,
        MODEL_FILE
    )

    # ========================================================
    # MODEL REPORT
    # ========================================================

    model_report = {

        "pipeline_step": "41",

        "status": "PASS",

        "model_name": (
            "ZOKASCORE V2 EWMA XGBoost"
        ),

        "source": (
            "data/ml/features_v3.csv"
        ),

        "population": {
            "total_rows": EXPECTED_ROWS,
            "training_rows": len(train_df),
            "testing_rows": len(test_df),
            "train_ratio": TRAIN_RATIO
        },

        "date_range": {
            "training_through":
                train_end_date.strftime(
                    "%Y-%m-%d"
                ),

            "testing_from":
                test_start_date.strftime(
                    "%Y-%m-%d"
                )
        },

        "features": FEATURE_COLUMNS,

        "feature_count": len(
            FEATURE_COLUMNS
        ),

        "target": "target",

        "target_classes": LABELS,

        "target_encoding": {
            str(index): label
            for index, label
            in enumerate(le.classes_)
        },

        "model": {

            "type":
                "XGBClassifier",

            "objective":
                "multi:softprob",

            "num_class":
                3,

            "n_estimators":
                300,

            "learning_rate":
                0.05,

            "max_depth":
                6,

            "min_child_weight":
                3,

            "subsample":
                0.85,

            "colsample_bytree":
                0.85,

            "gamma":
                0.0,

            "reg_alpha":
                0.0,

            "reg_lambda":
                1.0,

            "tree_method":
                "hist",

            "random_state":
                RANDOM_STATE,

            "sample_weight":
                "balanced"
        },

        "evaluation": {

            "accuracy":
                float(accuracy),

            "accuracy_percent":
                float(accuracy_percent),

            "balanced_accuracy":
                float(balanced_accuracy),

            "balanced_accuracy_percent":
                float(
                    balanced_accuracy * 100
                ),

            "macro_f1":
                float(macro_f1),

            "macro_f1_percent":
                float(
                    macro_f1 * 100
                ),

            "weighted_f1":
                float(weighted_f1),

            "weighted_f1_percent":
                float(
                    weighted_f1 * 100
                ),

            "log_loss":
                float(logloss),

            "baseline_accuracy_percent":
                BASELINE_ACCURACY,

            "elo_only_accuracy_percent":
                ELO_ONLY_ACCURACY,

            "xgb_balanced_accuracy_percent":
                XGB_BALANCED_ACCURACY,

            "xgb_natural_accuracy_percent":
                XGB_NATURAL_ACCURACY,

            "difference_vs_baseline_pp":
                float(diff_baseline),

            "difference_vs_elo_only_pp":
                float(diff_elo),

            "difference_vs_xgb_balanced_pp":
                float(
                    diff_xgb_balanced
                ),

            "difference_vs_xgb_natural_pp":
                float(
                    diff_xgb_natural
                ),

            "classification_report":
                classification,

            "confusion_matrix":
                cm.tolist(),

            "feature_importances":
                feature_importances,

            "signal_contribution": {

                "elo_features":
                    float(elo_importance),

                "ewma_features":
                    float(ewma_importance),

                "elo_features_percent":
                    float(
                        elo_importance * 100
                    ),

                "ewma_features_percent":
                    float(
                        ewma_importance * 100
                    )
            }
        },

        "leakage_control": {

            "chronological_split":
                True,

            "split_method":
                "date + match_id",

            "same_day_order":
                "date + match_id",

            "target_encoder_fit":
                "training_data_only",

            "sample_weights_source":
                "training_data_only",

            "future_match_information":
                False,

            "current_match_result_used":
                False,

            "step_40_dataset_modified":
                False
        },

        "integrity": {

            "expected_population":
                EXPECTED_ROWS,

            "actual_population":
                len(df),

            "population_preserved":
                len(df) == EXPECTED_ROWS,

            "duplicate_match_ids":
                int(
                    df["match_id"]
                    .duplicated()
                    .sum()
                ),

            "missing_values":
                int(
                    df[
                        FEATURE_COLUMNS
                        + IDENTITY_COLUMNS
                    ]
                    .isna()
                    .sum()
                    .sum()
                )
        },

        "output": MODEL_FILE
    }

    atomic_json_dump(
        model_report,
        REPORT_FILE
    )

    # ========================================================
    # FINAL CONSOLE REPORT
    # ========================================================

    print()
    print("=" * 60)
    print(" STEP 41 COMPLETE: PASS")
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

    print()
    print("🚀 Model Comparison")
    print("-" * 60)

    print(
        f"   vs XGBoost (Natural):  "
        f"{diff_xgb_natural:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Balanced): "
        f"{diff_xgb_balanced:+.2f} pp"
    )

    print(
        f"   vs ELO-only:           "
        f"{diff_elo:+.2f} pp"
    )

    print(
        f"   vs Original baseline:  "
        f"{diff_baseline:+.2f} pp"
    )

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

    print()
    print("🧠 Feature Importances")
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
        importance_rows,
        start=1
    ):

        print(
            f"   {rank:>2}. "
            f"{feature:<30} "
            f"{importance * 100:>7.2f}%"
        )

    print()
    print("🧠 Signal Contribution")
    print("-" * 60)

    print(
        f"   ELO features:          "
        f"{elo_importance * 100:>6.2f}%"
    )

    print(
        f"   EWMA features:         "
        f"{ewma_importance * 100:>6.2f}%"
    )

    print()
    print(
        f"📁 Model:               "
        f"{MODEL_FILE}"
    )

    print(
        f"📁 Report:              "
        f"{REPORT_FILE}"
    )

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
        "🔒 Exact population preserved: "
        "484,354."
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()
