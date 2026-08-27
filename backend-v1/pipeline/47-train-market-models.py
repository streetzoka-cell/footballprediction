
import os, json, joblib, tempfile, shutil
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")

MARKETS = {
    "BTTS": {"target":"btts", "labels":["YES","NO"]},
    "OU_2_5": {"target":"ou_2_5", "labels":["OVER","UNDER"]},
    "OU_1_5": {"target":"ou_1_5", "labels":["OVER","UNDER"]},
    "OU_0_5": {"target":"ou_0_5", "labels":["OVER","UNDER"]},
}

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 47: MARKET MODELS (CLEAN UNIFIED)")
    print("="*60+"\n")
    
    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(FEATURES_FILE)
    
    print("[1/4] Loading v4 unified...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    print(f"   Rows: {len(df):,} Cols: {len(df.columns)}")
    
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.sort_values(by=["date","match_id"], kind="mergesort").reset_index(drop=True)
    
    # Auto-detect feature columns (all numeric except targets)
    exclude = {"match_id","date","target","home_goals","away_goals","total_goals","ou_0_5","ou_1_5","ou_2_5","ou_3_5","btts","zokascore_match_id"}
    feature_cols = [c for c in df.columns if c not in exclude and pd.api.types.is_numeric_dtype(df[c]) or c in ["home_elo_pre","away_elo_pre","elo_diff","home_ewma_pts","away_ewma_pts","home_ewma_gd","away_ewma_gd","home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga"]]
    # Filter to existing numeric
    feature_cols = [c for c in df.columns if c not in exclude and c not in ["home_team_id","away_team_id"]]
    # Keep only numeric that exist
    numeric_cols=[]
    for c in feature_cols:
        try:
            pd.to_numeric(df[c], errors="raise")
            if c not in ["ou_0_5","ou_1_5","ou_2_5","ou_3_5","btts","target"]:
                numeric_cols.append(c)
        except:
            pass
    # Use known EWMA cols if present
    preferred = [c for c in ["home_elo_pre","away_elo_pre","elo_diff","home_ewma_pts","away_ewma_pts","home_ewma_gd","away_ewma_gd","home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga","home_ewma_home_pts","away_ewma_away_pts","home_ewma_home_gd","away_ewma_away_gd","home_ewma_home_gf","away_ewma_away_gf","home_ewma_home_ga","away_ewma_away_ga","home_matches_before","away_matches_before"] if c in df.columns]
    if len(preferred)>=10:
        feature_cols = preferred
    else:
        feature_cols = numeric_cols[:22]
    
    print(f"   ↳ Feature cols for markets: {len(feature_cols)}")
    print(f"      {feature_cols[:5]}...")
    
    split_idx = int(len(df)*0.80)
    print(f"\n[2/4] Split Train {split_idx:,} | Test {len(df)-split_idx:,}")
    
    X = df[feature_cols].fillna(0).astype(float).replace([np.inf,-np.inf],0)
    
    results={}
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    
    print("\n[3/4] Training market models...")
    for market_key, cfg in MARKETS.items():
        target_col = cfg["target"]
        if target_col not in df.columns:
            print(f"   ⚠ Skip {market_key} - {target_col} not in file")
            continue
        
        print(f"\n   --- {market_key} ({target_col}) ---")
        y_raw = df[target_col].astype(str).str.strip()
        print(f"   Dist: {y_raw.value_counts().to_dict()}")
        
        y_train_raw = y_raw.iloc[:split_idx]
        y_test_raw = y_raw.iloc[split_idx:]
        X_train = X.iloc[:split_idx]
        X_test = X.iloc[split_idx:]
        
        le = LabelEncoder()
        y_train = le.fit_transform(y_train_raw)
        y_test = le.transform(y_test_raw)
        
        # Save mapping
        mapping = {str(i): str(label) for i, label in enumerate(le.classes_)}
        with open(os.path.join(MODELS_DIR, f"market_{target_col}_label_mapping.json"), "w") as f:
            json.dump(mapping, f, indent=2)
        
        # Balanced
        from sklearn.utils.class_weight import compute_sample_weight
        sw = compute_sample_weight(class_weight="balanced", y=y_train)
        
        model = xgb.XGBClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.05,
            subsample=0.85, colsample_bytree=0.85,
            random_state=42, n_jobs=-1, tree_method="hist", eval_metric="logloss"
        )
        model.fit(X_train, y_train, sample_weight=sw, verbose=False)
        
        y_pred = model.predict(X_test)
        y_pred_str = le.inverse_transform(y_pred)
        y_test_str = le.inverse_transform(y_test)
        
        acc = accuracy_score(y_test_str, y_pred_str)
        print(f"   🎯 Acc: {acc*100:.2f}%")
        print(classification_report(y_test_str, y_pred_str, zero_division=0))
        
        # Save model
        joblib.dump(model, os.path.join(MODELS_DIR, f"market_{target_col}_model.joblib"))
        results[market_key] = {"accuracy": float(acc), "target": target_col, "labels": list(le.classes_)}
    
    print("\n[4/4] Saving report...")
    report = {
        "pipeline_step": "47",
        "status": "PASS",
        "markets": results,
        "feature_count": len(feature_cols),
        "features": feature_cols,
        "population": len(df)
    }
    with open(os.path.join(REPORTS_DIR, "market_models_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    
    print("\n"+"="*60)
    print(" STEP 47 COMPLETE: PASS")
    print("="*60)
    for k,v in results.items():
        print(f"🎯 {k}: {v['accuracy']*100:.2f}%")
    print("="*60)

if __name__=="__main__":
    run()
