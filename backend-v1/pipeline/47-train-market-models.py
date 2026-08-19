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
    classification_report,
    confusion_matrix,
    balanced_accuracy_score,
    f1_score,
    log_loss
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight


# ============================================================
# ZOKASCORE V2 — STEP 47
# MARKET MODEL TRAINING (HARDENED)
#
# Input:
#   data/ml/features_v4_unified.csv
#
# Output:
#   data/models/market_ou_2_5_model.joblib
#   data/models/market_ou_2_5_label_mapping.json
#   data/models/market_btts_model.joblib
#   data/models/market_btts_label_mapping.json
#   data/processed/xgboost_market_models_report.json
#
# IMPORTANT:
#   Pipeline 41 1X2 champion is protected.
# ============================================================


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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

PIPELINE41_MODEL = os.path.join(
    MODELS_DIR,
    "zokascore_v2_model.json"
)

REPORT_FILE = os.path.join(
    REPORTS_DIR,
    "xgboost_market_models_report.json"
)


# ============================================================
# GLOBAL CONFIGURATION
# ============================================================

EXPECTED_ROWS = 484354

TRAIN_RATIO = 0.80

RANDOM_STATE = 42

EXPECTED_1X2_CLASSES = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
}


# ============================================================
# FEATURE COLUMNS
#
# These MUST match Step 46 exactly.
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
# MARKET DEFINITIONS
#
# Keep the current scope deliberately small.
# We can extend later after the core models are validated.
# ============================================================

MARKETS = {

    "OU_2_5": {
        "target": "ou_2_5",
        "labels": ["OVER", "UNDER"],
        "model_file": os.path.join(
            MODELS_DIR,
            "market_ou_2_5_model.joblib"
        ),
        "mapping_file": os.path.join(
            MODELS_DIR,
            "market_ou_2_5_label_mapping.json"
        )
    },

    "BTTS": {
        "target": "btts",
        "labels": ["YES", "NO"],
        "model_file": os.path.join(
            MODELS_DIR,
            "market_btts_model.joblib"
        ),
        "mapping_file": os.path.join(
            MODELS_DIR,
            "market_btts_label_mapping.json"
        )
    }
}


# ============================================================
# DIRECTORY SETUP
# ============================================================

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    print("\n❌ PIPELINE 47 ABORTED")
    print("-" * 60)
    print(message)
    print("-" * 60)
    raise SystemExit(1)


def atomic_write_json(data, file_path):
    """
    Write JSON atomically so a failed write cannot corrupt
    an existing valid artifact.
    """

    output_dir = os.path.dirname(file_path)
    os.makedirs(output_dir, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(
        prefix="pipeline47_",
        suffix=".json",
        dir=output_dir
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
        if os.path.exists(temp_path):
            os.remove(temp_path)


def atomic_write_model(model, file_path):
    """
    Atomically save a Joblib model.
    """

    output_dir = os.path.dirname(file_path)
    os.makedirs(output_dir, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(
        prefix="pipeline47_model_",
        suffix=".joblib",
        dir=output_dir
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
        if os.path.exists(temp_path):
            os.remove(temp_path)


def validate_finite_features(df):
    """
    Ensure every ML feature is numeric and finite.
    """

    print("\n🔢 Validating ML features...")

    for feature in FEATURE_COLUMNS:

        values = pd.to_numeric(
            df[feature],
            errors="coerce"
        )

        invalid = int(
            values.isna().sum()
        )

        if invalid:
            fail(
                f"Feature '{feature}' contains "
                f"{invalid:,} null/invalid values."
            )

        array = values.to_numpy(
            dtype=float
        )

        if not np.isfinite(array).all():
            fail(
                f"Feature '{feature}' contains "
                f"non-finite values."
            )

    print(
        f"   ✅ All {len(FEATURE_COLUMNS)} "
        f"features are numeric and finite."
    )


def validate_market_targets(df):
    """
    Reconstruct market targets directly from historical
    goal data and ensure Step 46 produced them correctly.
    """

    print("\n🎯 Validating market target logic...")

    # --------------------------------------------------------
    # O/U 2.5
    # --------------------------------------------------------

    expected_ou = np.where(
        df["total_goals"] > 2.5,
        "OVER",
        "UNDER"
    )

    actual_ou = (
        df["ou_2_5"]
        .astype(str)
        .to_numpy()
    )

    ou_mismatches = int(
        np.sum(actual_ou != expected_ou)
    )

    if ou_mismatches:
        fail(
            f"O/U 2.5 target mismatch: "
            f"{ou_mismatches:,} rows."
        )

    print(
        "   ✅ O/U 2.5 target logic verified."
    )

    # --------------------------------------------------------
    # BTTS
    # --------------------------------------------------------

    expected_btts = np.where(
        (df["home_goals"] > 0)
        &
        (df["away_goals"] > 0),
        "YES",
        "NO"
    )

    actual_btts = (
        df["btts"]
        .astype(str)
        .to_numpy()
    )

    btts_mismatches = int(
        np.sum(actual_btts != expected_btts)
    )

    if btts_mismatches:
        fail(
            f"BTTS target mismatch: "
            f"{btts_mismatches:,} rows."
        )

    print(
        "   ✅ BTTS target logic verified."
    )


def validate_dataset(df):
    """
    Complete Step 47 input validation.
    """

    print("\n" + "=" * 60)
    print("🔐 DATASET VALIDATION")
    print("=" * 60)

    # --------------------------------------------------------
    # Population
    # --------------------------------------------------------

    if len(df) != EXPECTED_ROWS:
        fail(
            f"POPULATION MISMATCH:\n"
            f"Expected: {EXPECTED_ROWS:,}\n"
            f"Found:    {len(df):,}"
        )

    print(
        f"   ✅ Population: {len(df):,}"
    )

    # --------------------------------------------------------
    # Required columns
    # --------------------------------------------------------

    required_columns = [
        "match_id",
        "date",
        "target",
        "home_goals",
        "away_goals",
        "total_goals",
        "ou_2_5",
        "btts"
    ] + FEATURE_COLUMNS

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        fail(
            "Missing required columns:\n"
            + "\n".join(
                f"   - {column}"
                for column in missing
            )
        )

    print(
        f"   ✅ Required columns present: "
        f"{len(required_columns)}/{len(required_columns)}"
    )

    # --------------------------------------------------------
    # Match identity
    # --------------------------------------------------------

    if df["match_id"].isna().any():
        fail(
            "match_id contains null values."
        )

    duplicate_ids = int(
        df["match_id"].duplicated().sum()
    )

    if duplicate_ids:
        fail(
            f"Found {duplicate_ids:,} duplicate match IDs."
        )

    print(
        f"   ✅ Match IDs unique: {len(df):,}"
    )

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
        fail(
            f"Found {invalid_dates:,} invalid dates."
        )

    # --------------------------------------------------------
    # Deterministic chronological ordering
    # --------------------------------------------------------

    df = df.sort_values(
        by=["date", "match_id"],
        kind="mergesort"
    ).reset_index(drop=True)

    if not df["date"].is_monotonic_increasing:
        fail(
            "Dataset is not chronologically ordered."
        )

    print(
        f"   ✅ Date range: "
        f"{df['date'].min().date()} → "
        f"{df['date'].max().date()}"
    )

    # --------------------------------------------------------
    # Existing 1X2 target
    # --------------------------------------------------------

    actual_1x2 = set(
        df["target"]
        .dropna()
        .astype(str)
        .unique()
    )

    if actual_1x2 != EXPECTED_1X2_CLASSES:
        fail(
            "Unexpected 1X2 target classes.\n"
            f"Expected: {sorted(EXPECTED_1X2_CLASSES)}\n"
            f"Found:    {sorted(actual_1x2)}"
        )

    print(
        "   🔒 Existing 1X2 target classes verified."
    )

    # --------------------------------------------------------
    # Goal validation
    # --------------------------------------------------------

    print("\n⚽ Validating historical goal data...")

    for column in [
        "home_goals",
        "away_goals",
        "total_goals"
    ]:

        values = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        if values.isna().any():
            fail(
                f"{column} contains null/invalid values."
            )

        if (values < 0).any():
            fail(
                f"{column} contains negative values."
            )

    calculated_total = (
        df["home_goals"]
        + df["away_goals"]
    )

    total_mismatches = int(
        (
            df["total_goals"]
            != calculated_total
        ).sum()
    )

    if total_mismatches:
        fail(
            f"total_goals mismatch: "
            f"{total_mismatches:,} rows."
        )

    print(
        "   ✅ Goal data verified."
    )

    # --------------------------------------------------------
    # Market targets
    # --------------------------------------------------------

    validate_market_targets(df)

    # --------------------------------------------------------
    # ML features
    # --------------------------------------------------------

    validate_finite_features(df)

    return df


# ============================================================
# TRAIN ONE MARKET
# ============================================================

def train_market(df, market_key, config):

    target_column = config["target"]
    expected_labels = config["labels"]

    model_file = config["model_file"]
    mapping_file = config["mapping_file"]

    print("\n" + "=" * 60)
    print(
        f"📈 TRAINING MARKET MODEL: {market_key}"
    )
    print("=" * 60)

    # --------------------------------------------------------
    # Target validation
    # --------------------------------------------------------

    y_raw = (
        df[target_column]
        .astype(str)
    )

    actual_labels = set(
        y_raw.unique()
    )

    expected_label_set = set(
        expected_labels
    )

    if actual_labels != expected_label_set:
        fail(
            f"{market_key} target classes invalid.\n"
            f"Expected: {sorted(expected_label_set)}\n"
            f"Found:    {sorted(actual_labels)}"
        )

    print("\n🎯 Target distribution:")

    target_distribution = {}

    for label in expected_labels:

        count = int(
            (y_raw == label).sum()
        )

        percentage = (
            count
            / len(y_raw)
            * 100
        )

        target_distribution[label] = {
            "count": count,
            "percentage": float(percentage)
        }

        print(
            f"   {label:<8}"
            f"{count:>10,}"
            f" ({percentage:>6.2f}%)"
        )

    # --------------------------------------------------------
    # Features
    # --------------------------------------------------------

    X = (
        df[FEATURE_COLUMNS]
        .astype(float)
    )

    # --------------------------------------------------------
    # Chronological split
    # --------------------------------------------------------

    split_idx = int(
        len(df) * TRAIN_RATIO
    )

    X_train = X.iloc[:split_idx]
    X_test = X.iloc[split_idx:]

    y_train_raw = y_raw.iloc[:split_idx]
    y_test_raw = y_raw.iloc[split_idx:]

    train_dates = df["date"].iloc[:split_idx]
    test_dates = df["date"].iloc[split_idx:]

    if len(X_train) == 0 or len(X_test) == 0:
        fail(
            f"{market_key}: invalid train/test split."
        )

    print("\n📅 Chronological split")

    print(
        f"   🏋️ Training: "
        f"{len(X_train):,}"
    )

    print(
        f"   🧪 Testing:  "
        f"{len(X_test):,}"
    )

    print(
        f"   Training dates: "
        f"{train_dates.min().date()} → "
        f"{train_dates.max().date()}"
    )

    print(
        f"   Testing dates:  "
        f"{test_dates.min().date()} → "
        f"{test_dates.max().date()}"
    )

    if train_dates.max() > test_dates.min():
        fail(
            f"{market_key}: chronological leakage detected."
        )

    # --------------------------------------------------------
    # Label encoding
    #
    # Fit ONLY on training data.
    # --------------------------------------------------------

    label_encoder = LabelEncoder()

    y_train = label_encoder.fit_transform(
        y_train_raw
    )

    # Make sure the training period contains every class.
    train_classes = set(
        label_encoder.classes_
    )

    if train_classes != expected_label_set:
        fail(
            f"{market_key}: training period does not "
            f"contain all expected target classes.\n"
            f"Expected: {sorted(expected_label_set)}\n"
            f"Training: {sorted(train_classes)}"
        )

    # Test classes must all be known to encoder.
    unseen_test_classes = (
        set(y_test_raw.unique())
        - train_classes
    )

    if unseen_test_classes:
        fail(
            f"{market_key}: unseen target classes "
            f"appear in test period: "
            f"{sorted(unseen_test_classes)}"
        )

    y_test = label_encoder.transform(
        y_test_raw
    )

    label_mapping = {
        str(index): label
        for index, label
        in enumerate(label_encoder.classes_)
    }

    atomic_write_json(
        label_mapping,
        mapping_file
    )

    print(
        f"\n💾 Label mapping saved: "
        f"{mapping_file}"
    )

    print(
        f"   Mapping: {label_mapping}"
    )

    # --------------------------------------------------------
    # Class balancing
    # --------------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )

    print(
        "\n⚖️ Balanced sample weights generated."
    )

    # --------------------------------------------------------
    # XGBoost
    # --------------------------------------------------------

    print(
        "\n⚡ Training XGBoost..."
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

    print(
        "   ✅ Model training completed."
    )

    # --------------------------------------------------------
    # Evaluation
    # --------------------------------------------------------

    print(
        "\n📈 Evaluating on unseen chronological test data..."
    )

    y_pred = model.predict(
        X_test
    )

    y_prob = model.predict_proba(
        X_test
    )

    # --------------------------------------------------------
    # Probability integrity
    # --------------------------------------------------------

    expected_probability_shape = (
        len(X_test),
        len(label_encoder.classes_)
    )

    if y_prob.shape != expected_probability_shape:
        fail(
            f"{market_key}: probability shape mismatch.\n"
            f"Expected: {expected_probability_shape}\n"
            f"Found:    {y_prob.shape}"
        )

    if not np.isfinite(y_prob).all():
        fail(
            f"{market_key}: model generated "
            f"non-finite probabilities."
        )

    # --------------------------------------------------------
    # Metrics
    # --------------------------------------------------------

    y_test_str = label_encoder.inverse_transform(
        y_test
    )

    y_pred_str = label_encoder.inverse_transform(
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
            len(label_encoder.classes_)
        )
    )

    report = classification_report(
        y_test_str,
        y_pred_str,
        labels=expected_labels,
        zero_division=0,
        output_dict=True
    )

    cm = confusion_matrix(
        y_test_str,
        y_pred_str,
        labels=expected_labels
    )

    # --------------------------------------------------------
    # Feature importance
    # --------------------------------------------------------

    importances = (
        model.feature_importances_
    )

    if len(importances) != len(FEATURE_COLUMNS):
        fail(
            f"{market_key}: feature importance count "
            f"does not match feature count."
        )

    feature_importances = {
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

    elo_features = {
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff"
    }

    elo_importance = float(
        sum(
            importance
            for feature, importance
            in feature_importances.items()
            if feature in elo_features
        )
    )

    ewma_importance = float(
        sum(
            importance
            for feature, importance
            in feature_importances.items()
            if feature not in elo_features
        )
    )

    # --------------------------------------------------------
    # Print evaluation
    # --------------------------------------------------------

    print("\n" + "-" * 60)
    print(
        f"🎯 {market_key} RESULTS"
    )
    print("-" * 60)

    print(
        f"Accuracy:              "
        f"{accuracy * 100:.2f}%"
    )

    print(
        f"Balanced Accuracy:     "
        f"{balanced_accuracy * 100:.2f}%"
    )

    print(
        f"Macro F1:              "
        f"{macro_f1 * 100:.2f}%"
    )

    print(
        f"Weighted F1:           "
        f"{weighted_f1 * 100:.2f}%"
    )

    print(
        f"Log Loss:              "
        f"{logloss:.4f}"
    )

    print(
        "\n📋 Classification Report"
    )

    print(
        classification_report(
            y_test_str,
            y_pred_str,
            labels=expected_labels,
            zero_division=0
        )
    )

    print(
        "🧩 Confusion Matrix"
    )

    print("-" * 60)

    header = "".join(
        f"{label:>14}"
        for label in expected_labels
    )

    print(
        f"{'':>14}{header}"
    )

    for i, label in enumerate(expected_labels):

        row = "".join(
            f"{cm[i, j]:>14,}"
            for j in range(
                len(expected_labels)
            )
        )

        print(
            f"{label:>14}{row}"
        )

    # --------------------------------------------------------
    # Atomic model save
    # --------------------------------------------------------

    print(
        "\n💾 Saving model atomically..."
    )

    atomic_write_model(
        model,
        model_file
    )

    if not os.path.exists(model_file):
        fail(
            f"{market_key}: model file was not created:\n"
            f"{model_file}"
        )

    model_size_kb = (
        os.path.getsize(model_file)
        / 1024
    )

    print(
        f"   ✅ Model saved: {model_file}"
    )

    print(
        f"   📦 Model size: "
        f"{model_size_kb:.1f} KB"
    )

    # --------------------------------------------------------
    # Reload verification
    # --------------------------------------------------------

    print(
        "\n🔄 Reloading saved model..."
    )

    verification_model = joblib.load(
        model_file
    )

    verification_pred = (
        verification_model
        .predict(X_test)
    )

    verification_prob = (
        verification_model
        .predict_proba(X_test)
    )

    if not np.array_equal(
        y_pred,
        verification_pred
    ):
        fail(
            f"{market_key}: reloaded model "
            f"predictions differ from original model."
        )

    if not np.allclose(
        y_prob,
        verification_prob,
        rtol=1e-10,
        atol=1e-12
    ):
        fail(
            f"{market_key}: reloaded model "
            f"probabilities differ from original model."
        )

    print(
        "   ✅ Saved model reload verified."
    )

    # --------------------------------------------------------
    # Mapping verification
    # --------------------------------------------------------

    with open(
        mapping_file,
        "r",
        encoding="utf-8"
    ) as f:
        reloaded_mapping = json.load(f)

    if reloaded_mapping != label_mapping:
        fail(
            f"{market_key}: saved label mapping "
            f"does not match training mapping."
        )

    print(
        "   ✅ Label mapping reload verified."
    )

    # --------------------------------------------------------
    # Result object
    # --------------------------------------------------------

    result = {
        "market": market_key,

        "target_column": target_column,

        "labels": list(
            label_encoder.classes_
        ),

        "feature_count": len(
            FEATURE_COLUMNS
        ),

        "features": list(
            FEATURE_COLUMNS
        ),

        "dataset_rows": int(
            len(df)
        ),

        "train_rows": int(
            len(X_train)
        ),

        "test_rows": int(
            len(X_test)
        ),

        "train_ratio": float(
            TRAIN_RATIO
        ),

        "train_date_start": str(
            train_dates.min().date()
        ),

        "train_date_end": str(
            train_dates.max().date()
        ),

        "test_date_start": str(
            test_dates.min().date()
        ),

        "test_date_end": str(
            test_dates.max().date()
        ),

        "target_distribution": target_distribution,

        "evaluation": {
            "accuracy": float(
                accuracy
            ),

            "balanced_accuracy": float(
                balanced_accuracy
            ),

            "macro_f1": float(
                macro_f1
            ),

            "weighted_f1": float(
                weighted_f1
            ),

            "log_loss": float(
                logloss
            )
        },

        "classification_report": report,

        "confusion_matrix": cm.tolist(),

        "feature_importances": (
            feature_importances
        ),

        "signal_contribution": {
            "elo_features": elo_importance,
            "ewma_features": ewma_importance
        },

        "model_file": model_file,

        "label_mapping_file": mapping_file,

        "model_format": "joblib",

        "random_state": RANDOM_STATE,

        "status": "PASS"
    }

    return result


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(
        " ZOKASCORE V2 — STEP 47: "
        "MARKET MODEL TRAINING"
    )
    print("=" * 60)

    print()

    # --------------------------------------------------------
    # 1. SAFETY CHECK
    # --------------------------------------------------------

    print(
        "[1/4] Checking Step 46 dataset..."
    )

    if not os.path.exists(
        FEATURES_FILE
    ):
        fail(
            "Step 46 unified feature dataset "
            "was not found:\n"
            f"{FEATURES_FILE}\n\n"
            "Run Pipeline 46 first."
        )

    print(
        f"   ✅ Found: {FEATURES_FILE}"
    )

    # --------------------------------------------------------
    # Pipeline 41 protection
    # --------------------------------------------------------

    print(
        "\n🔒 Checking Pipeline 41 champion..."
    )

    if os.path.exists(
        PIPELINE41_MODEL
    ):
        print(
            "   ✅ Pipeline 41 champion exists."
        )

        print(
            f"   🔒 Protected: "
            f"{PIPELINE41_MODEL}"
        )

    else:
        print(
            "   ⚠️ Pipeline 41 champion "
            "not found."
        )

        print(
            "   Market training will continue, "
            "but deployment should be checked later."
        )

    # --------------------------------------------------------
    # 2. LOAD
    # --------------------------------------------------------

    print(
        "\n[2/4] Loading Step 46 dataset..."
    )

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    print(
        f"   ↳ Rows loaded: "
        f"{len(df):,}"
    )

    # --------------------------------------------------------
    # 3. VALIDATION
    # --------------------------------------------------------

    print(
        "\n[3/4] Validating Step 46 dataset..."
    )

    df = validate_dataset(
        df
    )

    # --------------------------------------------------------
    # 4. TRAIN
    # --------------------------------------------------------

    print(
        "\n[4/4] Training market models..."
    )

    all_results = {}

    for market_key, config in MARKETS.items():

        all_results[market_key] = train_market(
            df,
            market_key,
            config
        )

    # --------------------------------------------------------
    # Master report
    # --------------------------------------------------------

    print(
        "\n" + "=" * 60
    )

    print(
        "📦 SAVING STEP 47 MASTER REPORT"
    )

    print(
        "=" * 60
    )

    pipeline_results = {

        "pipeline_step": "47",

        "name": "Market Model Training",

        "status": "PASS",

        "input": {
            "file": FEATURES_FILE,
            "population": int(len(df)),
            "expected_population": EXPECTED_ROWS
        },

        "training": {
            "train_ratio": TRAIN_RATIO,
            "random_state": RANDOM_STATE,
            "feature_count": len(FEATURE_COLUMNS),
            "features": FEATURE_COLUMNS
        },

        "markets": all_results,

        "pipeline_41_protected": os.path.exists(
            PIPELINE41_MODEL
        )
    }

    atomic_write_json(
        pipeline_results,
        REPORT_FILE
    )

    print(
        f"💾 Report saved:\n"
        f"{REPORT_FILE}"
    )

    # --------------------------------------------------------
    # Final artifact check
    # --------------------------------------------------------

    print(
        "\n🔐 FINAL ARTIFACT CHECK"
    )

    print(
        "-" * 60
    )

    artifacts = []

    for market_key, config in MARKETS.items():

        artifacts.extend([
            config["model_file"],
            config["mapping_file"]
        ])

    artifacts.append(
        REPORT_FILE
    )

    for artifact in artifacts:

        if not os.path.exists(
            artifact
        ):
            fail(
                f"Required artifact missing:\n"
                f"{artifact}"
            )

        size_kb = (
            os.path.getsize(artifact)
            / 1024
        )

        print(
            f"   ✅ {artifact} "
            f"({size_kb:.1f} KB)"
        )

    # --------------------------------------------------------
    # Pipeline 41 final protection
    # --------------------------------------------------------

    print(
        "\n🔒 PIPELINE 41 FINAL PROTECTION CHECK"
    )

    if os.path.exists(
        PIPELINE41_MODEL
    ):
        print(
            "   ✅ Pipeline 41 champion still exists."
        )

        print(
            "   🔒 No Pipeline 41 artifact was overwritten."
        )

    else:
        print(
            "   ⚠️ Pipeline 41 champion is absent."
        )

    # --------------------------------------------------------
    # Final summary
    # --------------------------------------------------------

    print(
        "\n" + "=" * 60
    )

    print(
        " STEP 47 COMPLETE: PASS"
    )

    print(
        "=" * 60
    )

    print(
        f"📊 Population: "
        f"{len(df):,}"
    )

    print(
        f"📈 Markets trained: "
        f"{len(MARKETS)}"
    )

    for market_key, result in all_results.items():

        metrics = result["evaluation"]

        print(
            f"\n   {market_key}"
        )

        print(
            f"      Accuracy: "
            f"{metrics['accuracy'] * 100:.2f}%"
        )

        print(
            f"      Balanced Accuracy: "
            f"{metrics['balanced_accuracy'] * 100:.2f}%"
        )

        print(
            f"      Macro F1: "
            f"{metrics['macro_f1'] * 100:.2f}%"
        )

        print(
            f"      Log Loss: "
            f"{metrics['log_loss']:.4f}"
        )

    print(
        "\n🔒 Pipeline 41: PROTECTED"
    )

    print(
        "💾 Step 47 artifacts: VERIFIED"
    )

    print(
        "=" * 60
    )


if __name__ == "__main__":
    run()
