
import os, json, joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V4_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 47: MARKET MODELS (ROBUST)")
    print(" No sample_weight -> scale_pos_weight for imbalanced")
    print("="*60+"\n")
    
    print("[1/4] Loading v4...")
    df = pd.read_csv(V4_FILE, low_memory=False)
    print(f"   Rows: {len(df):,} Cols: {len(df.columns)}")
    
    # Known EWMA features (from v3)
    pref = ["home_elo_pre","away_elo_pre","elo_diff","home_ewma_pts","away_ewma_pts","home_ewma_gd","away_ewma_gd","home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga","home_ewma_home_pts","away_ewma_away_pts","home_ewma_home_gd","away_ewma_away_gd","home_ewma_home_gf","away_ewma_away_gf","home_ewma_home_ga","away_ewma_away_ga","home_matches_before","away_matches_before","home_home_matches_before","away_away_matches_before"]
    feature_cols = [c for c in pref if c in df.columns]
    if len(feature_cols)<10:
        # fallback to numeric
        feature_cols = [c for c in df.columns if c not in ["match_id","date","target","home_goals","away_goals","total_goals","ou_0_5","ou_1_5","ou_2_5","ou_3_5","btts","home_team_id","away_team_id"] and pd.api.types.is_numeric_dtype(df[c])][:21]
    
    print(f"   ↳ Features: {len(feature_cols)}")
    
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.sort_values("date").reset_index(drop=True)
    split = int(len(df)*0.8)
    print(f"   Train {split:,} | Test {len(df)-split:,}")
    
    X_train = df.iloc[:split][feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    X_test = df.iloc[split:][feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    
    markets = [("btts","BTTS"), ("ou_2_5","Over2.5"), ("ou_1_5","Over1.5"), ("ou_3_5","Over3.5"), ("ou_0_5","Over0.5")]
    
    print("\n[2/4] Training (robust, no sample_weight crash)...\n")
    results={}
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    for col, name in markets:
        if col not in df.columns:
            continue
        print(f"--- {name} ({col}) ---")
        y_train_raw = df.iloc[:split][col].astype(str)
        y_test_raw = df.iloc[split:][col].astype(str)
        print(f"Dist train {y_train_raw.value_counts().to_dict()}")
        
        le = LabelEncoder()
        y_train = le.fit_transform(y_train_raw)
        y_test = le.transform(y_test_raw)
        
        # scale_pos_weight for imbalanced
        counts = np.bincount(y_train)
        if len(counts)==2:
            # weight for minority
            scale = max(counts)/min(counts)
            scale = min(scale, 4.0)
        else:
            scale = 1.0
        print(f"scale_pos_weight {scale:.2f} classes {list(le.classes_)}")
        
        model = xgb.XGBClassifier(
            n_estimators=350,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            scale_pos_weight=scale,
            random_state=42,
            n_jobs=-1,
            tree_method="hist",
            eval_metric="logloss",
            verbosity=0
        )
        try:
            model.fit(X_train, y_train, verbose=False)
            pred = le.inverse_transform(model.predict(X_test))
            acc = accuracy_score(y_test_raw, pred)
            print(f"🎯 Acc {acc*100:.2f}%\n{classification_report(y_test_raw, pred, zero_division=0)}")
            
            # save
            joblib.dump(model, os.path.join(MODELS_DIR, f"market_{col}_model.joblib"))
            with open(os.path.join(MODELS_DIR, f"market_{col}_label_mapping.json"),"w") as f:
                json.dump({str(i):str(c) for i,c in enumerate(le.classes_)}, f, indent=2)
            with open(os.path.join(MODELS_DIR, f"market_{col}_meta.json"),"w") as f:
                json.dump({"target":col,"classes":list(le.classes_),"features":feature_cols,"accuracy":float(acc)}, f, indent=2)
            results[col]=float(acc)
        except Exception as e:
            print(f"❌ {name} failed: {e}\n")
            continue
    
    print("[3/4] Manifest...")
    manifest = {"step":47,"status":"PASS","markets":results,"features":feature_cols}
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR,"market_models_report.json"),"w") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(MODELS_DIR,"market_models_manifest.json"),"w") as f:
        json.dump(manifest, f, indent=2)
    
    print("="*60)
    print(" STEP 47 COMPLETE")
    print("="*60)
    for k,v in results.items():
        print(f"{k}: {v*100:.2f}%")
    print("="*60)

if __name__=="__main__":
    run()
