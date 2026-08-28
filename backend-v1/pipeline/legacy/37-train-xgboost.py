
import os, json, joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, log_loss, balanced_accuracy_score
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v2.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "models")
REPORT_DIR = os.path.join(BASE_DIR, "data", "processed")
MODEL_FILE = os.path.join(OUTPUT_DIR, "xgboost_v1.joblib")
REPORT_FILE = os.path.join(REPORT_DIR, "xgboost_model_report.json")

TRAIN_RATIO = 0.80
ELO_ONLY_ACCURACY = 50.39  # To beat from your 34

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts",
    "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
]
LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 37: XGBOOST TO BEAT 50.39% (PRO)")
    print("="*60+"\n")
    print("[1/8] Loading features_v2.csv (DYNAMIC)...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    EXPECTED_ROWS = len(df)
    print(f"   ↳ Rows: {EXPECTED_ROWS:,} (dynamic)")

    print("\n[2/8] Engineering features to BEAT baseline...")
    # Add features that help separate DRAW
    df["elo_diff_abs"] = df["elo_diff"].abs()
    df["elo_diff_sq"] = df["elo_diff"] ** 2
    df["form_diff"] = df["home_form_pts"] - df["away_form_pts"]
    df["gf_diff"] = df["home_gf_avg"] - df["away_gf_avg"]
    df["ga_diff"] = df["home_ga_avg"] - df["away_ga_avg"]
    df["home_advantage"] = df["home_home_pts"] - df["away_away_pts"]
    df["h2h_draw_bias"] = df["h2h_d_rate"] * df["h2h_matches"]
    
    FEATURES_EXTENDED = FEATURE_COLUMNS + ["elo_diff_abs","elo_diff_sq","form_diff","gf_diff","ga_diff","home_advantage","h2h_draw_bias"]
    print(f"   ↳ Features: {len(FEATURE_COLUMNS)} -> {len(FEATURES_EXTENDED)} (added 7 engineered)")

    print("\n[3/8] Validating...")
    df["date"]=pd.to_datetime(df["date"], errors="coerce")
    df=df.sort_values(by=["date","match_id"], kind="mergesort").reset_index(drop=True)
    for col in FEATURES_EXTENDED:
        df[col]=pd.to_numeric(df[col], errors="coerce")
        df[col]=df[col].fillna(0)

    print("\n[4/8] GAP chronological split...")
    split_idx=int(len(df)*TRAIN_RATIO)
    train_end=df.iloc[split_idx-1]["date"]
    test_start_idx=split_idx
    while test_start_idx < len(df) and df.iloc[test_start_idx]["date"] <= train_end:
        test_start_idx+=1
    train_df=df.iloc[:split_idx].copy()
    test_df=df.iloc[test_start_idx:].copy()
    print(f"   ↳ Train: {len(train_df):,} through {train_end.date()} | Test: {len(test_df):,} from {test_df.iloc[0]['date'].date()}")

    X_train=train_df[FEATURES_EXTENDED].astype(float)
    X_test=test_df[FEATURES_EXTENDED].astype(float)
    y_train_raw=train_df["target"].astype(str)
    y_test_raw=test_df["target"].astype(str)

    print("\n[5/8] Encoding targets...")
    le=LabelEncoder()
    y_train=le.fit_transform(y_train_raw)
    y_test=le.transform(y_test_raw)

    print("\n[6/8] Training XGBoost (accuracy-optimized, not over-balanced)...")
    # Don't over-balance - use slight balancing to keep HOME accuracy
    # Compute balanced but with less aggressive weighting
    from sklearn.utils.class_weight import compute_class_weight
    classes=np.unique(y_train)
    weights=compute_class_weight('balanced', classes=classes, y=y_train)
    # Reduce DRAW weight from ~2.0 to ~1.3 to keep HOME recall
    # Original balanced: HOME~0.73, DRAW~1.56, AWAY~1.2
    # Adjusted: keep closer to 1.0 for accuracy
    adjusted_weights={0: 0.9, 1: 1.3, 2: 1.0}  # HOME 0.9, DRAW 1.3, AWAY 1.0
    sample_weights=np.array([adjusted_weights[y] for y in y_train])
    print(f"   ↳ Adjusted weights (not over-balanced): {adjusted_weights} (vs strict balanced {dict(zip(classes, weights))})")

    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=600,
        learning_rate=0.03,
        max_depth=10,
        min_child_weight=1,
        subsample=0.9,
        colsample_bytree=0.9,
        colsample_bylevel=0.9,
        gamma=0.1,
        reg_alpha=0.05,
        reg_lambda=0.8,
        random_state=42,
        n_jobs=-1,
        eval_metric="mlogloss",
        tree_method="hist"
    )
    model.fit(X_train, y_train, sample_weight=sample_weights, verbose=False)
    print("   ✅ XGB 600 trees depth 10 trained")

    print("\n[7/8] Evaluating to BEAT 50.39%...")
    y_pred=model.predict(X_test)
    y_proba=model.predict_proba(X_test)
    y_test_str=le.inverse_transform(y_test)
    y_pred_str=le.inverse_transform(y_pred)
    acc=accuracy_score(y_test_str, y_pred_str)
    bal_acc=balanced_accuracy_score(y_test_str, y_pred_str)
    ll=log_loss(y_test, y_proba)
    
    report=classification_report(y_test_str, y_pred_str, labels=LABELS, output_dict=True, zero_division=0)
    cm=confusion_matrix(y_test_str, y_pred_str, labels=LABELS)
    importances=model.feature_importances_

    diff_elo=(acc*100)-ELO_ONLY_ACCURACY
    print(f"   ↳ Accuracy: {acc*100:.2f}% vs {ELO_ONLY_ACCURACY}% to beat")
    print(f"   ↳ Balanced Acc: {bal_acc*100:.2f}% | LogLoss: {ll:.4f}")
    print(f"   ↳ Improvement: {diff_elo:+.2f}pp")
    print("\n"+classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))

    print("\n[8/8] Saving...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)
    joblib.dump(model, MODEL_FILE+".tmp")
    os.replace(MODEL_FILE+".tmp", MODEL_FILE)

    model_report={
        "step":"37","status":"PASS" if acc*100>ELO_ONLY_ACCURACY else "BELOW",
        "population":{"total_rows":EXPECTED_ROWS,"training_rows":len(train_df),"testing_rows":len(test_df)},
        "features":FEATURES_EXTENDED,
        "model":{"type":"XGBoost","n_estimators":600,"max_depth":10,"adjusted_weights":adjusted_weights,"engineered":7},
        "evaluation":{"accuracy":acc,"accuracy_percent":acc*100,"balanced_accuracy":bal_acc,"log_loss":ll,"elo_only_accuracy_percent":ELO_ONLY_ACCURACY,"difference_vs_elo_only_pp":diff_elo,"classification_report":report,"confusion_matrix":cm.tolist(),"feature_importances":dict(zip(FEATURES_EXTENDED, importances.tolist())),"beat_elo_only": acc*100 > ELO_ONLY_ACCURACY},
    }
    with open(REPORT_FILE+".tmp","w",encoding="utf-8") as f:
        json.dump(model_report,f,indent=2)
    os.replace(REPORT_FILE+".tmp", REPORT_FILE)

    print("\n"+"="*60)
    print(f" STEP 37 COMPLETE: {'PASS - BEAT 50.39% ✅' if acc*100>ELO_ONLY_ACCURACY else 'FAIL - DID NOT BEAT ❌'}")
    print("="*60)
    print(f"🎯 Accuracy: {acc*100:.2f}% vs ELO-only {ELO_ONLY_ACCURACY}%")
    print(f"🚀 Improvement: {diff_elo:+.2f}pp {'✅ BEAT' if diff_elo>0 else '❌ NOT YET'}")
    print(f"📁 Model: {MODEL_FILE}")
    print("="*60)

if __name__=="__main__":
    run()
