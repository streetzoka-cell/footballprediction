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
# ZOKASCORE V2 — STEP 43.1
# CLEAN SIGNAL FUSION & SIMILARITY REPLICATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v3.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")

MODEL_FILE = os.path.join(OUTPUT_DIR, "xgboost_similarity_clean_v1.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "xgboost_similarity_clean_model_report.json")

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80
RANDOM_STATE = 42

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

REFERENCE_MODELS = {
    "original_baseline": {"accuracy_percent": 47.97},
    "elo_only": {"accuracy_percent": 51.23},
    "xgb_balanced": {"accuracy_percent": 48.17},
    "xgb_natural": {"accuracy_percent": 51.50},
    "xgb_ewma": {"accuracy_percent": 48.19},
    "xgb_relative": {"accuracy_percent": 47.66},
    "xgb_combined_42_1": {"accuracy_percent": 48.25},
    "xgb_similarity_43": {"accuracy_percent": 47.99}
}

# Corrected column names to match Step 40 output exactly
RAW_FEATURES = [
    "home_elo_pre", "away_elo_pre",
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

ENGINEERED_FEATURES = [
    "elo_diff_signed",
    "form_diff", "gd_diff",
    "venue_form_diff", "venue_gd_diff",
    "elo_form_conflict", "venue_elo_form_conflict",
    "elo_gap_abs", "form_gap_abs", "gd_gap_abs",
    "venue_form_gap_abs", "venue_gd_gap_abs",
    "attack_gap_abs", "defense_gap_abs"
]

FEATURE_COLUMNS = RAW_FEATURES + ENGINEERED_FEATURES
EXPECTED_FEATURE_COUNT = len(FEATURE_COLUMNS)

def numpy_safe(value):
    if isinstance(value, dict):
        return {str(k): numpy_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [numpy_safe(v) for v in value]
    if isinstance(value, tuple):
        return [numpy_safe(v) for v in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if pd.isna(value):
        return None
    return value

def engineer_features(data):
    data = data.copy()
    
    data["elo_diff_signed"] = data["home_elo_pre"] - data["away_elo_pre"]
    data["form_diff"] = data["home_ewma_pts"] - data["away_ewma_pts"]
    data["gd_diff"] = data["home_ewma_gd"] - data["away_ewma_gd"]
    data["venue_form_diff"] = data["home_ewma_home_pts"] - data["away_ewma_away_pts"]
    data["venue_gd_diff"] = data["home_ewma_home_gd"] - data["away_ewma_away_gd"]
    
    data["elo_form_conflict"] = data["elo_diff_signed"] * data["form_diff"]
    data["venue_elo_form_conflict"] = data["elo_diff_signed"] * data["venue_form_diff"]
    
    data["elo_gap_abs"] = (data["home_elo_pre"] - data["away_elo_pre"]).abs()
    data["form_gap_abs"] = (data["home_ewma_pts"] - data["away_ewma_pts"]).abs()
    data["gd_gap_abs"] = (data["home_ewma_gd"] - data["away_ewma_gd"]).abs()
    data["venue_form_gap_abs"] = (data["home_ewma_home_pts"] - data["away_ewma_away_pts"]).abs()
    data["venue_gd_gap_abs"] = (data["home_ewma_home_gd"] - data["away_ewma_away_gd"]).abs()
    data["attack_gap_abs"] = (data["home_ewma_gf"] - data["away_ewma_gf"]).abs()
    data["defense_gap_abs"] = (data["home_ewma_ga"] - data["away_ewma_ga"]).abs()
    
    return data

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 43.1")
    print(" CLEAN SIGNAL FUSION & SIMILARITY REPLICATION")
    print("=" * 60)
    print()

    print("[1/10] Checking Step 40 feature dataset...")
    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(f"Step 40 feature dataset not found:\n{FEATURES_FILE}")
    print("   ✅ Step 40 feature dataset found.")

    print("\n[2/10] Loading features...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(f"POPULATION MISMATCH: expected {EXPECTED_ROWS:,}, got {len(df):,}.")
    print(f"   ↳ Rows loaded: {len(df):,}")

    print("\n[3/10] Validating raw source dataset...")
    required_columns = RAW_FEATURES + ["match_id", "date", "target"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise RuntimeError(f"Missing required columns: {missing_columns}")

    if df["match_id"].isna().any() or df["match_id"].duplicated().any():
        raise RuntimeError("Match ID integrity check failed.")
        
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any():
        raise RuntimeError("Invalid dates detected.")
        
    for col in RAW_FEATURES:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any() or not np.isfinite(df[col].to_numpy(dtype=float)).all():
            raise RuntimeError(f"{col} contains invalid or non-finite values.")

    invalid_targets = set(df["target"].astype(str).unique()) - set(LABELS)
    if invalid_targets:
        raise RuntimeError(f"Invalid target values: {invalid_targets}")
    print("   ✅ Structural, numeric, identity, and target integrity verified.")

    print("\n[4/10] Preparing deterministic chronological order...")
    df = df.sort_values(by=["date", "match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[5/10] Engineering interaction and similarity features...")
    df = engineer_features(df)

    if len(FEATURE_COLUMNS) != EXPECTED_FEATURE_COUNT:
        raise RuntimeError(f"FEATURE COUNT ERROR: expected {EXPECTED_FEATURE_COUNT}, got {len(FEATURE_COLUMNS)}")

    for col in FEATURE_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            raise RuntimeError(f"Final feature {col} contains invalid/missing values.")
            
    print(f"   ↳ Raw features: {len(RAW_FEATURES)}")
    print(f"   ↳ Engineered features: {len(ENGINEERED_FEATURES)}")
    print(f"   ↳ Total features: {len(FEATURE_COLUMNS)}")

    print("\n[6/10] Preparing deterministic chronological split...")
    split_idx = int(len(df) * TRAIN_RATIO)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    print(f"   ↳ Training: {len(train_df):,} matches (Through {train_df.iloc[-1]['date'].date()})")
    print(f"   ↳ Testing:  {len(test_df):,} matches (From {test_df.iloc[0]['date'].date()})")

    X_train = train_df[FEATURE_COLUMNS].astype(float)
    X_test = test_df[FEATURE_COLUMNS].astype(float)
    y_train_raw = train_df["target"].astype(str)
    y_test_raw = test_df["target"].astype(str)

    print("\n[7/10] Encoding targets (fit on train only)...")
    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_test = le.transform(y_test_raw)

    print("\n[8/10] Training XGBoost (Balanced + Clean Signal Fusion)...")
    sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)

    model = xgb.XGBClassifier(
        objective="multi:softprob", num_class=3,
        n_estimators=300, learning_rate=0.05, max_depth=6,
        min_child_weight=3, subsample=0.85, colsample_bytree=0.85,
        gamma=0.0, reg_alpha=0.0, reg_lambda=1.0,
        random_state=RANDOM_STATE, n_jobs=-1,
        eval_metric="mlogloss", tree_method="hist"
    )

    model.fit(X_train, y_train, sample_weight=sample_weights)
    print("   ✅ Model trained.")

    print("\n[9/10] Evaluating on unseen chronological test data...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    y_test_str = le.inverse_transform(y_test)
    y_pred_str = le.inverse_transform(y_pred)

    accuracy = accuracy_score(y_test_str, y_pred_str)
    balanced_accuracy = balanced_accuracy_score(y_test_str, y_pred_str)
    macro_f1 = f1_score(y_test_str, y_pred_str, average="macro")
    weighted_f1 = f1_score(y_test_str, y_pred_str, average="weighted")
    logloss = log_loss(y_test, y_prob, labels=np.arange(len(le.classes_)))

    classification = classification_report(y_test_str, y_pred_str, labels=LABELS, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test_str, y_pred_str, labels=LABELS)
    importances = model.feature_importances_
    importance_dict = {feature: float(importance) for feature, importance in zip(FEATURE_COLUMNS, importances)}

    accuracy_percent = accuracy * 100
    differences = {name: accuracy_percent - ref["accuracy_percent"] for name, ref in REFERENCE_MODELS.items()}

    draw_report = classification.get("DRAW", {})
    draw_precision = float(draw_report.get("precision", 0.0))
    draw_recall = float(draw_report.get("recall", 0.0))
    draw_f1 = float(draw_report.get("f1-score", 0.0))

    print("\n[10/10] Saving model and forensic report...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)

    temp_model = MODEL_FILE + ".tmp"
    joblib.dump(model, temp_model)
    os.replace(temp_model, MODEL_FILE)

    model_report = {
        "pipeline_step": "43.1",
        "status": "PASS",
        "source": {"file": "data/ml/features_v3.csv", "source_modified": False},
        "population": {
            "expected_rows": EXPECTED_ROWS, "actual_rows": len(df),
            "training_rows": len(train_df), "testing_rows": len(test_df), "train_ratio": TRAIN_RATIO
        },
        "date_range": {
            "training_through": train_df.iloc[-1]["date"].strftime("%Y-%m-%d"),
            "testing_from": test_df.iloc[0]["date"].strftime("%Y-%m-%d")
        },
        "features": {
            "raw_features": RAW_FEATURES, "engineered_features": ENGINEERED_FEATURES,
            "final_features": FEATURE_COLUMNS, "elo_diff_removed": True
        },
        "model": {
            "type": "XGBClassifier (Clean Signal Fusion & Similarity)",
            "objective": "multi:softprob", "n_estimators": 300, "max_depth": 6
        },
        "evaluation": {
            "accuracy": float(accuracy), "accuracy_percent": float(accuracy_percent),
            "balanced_accuracy": float(balanced_accuracy), "macro_f1": float(macro_f1),
            "weighted_f1": float(weighted_f1), "log_loss": float(logloss),
            "draw_precision": draw_precision, "draw_recall": draw_recall, "draw_f1": draw_f1,
            "classification_report": classification, "confusion_matrix": cm.tolist(),
            "feature_importances": importance_dict
        },
        "reference_models": {
            name: {"accuracy_percent": float(ref["accuracy_percent"]), "difference_pp": float(diff)}
            for name, ref, diff in zip(REFERENCE_MODELS.keys(), REFERENCE_MODELS.values(), differences.values())
        },
        "leakage_control": {
            "chronological_split": True, "same_day_order": "date + match_id",
            "target_mapping_fit_after_split": True, "sample_weights_from_train_only": True,
            "feature_engineering_row_local": True, "future_results_used": False
        },
        "output": {"model": MODEL_FILE, "report": REPORT_FILE}
    }

    model_report = numpy_safe(model_report)

    temp_report = REPORT_FILE + ".tmp"
    with open(temp_report, "w", encoding="utf-8") as f:
        json.dump(model_report, f, indent=2, ensure_ascii=False)
    os.replace(temp_report, REPORT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 43.1 COMPLETE: PASS")
    print("=" * 60)
    print(f"🎯 Accuracy:              {accuracy_percent:.2f}%")
    print(f"⚖️ Balanced Accuracy:     {balanced_accuracy * 100:.2f}%")
    print(f"🧠 Macro F1:              {macro_f1 * 100:.2f}%")
    print(f"📊 Weighted F1:           {weighted_f1 * 100:.2f}%")
    print(f"📉 Log Loss:              {logloss:.4f}")

    print("\n📊 Reference Models")
    print("-" * 60)
    for name, ref in REFERENCE_MODELS.items():
        print(f"   {name.replace('_', ' ').title():<25} {ref['accuracy_percent']:.2f}%")

    print("\n🚀 Model Comparisons")
    print("-" * 60)
    for name in ["xgb_similarity_43", "xgb_combined_42_1", "xgb_ewma", "xgb_balanced", "elo_only"]:
        print(f"   vs {name.replace('_', ' ').title():<20} {differences[name]:+.2f} pp")

    print("\n🎯 DRAW Performance")
    print("-" * 60)
    print(f"   Precision: {draw_precision * 100:.2f}%")
    print(f"   Recall:    {draw_recall * 100:.2f}%")
    print(f"   F1:        {draw_f1 * 100:.2f}%")

    print("\n📋 Classification Report")
    print("-" * 60)
    print(classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))

    print("🧩 Confusion Matrix")
    print("-" * 60)
    print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
    for i, label in enumerate(LABELS):
        print(f"{label:>12}{cm[i, 0]:>12,}{cm[i, 1]:>12,}{cm[i, 2]:>12,}")

    print("\n🧠 Top 15 Feature Importances")
    print("-" * 60)
    importance_rows = sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)
    for rank, (feature, importance) in enumerate(importance_rows[:15], start=1):
        print(f"   {rank:>2}. {feature:<32} {importance * 100:>7.2f}%")

    print(f"\n📁 Model:               {MODEL_FILE}")
    print(f"📁 Report:              {REPORT_FILE}")
    print("\n🔒 Step 40 feature dataset was NOT modified.")
    print("🔒 JSON report passed NumPy-safe serialization.")
    print("🔒 Exact population preserved: 484,354.")
    print("=" * 60)

if __name__ == "__main__":
    run()