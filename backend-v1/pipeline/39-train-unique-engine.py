
import os, json, joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, log_loss
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v3_unique.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")
MODEL_FILE = os.path.join(OUTPUT_DIR, "unique_goal_engine.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "unique_engine_report.json")

ELO_ONLY_ACCURACY = 50.39

# 49 columns - use all goal-based to beat result-only
FEATURES = [
    "home_elo_pre","away_elo_pre","elo_diff",
    "home_gf_ewma","away_gf_ewma","home_ga_ewma","away_ga_ewma",
    "home_btts_rate","away_btts_rate","home_over25_rate","away_over25_rate",
    "home_clean_rate","away_clean_rate","home_failed_rate","away_failed_rate",
    "home_attack_strength","away_attack_strength","home_defense_strength","away_defense_strength",
    "exp_home_goals","exp_away_goals","exp_total_goals","exp_goal_diff",
    "h2h_avg_goals","h2h_btts_rate","h2h_over25_rate","h2h_matches_goals",
    "home_form_pts","away_form_pts","home_home_pts","away_away_pts",
    "home_gf_avg","away_gf_avg","home_ga_avg","away_ga_avg",
    "h2h_hw_rate","h2h_d_rate","h2h_aw_rate","h2h_matches"
]
LABELS = ["HOME_WIN","DRAW","AWAY_WIN"]

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 39: UNIQUE GOAL ENGINE TRAINING")
    print(" BEAT 50.39% WITH BTTS + Over/Under + Expected Goals")
    print("="*60+"\n")
    print("[1/7] Loading features_v3_unique.csv (49 cols)...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    total = len(df)
    print(f"   ↳ Rows: {total:,} | Features: {len(FEATURES)} (unique goal-based)")

    print("\n[2/7] Engineering final signals...")
    df["date"]=pd.to_datetime(df["date"], errors="coerce")
    df=df.sort_values(by=["date","match_id"], kind="mergesort").reset_index(drop=True)
    # Extra signals from expected goals
    df["exp_total_goals"] = pd.to_numeric(df["exp_total_goals"], errors="coerce").fillna(1.4)
    df["exp_goal_diff"] = pd.to_numeric(df["exp_goal_diff"], errors="coerce").fillna(0)
    df["elo_diff"] = pd.to_numeric(df["elo_diff"], errors="coerce").fillna(0)
    # Goal-based derived
    df["goal_supremacy"] = df["exp_home_goals"] - df["exp_away_goals"] + df["elo_diff"]/100
    df["total_goals_signal"] = df["exp_total_goals"] + df["home_over25_rate"] + df["away_over25_rate"]
    df["btts_signal"] = df["home_btts_rate"] + df["away_btts_rate"] + df["h2h_btts_rate"]
    df["defensive_signal"] = df["home_clean_rate"] + df["away_clean_rate"]
    
    FEATURES_FINAL = FEATURES + ["goal_supremacy","total_goals_signal","btts_signal","defensive_signal"]
    for col in FEATURES_FINAL:
        df[col]=pd.to_numeric(df[col], errors="coerce")
        df[col]=df[col].fillna(0)
    print(f"   ↳ Final features: {len(FEATURES_FINAL)} (added 4 goal signals)")

    print("\n[3/7] GAP split...")
    split_idx=int(len(df)*0.80)
    train_end=df.iloc[split_idx-1]["date"]
    test_start_idx=split_idx
    while test_start_idx < len(df) and df.iloc[test_start_idx]["date"] <= train_end:
        test_start_idx+=1
    train_df=df.iloc[:split_idx].copy()
    test_df=df.iloc[test_start_idx:].copy()
    print(f"   ↳ Train: {len(train_df):,} through {train_end.date()} | Test: {len(test_df):,} from {test_df.iloc[0]['date'].date()}")

    X_train=train_df[FEATURES_FINAL].astype(float)
    X_test=test_df[FEATURES_FINAL].astype(float)
    y_train_raw=train_df["target"].astype(str)
    y_test_raw=test_df["target"].astype(str)
    
    le=LabelEncoder()
    y_train=le.fit_transform(y_train_raw)
    y_test=le.transform(y_test_raw)

    print("\n[4/7] Training UNIQUE engine (XGBoost 800 trees, goal-based)...")
    # Balanced but not over-balanced - to beat 50.39% we keep HOME accuracy
    # Compute sample weights: slight boost to DRAW but not killing HOME
    adjusted_weights={0: 1.0, 1: 1.4, 2: 1.05}  # HOME 1.0, DRAW 1.4, AWAY 1.05
    sample_weights=np.array([adjusted_weights[y] for y in y_train])
    print(f"   ↳ Weights: {adjusted_weights} (goal-based, slight DRAW boost)")

    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=800,
        learning_rate=0.02,
        max_depth=12,
        min_child_weight=1,
        subsample=0.85,
        colsample_bytree=0.85,
        colsample_bylevel=0.9,
        gamma=0.05,
        reg_alpha=0.03,
        reg_lambda=0.7,
        random_state=42,
        n_jobs=-1,
        eval_metric="mlogloss",
        tree_method="hist"
    )
    model.fit(X_train, y_train, sample_weight=sample_weights, verbose=False)
    print("   ✅ XGB 800 trees depth 12 trained (goal-based)")

    print("\n[5/7] Evaluating to BEAT 50.39%...")
    y_pred=model.predict(X_test)
    y_proba=model.predict_proba(X_test)
    y_test_str=le.inverse_transform(y_test)
    y_pred_str=le.inverse_transform(y_pred)
    acc=accuracy_score(y_test_str, y_pred_str)
    ll=log_loss(y_test, y_proba)
    diff=acc*100 - ELO_ONLY_ACCURACY
    
    # Also evaluate BTTS and Over25 if available (multi-task)
    btts_acc = 0
    over_acc = 0
    if "target_btts" in test_df.columns:
        # Train BTTS model quickly from same features
        from sklearn.ensemble import RandomForestClassifier
        btts_train=train_df["target_btts"].astype(int)
        btts_test=test_df["target_btts"].astype(int)
        btts_model=RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
        btts_model.fit(X_train, btts_train)
        btts_pred=btts_model.predict(X_test)
        btts_acc=accuracy_score(btts_test, btts_pred)
        
        over_train=train_df["target_over25"].astype(int)
        over_test=test_df["target_over25"].astype(int)
        over_model=RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
        over_model.fit(X_train, over_train)
        over_pred=over_model.predict(X_test)
        over_acc=accuracy_score(over_test, over_pred)
    
    print(f"   ↳ 1X2 Accuracy: {acc*100:.2f}% vs {ELO_ONLY_ACCURACY}%")
    print(f"   ↳ LogLoss: {ll:.4f}")
    print(f"   ↳ BTTS Accuracy: {btts_acc*100:.2f}% (2 outcomes, easier)")
    print(f"   ↳ Over2.5 Accuracy: {over_acc*100:.2f}% (2 outcomes, easier)")
    print(f"   ↳ Improvement vs 50.39%: {diff:+.2f}pp")
    print("\n"+classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))
    
    importances=model.feature_importances_
    top10=sorted(zip(FEATURES_FINAL, importances), key=lambda x: x[1], reverse=True)[:10]
    print("Top 10 unique features:")
    for f, imp in top10:
        print(f"  {f}: {imp*100:.2f}%")

    print("\n[6/7] Saving UNIQUE champion...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)
    joblib.dump(model, MODEL_FILE+".tmp")
    os.replace(MODEL_FILE+".tmp", MODEL_FILE)

    report={
        "step":"39","status":"PASS" if acc*100>ELO_ONLY_ACCURACY else "BELOW",
        "population":{"total":total,"train":len(train_df),"test":len(test_df)},
        "features":FEATURES_FINAL,
        "unique_features":{"ewma":4,"btts_over":6,"attack_defense":6,"expected_goals":4,"h2h_goals":4,"goal_signals":4},
        "model":{"type":"XGBoost Unique Goal Engine","n_estimators":800,"max_depth":12,"weights":adjusted_weights},
        "evaluation":{"accuracy":acc,"accuracy_percent":acc*100,"log_loss":ll,"elo_only_accuracy":ELO_ONLY_ACCURACY,"improvement_pp":diff,"btts_accuracy":btts_acc,"over25_accuracy":over_acc,"classification_report":classification_report(y_test_str, y_pred_str, labels=LABELS, output_dict=True, zero_division=0),"confusion_matrix":confusion_matrix(y_test_str, y_pred_str, labels=LABELS).tolist(),"top_features":top10,"beat_50_39": acc*100 > ELO_ONLY_ACCURACY}
    }
    with open(REPORT_FILE+".tmp","w",encoding="utf-8") as f:
        json.dump(report,f,indent=2)
    os.replace(REPORT_FILE+".tmp", REPORT_FILE)

    print("\n"+"="*60)
    print(f" STEP 39 COMPLETE: {'PASS - BEAT 50.39% ✅ UNIQUE CHAMPION' if acc*100>ELO_ONLY_ACCURACY else 'FAIL - NOT YET'}")
    print("="*60)
    print(f"🎯 1X2: {acc*100:.2f}% vs 50.39% (goal-based)")
    print(f"🎯 BTTS: {btts_acc*100:.2f}% (unique)")
    print(f"🎯 Over2.5: {over_acc*100:.2f}% (unique)")
    print(f"🚀 Improvement: {diff:+.2f}pp {'✅ BEAT CHAMPION' if diff>0 else '❌'}")
    print(f"📁 Model: {MODEL_FILE}")
    print("="*60)

if __name__=="__main__":
    run()
