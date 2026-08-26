
import os, json, joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import xgboost as xgb

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v2.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")
MODEL_FILE = os.path.join(OUTPUT_DIR, "random_forest_v2.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "v2_model_report.json")

TRAIN_RATIO = 0.80
BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 50.39  # From your 34 run, to beat

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts",
    "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
]
LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 36: V2 MODEL (RF+XGB) TO BEAT 50.39%")
    print("="*60+"\n")
    print("[1/7] Checking Step 35 features...")
    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(FEATURES_FILE)

    print("\n[2/7] Loading features_v2.csv (DYNAMIC)...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    EXPECTED_ROWS = len(df)
    print(f"   ↳ Rows loaded: {EXPECTED_ROWS:,} (dynamic, not 484,354) | Features: {len(FEATURE_COLUMNS)}")

    print("\n[3/7] Validating...")
    missing=[c for c in FEATURE_COLUMNS+["match_id","date","target"] if c not in df.columns]
    if missing: raise RuntimeError(f"Missing {missing}")
    if df["match_id"].duplicated().any(): raise RuntimeError("Duplicate IDs")
    df["date"]=pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any(): raise RuntimeError("Invalid dates")
    for col in FEATURE_COLUMNS:
        df[col]=pd.to_numeric(df[col], errors="coerce")
        df[col]=df[col].fillna(0)
    print("   ✅ Validated (dynamic, NaN filled)")

    print("\n[4/7] Preparing GAP chronological split (no same-day leak)...")
    df=df.sort_values(by=["date","match_id"], kind="mergesort").reset_index(drop=True)
    split_idx=int(len(df)*TRAIN_RATIO)
    train_end=df.iloc[split_idx-1]["date"]
    test_start_idx=split_idx
    while test_start_idx < len(df) and df.iloc[test_start_idx]["date"] <= train_end:
        test_start_idx+=1
    train_df=df.iloc[:split_idx].copy()
    test_df=df.iloc[test_start_idx:].copy()
    print(f"   ↳ Train: {len(train_df):,} through {train_end.date()}")
    print(f"   ↳ Test: {len(test_df):,} from {test_df.iloc[0]['date'].date()} (GAP)")
    print(f"   ✅ Split: {len(train_df):,} / {len(test_df):,} (gap, no leak)")

    print("\n[5/7] Training RF + XGB ensemble to BEAT 50.39%...")
    X_train=train_df[FEATURE_COLUMNS]
    y_train=train_df["target"]
    X_test=test_df[FEATURE_COLUMNS]
    y_test=test_df["target"]

    # RF balanced to fix DRAW recall 0
    rf = RandomForestClassifier(n_estimators=200, max_depth=12, class_weight="balanced_subsample", random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    
    # XGB balanced
    target_map={"HOME_WIN":0,"DRAW":1,"AWAY_WIN":2}
    y_train_enc=y_train.map(target_map)
    y_test_enc=y_test.map(target_map)
    from sklearn.utils.class_weight import compute_sample_weight
    sample_weights=compute_sample_weight(class_weight="balanced", y=y_train_enc)
    
    xgb_model = xgb.XGBClassifier(n_estimators=400, max_depth=8, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, objective='multi:softprob', num_class=3, eval_metric='mlogloss', reg_alpha=0.1, reg_lambda=1.0, random_state=42, n_jobs=-1)
    xgb_model.fit(X_train, y_train_enc, sample_weight=sample_weights, verbose=False)
    
    # Ensemble: average proba
    rf_proba=rf.predict_proba(X_test)
    # Align RF order with XGB order
    rf_classes=list(rf.classes_)
    # XGB order is 0,1,2 -> HOME,DRAW,AWAY
    # RF order is alphabetical? Let's map
    # Create proba in HOME,DRAW,AWAY order
    proba_dict={cls: rf_proba[:, i] for i, cls in enumerate(rf.classes_)}
    rf_proba_ordered=np.column_stack([proba_dict.get("HOME_WIN", np.zeros(len(X_test))), proba_dict.get("DRAW", np.zeros(len(X_test))), proba_dict.get("AWAY_WIN", np.zeros(len(X_test)))])
    
    xgb_proba=xgb_model.predict_proba(X_test)
    ensemble_proba=(rf_proba_ordered*0.4 + xgb_proba*0.6)
    y_pred_idx=np.argmax(ensemble_proba, axis=1)
    inv_map={0:"HOME_WIN",1:"DRAW",2:"AWAY_WIN"}
    y_pred=[inv_map[i] for i in y_pred_idx]
    
    print("   ✅ RF (200 trees) + XGB (400 trees) ensemble trained")

    print("\n[6/7] Evaluating to BEAT 50.39%...")
    acc=accuracy_score(y_test, y_pred)
    diff_baseline=(acc*100)-BASELINE_ACCURACY
    diff_elo=(acc*100)-ELO_ONLY_ACCURACY
    
    report=classification_report(y_test, y_pred, labels=LABELS, output_dict=True, zero_division=0)
    matrix=confusion_matrix(y_test, y_pred, labels=LABELS)
    
    # Feature importance from RF
    importances=rf.feature_importances_
    imp_dict=dict(zip(FEATURE_COLUMNS, importances))

    print(f"   ↳ Accuracy: {acc*100:.2f}% vs ELO-only 50.39%")
    print(f"   ↳ Improvement vs ELO-only: {diff_elo:+.2f}pp")
    print(f"   ↳ Top features: {sorted(imp_dict.items(), key=lambda x: x[1], reverse=True)[:5]}")

    print("\n[7/7] Saving...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)
    joblib.dump(rf, MODEL_FILE+".tmp")
    os.replace(MODEL_FILE+".tmp", MODEL_FILE)
    # Also save XGB
    joblib.dump(xgb_model, os.path.join(OUTPUT_DIR, "xgboost_v2.joblib"))

    model_report={
        "pipeline_step":"36","status":"PASS" if acc*100>ELO_ONLY_ACCURACY else "BELOW_BASELINE",
        "source":"data/ml/features_v2.csv",
        "population":{"total_rows":EXPECTED_ROWS,"training_rows":len(train_df),"testing_rows":len(test_df),"train_ratio":TRAIN_RATIO},
        "date_range":{"training_through":train_end.strftime("%Y-%m-%d"),"testing_from":test_df.iloc[0]["date"].strftime("%Y-%m-%d")},
        "features":FEATURE_COLUMNS,
        "target":"target","target_classes":LABELS,
        "model":{"type":"RF(200)+XGB(400) Ensemble","rf_class_weight":"balanced_subsample","xgb_balanced":True,"beat_target":ELO_ONLY_ACCURACY},
        "evaluation":{"accuracy":acc,"accuracy_percent":acc*100,"baseline_accuracy_percent":BASELINE_ACCURACY,"elo_only_accuracy_percent":ELO_ONLY_ACCURACY,"difference_vs_baseline_pp":diff_baseline,"difference_vs_elo_only_pp":diff_elo,"classification_report":report,"confusion_matrix":matrix.tolist(),"feature_importances":imp_dict,"beat_elo_only": acc*100 > ELO_ONLY_ACCURACY},
        "leakage_control":{"chronological_split":True,"gap_split":True,"same_day_order":"date + match_id"},
        "output":MODEL_FILE
    }
    with open(REPORT_FILE+".tmp","w",encoding="utf-8") as f:
        json.dump(model_report,f,indent=2)
    os.replace(REPORT_FILE+".tmp", REPORT_FILE)

    print("\n"+"="*60)
    print(f" STEP 36 COMPLETE: {'PASS - BEAT 50.39%' if acc*100>ELO_ONLY_ACCURACY else 'FAIL - DID NOT BEAT'}")
    print("="*60)
    print(f"📊 Model accuracy:      {acc*100:.2f}%")
    print(f"📊 Original baseline:   {BASELINE_ACCURACY:.2f}%")
    print(f"📊 ELO-only (Step 34):  {ELO_ONLY_ACCURACY:.2f}%")
    if diff_elo>0:
        print(f"🚀 vs ELO-only:         +{diff_elo:.2f} pp ✅ BEAT")
    else:
        print(f"📉 vs ELO-only:         {diff_elo:.2f} pp ❌ DID NOT BEAT")
    print("\n📋 Classification Report")
    print("-"*60)
    print(classification_report(y_test, y_pred, labels=LABELS, zero_division=0))
    print("🧠 Feature Importances")
    print("-"*60)
    for feat, imp in sorted(imp_dict.items(), key=lambda x: x[1], reverse=True):
        print(f"   {feat:<20} {imp*100:>7.2f}%")
    print(f"\n📁 Model: {MODEL_FILE}")
    print(f"📁 Report: {REPORT_FILE}")
    print("\n🔒 No future leakage (GAP split)")
    print(f"🔒 Population dynamic: {EXPECTED_ROWS:,}")
    print(f"🔒 Beat target: {ELO_ONLY_ACCURACY}% -> {'YES' if acc*100>ELO_ONLY_ACCURACY else 'NO'}")
    print("="*60)

if __name__=="__main__":
    run()
