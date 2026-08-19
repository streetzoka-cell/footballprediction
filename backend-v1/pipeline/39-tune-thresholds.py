import os
import json
import joblib
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
# ZOKASCORE V2 — STEP 39
# DRAW THRESHOLD TUNING
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v2.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")

MODEL_FILE = os.path.join(OUTPUT_DIR, "xgboost_tuned_threshold_v1.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "xgboost_tuned_threshold_report.json")

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.70
VAL_RATIO = 0.80  # 70% train, 10% val, 20% test

# Baselines from previous steps
BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23
XGB_NATURAL_ACCURACY = 51.50

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts",
    "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
]

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

def threshold_predict(probs, threshold):
    """
    Custom prediction logic:
    If DRAW probability exceeds threshold, predict DRAW.
    Otherwise, predict argmax between HOME_WIN and AWAY_WIN.
    """
    preds = []
    for p in probs:
        p_away, p_draw, p_home = p  # LabelEncoder sorts alphabetically: AWAY, DRAW, HOME
        if p_draw >= threshold:
            preds.append("DRAW")
        elif p_home >= p_away:
            preds.append("HOME_WIN")
        else:
            preds.append("AWAY_WIN")
    return preds

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 39: DRAW THRESHOLD TUNING")
    print("=" * 60)
    print()

    print("[1/9] Checking Step 35 feature dataset...")
    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(f"Feature dataset not found:\n{FEATURES_FILE}")

    print("\n[2/9] Loading features...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(f"POPULATION MISMATCH: expected {EXPECTED_ROWS:,}, got {len(df):,}.")
    print(f"   ↳ Rows loaded: {len(df):,}")

    print("\n[3/9] Validating feature dataset...")
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

    print("\n[4/9] Preparing deterministic chronological split (70/10/20)...")
    df = df.sort_values(by=["date", "match_id"], kind="mergesort").reset_index(drop=True)

    train_end = int(len(df) * TRAIN_RATIO)
    val_end = int(len(df) * VAL_RATIO)

    train_df = df.iloc[:train_end].copy()
    val_df = df.iloc[train_end:val_end].copy()
    test_df = df.iloc[val_end:].copy()

    print(f"   ↳ Training:   {len(train_df):,} matches (Through {train_df.iloc[-1]['date'].date()})")
    print(f"   ↳ Validation: {len(val_df):,} matches (From {val_df.iloc[0]['date'].date()})")
    print(f"   ↳ Final test: {len(test_df):,} matches (From {test_df.iloc[0]['date'].date()})")

    X_train, y_train_raw = train_df[FEATURE_COLUMNS].astype(float), train_df["target"].astype(str)
    X_val, y_val_raw = val_df[FEATURE_COLUMNS].astype(float), val_df["target"].astype(str)
    X_test, y_test_raw = test_df[FEATURE_COLUMNS].astype(float), test_df["target"].astype(str)

    print("\n[5/9] Encoding targets (fit on train only)...")
    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_val = le.transform(y_val_raw)
    y_test = le.transform(y_test_raw)

    print("\n[6/9] Training balanced XGBoost on 70% train set...")
    train_weights = compute_sample_weight(class_weight="balanced", y=y_train)
    
    threshold_model = xgb.XGBClassifier(
        objective="multi:softprob", num_class=3, n_estimators=300,
        learning_rate=0.05, max_depth=6, min_child_weight=3,
        subsample=0.85, colsample_bytree=0.85, random_state=42,
        n_jobs=-1, eval_metric="mlogloss", tree_method="hist"
    )
    threshold_model.fit(X_train, y_train, sample_weight=train_weights)
    print("   ✅ Threshold model trained.")

    print("\n[7/9] Searching DRAW thresholds on validation set (0.200 to 0.450)...")
    val_probs = threshold_model.predict_proba(X_val)
    y_val_str = le.inverse_transform(y_val)

    best_threshold = 0
    best_macro_f1 = -1
    best_acc = 0
    best_bal_acc = 0
    best_draw_recall = 0

    for t in np.arange(0.20, 0.451, 0.005):
        preds = threshold_predict(val_probs, t)
        macro_f1 = f1_score(y_val_str, preds, average="macro")
        acc = accuracy_score(y_val_str, preds)
        
        if macro_f1 > best_macro_f1 or (abs(macro_f1 - best_macro_f1) < 1e-9 and acc > best_acc):
            best_macro_f1 = macro_f1
            best_acc = acc
            best_bal_acc = balanced_accuracy_score(y_val_str, preds)
            cm_val = confusion_matrix(y_val_str, preds, labels=LABELS)
            best_draw_recall = cm_val[1, 1] / cm_val[1].sum() if cm_val[1].sum() > 0 else 0
            best_threshold = t

    print(f"   🏆 Best Validation Threshold: {best_threshold:.3f}")
    print(f"      Val Accuracy:      {best_acc * 100:.2f}%")
    print(f"      Val Macro F1:      {best_macro_f1 * 100:.2f}%")
    print(f"      Val DRAW Recall:   {best_draw_recall * 100:.2f}%")

    print("\n[8/9] Retraining final model on full 80% (Train + Val)...")
    X_full_train = pd.concat([X_train, X_val])
    y_full_train = np.concatenate([y_train, y_val])
    full_weights = compute_sample_weight(class_weight="balanced", y=y_full_train)

    final_model = xgb.XGBClassifier(
        objective="multi:softprob", num_class=3, n_estimators=300,
        learning_rate=0.05, max_depth=6, min_child_weight=3,
        subsample=0.85, colsample_bytree=0.85, random_state=42,
        n_jobs=-1, eval_metric="mlogloss", tree_method="hist"
    )
    final_model.fit(X_full_train, y_full_train, sample_weight=full_weights)
    print("   ✅ Final model trained.")

    print("\n[9/9] Evaluating LOCKED threshold on final 20% test set...")
    test_probs = final_model.predict_proba(X_test)
    y_test_str = le.inverse_transform(y_test)

    y_pred_argmax = le.inverse_transform(np.argmax(test_probs, axis=1))
    y_pred_threshold = threshold_predict(test_probs, best_threshold)

    argmax_acc = accuracy_score(y_test_str, y_pred_argmax)
    thresh_acc = accuracy_score(y_test_str, y_pred_threshold)
    thresh_bal_acc = balanced_accuracy_score(y_test_str, y_pred_threshold)
    thresh_macro_f1 = f1_score(y_test_str, y_pred_threshold, average="macro")
    thresh_log_loss = log_loss(y_test, test_probs, labels=np.arange(len(le.classes_)))

    cm = confusion_matrix(y_test_str, y_pred_threshold, labels=LABELS)
    report = classification_report(y_test_str, y_pred_threshold, labels=LABELS, output_dict=True, zero_division=0)
    final_draw_recall = report["DRAW"]["recall"]
    importances = final_model.feature_importances_

    # Save Model & Report
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)

    temp_model = MODEL_FILE + ".tmp"
    joblib.dump(final_model, temp_model)
    os.replace(temp_model, MODEL_FILE)

    model_report = {
        "pipeline_step": "39",
        "status": "PASS",
        "source": "data/ml/features_v2.csv",
        "population": {
            "total_rows": EXPECTED_ROWS,
            "training_rows": len(train_df) + len(val_df),
            "testing_rows": len(test_df),
            "train_ratio": VAL_RATIO
        },
        "date_range": {
            "training_through": val_df.iloc[-1]["date"].strftime("%Y-%m-%d"),
            "testing_from": test_df.iloc[0]["date"].strftime("%Y-%m-%d")
        },
        "features": FEATURE_COLUMNS,
        "target": "target",
        "target_classes": LABELS,
        "model": {
            "type": "XGBoostClassifier (Tuned DRAW Threshold)",
            "n_estimators": 300,
            "max_depth": 6,
            "learning_rate": 0.05,
            "objective": "multi:softprob",
            "sample_weight": "balanced (calculated from 80% train set only)"
        },
        "threshold_tuning": {
            "search_range": [0.20, 0.45],
            "locked_threshold": float(best_threshold),
            "validation_accuracy": best_acc,
            "validation_macro_f1": best_macro_f1
        },
        "evaluation": {
            "accuracy": thresh_acc,
            "accuracy_percent": thresh_acc * 100,
            "argmax_accuracy_percent": argmax_acc * 100,
            "balanced_accuracy": thresh_bal_acc,
            "macro_f1": thresh_macro_f1,
            "log_loss": thresh_log_loss,
            "draw_recall": final_draw_recall,
            "baseline_accuracy_percent": BASELINE_ACCURACY,
            "elo_only_accuracy_percent": ELO_ONLY_ACCURACY,
            "xgb_natural_accuracy_percent": XGB_NATURAL_ACCURACY,
            "classification_report": report,
            "confusion_matrix": cm.tolist(),
            "feature_importances": dict(zip(FEATURE_COLUMNS, importances.tolist()))
        },
        "leakage_control": {
            "chronological_split": True,
            "same_day_order": "date + match_id",
            "target_mapping_applied_after_split": True,
            "threshold_locked_on_validation_set": True
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
    print(" STEP 39 COMPLETE: PASS")
    print("=" * 60)
    print(f"🎯 Locked DRAW Threshold: {best_threshold:.3f}\n")
    print(f"📌 Standard Argmax Accuracy: {argmax_acc * 100:.2f}%")
    print(f"🚀 Threshold Accuracy:       {thresh_acc * 100:.2f}%")
    print(f"⚖️ Balanced Accuracy:        {thresh_bal_acc * 100:.2f}%")
    print(f"🧠 Macro F1:                 {thresh_macro_f1 * 100:.2f}%")
    print(f"📉 Log Loss:                 {thresh_log_loss:.4f}")
    print(f"🎯 DRAW Recall:              {final_draw_recall * 100:.2f}%")

    print()
    print("📊 Reference Models")
    print("-" * 60)
    print(f"   Original baseline:     {BASELINE_ACCURACY:.2f}%")
    print(f"   ELO-only:              {ELO_ONLY_ACCURACY:.2f}%")
    print(f"   XGBoost (Natural):    {XGB_NATURAL_ACCURACY:.2f}% (DRAW Recall: 0.91%)")

    print()
    print("📋 FINAL TEST CLASSIFICATION REPORT")
    print("-" * 60)
    print(classification_report(y_test_str, y_pred_threshold, labels=LABELS, zero_division=0))

    print("🧩 FINAL TEST CONFUSION MATRIX")
    print("-" * 60)
    print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
    for i, label in enumerate(LABELS):
        print(f"{label:>12}{cm[i, 0]:>12,}{cm[i, 1]:>12,}{cm[i, 2]:>12,}")

    print()
    print(f"📁 Model:               {MODEL_FILE}")
    print(f"📁 Report:              {REPORT_FILE}")
    print()
    print("🔒 Step 35 feature dataset was NOT modified.")
    print("🔒 Target mapping applied AFTER chronological split.")
    print("🔒 Threshold locked strictly on validation set.")
    print("🔒 Exact population preserved: 484,354.")
    print("=" * 60)

if __name__ == "__main__":
    run()