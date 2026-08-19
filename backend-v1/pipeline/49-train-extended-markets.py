import os
import json
import joblib
import tempfile
import shutil

import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    log_loss,
    classification_report,
    confusion_matrix
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight


# ============================================================
# ZOKASCORE V2 — STEP 49
# EXTENDED MARKET TRAINING
#
# PURPOSE
# -------
# Train the extended football market models from the unified
# Step 46 feature dataset.
#
# DEPLOYMENT CONTRACT
# -------------------
# Step 48 currently consumes:
#
#     market_ou_2_5_model.joblib
#     market_btts_model.joblib
#
# Therefore this step MUST NOT remove or rename the 2.5 model.
#
# This step trains:
#
#     OU_0_5
#     OU_1_5
#     OU_2_5
#     OU_3_5
#
# Existing BTTS is NOT retrained here because Step 49 is the
# extended OU market training stage.
#
# HARDENING
# ---------
# - Deterministic chronological split
# - No random train/test split
# - LabelEncoder fitted on training data only
# - Explicit model class validation
# - Atomic model writes
# - Atomic JSON writes
# - Feature validation
# - Target validation
# - Population validation
# - NaN / infinite feature validation
# - Class-distribution reporting
# - Confusion matrices
# - Classification reports
# - Deployment artifact verification
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
    "features_v4_unified.csv"
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


# ============================================================
# HARD CONTRACTS
# ============================================================

EXPECTED_ROWS = 484354

TRAIN_RATIO = 0.80

RANDOM_STATE = 42


# ============================================================
# FEATURE CONTRACT
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


# ============================================================
# MARKET CONTRACT
# ============================================================
#
# IMPORTANT:
#
# Step 48 expects:
#
#     market_ou_2_5_model.joblib
#
# Therefore OU_2_5 is mandatory here.
#
# The extended markets are trained alongside it.
# ============================================================

MARKETS = {

    "OU_0_5": {
        "target": "ou_0_5",
        "labels": ["OVER", "UNDER"]
    },

    "OU_1_5": {
        "target": "ou_1_5",
        "labels": ["OVER", "UNDER"]
    },

    "OU_2_5": {
        "target": "ou_2_5",
        "labels": ["OVER", "UNDER"]
    },

    "OU_3_5": {
        "target": "ou_3_5",
        "labels": ["OVER", "UNDER"]
    }
}


# ============================================================
# UTILITY — ATOMIC JSON WRITE
# ============================================================

def atomic_write_json(
    data,
    file_path
):

    directory = os.path.dirname(
        file_path
    )

    os.makedirs(
        directory,
        exist_ok=True
    )

    fd, temp_path = tempfile.mkstemp(
        prefix="pipeline49_",
        suffix=".json",
        dir=directory
    )

    os.close(fd)

    try:

        with open(
            temp_path,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                data,
                f,
                indent=2,
                ensure_ascii=False
            )

        shutil.move(
            temp_path,
            file_path
        )

    finally:

        if os.path.exists(
            temp_path
        ):

            os.remove(
                temp_path
            )


# ============================================================
# UTILITY — ATOMIC MODEL WRITE
# ============================================================

def atomic_write_model(
    model,
    file_path
):

    directory = os.path.dirname(
        file_path
    )

    os.makedirs(
        directory,
        exist_ok=True
    )

    fd, temp_path = tempfile.mkstemp(
        prefix="pipeline49_",
        suffix=".joblib",
        dir=directory
    )

    os.close(fd)

    try:

        joblib.dump(
            model,
            temp_path
        )

        shutil.move(
            temp_path,
            file_path
        )

    finally:

        if os.path.exists(
            temp_path
        ):

            os.remove(
                temp_path
            )


# ============================================================
# UTILITY — CLASSIFICATION REPORT CONVERSION
# ============================================================

def classification_report_to_dict(
    y_true,
    y_pred,
    labels,
    target_names
):

    report = classification_report(
        y_true,
        y_pred,
        labels=labels,
        target_names=target_names,
        output_dict=True,
        zero_division=0
    )

    return report


# ============================================================
# TRAIN ONE MARKET
# ============================================================

def train_market(
    df,
    market_key,
    config
):

    target_col = config["target"]

    expected_labels = list(
        config["labels"]
    )

    print()
    print("=" * 60)
    print(
        f"📈 TRAINING MARKET MODEL: "
        f"{market_key}"
    )
    print("=" * 60)

    # ========================================================
    # 1. VALIDATE TARGET
    # ========================================================

    if target_col not in df.columns:

        raise RuntimeError(
            f"Market {market_key} requires "
            f"missing target column: "
            f"{target_col}"
        )

    target_series = (
        df[target_col]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    if target_series.isna().any():

        raise RuntimeError(
            f"{market_key} contains "
            f"missing target values."
        )

    unique_targets = sorted(
        target_series.unique().tolist()
    )

    print(
        f"🎯 Target column: {target_col}"
    )

    print(
        f"🎯 Observed classes: "
        f"{unique_targets}"
    )

    print(
        f"🎯 Expected classes: "
        f"{expected_labels}"
    )

    unexpected_classes = [
        value
        for value in unique_targets
        if value not in expected_labels
    ]

    if unexpected_classes:

        raise RuntimeError(
            f"{market_key} contains "
            f"unexpected target classes: "
            f"{unexpected_classes}"
        )

    missing_expected = [
        value
        for value in expected_labels
        if value not in unique_targets
    ]

    if missing_expected:

        raise RuntimeError(
            f"{market_key} is missing "
            f"expected target classes: "
            f"{missing_expected}"
        )

    # ========================================================
    # 2. FEATURES
    # ========================================================

    X = (
        df[
            FEATURE_COLUMNS
        ]
        .astype(float)
    )

    y_raw = target_series

    # ========================================================
    # 3. FEATURE VALIDATION
    # ========================================================

    nan_counts = (
        X.isna()
        .sum()
    )

    nan_columns = [
        column
        for column, count in nan_counts.items()
        if count > 0
    ]

    if nan_columns:

        raise RuntimeError(
            f"{market_key} contains NaN "
            f"feature values in: "
            f"{nan_columns}"
        )

    X_values = X.to_numpy(
        dtype=np.float64
    )

    if not np.isfinite(
        X_values
    ).all():

        raise RuntimeError(
            f"{market_key} contains "
            f"infinite feature values."
        )

    # ========================================================
    # 4. CHRONOLOGICAL SPLIT
    # ========================================================

    split_idx = int(
        len(df)
        * TRAIN_RATIO
    )

    if split_idx <= 0:

        raise RuntimeError(
            f"Invalid training split "
            f"for {market_key}."
        )

    if split_idx >= len(df):

        raise RuntimeError(
            f"Invalid test split "
            f"for {market_key}."
        )

    X_train = X.iloc[
        :split_idx
    ]

    X_test = X.iloc[
        split_idx:
    ]

    y_train_raw = y_raw.iloc[
        :split_idx
    ]

    y_test_raw = y_raw.iloc[
        split_idx:
    ]

    print()
    print(
        "📅 Chronological split:"
    )

    print(
        f"   Train rows: "
        f"{len(X_train):,}"
    )

    print(
        f"   Test rows:  "
        f"{len(X_test):,}"
    )

    print(
        f"   Train ratio: "
        f"{TRAIN_RATIO:.2f}"
    )

    # ========================================================
    # 5. VERIFY TEMPORAL ORDER
    # ========================================================

    train_last_date = df.iloc[
        split_idx - 1
    ]["date"]

    test_first_date = df.iloc[
        split_idx
    ]["date"]

    if test_first_date < train_last_date:

        raise RuntimeError(
            f"Chronological split violation "
            f"for {market_key}: "
            f"test starts before train ends."
        )

    print(
        f"   Train end: "
        f"{train_last_date}"
    )

    print(
        f"   Test start: "
        f"{test_first_date}"
    )

    # ========================================================
    # 6. TARGET ENCODING
    #
    # Fit ONLY on training data.
    # ========================================================

    label_encoder = LabelEncoder()

    y_train = (
        label_encoder.fit_transform(
            y_train_raw
        )
    )

    try:

        y_test = (
            label_encoder.transform(
                y_test_raw
            )
        )

    except ValueError as exc:

        raise RuntimeError(
            f"{market_key} contains a "
            f"test-only target class. "
            f"Training classes: "
            f"{list(label_encoder.classes_)}"
        ) from exc

    encoded_classes = list(
        label_encoder.classes_
    )

    print()
    print(
        f"🏷️ Encoded classes: "
        f"{encoded_classes}"
    )

    if set(encoded_classes) != set(
        expected_labels
    ):

        raise RuntimeError(
            f"{market_key} label contract "
            f"mismatch. "
            f"Expected {expected_labels}, "
            f"got {encoded_classes}"
        )

    # ========================================================
    # 7. CLASS DISTRIBUTION
    # ========================================================

    train_distribution = (
        y_train_raw
        .value_counts()
        .sort_index()
        .to_dict()
    )

    test_distribution = (
        y_test_raw
        .value_counts()
        .sort_index()
        .to_dict()
    )

    print()
    print(
        "📊 Training distribution:"
    )

    for label in expected_labels:

        print(
            f"   {label}: "
            f"{train_distribution.get(label, 0):,}"
        )

    print()
    print(
        "📊 Test distribution:"
    )

    for label in expected_labels:

        print(
            f"   {label}: "
            f"{test_distribution.get(label, 0):,}"
        )

    # ========================================================
    # 8. SAVE LABEL MAPPING
    # ========================================================

    label_mapping = {

        str(index): str(label)

        for index, label
        in enumerate(
            label_encoder.classes_
        )
    }

    mapping_file = os.path.join(
        MODELS_DIR,
        f"market_{market_key.lower()}_label_mapping.json"
    )

    atomic_write_json(
        label_mapping,
        mapping_file
    )

    print()
    print(
        f"💾 Label mapping saved:"
    )

    print(
        f"   {mapping_file}"
    )

    # ========================================================
    # 9. CLASS BALANCING
    # ========================================================

    sample_weights = (
        compute_sample_weight(
            class_weight="balanced",
            y=y_train
        )
    )

    print()
    print(
        "⚖️ Balanced sample weights "
        "computed."
    )

    # ========================================================
    # 10. TRAIN XGBOOST
    # ========================================================

    print()
    print(
        "⚡ Training XGBoost..."
    )

    model = xgb.XGBClassifier(

        objective="binary:logistic",

        n_estimators=300,

        learning_rate=0.05,

        max_depth=6,

        min_child_weight=3,

        subsample=0.85,

        colsample_bytree=0.85,

        random_state=RANDOM_STATE,

        n_jobs=-1,

        eval_metric="logloss",

        tree_method="hist"
    )

    model.fit(
        X_train,
        y_train,
        sample_weight=sample_weights
    )

    # ========================================================
    # 11. VERIFY MODEL CLASSES
    # ========================================================

    model_classes = list(
        model.classes_
    )

    print()
    print(
        f"🤖 Model classes: "
        f"{model_classes}"
    )

    expected_encoded_classes = list(
        range(
            len(
                label_encoder.classes_
            )
        )
    )

    if model_classes != (
        expected_encoded_classes
    ):

        raise RuntimeError(
            f"{market_key} model class "
            f"contract mismatch. "
            f"Expected "
            f"{expected_encoded_classes}, "
            f"got {model_classes}"
        )

    # ========================================================
    # 12. EVALUATION
    # ========================================================

    print()
    print(
        "📈 Evaluating on unseen "
        "chronological test data..."
    )

    y_pred = model.predict(
        X_test
    )

    y_prob = model.predict_proba(
        X_test
    )

    accuracy = accuracy_score(
        y_test,
        y_pred
    )

    balanced_acc = (
        balanced_accuracy_score(
            y_test,
            y_pred
        )
    )

    macro_f1 = f1_score(
        y_test,
        y_pred,
        average="macro"
    )

    weighted_f1 = f1_score(
        y_test,
        y_pred,
        average="weighted"
    )

    logloss = log_loss(
        y_test,
        y_prob,
        labels=expected_encoded_classes
    )

    confusion = confusion_matrix(
        y_test,
        y_pred,
        labels=expected_encoded_classes
    )

    class_report = (
        classification_report_to_dict(
            y_test,
            y_pred,
            expected_encoded_classes,
            [
                str(label)
                for label
                in label_encoder.classes_
            ]
        )
    )

    print()
    print(
        f"🎯 Accuracy:          "
        f"{accuracy * 100:.2f}%"
    )

    print(
        f"⚖️ Balanced Accuracy: "
        f"{balanced_acc * 100:.2f}%"
    )

    print(
        f"🧠 Macro F1:          "
        f"{macro_f1 * 100:.2f}%"
    )

    print(
        f"📊 Weighted F1:       "
        f"{weighted_f1 * 100:.2f}%"
    )

    print(
        f"📉 Log Loss:          "
        f"{logloss:.4f}"
    )

    # ========================================================
    # 13. MODEL ARTIFACT PATH
    # ========================================================

    model_file = os.path.join(
        MODELS_DIR,
        f"market_{market_key.lower()}_model.joblib"
    )

    # ========================================================
    # 14. ATOMIC MODEL SAVE
    # ========================================================

    atomic_write_model(
        model,
        model_file
    )

    print()
    print(
        f"💾 Model saved:"
    )

    print(
        f"   {model_file}"
    )

    # ========================================================
    # 15. VERIFY SAVED MODEL
    # ========================================================

    if not os.path.exists(
        model_file
    ):

        raise RuntimeError(
            f"Model save verification failed "
            f"for {market_key}."
        )

    saved_model = joblib.load(
        model_file
    )

    saved_classes = list(
        saved_model.classes_
    )

    if saved_classes != (
        expected_encoded_classes
    ):

        raise RuntimeError(
            f"Saved model class verification "
            f"failed for {market_key}. "
            f"Expected "
            f"{expected_encoded_classes}, "
            f"got {saved_classes}"
        )

    print(
        "   ✅ Saved model verified."
    )

    # ========================================================
    # 16. BUILD RESULT
    # ========================================================

    result = {

        "market":
            market_key,

        "target_column":
            target_col,

        "labels":
            [
                str(label)
                for label
                in label_encoder.classes_
            ],

        "encoded_classes":
            [
                int(value)
                for value
                in model.classes_
            ],

        "feature_count":
            len(FEATURE_COLUMNS),

        "features":
            list(FEATURE_COLUMNS),

        "train_rows":
            int(len(X_train)),

        "test_rows":
            int(len(X_test)),

        "train_start_date":
            str(
                df.iloc[0]["date"]
            ),

        "train_end_date":
            str(
                train_last_date
            ),

        "test_start_date":
            str(
                test_first_date
            ),

        "test_end_date":
            str(
                df.iloc[-1]["date"]
            ),

        "class_distribution":
            {

                "train":
                    {
                        str(key): int(value)
                        for key, value
                        in train_distribution.items()
                    },

                "test":
                    {
                        str(key): int(value)
                        for key, value
                        in test_distribution.items()
                    }
            },

        "evaluation":
            {

                "accuracy":
                    float(accuracy),

                "balanced_accuracy":
                    float(balanced_acc),

                "macro_f1":
                    float(macro_f1),

                "weighted_f1":
                    float(weighted_f1),

                "log_loss":
                    float(logloss)
            },

        "confusion_matrix":
            confusion.tolist(),

        "classification_report":
            class_report,

        "model_file":
            model_file,

        "label_mapping_file":
            mapping_file
    }

    return result


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)

    print(
        " ZOKASCORE V2 — STEP 49: "
        "EXTENDED MARKET TRAINING"
    )

    print("=" * 60)

    print()

    # ========================================================
    # PREPARE DIRECTORIES
    # ========================================================

    os.makedirs(
        MODELS_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORTS_DIR,
        exist_ok=True
    )

    # ========================================================
    # 1. LOAD DATASET
    # ========================================================

    print(
        "[1/4] Loading unified Step 46 "
        "dataset..."
    )

    if not os.path.exists(
        FEATURES_FILE
    ):

        raise FileNotFoundError(
            "Unified feature dataset not found:\n"
            f"{FEATURES_FILE}"
        )

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    print(
        f"   ↳ Rows loaded: "
        f"{len(df):,}"
    )

    # ========================================================
    # POPULATION CONTRACT
    # ========================================================

    if len(df) != EXPECTED_ROWS:

        raise RuntimeError(
            "POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {len(df):,}."
        )

    print(
        "   ✅ Population contract verified."
    )

    # ========================================================
    # 2. VALIDATE DATASET
    # ========================================================

    print()
    print(
        "[2/4] Preprocessing and "
        "validating..."
    )

    required_columns = [

        "match_id",

        "date",

        *FEATURE_COLUMNS,

        "ou_0_5",

        "ou_1_5",

        "ou_2_5",

        "ou_3_5"
    ]

    missing = [

        column

        for column
        in required_columns

        if column not in df.columns
    ]

    if missing:

        raise RuntimeError(
            "Missing required columns:\n"
            f"{missing}"
        )

    print(
        "   ✅ Required columns verified."
    )

    # ========================================================
    # DATE VALIDATION
    # ========================================================

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    if df["date"].isna().any():

        invalid_count = int(
            df["date"]
            .isna()
            .sum()
        )

        raise RuntimeError(
            f"Invalid dates found: "
            f"{invalid_count:,}"
        )

    # ========================================================
    # MATCH ID VALIDATION
    # ========================================================

    if df["match_id"].isna().any():

        invalid_count = int(
            df["match_id"]
            .isna()
            .sum()
        )

        raise RuntimeError(
            f"Missing match_id values: "
            f"{invalid_count:,}"
        )

    # ========================================================
    # DETERMINISTIC CHRONOLOGY
    # ========================================================

    print(
        "   ↳ Sorting chronologically..."
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

    print(
        "   ✅ Deterministic chronology "
        "established."
    )

    print(
        f"   ↳ First date: "
        f"{df.iloc[0]['date']}"
    )

    print(
        f"   ↳ Last date:  "
        f"{df.iloc[-1]['date']}"
    )

    # ========================================================
    # FEATURE VALIDATION
    # ========================================================

    print(
        "   ↳ Validating feature matrix..."
    )

    feature_frame = (
        df[
            FEATURE_COLUMNS
        ]
        .apply(
            pd.to_numeric,
            errors="coerce"
        )
    )

    missing_feature_values = (
        feature_frame
        .isna()
        .sum()
        .sum()
    )

    if missing_feature_values:

        raise RuntimeError(
            "Feature matrix contains "
            f"{int(missing_feature_values):,} "
            "NaN/non-numeric values."
        )

    feature_values = (
        feature_frame
        .to_numpy(
            dtype=np.float64
        )
    )

    if not np.isfinite(
        feature_values
    ).all():

        raise RuntimeError(
            "Feature matrix contains "
            "infinite values."
        )

    print(
        "   ✅ Feature matrix validated."
    )

    # ========================================================
    # TARGET VALIDATION
    # ========================================================

    print(
        "   ↳ Validating market targets..."
    )

    for market_key, config in (
        MARKETS.items()
    ):

        target = config[
            "target"
        ]

        series = (
            df[target]
            .astype(str)
            .str.strip()
            .str.upper()
        )

        observed = set(
            series.unique()
        )

        expected = set(
            config["labels"]
        )

        if observed != expected:

            raise RuntimeError(
                f"{market_key} target "
                f"contract mismatch. "
                f"Expected {sorted(expected)}, "
                f"got {sorted(observed)}"
            )

        print(
            f"   ✅ {market_key}: "
            f"{len(series):,} valid rows"
        )

    # ========================================================
    # 3. TRAIN MARKETS
    # ========================================================

    print()
    print(
        "[3/4] Training extended "
        "market models..."
    )

    all_results = {}

    for market_key, config in (
        MARKETS.items()
    ):

        all_results[
            market_key
        ] = train_market(
            df,
            market_key,
            config
        )

    # ========================================================
    # 4. DEPLOYMENT VERIFICATION
    # ========================================================

    print()
    print(
        "[4/4] Verifying deployment "
        "artifacts..."
    )

    deployment_files = {}

    for market_key in MARKETS:

        model_file = os.path.join(
            MODELS_DIR,
            f"market_{market_key.lower()}_model.joblib"
        )

        mapping_file = os.path.join(
            MODELS_DIR,
            f"market_{market_key.lower()}_label_mapping.json"
        )

        if not os.path.exists(
            model_file
        ):

            raise RuntimeError(
                f"Missing deployment model: "
                f"{model_file}"
            )

        if not os.path.exists(
            mapping_file
        ):

            raise RuntimeError(
                f"Missing label mapping: "
                f"{mapping_file}"
            )

        deployment_files[
            market_key
        ] = {

            "model":
                model_file,

            "label_mapping":
                mapping_file
        }

        print(
            f"   ✅ {market_key} "
            "deployment artifacts verified."
        )

    # ========================================================
    # STEP 48 CONTRACT CHECK
    # ========================================================
    #
    # Step 48 specifically needs:
    #
    #     market_ou_2_5_model.joblib
    #
    # Verify it explicitly.
    # ========================================================

    step48_ou_model = os.path.join(
        MODELS_DIR,
        "market_ou_2_5_model.joblib"
    )

    if not os.path.exists(
        step48_ou_model
    ):

        raise RuntimeError(
            "STEP 48 DEPLOYMENT CONTRACT "
            "FAILED: "
            "market_ou_2_5_model.joblib "
            "was not produced."
        )

    step48_model = joblib.load(
        step48_ou_model
    )

    if not hasattr(
        step48_model,
        "classes_"
    ):

        raise RuntimeError(
            "Step 48 OU 2.5 model does "
            "not expose classes_."
        )

    step48_classes = list(
        step48_model.classes_
    )

    if step48_classes != [0, 1]:

        raise RuntimeError(
            "Step 48 OU 2.5 model has "
            f"unexpected encoded classes: "
            f"{step48_classes}"
        )

    print()
    print(
        "   ✅ Step 48 OU 2.5 "
        "deployment contract verified."
    )

    # ========================================================
    # MASTER REPORT
    # ========================================================

    report_file = os.path.join(
        REPORTS_DIR,
        "xgboost_extended_markets_report.json"
    )

    report = {

        "pipeline_step":
            "49",

        "status":
            "PASS",

        "population":
            EXPECTED_ROWS,

        "train_ratio":
            TRAIN_RATIO,

        "random_state":
            RANDOM_STATE,

        "feature_count":
            len(FEATURE_COLUMNS),

        "features":
            list(FEATURE_COLUMNS),

        "markets_trained":
            list(MARKETS.keys()),

        "deployment_contract":
            {

                "step48_required_model":
                    "market_ou_2_5_model.joblib",

                "step48_required_classes":
                    [
                        0,
                        1
                    ],

                "step48_contract_verified":
                    True
            },

        "markets":
            all_results,

        "deployment_files":
            deployment_files
    }

    atomic_write_json(
        report,
        report_file
    )

    print()
    print(
        "📄 Master report saved:"
    )

    print(
        f"   {report_file}"
    )

    # ========================================================
    # FINAL REPORT
    # ========================================================

    print()
    print("=" * 60)

    print(
        " STEP 49 COMPLETE: PASS"
    )

    print("=" * 60)

    print(
        f"📊 Population: "
        f"{EXPECTED_ROWS:,}"
    )

    print(
        f"📈 Markets trained: "
        f"{len(MARKETS)}"
    )

    for market_key in MARKETS:

        result = all_results[
            market_key
        ]

        print(
            f"   ✅ {market_key}: "
            f"Accuracy "
            f"{result['evaluation']['accuracy'] * 100:.2f}% | "
            f"Balanced "
            f"{result['evaluation']['balanced_accuracy'] * 100:.2f}% | "
            f"LogLoss "
            f"{result['evaluation']['log_loss']:.4f}"
        )

    print()
    print(
        "📁 Models:"
    )

    print(
        f"   {MODELS_DIR}"
    )

    print()
    print(
        "📁 Report:"
    )

    print(
        f"   {report_file}"
    )

    print()
    print(
        "🔗 Step 48 contract:"
    )

    print(
        "   market_ou_2_5_model.joblib "
        "verified"
    )

    print("=" * 60)


if __name__ == "__main__":
    run()