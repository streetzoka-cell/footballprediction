import os
import json
import numpy as np
import pandas as pd
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
# ZOKASCORE V2 — PIPELINE 47
# MARKET MODEL TRAINING (Hardened)
# ============================================================

FEATURES_FILE = os.path.join("data", "ml", "features_v4_unified.csv")
MODEL_DIR = os.path.join("data", "ml")

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_points", "away_ewma_points",
    "home_ewma_gd", "away_ewma_gd",
    "home_ewma_gf", "away_ewma_gf",
    "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_points", "away_ewma_away_points",
    "home_ewma_home_gd", "away_ewma_away_gd",
    "home_ewma_home_gf", "away_ewma_away_gf",
    "home_ewma_home_ga", "away_ewma_away_ga",
    "home_matches_before", "away_matches_before",
    "home_home_matches_before", "away_away_matches_before"
]

RANDOM_STATE = 42
TRAIN_RATIO = 0.80
EXPECTED_ROWS = 118154

MARKETS = {
    "OU_2_5": {
        "target": "ou_2_5",
        "labels": ["OVER", "UNDER"],
        "model_file": "market_ou_2_5_model.json",
        "mapping_file": "market_ou_2_5_label_mapping.json"
    },
    "BTTS": {
        "target": "btts",
        "labels": ["YES", "NO"],
        "model_file": "market_btts_model.json",
        "mapping_file": "market_btts_label_mapping.json"
    }
}

RESULTS_FILE = os.path.join(MODEL_DIR, "pipeline_47_market_results.json")

os.makedirs(MODEL_DIR, exist_ok=True)

print("🧠 ZOKASCORE V2 - Pipeline 47: Hardened Market Model Training")
print("=" * 60)
print()

# 1. SAFETY CHECKS
print("🔍 Checking input files...")
if not os.path.exists(FEATURES_FILE):
    raise FileNotFoundError(f"Unified feature dataset not found:\n{FEATURES_FILE}\nRun Pipeline 46 first.")
print(f"   ✅ Unified features: {FEATURES_FILE}")

print("\n🛡️ Checking Pipeline 41 champion is present...")
pipeline41_model = os.path.join(MODEL_DIR, "zokascore_v2_model.json")
if os.path.exists(pipeline41_model):
    print(f"   🔒 Pipeline 41 champion found and protected: {pipeline41_model}")
else:
    print("   ⚠️ Pipeline 41 model not found. Market training will continue, but verify deployment artifacts later.")

# 2. LOAD DATA
print(f"\n📊 Loading unified dataset...")
df = pd.read_csv(FEATURES_FILE, low_memory=False)
print(f"   ✅ Loaded {len(df):,} matches.")

# 3. DATASET SIZE CHECK
print("\n🔐 Validating dataset size...")
if len(df) != EXPECTED_ROWS:
    print(f"   ⚠️ Expected {EXPECTED_ROWS:,} rows, found {len(df):,}.")
else:
    print(f"   ✅ Expected row count confirmed: {len(df):,}")

# 4. REQUIRED COLUMN VALIDATION
print("\n🔐 Validating required columns...")
required_columns = ["match_id", "date", "target", "home_goals", "away_goals", "total_goals", "ou_2_5", "btts"] + FEATURE_COLUMNS
missing_columns = [col for col in required_columns if col not in df.columns]
if missing_columns:
    raise ValueError("Missing required columns:\n" + "\n".join(f"   - {col}" for col in missing_columns))
print(f"   ✅ Required columns present: {len(required_columns)}/{len(required_columns)}")

# 5. DATE VALIDATION
print("\n📅 Validating dates...")
df["date"] = pd.to_datetime(df["date"], errors="coerce")
invalid_dates = int(df["date"].isna().sum())
if invalid_dates:
    raise ValueError(f"Found {invalid_dates:,} rows with invalid dates.")
df = df.sort_values("date", kind="stable").reset_index(drop=True)
print(f"   ✅ Date range: {df['date'].min().date()} → {df['date'].max().date()}")

# 6. MATCH ID INTEGRITY
print("\n🆔 Validating match IDs...")
duplicate_ids = int(df["match_id"].duplicated().sum())
if duplicate_ids:
    raise ValueError(f"Found {duplicate_ids:,} duplicate match IDs.")
print(f"   ✅ Match IDs unique: {len(df):,}")

# 7. 1X2 TARGET PROTECTION
print("\n🎯 Validating existing Pipeline 41 1X2 target...")
expected_1x2 = {"HOME_WIN", "DRAW", "AWAY_WIN"}
actual_1x2 = set(df["target"].dropna().astype(str).unique())
if actual_1x2 != expected_1x2:
    raise ValueError(f"Unexpected 1X2 target classes.\nExpected: {sorted(expected_1x2)}\nFound:    {sorted(actual_1x2)}")
print("   🔒 Existing 1X2 target preserved.")
for label in ["HOME_WIN", "DRAW", "AWAY_WIN"]:
    count = int((df["target"] == label).sum())
    pct = count / len(df) * 100
    print(f"   {label:<10}{count:>10,} ({pct:>6.2f}%)")

# 8. NUMERIC FEATURE VALIDATION
print("\n🔢 Validating ML features...")
for feature in FEATURE_COLUMNS:
    converted = pd.to_numeric(df[feature], errors="coerce")
    invalid = int(converted.isna().sum())
    if invalid:
        raise ValueError(f"Feature '{feature}' contains {invalid:,} invalid/null values.")
    if not np.isfinite(converted.to_numpy()).all():
        raise ValueError(f"Feature '{feature}' contains non-finite values.")
print(f"   ✅ All {len(FEATURE_COLUMNS)} features are numeric and finite.")

# 9. GOAL VALIDATION
print("\n⚽ Validating historical goal data...")
for column in ["home_goals", "away_goals", "total_goals"]:
    values = pd.to_numeric(df[column], errors="coerce")
    if values.isna().any():
        raise ValueError(f"{column} contains null/invalid values.")
    if (values < 0).any():
        raise ValueError(f"{column} contains negative values.")
print("   ✅ Goal data valid.")

# 10. TARGET LOGIC CROSS-CHECK
print("\n🧪 Cross-checking market target logic...")
expected_ou = np.where(df["total_goals"] > 2.5, "OVER", "UNDER")
ou_mismatches = int((df["ou_2_5"].astype(str) != expected_ou).sum())
if ou_mismatches:
    raise ValueError(f"O/U 2.5 target mismatch count: {ou_mismatches:,}")

expected_btts = np.where((df["home_goals"] > 0) & (df["away_goals"] > 0), "YES", "NO")
btts_mismatches = int((df["btts"].astype(str) != expected_btts).sum())
if btts_mismatches:
    raise ValueError(f"BTTS target mismatch count: {btts_mismatches:,}")
print("   ✅ O/U 2.5 logic verified.")
print("   ✅ BTTS logic verified.")

# 11. CHRONOLOGICAL SANITY CHECK
print("\n⏱️ Checking chronological ordering...")
if not df["date"].is_monotonic_increasing:
    raise ValueError("Dataset is not chronologically sorted.")
print("   ✅ Chronological ordering confirmed.")


# 12. TRAINING FUNCTION
def train_market(df, market_key, config):
    target_column = config["target"]
    labels = config["labels"]
    model_file = os.path.join(MODEL_DIR, config["model_file"])
    mapping_file = os.path.join(MODEL_DIR, config["mapping_file"])

    print("\n" + "=" * 60)
    print(f"📈 TRAINING MARKET MODEL: {market_key}")
    print("=" * 60)

    target_values = df[target_column].astype(str)
    unique_values = set(target_values.unique())
    expected_values = set(labels)

    if unique_values != expected_values:
        raise ValueError(f"{market_key} target classes invalid.\nExpected: {sorted(expected_values)}\nFound:    {sorted(unique_values)}")

    print("\n🎯 Target distribution:")
    for label in labels:
        count = int((target_values == label).sum())
        pct = count / len(df) * 100
        print(f"   {label:<8}{count:>10,} ({pct:>6.2f}%)")

    X = df[FEATURE_COLUMNS].astype(float)
    
    le = LabelEncoder()
    y_encoded = le.fit_transform(target_values)

    if set(le.classes_) != expected_values:
        raise ValueError(f"LabelEncoder classes do not match expected classes for {market_key}.")

    label_mapping = {str(i): label for i, label in enumerate(le.classes_)}
    
    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(label_mapping, f, indent=2)
    print(f"\n💾 Label mapping saved: {mapping_file}")
    print(f"   Mapping: {label_mapping}")

    split_idx = int(len(df) * TRAIN_RATIO)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y_encoded[:split_idx], y_encoded[split_idx:]
    train_dates = df["date"].iloc[:split_idx]
    test_dates = df["date"].iloc[split_idx:]

    print("\n📅 Chronological split")
    print(f"   🏋️ Training: {len(X_train):,}")
    print(f"   🧪 Testing:  {len(X_test):,}")
    print(f"   Training dates: {train_dates.min().date()} → {train_dates.max().date()}")
    print(f"   Testing dates:  {test_dates.min().date()} → {test_dates.max().date()}")

    # FIX: Changed >= to > because multiple matches can occur on the exact same boundary day
    if train_dates.max() > test_dates.min():
        raise ValueError("Chronological leakage detected: training period strictly overlaps test period.")

    sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)

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

    model.fit(X_train, y_train, sample_weight=sample_weights)

    print("\n📈 Evaluating on unseen chronological test data...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    y_test_str = le.inverse_transform(y_test)
    y_pred_str = le.inverse_transform(y_pred)

    accuracy = accuracy_score(y_test_str, y_pred_str)
    balanced_accuracy = balanced_accuracy_score(y_test_str, y_pred_str)
    macro_f1 = f1_score(y_test_str, y_pred_str, average="macro")
    weighted_f1 = f1_score(y_test_str, y_pred_str, average="weighted")
    logloss = log_loss(y_test, y_prob, labels=np.arange(len(le.classes_)))

    report = classification_report(y_test_str, y_pred_str, labels=labels, zero_division=0, output_dict=True)
    cm = confusion_matrix(y_test_str, y_pred_str, labels=labels)

    print("\n" + "-" * 60)
    print(f"🎯 {market_key} RESULTS")
    print("-" * 60)
    print(f"Accuracy:              {accuracy * 100:.2f}%")
    print(f"Balanced Accuracy:     {balanced_accuracy * 100:.2f}%")
    print(f"Macro F1:              {macro_f1 * 100:.2f}%")
    print(f"Weighted F1:           {weighted_f1 * 100:.2f}%")
    print(f"Log Loss:              {logloss:.4f}")

    print("\n📋 Classification Report")
    print("-" * 60)
    print(classification_report(y_test_str, y_pred_str, labels=labels, zero_division=0))

    print("🧩 Confusion Matrix")
    print("-" * 60)
    header = "".join(f"{label:>14}" for label in labels)
    print(f"{'':>14}{header}")
    for i, label in enumerate(labels):
        row = "".join(f"{cm[i, j]:>14,}" for j in range(len(labels)))
        print(f"{label:>14}{row}")

    model.save_model(model_file)
    print(f"\n💾 Model saved: {model_file}")

    if not os.path.exists(model_file):
        raise RuntimeError(f"Model file was not created: {model_file}")

    print("🔄 Reloading saved model for integrity verification...")
    verification_model = xgb.XGBClassifier()
    verification_model.load_model(model_file)
    verification_prob = verification_model.predict_proba(X_test)
    if verification_prob.shape != y_prob.shape:
        raise RuntimeError("Reloaded model probability shape mismatch.")
    print("   ✅ Saved model reload verified.")

    result = {
        "market": market_key,
        "target_column": target_column,
        "labels": list(le.classes_),
        "feature_count": len(FEATURE_COLUMNS),
        "dataset_rows": int(len(df)),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "metrics": {
            "accuracy": float(accuracy),
            "balanced_accuracy": float(balanced_accuracy),
            "macro_f1": float(macro_f1),
            "weighted_f1": float(weighted_f1),
            "log_loss": float(logloss)
        },
        "model_file": model_file,
        "label_mapping_file": mapping_file
    }
    return result

# 13. TRAIN ALL CURRENT MARKET MODELS
all_results = {}
for market_key, config in MARKETS.items():
    all_results[market_key] = train_market(df, market_key, config)

# 14. SAVE MASTER RESULTS
print("\n" + "=" * 60)
print("📦 SAVING PIPELINE 47 RESULTS")
print("=" * 60)

pipeline_results = {
    "pipeline": "47",
    "name": "Market Model Training",
    "status": "COMPLETE",
    "markets": all_results
}

with open(RESULTS_FILE, "w", encoding="utf-8") as f:
    json.dump(pipeline_results, f, indent=2)
print(f"💾 Results saved: {RESULTS_FILE}")

# 15. FINAL ARTIFACT CHECK
print("\n🔐 FINAL ARTIFACT CHECK")
print("-" * 60)
artifacts = [
    os.path.join(MODEL_DIR, "market_ou_2_5_model.json"),
    os.path.join(MODEL_DIR, "market_ou_2_5_label_mapping.json"),
    os.path.join(MODEL_DIR, "market_btts_model.json"),
    os.path.join(MODEL_DIR, "market_btts_label_mapping.json"),
    RESULTS_FILE
]

for artifact in artifacts:
    if os.path.exists(artifact):
        size_kb = os.path.getsize(artifact) / 1024
        print(f"   ✅ {artifact} ({size_kb:.1f} KB)")
    else:
        raise RuntimeError(f"Required artifact missing: {artifact}")

# 16. PROTECT PIPELINE 41
print("\n🔒 PIPELINE 41 PROTECTION CHECK")
if os.path.exists(pipeline41_model):
    print("   ✅ Pipeline 41 champion still exists.")
    print("   🔒 No Pipeline 41 model was overwritten.")
else:
    print("   ⚠️ Pipeline 41 champion artifact not found.")

print("\n" + "=" * 60)
print("✅ PIPELINE 47 COMPLETE")
print("=" * 60)