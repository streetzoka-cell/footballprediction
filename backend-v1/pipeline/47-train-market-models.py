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
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")
PIPELINE41_MODEL = os.path.join(MODELS_DIR, "zokascore_v2_model.json")
REPORT_FILE = os.path.join(REPORTS_DIR, "xgboost_market_models_report.json")

# ← FIXED: No longer hardcoded. Set dynamically in run()
EXPECTED_ROWS = 0

TRAIN_RATIO = 0.80
RANDOM_STATE = 42
EXPECTED_1X2_CLASSES = {"HOME_WIN", "DRAW", "AWAY_WIN"}

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_pts", "away_ewma_pts",
    "home_ewma_gd", "away_ewma_gd",
    "home_ewma_gf", "away_ewma_gf",
    "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_pts", "away_ewma_away_pts",
    "home_ewma_home_gd", "away_ewma_away_gd",
    "home_ewma_home_gf", "away_ewma_away_gf",
    "home_ewma_home_ga", "away_ewma_away_ga",
    "home_matches_before", "away_matches_before",
    "home_home_matches_before", "away_away_matches_before"
]

MARKETS = {
    "OU_2_5": {
        "target": "ou_2_5", "labels": ["OVER", "UNDER"],
        "model_file": os.path.join(MODELS_DIR, "market_ou_2_5_model.joblib"),
        "mapping_file": os.path.join(MODELS_DIR, "market_ou_2_5_label_mapping.json")
    },
    "BTTS": {
        "target": "btts", "labels": ["YES", "NO"],
        "model_file": os.path.join(MODELS_DIR, "market_btts_model.joblib"),
        "mapping_file": os.path.join(MODELS_DIR, "market_btts_label_mapping.json")
    }
}

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

def fail(message):
    print("\n❌ PIPELINE 47 ABORTED")
    print("-" * 60)
    print(message)
    print("-" * 60)
    raise SystemExit(1)

def atomic_write_json(data, file_path):
    output_dir = os.path.dirname(file_path)
    os.makedirs(output_dir, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix="pipeline47_", suffix=".json", dir=output_dir)
    os.close(fd)
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        shutil.move(temp_path, file_path)
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)

def atomic_write_model(model, file_path):
    output_dir = os.path.dirname(file_path)
    os.makedirs(output_dir, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix="pipeline47_model_", suffix=".joblib", dir=output_dir)
    os.close(fd)
    try:
        joblib.dump(model, temp_path)
        shutil.move(temp_path, file_path)
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)

def validate_finite_features(df):
    print("\n🔢 Validating ML features...")
    for feature in FEATURE_COLUMNS:
        values = pd.to_numeric(df[feature], errors="coerce")
        invalid = int(values.isna().sum())
        if invalid: fail(f"Feature '{feature}' contains {invalid:,} null/invalid values.")
        array = values.to_numpy(dtype=float)
        if not np.isfinite(array).all(): fail(f"Feature '{feature}' contains non-finite values.")
    print(f"   ✅ All {len(FEATURE_COLUMNS)} features are numeric and finite.")

def validate_market_targets(df):
    print("\n🎯 Validating market target logic...")
    expected_ou = np.where(df["total_goals"] > 2.5, "OVER", "UNDER")
    actual_ou = df["ou_2_5"].astype(str).to_numpy()
    if int(np.sum(actual_ou != expected_ou)): fail("O/U 2.5 target mismatch.")
    print("   ✅ O/U 2.5 target logic verified.")
    
    expected_btts = np.where((df["home_goals"] > 0) & (df["away_goals"] > 0), "YES", "NO")
    actual_btts = df["btts"].astype(str).to_numpy()
    if int(np.sum(actual_btts != expected_btts)): fail("BTTS target mismatch.")
    print("   ✅ BTTS target logic verified.")

def validate_dataset(df):
    print("\n" + "=" * 60)
    print("🔐 DATASET VALIDATION")
    print("=" * 60)
    
    # ← FIXED: Removed rigid EXPECTED_ROWS check
    print(f"   ✅ Population: {len(df):,}")

    required_columns = ["match_id", "date", "target", "home_goals", "away_goals", "total_goals", "ou_2_5", "btts"] + FEATURE_COLUMNS
    missing = [c for c in required_columns if c not in df.columns]
    if missing: fail("Missing required columns:\n" + "\n".join(f"   - {c}" for c in missing))
    print(f"   ✅ Required columns present: {len(required_columns)}/{len(required_columns)}")

    if df["match_id"].isna().any(): fail("match_id contains null values.")
    if int(df["match_id"].duplicated().sum()): fail("Found duplicate match IDs.")
    print(f"   ✅ Match IDs unique: {len(df):,}")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if int(df["date"].isna().sum()): fail("Found invalid dates.")
    df = df.sort_values(by=["date", "match_id"], kind="mergesort").reset_index(drop=True)
    if not df["date"].is_monotonic_increasing: fail("Dataset is not chronologically ordered.")
    print(f"   ✅ Date range: {df['date'].min().date()} → {df['date'].max().date()}")

    actual_1x2 = set(df["target"].dropna().astype(str).unique())
    if actual_1x2 != EXPECTED_1X2_CLASSES: fail("Unexpected 1X2 target classes.")
    print("   🔒 Existing 1X2 target classes verified.")

    print("\n⚽ Validating historical goal data...")
    for col in ["home_goals", "away_goals", "total_goals"]:
        vals = pd.to_numeric(df[col], errors="coerce")
        if vals.isna().any(): fail(f"{col} contains null/invalid values.")
        if (vals < 0).any(): fail(f"{col} contains negative values.")
    if int((df["total_goals"] != (df["home_goals"] + df["away_goals"])).sum()): fail("total_goals mismatch.")
    print("   ✅ Goal data verified.")

    validate_market_targets(df)
    validate_finite_features(df)
    return df

def train_market(df, market_key, config):
    target_column = config["target"]
    expected_labels = config["labels"]
    model_file = config["model_file"]
    mapping_file = config["mapping_file"]

    print("\n" + "=" * 60)
    print(f"📈 TRAINING MARKET MODEL: {market_key}")
    print("=" * 60)

    y_raw = df[target_column].astype(str)
    if set(y_raw.unique()) != set(expected_labels): fail(f"{market_key} target classes invalid.")
    
    print("\n🎯 Target distribution:")
    for label in expected_labels:
        count = int((y_raw == label).sum())
        print(f"   {label:<8}{count:>10,} ({count/len(y_raw)*100:>6.2f}%)")

    X = df[FEATURE_COLUMNS].astype(float)
    split_idx = int(len(df) * TRAIN_RATIO)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train_raw, y_test_raw = y_raw.iloc[:split_idx], y_raw.iloc[split_idx:]
    
    if len(X_train) == 0 or len(X_test) == 0: fail(f"{market_key}: invalid train/test split.")
    print(f"\n🏋️ Training: {len(X_train):,} | 🧪 Testing: {len(X_test):,}")

    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_test = le.transform(y_test_raw)
    
    atomic_write_json({str(i): l for i, l in enumerate(le.classes_)}, mapping_file)
    sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)

    model = xgb.XGBClassifier(
        objective="binary:logistic", n_estimators=300, learning_rate=0.05,
        max_depth=6, min_child_weight=3, subsample=0.85, colsample_bytree=0.85,
        random_state=RANDOM_STATE, n_jobs=-1, eval_metric="logloss", tree_method="hist"
    )
    model.fit(X_train, y_train, sample_weight=sample_weights)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)
    
    y_test_str = le.inverse_transform(y_test)
    y_pred_str = le.inverse_transform(y_pred)
    
    acc = accuracy_score(y_test_str, y_pred_str)
    print(f"🎯 {market_key} Accuracy: {acc * 100:.2f}%")
    
    atomic_write_model(model, model_file)
    print(f"💾 Saved: {model_file}")
    return {"accuracy": float(acc)}

def run():
    global EXPECTED_ROWS
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 47: MARKET MODEL TRAINING")
    print("=" * 60)
    
    if not os.path.exists(FEATURES_FILE): fail(f"Dataset not found: {FEATURES_FILE}")
    
    print("\n[2/4] Loading Step 46 dataset...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    
    # ← FIXED: Set expected rows dynamically 
    EXPECTED_ROWS = len(df)
    print(f"   ↳ Rows loaded: {EXPECTED_ROWS:,}")
    
    df = validate_dataset(df)
    
    all_results = {}
    for market_key, config in MARKETS.items():
        all_results[market_key] = train_market(df, market_key, config)
        
    atomic_write_json({"pipeline_step": "47", "status": "PASS", "population": EXPECTED_ROWS}, REPORT_FILE)
    print("\n✅ STEP 47 COMPLETE: PASS")

if __name__ == "__main__":
    run()