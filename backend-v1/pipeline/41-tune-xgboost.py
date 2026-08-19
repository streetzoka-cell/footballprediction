import os
import json
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.model_selection import TimeSeriesSplit, ParameterSampler
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
# ZOKASCORE V2 — STEP 41 TUNE
# CHRONOLOGICAL XGBOOST HYPERPARAMETER OPTIMIZATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v3.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")

MODEL_FILE = os.path.join(OUTPUT_DIR, "xgboost_tuned_ewma_v1.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "xgboost_tuned_ewma_report.json")

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80
TEST_RATIO = 0.20

N_SPLITS = 3
N_ITER = 30
RANDOM_STATE = 42

# Reference Models
BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23
XGB_BALANCED_ACCURACY = 48.17
XGB_NATURAL_ACCURACY = 51.50
XGB_EWMA_ACCURACY = 48.19

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

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

PARAM_GRID = {
    "n_estimators": [200, 300, 400, 500],
    "learning_rate": [0.01, 0.03, 0.05, 0.08, 0.10],
    "max_depth": [4, 5, 6, 7, 8],
    "min_child_weight": [1, 3, 5, 7],
    "subsample": [0.70, 0.80, 0.90, 1.00],
    "colsample_bytree": [0.70, 0.80, 0.90, 1.00],
    "gamma": [0.0, 0.1, 0.2],
    "reg_alpha": [0.0, 0.1, 1.0],
    "reg_lambda": [0.1, 1.0, 5.0]
}

def build_model(params):
    return xgb.XGBClassifier(
        objective="multi:softprob", num_class=3,
        n_estimators=int(params["n_estimators"]),
        learning_rate=float(params["learning_rate"]),
        max_depth=int(params["max_depth"]),
        min_child_weight=int(params["min_child_weight"]),
        subsample=float(params["subsample"]),
        colsample_bytree=float(params["colsample_bytree"]),
        gamma=float(params["gamma"]),
        reg_alpha=float(params["reg_alpha"]),
        reg_lambda=float(params["reg_lambda"]),
        random_state=RANDOM_STATE, n_jobs=-1,
        eval_metric="mlogloss", tree_method="hist"
    )

def evaluate_fold(model, X_train_fold, y_train_fold, X_val_fold, y_val_fold):
    sample_weights = compute_sample_weight(class_weight="balanced", y=y_train_fold)
    model.fit(X_train_fold, y_train_fold, sample_weight=sample_weights)
    predictions = model.predict(X_val_fold)
    
    macro_f1 = f1_score(y_val_fold, predictions, average="macro")
    accuracy = accuracy_score(y_val_fold, predictions)
    balanced_accuracy = balanced_accuracy_score(y_val_fold, predictions)
    
    return {"macro_f1": macro_f1, "accuracy": accuracy, "balanced_accuracy": balanced_accuracy}

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 41 TUNE")
    print(" CHRONOLOGICAL XGBOOST HYPERPARAMETER OPTIMIZATION")
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

    print("\n[3/10] Validating Step 40 feature dataset...")
    required_columns = FEATURE_COLUMNS + ["match_id", "date", "target"]
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns: {missing}")

    if df["match_id"].isna().any() or df["match_id"].duplicated().any():
        raise RuntimeError("Match ID integrity check failed.")
    
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any():
        raise RuntimeError("Invalid dates detected.")
        
    for col in FEATURE_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any() or not np.isfinite(df[col].to_numpy(dtype=float)).all():
            raise RuntimeError(f"{col} contains invalid or non-finite values.")

    invalid_targets = set(df["target"].astype(str).unique()) - set(LABELS)
    if invalid_targets:
        raise RuntimeError(f"Invalid target values: {invalid_targets}")
    print("   ✅ Structural, numeric, identity, and target integrity verified.")

    print("\n[4/10] Preparing deterministic chronological order...")
    df = df.sort_values(by=["date", "match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[5/10] Locking final 20% test population...")
    split_idx = int(len(df) * TRAIN_RATIO)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()
    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(f"   ↳ Tuning population: {len(train_df):,} matches")
    print(f"   ↳ Final test population: {len(test_df):,} matches")
    print(f"   ↳ Training through: {train_end_date.date()}")
    print(f"   ↳ Final test from: {test_start_date.date()}")

    X_train = train_df[FEATURE_COLUMNS].astype(float)
    y_train_raw = train_df["target"].astype(str)
    X_test = test_df[FEATURE_COLUMNS].astype(float)
    y_test_raw = test_df["target"].astype(str)

    print("\n[6/10] Preparing target encoding...")
    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_test = le.transform(y_test_raw)
    
    print("   ↳ Target mapping:")
    for idx, label in enumerate(le.classes_):
        print(f"      {idx} → {label}")

    print("\n[7/10] Preparing chronological CV...")
    tscv = TimeSeriesSplit(n_splits=N_SPLITS)
    cv_splits = list(tscv.split(X_train))
    
    print(f"   ↳ TimeSeriesSplit folds: {N_SPLITS}")
    for fold_number, (fold_train_idx, fold_val_idx) in enumerate(cv_splits, start=1):
        print(f"   ↳ Fold {fold_number}: train={len(fold_train_idx):,}, validation={len(fold_val_idx):,}")

    print(f"\n[8/10] Starting chronological Randomized Search ({N_ITER} candidates)...")
    parameter_candidates = list(ParameterSampler(PARAM_GRID, n_iter=N_ITER, random_state=RANDOM_STATE))
    
    best_score = -np.inf
    best_params = None
    best_cv_metrics = None
    search_results = []

    for candidate_number, params in enumerate(parameter_candidates, start=1):
        print(f"\n------------------------------------------------------------")
        print(f"Candidate {candidate_number}/{N_ITER}")
        print(f"   n_estimators={params['n_estimators']}, learning_rate={params['learning_rate']}, max_depth={params['max_depth']}")
        
        fold_scores = []
        for fold_number, (fold_train_idx, fold_val_idx) in enumerate(cv_splits, start=1):
            X_fold_train = X_train.iloc[fold_train_idx]
            y_fold_train = y_train[fold_train_idx]
            X_fold_val = X_train.iloc[fold_val_idx]
            y_fold_val = y_train[fold_val_idx]
            
            model = build_model(params)
            metrics = evaluate_fold(model, X_fold_train, y_fold_train, X_fold_val, y_fold_val)
            fold_scores.append(metrics)
            print(f"   Fold {fold_number}: Macro F1={metrics['macro_f1'] * 100:.2f}% | Accuracy={metrics['accuracy'] * 100:.2f}%")
            
        mean_macro_f1 = np.mean([item["macro_f1"] for item in fold_scores])
        mean_accuracy = np.mean([item["accuracy"] for item in fold_scores])
        mean_balanced_accuracy = np.mean([item["balanced_accuracy"] for item in fold_scores])
        
        result = {
            "candidate": candidate_number, "params": params,
            "mean_macro_f1": mean_macro_f1, "mean_accuracy": mean_accuracy,
            "mean_balanced_accuracy": mean_balanced_accuracy, "folds": fold_scores
        }
        search_results.append(result)
        
        print(f"   → Mean Macro F1: {mean_macro_f1 * 100:.2f}%")
        print(f"   → Mean Accuracy: {mean_accuracy * 100:.2f}%")
        
        if mean_macro_f1 > best_score:
            best_score = mean_macro_f1
            best_params = params
            best_cv_metrics = result
            print("   🏆 NEW BEST CANDIDATE")

    print("\n" + "=" * 60)
    print("🏆 BEST PARAMETERS FOUND")
    print("=" * 60)
    for key, value in best_params.items():
        print(f"   {key:<20} {value}")
    print()
    print(f"   CV Macro F1: {best_cv_metrics['mean_macro_f1'] * 100:.2f}%")
    print(f"   CV Accuracy: {best_cv_metrics['mean_accuracy'] * 100:.2f}%")
    print(f"   CV Balanced Accuracy: {best_cv_metrics['mean_balanced_accuracy'] * 100:.2f}%")

    print("\n[9/10] Retraining best model on complete 80%...")
    final_model = build_model(best_params)
    final_sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)
    final_model.fit(X_train, y_train, sample_weight=final_sample_weights)
    print("   ✅ Final tuned model trained.")

    print("\nEvaluating on LOCKED final 20%...")
    y_pred = final_model.predict(X_test)
    y_prob = final_model.predict_proba(X_test)
    
    y_test_str = le.inverse_transform(y_test)
    y_pred_str = le.inverse_transform(y_pred)

    accuracy = accuracy_score(y_test_str, y_pred_str)
    balanced_accuracy = balanced_accuracy_score(y_test_str, y_pred_str)
    macro_f1 = f1_score(y_test_str, y_pred_str, average="macro")
    weighted_f1 = f1_score(y_test_str, y_pred_str, average="weighted")
    logloss = log_loss(y_test, y_prob, labels=np.arange(len(le.classes_)))

    classification = classification_report(y_test_str, y_pred_str, labels=LABELS, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test_str, y_pred_str, labels=LABELS)

    accuracy_percent = accuracy * 100
    diff_baseline = accuracy_percent - BASELINE_ACCURACY
    diff_elo = accuracy_percent - ELO_ONLY_ACCURACY
    diff_xgb_balanced = accuracy_percent - XGB_BALANCED_ACCURACY
    diff_xgb_natural = accuracy_percent - XGB_NATURAL_ACCURACY
    diff_xgb_ewma = accuracy_percent - XGB_EWMA_ACCURACY

    importances = final_model.feature_importances_
    importance_rows = sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)

    elo_features = {"home_elo_pre", "away_elo_pre", "elo_diff"}
    
    # FIX: Cast to standard Python float to prevent JSON serialization crash
    elo_importance = float(sum(imp for feat, imp in zip(FEATURE_COLUMNS, importances) if feat in elo_features))
    ewma_importance = float(sum(imp for feat, imp in zip(FEATURE_COLUMNS, importances) if feat not in elo_features))

    print("\n[10/10] Saving tuned model and forensic report...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)

    temp_model = MODEL_FILE + ".tmp"
    joblib.dump(final_model, temp_model)
    os.replace(temp_model, MODEL_FILE)

    # Cast all numpy types to native Python types for JSON safety
    clean_search_results = []
    for res in search_results:
        clean_res = {
            "candidate": res["candidate"],
            "params": res["params"],
            "mean_macro_f1": float(res["mean_macro_f1"]),
            "mean_accuracy": float(res["mean_accuracy"]),
            "mean_balanced_accuracy": float(res["mean_balanced_accuracy"]),
            "folds": [{k: float(v) for k, v in fold.items()} for fold in res["folds"]]
        }
        clean_search_results.append(clean_res)

    model_report = {
        "pipeline_step": "41-tune",
        "status": "PASS",
        "source": "data/ml/features_v3.csv",
        "population": {
            "total_rows": EXPECTED_ROWS, "training_rows": len(train_df),
            "testing_rows": len(test_df), "train_ratio": TRAIN_RATIO, "test_ratio": TEST_RATIO
        },
        "date_range": {
            "training_through": train_end_date.strftime("%Y-%m-%d"),
            "testing_from": test_start_date.strftime("%Y-%m-%d")
        },
        "features": FEATURE_COLUMNS,
        "target": "target",
        "target_classes": LABELS,
        "model": {
            "type": "XGBoostClassifier (Tuned EWMA + ELO)",
            "best_params": best_params,
            "objective": "multi:softprob",
            "random_state": RANDOM_STATE,
            "sample_weight": "balanced"
        },
        "hyperparameter_search": {
            "method": "Manual Randomized Chronological Search",
            "iterations": N_ITER, "cv": "TimeSeriesSplit", "cv_splits": N_SPLITS,
            "scoring": "macro_f1",
            "best_cv_macro_f1": float(best_cv_metrics["mean_macro_f1"]),
            "best_cv_accuracy": float(best_cv_metrics["mean_accuracy"]),
            "best_cv_balanced_accuracy": float(best_cv_metrics["mean_balanced_accuracy"]),
            "results": clean_search_results
        },
        "evaluation": {
            "accuracy": float(accuracy), "accuracy_percent": float(accuracy_percent),
            "balanced_accuracy": float(balanced_accuracy), "macro_f1": float(macro_f1),
            "weighted_f1": float(weighted_f1), "log_loss": float(logloss),
            "baseline_accuracy_percent": BASELINE_ACCURACY,
            "elo_only_accuracy_percent": ELO_ONLY_ACCURACY,
            "xgb_balanced_accuracy_percent": XGB_BALANCED_ACCURACY,
            "xgb_natural_accuracy_percent": XGB_NATURAL_ACCURACY,
            "xgb_ewma_accuracy_percent": XGB_EWMA_ACCURACY,
            "difference_vs_baseline_pp": float(diff_baseline),
            "difference_vs_elo_only_pp": float(diff_elo),
            "difference_vs_xgb_balanced_pp": float(diff_xgb_balanced),
            "difference_vs_xgb_natural_pp": float(diff_xgb_natural),
            "difference_vs_xgb_ewma_pp": float(diff_xgb_ewma),
            "classification_report": classification,
            "confusion_matrix": cm.tolist(),
            "feature_importances": {k: float(v) for k, v in zip(FEATURE_COLUMNS, importances.tolist())},
            "signal_contribution": {
                "elo_features": elo_importance,
                "ewma_features": ewma_importance
            }
        },
        "leakage_control": {
            "chronological_sort": True, "chronological_final_test_lock": True,
            "final_test_excluded_from_tuning": True, "same_day_order": "date + match_id",
            "target_encoder_fit_on_training": True, "fold_specific_sample_weights": True,
            "final_sample_weights_from_training_only": True, "cv_method": "TimeSeriesSplit"
        },
        "output": MODEL_FILE
    }

    temp_report = REPORT_FILE + ".tmp"
    with open(temp_report, "w", encoding="utf-8") as f:
        json.dump(model_report, f, indent=2)
    os.replace(temp_report, REPORT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 41 TUNE COMPLETE: PASS")
    print("=" * 60)
    print(f"🎯 Accuracy:              {accuracy_percent:.2f}%")
    print(f"⚖️ Balanced Accuracy:     {balanced_accuracy * 100:.2f}%")
    print(f"🧠 Macro F1:              {macro_f1 * 100:.2f}%")
    print(f"📊 Weighted F1:           {weighted_f1 * 100:.2f}%")
    print(f"📉 Log Loss:              {logloss:.4f}")
    
    print("\n📊 Reference Models")
    print("-" * 60)
    print(f"   Original baseline:     {BASELINE_ACCURACY:.2f}%")
    print(f"   ELO-only:              {ELO_ONLY_ACCURACY:.2f}%")
    print(f"   XGBoost (Balanced):    {XGB_BALANCED_ACCURACY:.2f}%")
    print(f"   XGBoost (Natural):     {XGB_NATURAL_ACCURACY:.2f}%")
    print(f"   XGBoost (EWMA):        {XGB_EWMA_ACCURACY:.2f}%")
    
    print("\n🚀 Model Comparison")
    print("-" * 60)
    print(f"   vs XGBoost (EWMA):     {diff_xgb_ewma:+.2f} pp")
    print(f"   vs XGBoost (Natural):  {diff_xgb_natural:+.2f} pp")
    print(f"   vs XGBoost (Balanced): {diff_xgb_balanced:+.2f} pp")
    print(f"   vs ELO-only:           {diff_elo:+.2f} pp")
    print(f"   vs Original baseline:  {diff_baseline:+.2f} pp")
    
    print("\n🏆 Best Parameters")
    print("-" * 60)
    for key, value in best_params.items():
        print(f"   {key:<20} {value}")
        
    print("\n📋 FINAL TEST CLASSIFICATION REPORT")
    print("-" * 60)
    print(classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))
    
    print("🧩 FINAL TEST CONFUSION MATRIX")
    print("-" * 60)
    print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
    for i, label in enumerate(LABELS):
        print(f"{label:>12}{cm[i, 0]:>12,}{cm[i, 1]:>12,}{cm[i, 2]:>12,}")
        
    print("\n🧠 FEATURE IMPORTANCES")
    print("-" * 60)
    for rank, (feature, importance) in enumerate(importance_rows, start=1):
        print(f"   {rank:>2}. {feature:<30} {importance * 100:>7.2f}%")
        
    print("\n🧠 SIGNAL CONTRIBUTION")
    print("-" * 60)
    print(f"   ELO features:       {elo_importance * 100:>6.2f}%")
    print(f"   EWMA features:      {ewma_importance * 100:>6.2f}%")
    
    print(f"\n📁 Model:               {MODEL_FILE}")
    print(f"📁 Report:              {REPORT_FILE}")
    print("\n🔒 Step 40 feature dataset was NOT modified.")
    print("🔒 Final 20% test set was NOT used during tuning.")
    print("🔒 Exact population preserved: 484,354.")
    print("=" * 60)

if __name__ == "__main__":
    run()