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

# ============================================================
# ZOKASCORE V2 — STEP 38
# XGBOOST - NATURAL CLASS DISTRIBUTION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v2.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")

MODEL_FILE = os.path.join(OUTPUT_DIR, "xgboost_natural_v1.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "xgboost_natural_model_report.json")

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80

# Updated baselines from previous steps
BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23
RF_BALANCED_ACCURACY = 48.60
XGB_BALANCED_ACCURACY = 48.17

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts",
    "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
]

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 38: XGBOOST (NATURAL DISTRIBUTION)")
    print("=" * 60)
    print()

    print("[1/8] Checking Step 35 feature dataset...")
    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(f"Feature dataset not found:\n{FEATURES_FILE}")

    print("\n[2/8] Loading features...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(f"POPULATION MISMATCH: expected {EXPECTED_ROWS:,}, got {len(df):,}.")
    print(f"   ↳ Rows loaded: {len(df):,}")

    print("\n[3/8] Validating feature dataset...")
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
    
    invalid_targets = set(df["target"].unique()) - set(LABELS)
    if invalid_targets:
        raise RuntimeError(f"Invalid target values: {invalid_targets}")
    print("   ✅ Structural integrity verified.")

    print("\n[4/8] Preparing deterministic chronological split...")
    df = df.sort_values(by=["date", "match_id"], kind="mergesort").reset_index(drop=True)

    split_idx = int(len(df) * TRAIN_RATIO)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(f"   ↳ Training: {len(train_df):,} matches (Through {train_end_date.date()})")
    print(f"   ↳ Testing:  {len(test_df):,} matches (From {test_start_date.date()})")

    X_train = train_df[FEATURE_COLUMNS].astype(float)
    X_test = test_df[FEATURE_COLUMNS].astype(float)
    
    y_train_raw = train_df["target"].astype(str)
    y_test_raw = test_df["target"].astype(str)

    print("\n[5/8] Encoding targets (fit on train only)...")
    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_test = le.transform(y_test_raw)

    print("\n[6/8] Training XGBoost Classifier (No Class Weights)...")
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

    model.fit(X_train, y_train)
    print("   ✅ Model trained.")

    print("\n[7/8] Evaluating and saving artifacts...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    y_test_str = le.inverse_transform(y_test)
    y_pred_str = le.inverse_transform(y_pred)

    accuracy = accuracy_score(y_test_str, y_pred_str)
    balanced_accuracy = balanced_accuracy_score(y_test_str, y_pred_str)
    macro_f1 = f1_score(y_test_str, y_pred_str, average="macro")
    weighted_f1 = f1_score(y_test_str, y_pred_str, average="weighted")
    logloss = log_loss(y_test, y_prob, labels=np.arange(len(le.classes_)))

    diff_baseline = (accuracy * 100) - BASELINE_ACCURACY
    diff_elo = (accuracy * 100) - ELO_ONLY_ACCURACY
    diff_rf = (accuracy * 100) - RF_BALANCED_ACCURACY
    diff_xgb_bal = (accuracy * 100) - XGB_BALANCED_ACCURACY

    report = classification_report(y_test_str, y_pred_str, labels=LABELS, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test_str, y_pred_str, labels=LABELS)
    importances = model.feature_importances_

    # Save Model & Report
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)

    temp_model = MODEL_FILE + ".tmp"
    joblib.dump(model, temp_model)
    os.replace(temp_model, MODEL_FILE)

    model_report = {
        "pipeline_step": "38",
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
            "type": "XGBoostClassifier (Natural Distribution)",
            "n_estimators": 300,
            "max_depth": 6,
            "learning_rate": 0.05,
            "objective": "multi:softprob",
            "class_weighting": "none"
        },
        "evaluation": {
            "accuracy": accuracy,
            "accuracy_percent": accuracy * 100,
            "balanced_accuracy": balanced_accuracy,
            "macro_f1": macro_f1,
            "weighted_f1": weighted_f1,
            "log_loss": logloss,
            "baseline_accuracy_percent": BASELINE_ACCURACY,
            "elo_only_accuracy_percent": ELO_ONLY_ACCURACY,
            "rf_balanced_accuracy_percent": RF_BALANCED_ACCURACY,
            "xgb_balanced_accuracy_percent": XGB_BALANCED_ACCURACY,
            "difference_vs_baseline_pp": diff_baseline,
            "difference_vs_elo_only_pp": diff_elo,
            "difference_vs_rf_balanced_pp": diff_rf,
            "difference_vs_xgb_balanced_pp": diff_xgb_bal,
            "classification_report": report,
            "confusion_matrix": cm.tolist(),
            "feature_importances": dict(zip(FEATURE_COLUMNS, importances.tolist()))
        },
        "leakage_control": {
            "chronological_split": True,
            "same_day_order": "date + match_id",
            "target_mapping_applied_after_split": True
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
    print(" STEP 38 COMPLETE: PASS")
    print("=" * 60)
    print(f"🎯 Accuracy:              {accuracy * 100:.2f}%")
    print(f"⚖️ Balanced Accuracy:     {balanced_accuracy * 100:.2f}%")
    print(f"🧠 Macro F1:              {macro_f1 * 100:.2f}%")
    print(f"📊 Weighted F1:           {weighted_f1 * 100:.2f}%")
    print(f"📉 Log Loss:              {logloss:.4f}")
    
    print()
    print("📊 Reference Models")
    print("-" * 60)
    print(f"   Original baseline:     {BASELINE_ACCURACY:.2f}%")
    print(f"   ELO-only:              {ELO_ONLY_ACCURACY:.2f}%")
    print(f"   RF Balanced:           {RF_BALANCED_ACCURACY:.2f}%")
    print(f"   XGBoost (Balanced):    {XGB_BALANCED_ACCURACY:.2f}%")

    print()
    print(f"🚀 vs XGBoost (Balanced): {diff_xgb_bal:+.2f} pp")
    print(f"🚀 vs RF Balanced:       {diff_rf:+.2f} pp")
    print(f"🚀 vs ELO-only:          {diff_elo:+.2f} pp")
    print(f"🚀 vs Original baseline: {diff_baseline:+.2f} pp")

    print()
    print("📋 Classification Report")
    print("-" * 60)
    print(classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))

    print("🧩 Confusion Matrix")
    print("-" * 60)
    print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
    for i, label in enumerate(LABELS):
        print(f"{label:>12}{cm[i, 0]:>12,}{cm[i, 1]:>12,}{cm[i, 2]:>12,}")

    print()
    print("🧠 Feature Importances")
    print("-" * 60)
    importance_rows = sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)
    for rank, (feature, importance) in enumerate(importance_rows, start=1):
        print(f"   {rank:>2}. {feature:<20} {importance * 100:>6.2f}%")

    print()
    print(f"📁 Model:               {MODEL_FILE}")
    print(f"📁 Report:              {REPORT_FILE}")
    print()
    print("🔒 Step 35 feature dataset was NOT modified.")
    print("🔒 Target mapping applied AFTER chronological split.")
    print("🔒 Exact population preserved: 484,354.")
    print("=" * 60)

if __name__ == "__main__":
    run()