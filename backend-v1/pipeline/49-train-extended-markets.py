import os
import json
import numpy as np
import pandas as pd
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
# ZOKASCORE V2 - PIPELINE 49
# EXTENDED MARKET TRAINING
#
# PURPOSE:
#   Train additional O/U markets:
#       - O/U 0.5
#       - O/U 1.5
#       - O/U 3.5
#
# EXISTING MODELS PROTECTED:
#       - 1X2 Champion        -> Pipeline 44
#       - O/U 2.5             -> Pipeline 47
#       - BTTS                 -> Pipeline 47
#
# IMPORTANT:
#   This pipeline NEVER overwrites the 1X2 champion.
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

FEATURES_FILE = os.path.join(
    "data",
    "ml",
    "features_v4_unified.csv"
)

MODEL_DIR = os.path.join(
    "data",
    "ml"
)

CHAMPION_MODEL = os.path.join(
    MODEL_DIR,
    "zokascore_v2_model.json"
)

EXPECTED_ROWS = 118_154
RANDOM_STATE = 42

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


MARKETS = {
    "OU_0_5": {
        "target": "ou_0_5",
        "labels": ["OVER", "UNDER"]
    },

    "OU_1_5": {
        "target": "ou_1_5",
        "labels": ["OVER", "UNDER"]
    },

    "OU_3_5": {
        "target": "ou_3_5",
        "labels": ["OVER", "UNDER"]
    }
}


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    raise RuntimeError(f"\n❌ {message}\n")


def validate_file(path, description):
    if not os.path.isfile(path):
        fail(f"{description} not found: {path}")

    if os.path.getsize(path) <= 0:
        fail(f"{description} is empty: {path}")

    print(f"   ✅ {description}: {path}")


def validate_probability_matrix(probabilities, expected_rows):
    if probabilities.shape[0] != expected_rows:
        fail(
            f"Probability row count mismatch: "
            f"{probabilities.shape[0]} != {expected_rows}"
        )

    if not np.isfinite(probabilities).all():
        fail("Model produced NaN or infinite probabilities.")

    row_sums = probabilities.sum(axis=1)

    if not np.allclose(row_sums, 1.0, atol=1e-6):
        fail("Model probabilities do not sum to 1.")


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# ============================================================
# START
# ============================================================

print("🧠 ZOKASCORE V2 - Pipeline 49: Extended Market Training")
print("=" * 60)
print()


# ============================================================
# 1. FILE CHECKS
# ============================================================

print("🔍 Checking input files...")

os.makedirs(MODEL_DIR, exist_ok=True)

validate_file(
    FEATURES_FILE,
    "Unified features"
)

validate_file(
    CHAMPION_MODEL,
    "Pipeline 41 1X2 champion"
)

print()
print("🔒 Pipeline 41 protection:")
print(f"   Champion: {CHAMPION_MODEL}")
print("   ✅ Champion will NOT be modified.")


# ============================================================
# 2. LOAD DATA
# ============================================================

print("\n📊 Loading unified dataset...")

df = pd.read_csv(
    FEATURES_FILE,
    low_memory=False
)

print(f"   ✅ Loaded {len(df):,} matches.")


# ============================================================
# 3. DATASET SIZE VALIDATION
# ============================================================

print("\n🔐 Validating dataset size...")

if len(df) != EXPECTED_ROWS:
    fail(
        f"Unexpected row count: "
        f"{len(df):,} != {EXPECTED_ROWS:,}"
    )

print(
    f"   ✅ Expected row count confirmed: "
    f"{len(df):,}"
)


# ============================================================
# 4. REQUIRED COLUMNS
# ============================================================

print("\n🔐 Validating required columns...")

required_columns = (
    FEATURE_COLUMNS
    + [
        "match_id",
        "date",
        "target",
        "home_goals",
        "away_goals"
    ]
    + [config["target"] for config in MARKETS.values()]
)

missing_columns = [
    col
    for col in required_columns
    if col not in df.columns
]

if missing_columns:
    fail(
        "Missing required columns:\n"
        + "\n".join(f"   - {c}" for c in missing_columns)
    )

print(
    f"   ✅ Required columns present: "
    f"{len(required_columns)}/{len(required_columns)}"
)


# ============================================================
# 5. DATE VALIDATION
# ============================================================

print("\n📅 Validating dates...")

df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)

if df["date"].isna().any():
    fail(
        f"Found {df['date'].isna().sum():,} invalid dates."
    )

df = df.sort_values(
    "date",
    kind="stable"
).reset_index(drop=True)

print(
    f"   ✅ Date range: "
    f"{df['date'].min().date()} → "
    f"{df['date'].max().date()}"
)


# ============================================================
# 6. MATCH ID VALIDATION
# ============================================================

print("\n🆔 Validating match IDs...")

if df["match_id"].isna().any():
    fail("Null match IDs detected.")

duplicate_ids = df["match_id"].duplicated().sum()

if duplicate_ids:
    fail(
        f"Duplicate match IDs detected: "
        f"{duplicate_ids:,}"
    )

print(
    f"   ✅ Match IDs unique: {len(df):,}"
)


# ============================================================
# 7. PIPELINE 41 TARGET PROTECTION
# ============================================================

print("\n🎯 Validating existing 1X2 target...")

valid_1x2 = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
}

actual_1x2 = set(
    df["target"]
    .dropna()
    .astype(str)
    .unique()
)

if actual_1x2 != valid_1x2:
    fail(
        f"Unexpected 1X2 target classes: "
        f"{sorted(actual_1x2)}"
    )

target_counts = df["target"].value_counts()

for label in ["HOME_WIN", "DRAW", "AWAY_WIN"]:
    print(
        f"   {label:<12} "
        f"{target_counts.get(label, 0):>8,} "
        f"({target_counts.get(label, 0) / len(df) * 100:6.2f}%)"
    )

print("   🔒 Existing 1X2 target preserved.")


# ============================================================
# 8. FEATURE VALIDATION
# ============================================================

print("\n🔢 Validating ML features...")

feature_frame = df[FEATURE_COLUMNS].apply(
    pd.to_numeric,
    errors="coerce"
)

if feature_frame.isna().any().any():
    bad_columns = feature_frame.columns[
        feature_frame.isna().any()
    ].tolist()

    fail(
        "NaN/non-numeric values found in features:\n"
        + "\n".join(
            f"   - {c}" for c in bad_columns
        )
    )

feature_values = feature_frame.to_numpy(dtype=float)

if not np.isfinite(feature_values).all():
    fail("Infinite feature values detected.")

print(
    f"   ✅ All {len(FEATURE_COLUMNS)} features "
    "are numeric and finite."
)


# ============================================================
# 9. MARKET TARGET VALIDATION
# ============================================================

print("\n🎯 Validating extended market targets...")

for market_key, config in MARKETS.items():

    target = config["target"]
    expected_labels = set(config["labels"])

    values = set(
        df[target]
        .dropna()
        .astype(str)
        .unique()
    )

    if values != expected_labels:
        fail(
            f"{market_key} has invalid classes: "
            f"{sorted(values)}"
        )

    if df[target].isna().any():
        fail(
            f"{market_key} contains "
            f"{df[target].isna().sum():,} null targets."
        )

    print(
        f"   ✅ {market_key}: "
        f"{len(df):,} valid targets"
    )


# ============================================================
# 10. GOAL LOGIC CROSS-CHECK
# ============================================================

print("\n⚽ Cross-checking market target logic...")

total_goals = (
    df["home_goals"].astype(int)
    + df["away_goals"].astype(int)
)

checks = {
    "ou_0_5": np.where(
        total_goals > 0.5,
        "OVER",
        "UNDER"
    ),

    "ou_1_5": np.where(
        total_goals > 1.5,
        "OVER",
        "UNDER"
    ),

    "ou_3_5": np.where(
        total_goals > 3.5,
        "OVER",
        "UNDER"
    )
}

for target, expected in checks.items():

    actual = df[target].astype(str).to_numpy()

    mismatches = np.sum(actual != expected)

    if mismatches:
        fail(
            f"{target} has {mismatches:,} "
            "target/goal mismatches."
        )

    print(
        f"   ✅ {target.upper()} logic verified."
    )


# ============================================================
# 11. CHRONOLOGICAL SPLIT
# ============================================================

split_idx = int(len(df) * 0.8)

if split_idx <= 0 or split_idx >= len(df):
    fail("Invalid chronological split.")

train_df = df.iloc[:split_idx].copy()
test_df = df.iloc[split_idx:].copy()

print("\n📅 Chronological split")
print(
    f"   🏋️ Training: {len(train_df):,}"
)
print(
    f"   🧪 Testing:  {len(test_df):,}"
)
print(
    f"   Training dates: "
    f"{train_df['date'].min().date()} → "
    f"{train_df['date'].max().date()}"
)
print(
    f"   Testing dates:  "
    f"{test_df['date'].min().date()} → "
    f"{test_df['date'].max().date()}"
)


if train_df["date"].max() > test_df["date"].min():
    fail(
        "Chronological split is invalid."
    )


# ============================================================
# 12. TRAIN EACH EXTENDED MARKET
# ============================================================

results = {
    "pipeline": "49",
    "dataset": {
        "rows": len(df),
        "features": len(FEATURE_COLUMNS),
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "first_date": str(df["date"].min().date()),
        "last_date": str(df["date"].max().date())
    },
    "markets": {}
}


for market_key, config in MARKETS.items():

    target_col = config["target"]

    print("\n" + "=" * 60)
    print(f"📈 TRAINING MARKET MODEL: {market_key}")
    print("=" * 60)

    y_train_raw = (
        train_df[target_col]
        .astype(str)
    )

    y_test_raw = (
        test_df[target_col]
        .astype(str)
    )

    print("\n🎯 Target distribution:")

    full_counts = df[target_col].value_counts()

    for label in config["labels"]:
        count = full_counts.get(label, 0)

        print(
            f"   {label:<10}"
            f"{count:>10,} "
            f"({count / len(df) * 100:6.2f}%)"
        )


    # --------------------------------------------------------
    # LABEL ENCODING
    # --------------------------------------------------------

    le = LabelEncoder()

    y_train = le.fit_transform(
        y_train_raw
    )

    try:
        y_test = le.transform(
            y_test_raw
        )
    except ValueError as exc:
        fail(
            f"{market_key} test set contains "
            f"a class absent from training: {exc}"
        )


    if len(le.classes_) != 2:
        fail(
            f"{market_key} expected 2 classes, "
            f"found {len(le.classes_)}."
        )


    mapping = {
        str(i): str(label)
        for i, label in enumerate(le.classes_)
    }


    map_file = os.path.join(
        MODEL_DIR,
        f"market_{market_key.lower()}_label_mapping.json"
    )

    save_json(
        map_file,
        mapping
    )

    print(
        f"\n💾 Label mapping saved: {map_file}"
    )
    print(
        f"   Mapping: {mapping}"
    )


    # --------------------------------------------------------
    # FEATURES
    # --------------------------------------------------------

    X_train = (
        train_df[FEATURE_COLUMNS]
        .astype(float)
    )

    X_test = (
        test_df[FEATURE_COLUMNS]
        .astype(float)
    )


    # --------------------------------------------------------
    # CLASS BALANCING
    # --------------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )


    # --------------------------------------------------------
    # MODEL
    # --------------------------------------------------------

    print("\n⚡ Training XGBoost...")

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


    # --------------------------------------------------------
    # INFERENCE
    # --------------------------------------------------------

    print(
        "\n📈 Evaluating on unseen "
        "chronological test data..."
    )

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)


    validate_probability_matrix(
        y_prob,
        len(X_test)
    )


    # --------------------------------------------------------
    # METRICS
    # --------------------------------------------------------

    accuracy = accuracy_score(
        y_test,
        y_pred
    )

    balanced_accuracy = balanced_accuracy_score(
        y_test,
        y_pred
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
        labels=np.arange(
            len(le.classes_)
        )
    )


    print("\n------------------------------------------------------------")
    print(f"🎯 {market_key} RESULTS")
    print("------------------------------------------------------------")

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


    print("\n📋 Classification Report")
    print("-" * 60)

    print(
        classification_report(
            y_test,
            y_pred,
            target_names=le.classes_,
            zero_division=0
        )
    )


    print("🧩 Confusion Matrix")
    print("-" * 60)

    cm = confusion_matrix(
        y_test,
        y_pred,
        labels=np.arange(
            len(le.classes_)
        )
    )

    print(cm)


    # --------------------------------------------------------
    # SAVE MODEL
    # --------------------------------------------------------

    model_file = os.path.join(
        MODEL_DIR,
        f"market_{market_key.lower()}_model.json"
    )

    print(
        f"\n💾 Saving model: {model_file}"
    )

    model.save_model(
        model_file
    )


    # --------------------------------------------------------
    # RELOAD VERIFICATION
    # --------------------------------------------------------

    print(
        "🔄 Reloading saved model "
        "for integrity verification..."
    )

    reload_model = xgb.XGBClassifier()

    reload_model.load_model(
        model_file
    )

    reload_prob = reload_model.predict_proba(
        X_test.iloc[:10]
    )

    validate_probability_matrix(
        reload_prob,
        min(10, len(X_test))
    )

    print(
        "   ✅ Saved model reload verified."
    )


    # --------------------------------------------------------
    # RECORD RESULTS
    # --------------------------------------------------------

    results["markets"][market_key] = {
        "target": target_col,
        "classes": mapping,
        "model_file": model_file,
        "mapping_file": map_file,

        "metrics": {
            "accuracy": float(accuracy),
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

        "train_rows": len(train_df),
        "test_rows": len(test_df)
    }


# ============================================================
# 13. SAVE PIPELINE RESULTS
# ============================================================

results_file = os.path.join(
    MODEL_DIR,
    "pipeline_49_extended_market_results.json"
)

print("\n" + "=" * 60)
print("📦 SAVING PIPELINE 49 RESULTS")
print("=" * 60)

save_json(
    results_file,
    results
)

print(
    f"💾 Results saved: {results_file}"
)


# ============================================================
# 14. FINAL ARTIFACT CHECK
# ============================================================

print("\n🔐 FINAL ARTIFACT CHECK")
print("-" * 60)

for market_key in MARKETS:

    model_file = os.path.join(
        MODEL_DIR,
        f"market_{market_key.lower()}_model.json"
    )

    map_file = os.path.join(
        MODEL_DIR,
        f"market_{market_key.lower()}_label_mapping.json"
    )

    validate_file(
        model_file,
        f"{market_key} model"
    )

    validate_file(
        map_file,
        f"{market_key} mapping"
    )


validate_file(
    results_file,
    "Pipeline 49 results"
)


# ============================================================
# 15. PIPELINE 41 PROTECTION CHECK
# ============================================================

print("\n🔒 PIPELINE 41 PROTECTION CHECK")

if not os.path.isfile(CHAMPION_MODEL):
    fail(
        "CRITICAL: Pipeline 41 champion disappeared!"
    )

if os.path.getsize(CHAMPION_MODEL) <= 0:
    fail(
        "CRITICAL: Pipeline 41 champion is empty!"
    )

print(
    "   ✅ Pipeline 41 champion still exists."
)

print(
    "   🔒 No Pipeline 41 model was overwritten."
)


# ============================================================
# COMPLETE
# ============================================================

print("\n" + "=" * 60)
print("✅ PIPELINE 49 COMPLETE")
print("=" * 60)

print(
    "📈 Extended markets trained:"
)

for market_key in MARKETS:
    print(
        f"   ✅ {market_key}"
    )

print(
    "\n🔒 Pipeline 41 1X2 champion preserved."
)

print(
    "🚀 Ready for unified ML API integration."
)

print("=" * 60)