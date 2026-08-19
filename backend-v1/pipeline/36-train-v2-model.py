import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# ============================================================
# ZOKASCORE V2 — STEP 36
# V2 MODEL TRAINING (RANDOM FOREST)
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v2.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")

MODEL_FILE = os.path.join(OUTPUT_DIR, "random_forest_v2.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "v2_model_report.json")

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80

# Baselines from previous steps
BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts",
    "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
]

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 36: V2 MODEL TRAINING (RF)")
    print("=" * 60)
    print()

    print("[1/7] Checking Step 35 feature dataset...")
    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(f"Feature dataset not found:\n{FEATURES_FILE}")

    print("\n[2/7] Loading features...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(f"POPULATION MISMATCH: expected {EXPECTED_ROWS:,}, got {len(df):,}.")
    print(f"   ↳ Rows loaded: {len(df):,}")

    print("\n[3/7] Validating feature dataset...")
    missing = [c for c in FEATURE_COLUMNS + ["match_id", "date", "target"] if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns: {missing}")

    if df["match_id"].isna().any() or df["match_id"].duplicated().any():
        raise RuntimeError("Match IDs are missing or duplicated.")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any():
        raise RuntimeError("Invalid dates found.")

    for col in FEATURE_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            raise RuntimeError(f"{col} contains invalid/missing values.")
    print("   ✅ Structural integrity verified.")

    print("\n[4/7] Preparing deterministic chronological split...")
    df = df.sort_values(by=["date", "match_id"], kind="mergesort").reset_index(drop=True)

    split_idx = int(len(df) * TRAIN_RATIO)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(f"   ↳ Training: {len(train_df):,} matches (Through {train_end_date.date()})")
    print(f"   ↳ Testing:  {len(test_df):,} matches (From {test_start_date.date()})")

    print("\n[5/7] Training Random Forest Classifier...")
    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target"]
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target"]

    model = RandomForestClassifier(
        n_estimators=100,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train, y_train)
    print("   ✅ Model trained.")

    print("\n[6/7] Evaluating unseen chronological test data...")
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    diff_baseline = (accuracy * 100) - BASELINE_ACCURACY
    diff_elo = (accuracy * 100) - ELO_ONLY_ACCURACY

    report = classification_report(y_test, y_pred, labels=LABELS, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y_test, y_pred, labels=LABELS)
    importances = model.feature_importances_

    print("\n[7/7] Saving V2 model and audit report...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)

    temp_model = MODEL_FILE + ".tmp"
    joblib.dump(model, temp_model)
    os.replace(temp_model, MODEL_FILE)

    model_report = {
        "pipeline_step": "36",
        "status": "PASS",
        "source": "data/ml/features_v2.csv",
        "population": {
            "total_rows": EXPECTED_ROWS,
            "training_rows": len(train_df),
            "testing_rows": len(test_df),
            "train_ratio": TRAIN_RATIO
        },
        "date_range": {
            "training_through": train_end_date.strftime("%Y-%m-%d"),
            "testing_from": test_start_date.strftime("%Y-%m-%d")
        },
        "features": FEATURE_COLUMNS,
        "target": "target",
        "target_classes": LABELS,
        "model": {
            "type": "RandomForestClassifier",
            "n_estimators": 100,
            "class_weight": "balanced",
            "random_state": 42
        },
        "evaluation": {
            "accuracy": accuracy,
            "accuracy_percent": accuracy * 100,
            "baseline_accuracy_percent": BASELINE_ACCURACY,
            "elo_only_accuracy_percent": ELO_ONLY_ACCURACY,
            "difference_vs_baseline_pp": diff_baseline,
            "difference_vs_elo_only_pp": diff_elo,
            "classification_report": report,
            "confusion_matrix": matrix.tolist(),
            "feature_importances": dict(zip(FEATURE_COLUMNS, importances.tolist()))
        },
        "leakage_control": {
            "chronological_split": True,
            "same_day_order": "date + match_id"
        },
        "output": MODEL_FILE
    }

    temp_report = REPORT_FILE + ".tmp"
    with open(temp_report, "w", encoding="utf-8") as f:
        json.dump(model_report, f, indent=2)
    os.replace(temp_report, REPORT_FILE)

    # Console Output
    print()
    print("=" * 60)
    print(" STEP 36 COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 Model accuracy:      {accuracy * 100:.2f}%")
    print(f"📊 Original baseline:   {BASELINE_ACCURACY:.2f}%")
    print(f"📊 ELO-only (Step 34):  {ELO_ONLY_ACCURACY:.2f}%")
    
    if diff_elo > 0:
        print(f"🚀 vs ELO-only:         +{diff_elo:.2f} pp")
    else:
        print(f"📉 vs ELO-only:         {diff_elo:.2f} pp")

    print()
    print("📋 Classification Report")
    print("-" * 60)
    print(classification_report(y_test, y_pred, labels=LABELS, zero_division=0))

    print("🧠 Feature Importances")
    print("-" * 60)
    importance_rows = sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)
    for feature, importance in importance_rows:
        print(f"   {feature:<20} {importance * 100:>7.2f}%")

    print()
    print(f"📁 Model:               {MODEL_FILE}")
    print(f"📁 Report:              {REPORT_FILE}")
    print()
    print("🔒 Step 35 feature dataset was NOT modified.")
    print("🔒 No future matches were used for training.")
    print("🔒 Exact population preserved: 484,354.")
    print("=" * 60)

if __name__ == "__main__":
    run()