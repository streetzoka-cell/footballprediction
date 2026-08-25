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
    log_loss,
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight


# ============================================================
# ZOKASCORE V2 — STEP 41
# EWMA XGBOOST MODEL TRAINING
# ============================================================
#
# Source:
#   data/ml/features_v3.csv
#
# Output:
#   data/models/xgboost_ewma_v1.joblib
#   data/processed/xgboost_ewma_model_report.json
#
# CONTRACT
# -------
# Step 41 consumes ONLY the validated Step 40 dataset.
#
# It does NOT:
#   - rebuild historical data
#   - recalculate ELO
#   - calculate EWMA
#   - resolve identities
#   - use another dataset
#   - hard-code a population size
#   - silently drop rows
#
# Population:
#   Inherited dynamically from Step 40.
#
# Split:
#   Deterministic chronological split.
#
# Leakage control:
#   - Features are pre-match.
#   - Target encoder is fitted on training data only.
#   - Sample weights are calculated from training data only.
#   - Test data is never used during training.
# ============================================================


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

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


# ============================================================
# CONFIGURATION
# ============================================================

TRAIN_RATIO = 0.80
RANDOM_STATE = 42

# Football result classes.
#
# These are semantic labels, not a population expectation.
# The actual encoder is still fitted from the training data.
EXPECTED_LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
]


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
    "away_away_matches_before",
]


IDENTITY_COLUMNS = [
    "match_id",
    "date",
    "target",
]


# ============================================================
# HELPERS
# ============================================================

def atomic_joblib_dump(obj, output_file):
    temp_file = output_file + ".tmp"

    try:
        joblib.dump(
            obj,
            temp_file
        )

        os.replace(
            temp_file,
            output_file
        )

    except Exception:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass

        raise


def atomic_json_dump(obj, output_file):
    temp_file = output_file + ".tmp"

    try:
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

    except Exception:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass

        raise


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
            "Missing required Step 40 columns: "
            + ", ".join(missing)
        )

    # --------------------------------------------------------
    # Match identity
    # --------------------------------------------------------

    match_ids = (
        df["match_id"]
        .astype("string")
        .str.strip()
    )

    if match_ids.isna().any():
        raise RuntimeError(
            "Match IDs contain missing values."
        )

    if (match_ids == "").any():
        raise RuntimeError(
            "Match IDs contain empty values."
        )

    if match_ids.duplicated().any():
        duplicate_count = int(
            match_ids.duplicated().sum()
        )

        raise RuntimeError(
            "Duplicate match IDs detected: "
            f"{duplicate_count:,}"
        )

    df["match_id"] = match_ids.astype(str)

    # --------------------------------------------------------
    # Dates
    # --------------------------------------------------------

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    invalid_dates = int(
        df["date"].isna().sum()
    )

    if invalid_dates:
        raise RuntimeError(
            "Invalid dates detected: "
            f"{invalid_dates:,}"
        )

    # --------------------------------------------------------
    # Numeric features
    # --------------------------------------------------------

    for column in FEATURE_COLUMNS:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        missing_count = int(
            df[column].isna().sum()
        )

        if missing_count:
            raise RuntimeError(
                f"{column} contains "
                f"{missing_count:,} missing/invalid values."
            )

        values = df[column].to_numpy(
            dtype=float
        )

        if not np.isfinite(values).all():

            raise RuntimeError(
                f"{column} contains non-finite values."
            )

    # --------------------------------------------------------
    # Targets
    # --------------------------------------------------------

    if df["target"].isna().any():

        raise RuntimeError(
            "Target contains missing values."
        )

    targets = (
        df["target"]
        .astype(str)
        .str.strip()
    )

    invalid_targets = (
        set(targets.unique())
        - set(EXPECTED_LABELS)
    )

    if invalid_targets:

        raise RuntimeError(
            "Invalid target values detected: "
            + ", ".join(
                sorted(invalid_targets)
            )
        )

    df["target"] = targets

    # --------------------------------------------------------
    # Population sanity
    # --------------------------------------------------------
    #
    # No hard-coded expected population.
    # The only valid expectation is that the dataset is non-empty.
    # --------------------------------------------------------

    if len(df) == 0:

        raise RuntimeError(
            "Step 40 feature dataset is empty."
        )

    return df


def validate_split_population(
    source_rows,
    train_rows,
    test_rows
):

    if train_rows + test_rows != source_rows:

        raise RuntimeError(
            "Train/test population mismatch: "
            f"source={source_rows:,}, "
            f"train={train_rows:,}, "
            f"test={test_rows:,}."
        )

    if train_rows <= 0:

        raise RuntimeError(
            "Training population is empty."
        )

    if test_rows <= 0:

        raise RuntimeError(
            "Testing population is empty."
        )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(
        " ZOKASCORE V2 — STEP 41: "
        "EWMA XGBOOST TRAINING"
    )
    print("=" * 60)
    print()

    # ========================================================
    # [1/9] CHECK SOURCE
    # ========================================================

    print(
        "[1/9] Checking Step 40 feature dataset..."
    )

    if not os.path.exists(FEATURES_FILE):

        raise FileNotFoundError(
            "Step 40 feature dataset not found:\n"
            f"{FEATURES_FILE}"
        )

    print(
        "   ✅ Step 40 feature dataset found."
    )

    # ========================================================
    # [2/9] LOAD
    # ========================================================

    print(
        "\n[2/9] Loading features..."
    )

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    source_rows = len(df)

    if source_rows == 0:

        raise RuntimeError(
            "Step 40 feature dataset is empty."
        )

    print(
        f"   ↳ Rows loaded: {source_rows:,}"
    )

    # ========================================================
    # [3/9] VALIDATE
    # ========================================================

    print(
        "\n[3/9] Validating Step 40 feature dataset..."
    )

    df = validate_feature_dataset(
        df
    )

    print(
        "   ✅ Structural, numeric, identity, "
        "and target integrity verified."
    )

    print(
        f"   ✅ Dynamic source population: "
        f"{source_rows:,}"
    )

    # ========================================================
    # [4/9] CHRONOLOGICAL SPLIT
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
    ).reset_index(
        drop=True
    )

    split_idx = int(
        source_rows * TRAIN_RATIO
    )

    # Guard against pathological tiny datasets.
    if split_idx <= 0:
        raise RuntimeError(
            "Chronological split produced "
            "an empty training set."
        )

    if split_idx >= source_rows:
        raise RuntimeError(
            "Chronological split produced "
            "an empty testing set."
        )

    train_df = df.iloc[
        :split_idx
    ].copy()

    test_df = df.iloc[
        split_idx:
    ].copy()

    train_rows = len(train_df)
    test_rows = len(test_df)

    validate_split_population(
        source_rows,
        train_rows,
        test_rows
    )

    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(
        f"   ↳ Training: {train_rows:,} matches "
        f"(Through {train_end_date.date()})"
    )

    print(
        f"   ↳ Testing:  {test_rows:,} matches "
        f"(From {test_start_date.date()})"
    )

    print(
        f"   ✅ Population preserved: "
        f"{source_rows:,}"
    )

    # ========================================================
    # [5/9] MATRICES + TARGET ENCODING
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
        "   ↳ Fitting target encoder on "
        "training data only..."
    )

    le = LabelEncoder()

    y_train = le.fit_transform(
        y_train_raw
    )

    # --------------------------------------------------------
    # Verify the training data contains all expected outcomes.
    # --------------------------------------------------------

    missing_training_labels = (
        set(EXPECTED_LABELS)
        - set(le.classes_)
    )

    if missing_training_labels:

        raise RuntimeError(
            "Training data is missing expected "
            "football result classes: "
            + ", ".join(
                sorted(missing_training_labels)
            )
        )

    # --------------------------------------------------------
    # Verify test classes are represented in training.
    # --------------------------------------------------------

    unknown_test_classes = (
        set(y_test_raw.unique())
        - set(le.classes_)
    )

    if unknown_test_classes:

        raise RuntimeError(
            "Test set contains target classes "
            "not present in training: "
            + ", ".join(
                sorted(unknown_test_classes)
            )
        )

    y_test = le.transform(
        y_test_raw
    )

    target_classes = list(
        le.classes_
    )

    num_classes = len(
        target_classes
    )

    if num_classes < 2:

        raise RuntimeError(
            "Training data contains fewer than "
            "two target classes."
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

    print(
        f"   ↳ Classes: {num_classes}"
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

    if len(sample_weights) != train_rows:

        raise RuntimeError(
            "Sample-weight population mismatch: "
            f"weights={len(sample_weights):,}, "
            f"training={train_rows:,}."
        )

    if not np.isfinite(
        sample_weights
    ).all():

        raise RuntimeError(
            "Sample weights contain "
            "non-finite values."
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

        num_class=num_classes,

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

        tree_method="hist",
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

    # --------------------------------------------------------
    # Probability matrix validation
    # --------------------------------------------------------

    if y_prob.shape[0] != test_rows:

        raise RuntimeError(
            "Prediction population mismatch: "
            f"probabilities={y_prob.shape[0]:,}, "
            f"testing={test_rows:,}."
        )

    if y_prob.shape[1] != num_classes:

        raise RuntimeError(
            "Prediction class dimension mismatch: "
            f"probabilities={y_prob.shape[1]}, "
            f"classes={num_classes}."
        )

    if not np.isfinite(
        y_prob
    ).all():

        raise RuntimeError(
            "Prediction probabilities contain "
            "non-finite values."
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
            num_classes
        )
    )

    accuracy_percent = (
        accuracy * 100
    )

    # ========================================================
    # REFERENCE COMPARISON
    # ========================================================
    #
    # IMPORTANT:
    # No historical benchmark is treated as a required
    # population or pass/fail condition.
    #
    # We report the model's actual result only.
    # ========================================================

    classification = classification_report(
        y_test_str,
        y_pred_str,
        labels=EXPECTED_LABELS,
        output_dict=True,
        zero_division=0
    )

    cm = confusion_matrix(
        y_test_str,
        y_pred_str,
        labels=EXPECTED_LABELS
    )

    importances = model.feature_importances_

    # ========================================================
    # SIGNAL CONTRIBUTION
    # ========================================================

    elo_features = {
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff",
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

    # --------------------------------------------------------
    # Model artifact
    # --------------------------------------------------------

    model_artifact = {

        "model": model,

        "label_encoder": le,

        "feature_columns": FEATURE_COLUMNS,

        "target_classes": target_classes,

        "pipeline_step": "41",

        "source_population": source_rows,

        "training_population": train_rows,

        "testing_population": test_rows,

        "train_ratio": TRAIN_RATIO,
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

        "model_name":
            "ZOKASCORE V2 EWMA XGBoost",

        "source":
            "data/ml/features_v3.csv",

        # ----------------------------------------------------
        # Population
        # ----------------------------------------------------

        "population": {

            "total_rows":
                source_rows,

            "training_rows":
                train_rows,

            "testing_rows":
                test_rows,

            "train_ratio":
                TRAIN_RATIO,

            "population_preserved":
                (
                    train_rows
                    + test_rows
                    == source_rows
                ),
        },

        # ----------------------------------------------------
        # Dates
        # ----------------------------------------------------

        "date_range": {

            "training_through":
                train_end_date.strftime(
                    "%Y-%m-%d"
                ),

            "testing_from":
                test_start_date.strftime(
                    "%Y-%m-%d"
                ),
        },

        # ----------------------------------------------------
        # Features
        # ----------------------------------------------------

        "features":
            FEATURE_COLUMNS,

        "feature_count":
            len(FEATURE_COLUMNS),

        # ----------------------------------------------------
        # Target
        # ----------------------------------------------------

        "target":
            "target",

        "target_classes":
            target_classes,

        "target_encoding": {
            str(index): label
            for index, label
            in enumerate(
                le.classes_
            )
        },

        # ----------------------------------------------------
        # Model
        # ----------------------------------------------------

        "model": {

            "type":
                "XGBClassifier",

            "objective":
                "multi:softprob",

            "num_class":
                num_classes,

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
                "balanced",
        },

        # ----------------------------------------------------
        # Evaluation
        # ----------------------------------------------------

        "evaluation": {

            "accuracy":
                float(accuracy),

            "accuracy_percent":
                float(accuracy_percent),

            "balanced_accuracy":
                float(
                    balanced_accuracy
                ),

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

            "classification_report":
                classification,

            "confusion_matrix":
                cm.tolist(),

            "feature_importances":
                feature_importances,

            "signal_contribution": {

                "elo_features":
                    float(
                        elo_importance
                    ),

                "ewma_features":
                    float(
                        ewma_importance
                    ),

                "elo_features_percent":
                    float(
                        elo_importance * 100
                    ),

                "ewma_features_percent":
                    float(
                        ewma_importance * 100
                    ),
            },
        },

        # ----------------------------------------------------
        # Leakage control
        # ----------------------------------------------------

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
                False,
        },

        # ----------------------------------------------------
        # Integrity
        # ----------------------------------------------------

        "integrity": {

            "source_population":
                source_rows,

            "training_population":
                train_rows,

            "testing_population":
                test_rows,

            "population_preserved":
                (
                    train_rows
                    + test_rows
                    == source_rows
                ),

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
                ),
        },

        # ----------------------------------------------------
        # Output
        # ----------------------------------------------------

        "output":
            MODEL_FILE,
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
        f"📊 Source population:      "
        f"{source_rows:,}"
    )

    print(
        f"📊 Training population:    "
        f"{train_rows:,}"
    )

    print(
        f"📊 Testing population:     "
        f"{test_rows:,}"
    )

    print(
        f"🎯 Accuracy:               "
        f"{accuracy_percent:.2f}%"
    )

    print(
        f"⚖️ Balanced Accuracy:      "
        f"{balanced_accuracy * 100:.2f}%"
    )

    print(
        f"🧠 Macro F1:               "
        f"{macro_f1 * 100:.2f}%"
    )

    print(
        f"📊 Weighted F1:            "
        f"{weighted_f1 * 100:.2f}%"
    )

    print(
        f"📉 Log Loss:               "
        f"{logloss:.4f}"
    )

    print()
    print("📋 Classification Report")
    print("-" * 60)

    print(
        classification_report(
            y_test_str,
            y_pred_str,
            labels=EXPECTED_LABELS,
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

    for i, label in enumerate(
        EXPECTED_LABELS
    ):

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
        f"   ELO features:           "
        f"{elo_importance * 100:>6.2f}%"
    )

    print(
        f"   EWMA features:          "
        f"{ewma_importance * 100:>6.2f}%"
    )

    print()
    print(
        f"📁 Model:                 "
        f"{MODEL_FILE}"
    )

    print(
        f"📁 Report:                "
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
        "🔒 Population inherited dynamically "
        "from Step 40."
    )

    print(
        f"🔒 Exact population preserved: "
        f"{source_rows:,}."
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()