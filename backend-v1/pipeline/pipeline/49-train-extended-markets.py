import os
import json
import joblib
import tempfile

import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.metrics import accuracy_score, log_loss
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight


# ============================================================
# ZOKASCORE V2 — STEP 49
# EXTENDED MARKET & CORRECT SCORE TRAINING
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

TRAIN_RATIO = 0.80
RANDOM_STATE = 42

# ============================================================
# FEATURE CONTRACT
# ============================================================
# IMPORTANT:
# These are the 23 features produced by the unified feature
# dataset and consumed by the Step 49 market/CS models.
#
# DO NOT reorder or rename these without updating downstream
# inference code.
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

# Correct-score classes must have enough training examples
# to produce a useful model.
#
# This threshold is deliberately applied ONLY to the training
# portion of the chronological dataset.
MIN_CORRECT_SCORE_TRAIN_SAMPLES = 500


# ============================================================
# UTILITY — ATOMIC JSON WRITE
# ============================================================

def atomic_write_json(data, file_path):
    """
    Write JSON through a temporary file and replace the
    destination only after the write succeeds.
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    directory = os.path.dirname(file_path)

    fd, temp_path = tempfile.mkstemp(
        prefix=".tmp_",
        suffix=".json",
        dir=directory
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(
                data,
                f,
                indent=2,
                ensure_ascii=False
            )

        os.replace(temp_path, file_path)

    except Exception:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise


# ============================================================
# UTILITY — ATOMIC MODEL WRITE
# ============================================================

def atomic_write_model(model, file_path):
    """
    Write joblib model through a temporary file and replace
    the destination only after serialization succeeds.
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    directory = os.path.dirname(file_path)

    fd, temp_path = tempfile.mkstemp(
        prefix=".tmp_",
        suffix=".joblib",
        dir=directory
    )

    os.close(fd)

    try:
        joblib.dump(model, temp_path)
        os.replace(temp_path, file_path)

    except Exception:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise


# ============================================================
# DATASET VALIDATION
# ============================================================

def validate_dataset(df):
    print("\n🔍 VALIDATING FEATURE DATASET")

    required_columns = [
        "match_id",
        "date",
        "home_goals",
        "away_goals",
        "total_goals"
    ]

    required_columns.extend(FEATURE_COLUMNS)

    for config in MARKETS.values():
        required_columns.append(config["target"])

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        raise ValueError(
            "Missing required columns:\n"
            + "\n".join(f"   - {column}" for column in missing)
        )

    if len(df) == 0:
        raise ValueError("Feature dataset is empty.")

    if df["date"].isna().any():
        bad_dates = int(df["date"].isna().sum())
        raise ValueError(
            f"Dataset contains {bad_dates} rows with invalid dates."
        )

    if df["match_id"].isna().any():
        bad_ids = int(df["match_id"].isna().sum())
        raise ValueError(
            f"Dataset contains {bad_ids} rows with missing match_id."
        )

    # Check feature numeric conversion without modifying the
    # source dataframe in-place.
    for column in FEATURE_COLUMNS:
        numeric = pd.to_numeric(df[column], errors="coerce")

        invalid = int(numeric.isna().sum())

        if invalid:
            raise ValueError(
                f"Feature '{column}' contains {invalid} "
                f"non-numeric/null values."
            )

    print(f"   ✅ Rows: {len(df):,}")
    print(f"   ✅ Columns: {len(df.columns)}")
    print(f"   ✅ Required columns present")
    print(f"   ✅ Dates valid")
    print(f"   ✅ Feature values numeric")


# ============================================================
# FEATURE MATRIX
# ============================================================

def build_feature_matrix(df):
    """
    Build X using the fixed 23-feature contract.
    """
    X = df[FEATURE_COLUMNS].apply(
        pd.to_numeric,
        errors="coerce"
    )

    if X.isna().any().any():
        raise ValueError(
            "Feature matrix contains NaN values after numeric conversion."
        )

    return X.astype(np.float32)


# ============================================================
# TRAIN BINARY MARKET MODEL
# ============================================================

def train_market(df, market_key, config):
    target_col = config["target"]

    print("\n" + "-" * 60)
    print(f"📈 TRAINING MARKET MODEL: {market_key}")
    print("-" * 60)

    # --------------------------------------------------------
    # Remove rows with missing target only.
    # --------------------------------------------------------

    working = df[
        df[target_col].notna()
    ].copy()

    if len(working) < 2:
        raise ValueError(
            f"{market_key}: insufficient rows for training."
        )

    # --------------------------------------------------------
    # Chronological split
    # --------------------------------------------------------

    split_idx = int(len(working) * TRAIN_RATIO)

    if split_idx <= 0 or split_idx >= len(working):
        raise ValueError(
            f"{market_key}: invalid train/test split."
        )

    train_df = working.iloc[:split_idx].copy()
    test_df = working.iloc[split_idx:].copy()

    print(f"   Training rows: {len(train_df):,}")
    print(f"   Testing rows:  {len(test_df):,}")

    # --------------------------------------------------------
    # Build feature matrices
    # --------------------------------------------------------

    X_train = build_feature_matrix(train_df)
    X_test = build_feature_matrix(test_df)

    # --------------------------------------------------------
    # Normalize labels
    # --------------------------------------------------------

    y_train_raw = (
        train_df[target_col]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    y_test_raw = (
        test_df[target_col]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    # --------------------------------------------------------
    # Validate expected market labels
    # --------------------------------------------------------

    expected_labels = set(config["labels"])

    train_labels = set(y_train_raw.unique())
    test_labels = set(y_test_raw.unique())

    unexpected_train = train_labels - expected_labels
    unexpected_test = test_labels - expected_labels

    if unexpected_train:
        raise ValueError(
            f"{market_key}: unexpected training labels: "
            f"{sorted(unexpected_train)}"
        )

    if unexpected_test:
        raise ValueError(
            f"{market_key}: unexpected test labels: "
            f"{sorted(unexpected_test)}"
        )

    # --------------------------------------------------------
    # Ensure every expected class exists in training.
    # --------------------------------------------------------

    missing_train_classes = expected_labels - train_labels

    if missing_train_classes:
        raise ValueError(
            f"{market_key}: training data is missing classes: "
            f"{sorted(missing_train_classes)}"
        )

    # --------------------------------------------------------
    # Encode labels using fixed market label order.
    #
    # This makes the mapping deterministic:
    #
    # 0 = OVER
    # 1 = UNDER
    # --------------------------------------------------------

    label_to_int = {
        label: index
        for index, label in enumerate(config["labels"])
    }

    y_train = y_train_raw.map(label_to_int).astype(int)

    # --------------------------------------------------------
    # Test set may theoretically contain only one class.
    # That is acceptable for accuracy, but log-loss requires
    # careful handling.
    # --------------------------------------------------------

    y_test = y_test_raw.map(label_to_int).astype(int)

    # --------------------------------------------------------
    # Balanced sample weights
    # --------------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )

    # --------------------------------------------------------
    # Model
    # --------------------------------------------------------

    model = xgb.XGBClassifier(
        objective="binary:logistic",
        n_estimators=300,
        learning_rate=0.05,
        max_depth=6,
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

    # --------------------------------------------------------
    # Predictions
    # --------------------------------------------------------

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    acc = accuracy_score(
        y_test,
        y_pred
    )

    # XGBoost probability columns follow class order.
    # Since labels are fixed to [OVER, UNDER], this is stable.
    ll = log_loss(
        y_test,
        y_prob,
        labels=[0, 1]
    )

    print(
        f"   🎯 Accuracy: {acc * 100:.2f}%"
    )

    print(
        f"   📉 Log Loss: {ll:.6f}"
    )

    # --------------------------------------------------------
    # Save model
    # --------------------------------------------------------

    model_path = os.path.join(
        MODELS_DIR,
        f"market_{market_key.lower()}_model.joblib"
    )

    atomic_write_model(
        model,
        model_path
    )

    # --------------------------------------------------------
    # Save label mapping
    # --------------------------------------------------------

    mapping_path = os.path.join(
        MODELS_DIR,
        f"market_{market_key.lower()}_label_mapping.json"
    )

    atomic_write_json(
        {
            "0": "OVER",
            "1": "UNDER"
        },
        mapping_path
    )

    # --------------------------------------------------------
    # Save model metadata
    # --------------------------------------------------------

    metadata_path = os.path.join(
        MODELS_DIR,
        f"market_{market_key.lower()}_metadata.json"
    )

    metadata = {
        "step": 49,
        "market": market_key,
        "target": target_col,
        "model_type": "binary_xgboost",
        "feature_count": len(FEATURE_COLUMNS),
        "features": FEATURE_COLUMNS,
        "train_ratio": TRAIN_RATIO,
        "random_state": RANDOM_STATE,
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "labels": config["labels"],
        "metrics": {
            "accuracy": float(acc),
            "log_loss": float(ll)
        }
    }

    atomic_write_json(
        metadata,
        metadata_path
    )

    return {
        "market": market_key,
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "accuracy": float(acc),
        "log_loss": float(ll)
    }


# ============================================================
# BUILD CORRECT SCORE LABEL
# ============================================================

def build_correct_score(df):
    """
    Convert goals to bounded 0-5 correct-score classes.

    Scores above 5 are intentionally grouped into the 5 bucket,
    matching the original Step 49 design.
    """
    home = pd.to_numeric(
        df["home_goals"],
        errors="coerce"
    )

    away = pd.to_numeric(
        df["away_goals"],
        errors="coerce"
    )

    valid = (
        home.notna()
        & away.notna()
        & (home >= 0)
        & (away >= 0)
    )

    result = df.loc[valid].copy()

    result["cs_home"] = (
        home.loc[valid]
        .clip(0, 5)
        .astype(int)
    )

    result["cs_away"] = (
        away.loc[valid]
        .clip(0, 5)
        .astype(int)
    )

    result["correct_score"] = (
        result["cs_home"].astype(str)
        + "-"
        + result["cs_away"].astype(str)
    )

    return result


# ============================================================
# TRAIN CORRECT SCORE MODEL
# ============================================================

def train_correct_score_model(df):
    print("\n" + "-" * 60)
    print("📈 TRAINING CORRECT SCORE MODEL (MULTI-CLASS)")
    print("-" * 60)

    # --------------------------------------------------------
    # Build score labels first.
    # --------------------------------------------------------

    working = build_correct_score(df)

    if len(working) < 2:
        raise ValueError(
            "Correct Score: insufficient valid goal rows."
        )

    # --------------------------------------------------------
    # IMPORTANT:
    # Chronological split happens BEFORE class filtering.
    #
    # This prevents future/test data from influencing which
    # classes are considered sufficiently represented.
    # --------------------------------------------------------

    split_idx = int(len(working) * TRAIN_RATIO)

    if split_idx <= 0 or split_idx >= len(working):
        raise ValueError(
            "Correct Score: invalid train/test split."
        )

    train_df = working.iloc[:split_idx].copy()
    test_df = working.iloc[split_idx:].copy()

    print(f"   Training rows before filtering: {len(train_df):,}")
    print(f"   Testing rows:                  {len(test_df):,}")

    # --------------------------------------------------------
    # Determine valid classes from TRAIN ONLY.
    # --------------------------------------------------------

    train_counts = (
        train_df["correct_score"]
        .value_counts()
    )

    valid_classes = (
        train_counts[
            train_counts >= MIN_CORRECT_SCORE_TRAIN_SAMPLES
        ]
        .index
        .tolist()
    )

    if len(valid_classes) < 2:
        raise ValueError(
            "Correct Score: fewer than two sufficiently "
            "represented training classes."
        )

    print(
        f"   Valid CS classes: {len(valid_classes)}"
    )

    # --------------------------------------------------------
    # Filter both train and test to classes known from train.
    #
    # This prevents LabelEncoder from seeing unseen test
    # classes.
    # --------------------------------------------------------

    train_df = train_df[
        train_df["correct_score"].isin(valid_classes)
    ].copy()

    test_df = test_df[
        test_df["correct_score"].isin(valid_classes)
    ].copy()

    if len(train_df) == 0:
        raise ValueError(
            "Correct Score: training dataset empty after filtering."
        )

    if len(test_df) == 0:
        raise ValueError(
            "Correct Score: testing dataset empty after filtering."
        )

    print(
        f"   Training rows after filtering: {len(train_df):,}"
    )

    print(
        f"   Testing rows after filtering:  {len(test_df):,}"
    )

    # --------------------------------------------------------
    # Stable class ordering
    # --------------------------------------------------------

    valid_classes = sorted(
        valid_classes,
        key=lambda value: (
            int(value.split("-")[0]),
            int(value.split("-")[1])
        )
    )

    class_to_int = {
        label: index
        for index, label in enumerate(valid_classes)
    }

    # --------------------------------------------------------
    # Features
    # --------------------------------------------------------

    X_train = build_feature_matrix(train_df)
    X_test = build_feature_matrix(test_df)

    y_train = (
        train_df["correct_score"]
        .map(class_to_int)
        .astype(int)
    )

    y_test = (
        test_df["correct_score"]
        .map(class_to_int)
        .astype(int)
    )

    # --------------------------------------------------------
    # Sanity check
    # --------------------------------------------------------

    if y_train.isna().any():
        raise ValueError(
            "Correct Score: NaN labels detected in training."
        )

    if y_test.isna().any():
        raise ValueError(
            "Correct Score: NaN labels detected in testing."
        )

    # --------------------------------------------------------
    # Balanced sample weights
    # --------------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )

    # --------------------------------------------------------
    # Multi-class XGBoost
    # --------------------------------------------------------

    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=len(valid_classes),

        n_estimators=200,
        learning_rate=0.1,
        max_depth=4,

        subsample=0.8,
        colsample_bytree=0.8,

        random_state=RANDOM_STATE,
        n_jobs=-1,

        eval_metric="mlogloss",
        tree_method="hist",

        early_stopping_rounds=15
    )

    # --------------------------------------------------------
    # Train with chronological test evaluation.
    # --------------------------------------------------------

    model.fit(
        X_train,
        y_train,
        sample_weight=sample_weights,
        eval_set=[
            (X_test, y_test)
        ],
        verbose=False
    )

    # --------------------------------------------------------
    # Predictions
    # --------------------------------------------------------

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    acc = accuracy_score(
        y_test,
        y_pred
    )

    ll = log_loss(
        y_test,
        y_prob,
        labels=list(range(len(valid_classes)))
    )

    print(
        f"   🎯 Correct Score Top-1 Accuracy: "
        f"{acc * 100:.2f}%"
    )

    print(
        f"   📉 Correct Score Log Loss: "
        f"{ll:.6f}"
    )

    # --------------------------------------------------------
    # Save model
    # --------------------------------------------------------

    model_path = os.path.join(
        MODELS_DIR,
        "market_correct_score_model.joblib"
    )

    atomic_write_model(
        model,
        model_path
    )

    # --------------------------------------------------------
    # Save label mapping
    # --------------------------------------------------------

    mapping_path = os.path.join(
        MODELS_DIR,
        "market_correct_score_label_mapping.json"
    )

    atomic_write_json(
        {
            str(index): label
            for index, label in enumerate(valid_classes)
        },
        mapping_path
    )

    # --------------------------------------------------------
    # Save metadata
    # --------------------------------------------------------

    metadata_path = os.path.join(
        MODELS_DIR,
        "market_correct_score_metadata.json"
    )

    metadata = {
        "step": 49,
        "market": "CORRECT_SCORE",
        "target": "home_goals + away_goals",
        "model_type": "multiclass_xgboost",

        "feature_count": len(FEATURE_COLUMNS),
        "features": FEATURE_COLUMNS,

        "train_ratio": TRAIN_RATIO,
        "random_state": RANDOM_STATE,

        "minimum_training_samples_per_class":
            MIN_CORRECT_SCORE_TRAIN_SAMPLES,

        "train_rows_before_filter": int(
            split_idx
        ),

        "train_rows_after_filter": int(
            len(train_df)
        ),

        "test_rows_after_filter": int(
            len(test_df)
        ),

        "class_count": len(valid_classes),

        "classes": valid_classes,

        "best_iteration": (
            int(model.best_iteration)
            if hasattr(model, "best_iteration")
            else None
        ),

        "metrics": {
            "accuracy": float(acc),
            "log_loss": float(ll)
        }
    }

    atomic_write_json(
        metadata,
        metadata_path
    )

    return {
        "market": "CORRECT_SCORE",
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "class_count": len(valid_classes),
        "accuracy": float(acc),
        "log_loss": float(ll)
    }


# ============================================================
# MAIN RUNNER
# ============================================================

def run():

    print("=" * 70)
    print(" ZOKASCORE V2 — STEP 49")
    print(" EXTENDED MARKET & CORRECT SCORE TRAINING")
    print("=" * 70)

    # --------------------------------------------------------
    # Check dataset
    # --------------------------------------------------------

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Dataset not found:\n{FEATURES_FILE}"
        )

    print("\n📂 FEATURE DATASET")
    print(f"   {FEATURES_FILE}")

    # --------------------------------------------------------
    # Load dataset
    # --------------------------------------------------------

    print("\n📥 Loading feature dataset...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    print(
        f"   Loaded {len(df):,} rows"
    )

    # --------------------------------------------------------
    # Parse dates
    # --------------------------------------------------------

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    # --------------------------------------------------------
    # Validate before sorting
    # --------------------------------------------------------

    validate_dataset(df)

    # --------------------------------------------------------
    # Chronological ordering
    #
    # This is critical.
    # The model must never train on future matches and then
    # evaluate on older matches.
    # --------------------------------------------------------

    df = (
        df.sort_values(
            by=["date", "match_id"],
            kind="mergesort"
        )
        .reset_index(drop=True)
    )

    print("\n📅 CHRONOLOGICAL ORDER")
    print(
        f"   First match: {df['date'].iloc[0]}"
    )
    print(
        f"   Last match:  {df['date'].iloc[-1]}"
    )

    # --------------------------------------------------------
    # Create output directories
    # --------------------------------------------------------

    os.makedirs(
        MODELS_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORTS_DIR,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Train market models
    # --------------------------------------------------------

    market_results = []

    for market_key, config in MARKETS.items():

        result = train_market(
            df,
            market_key,
            config
        )

        market_results.append(result)

    # --------------------------------------------------------
    # Train Correct Score model
    # --------------------------------------------------------

    correct_score_result = train_correct_score_model(
        df
    )

    # --------------------------------------------------------
    # Build Step 49 report
    # --------------------------------------------------------

    report = {
        "step": 49,
        "status": "PASS",

        "dataset": {
            "file": FEATURES_FILE,
            "rows": int(len(df)),
            "columns": int(len(df.columns))
        },

        "feature_contract": {
            "count": len(FEATURE_COLUMNS),
            "features": FEATURE_COLUMNS
        },

        "training": {
            "train_ratio": TRAIN_RATIO,
            "random_state": RANDOM_STATE,
            "chronological_split": True
        },

        "markets": market_results,

        "correct_score": correct_score_result
    }

    report_path = os.path.join(
        REPORTS_DIR,
        "step49_training_report.json"
    )

    atomic_write_json(
        report,
        report_path
    )

    # --------------------------------------------------------
    # Final status
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print(" ✅ STEP 49 COMPLETE: PASS")
    print("=" * 70)

    print("\n📊 MARKET RESULTS")

    for result in market_results:
        print(
            f"   {result['market']}: "
            f"Accuracy={result['accuracy'] * 100:.2f}% | "
            f"LogLoss={result['log_loss']:.6f}"
        )

    print("\n📊 CORRECT SCORE")

    print(
        f"   Classes: "
        f"{correct_score_result['class_count']}"
    )

    print(
        f"   Accuracy: "
        f"{correct_score_result['accuracy'] * 100:.2f}%"
    )

    print(
        f"   LogLoss: "
        f"{correct_score_result['log_loss']:.6f}"
    )

    print("\n📄 Report:")
    print(f"   {report_path}")


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()

