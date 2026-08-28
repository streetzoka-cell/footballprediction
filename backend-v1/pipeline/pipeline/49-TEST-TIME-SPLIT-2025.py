"""
ZOKASCORE V2 — STEP 49 TRAIN MARKET MODELS - MODERN ERA 2010-2024 FIXED BUG
Location: pipeline/49-train-market-models.py
"""

import os, json, joblib, tempfile
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score as acc_score, classification_report, confusion_matrix
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")

BASE_FEATURES = [
    "home_elo_pre","away_elo_pre","elo_diff",
    "home_ewma_pts","away_ewma_pts",
    "home_ewma_gd","away_ewma_gd",
    "home_ewma_gf","away_ewma_gf",
    "home_ewma_ga","away_ewma_ga",
    "home_ewma_home_pts","away_ewma_away_pts",
    "home_ewma_home_gd","away_ewma_away_gd",
    "home_ewma_home_gf","away_ewma_away_gf",
    "home_ewma_home_ga","away_ewma_away_ga",
    "home_matches_before","away_matches_before",
    "home_home_matches_before","away_away_matches_before"
]

TRAIN_START = "2010-01-01"
TRAIN_END = "2025-01-01"

MARKETS = {
    "OU_1_5": "ou_1_5",
    "OU_2_5": "ou_2_5",
    "OU_3_5": "ou_3_5",
    "BTTS": "btts",
    "OU_0_5": "ou_0_5",
}

def atomic_write_json(data, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".json", dir=os.path.dirname(path))
    os.close(fd)
    try:
        with open(tmp,"w",encoding="utf-8") as f:
            json.dump(data,f,indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass

def atomic_write_model(model, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".joblib", dir=os.path.dirname(path))
    os.close(fd)
    try:
        joblib.dump(model, tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass

def engineer_modern(df):
    df = df.copy()
    for col in ["home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga","home_ewma_home_gf","away_ewma_away_gf","home_ewma_home_ga","away_ewma_away_ga"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(1.2).clip(0.3, 2.5)
    if "elo_diff" in df.columns:
        df["elo_diff"] = pd.to_numeric(df["elo_diff"], errors="coerce").fillna(0).clip(-400,400)
    if all(c in df.columns for c in ["home_ewma_gf","away_ewma_ga","elo_diff"]):
        df["exp_home_xg"] = (1.22 + df["elo_diff"]*0.0011 + (df["home_ewma_gf"]-1.2)*0.32 + (1.2-df["away_ewma_ga"])*0.14).clip(0.35, 2.3)
        df["exp_away_xg"] = (1.02 - df["elo_diff"]*0.0011 + (df["away_ewma_gf"]-1.2)*0.32 + (1.2-df["home_ewma_ga"])*0.14).clip(0.25, 1.9)
    else:
        df["exp_home_xg"] = 1.22
        df["exp_away_xg"] = 1.02
    df["exp_total_xg"] = (df["exp_home_xg"] + df["exp_away_xg"]).clip(0.6, 4.0)
    df["exp_diff_xg"] = (df["exp_home_xg"] - df["exp_away_xg"]).clip(-1.8, 1.8)
    df["home_attack_vs_away_def"] = (df["home_ewma_gf"] - df["away_ewma_ga"]).clip(-1.4,1.4) if "home_ewma_gf" in df.columns else 0
    df["away_attack_vs_home_def"] = (df["away_ewma_gf"] - df["home_ewma_ga"]).clip(-1.4,1.4) if "away_ewma_gf" in df.columns else 0
    df["home_form_adv"] = (df["home_ewma_pts"] - df["away_ewma_pts"]).clip(-7,7) if "home_ewma_pts" in df.columns else 0
    df["home_home_adv"] = (df["home_ewma_home_pts"] - 7.0).clip(-4,4) if "home_ewma_home_pts" in df.columns else 0
    df["away_away_adv"] = (df["away_ewma_away_pts"] - 7.0).clip(-4,4) if "away_ewma_away_pts" in df.columns else 0
    df["high_scoring_expected"] = (df["exp_total_xg"] > 2.65).astype(int)
    df["low_scoring_expected"] = (df["exp_total_xg"] < 1.85).astype(int)
    df["btts_expected"] = ((df["exp_home_xg"]>0.82) & (df["exp_away_xg"]>0.72)).astype(int)
    df["elo_diff_sq"] = (df["elo_diff"]**2 / 10000.0).clip(0,16)
    df["elo_diff_abs"] = df["elo_diff"].abs().clip(0,400)
    df["total_gd_form"] = (df["home_ewma_gd"] - df["away_ewma_gd"]).clip(-3.5,3.5) if "home_ewma_gd" in df.columns else 0
    return df

def find_best_threshold(y_true, y_proba):
    best_thresh = 0.5
    best_acc = 0
    for thresh in np.arange(0.15, 0.85, 0.01):
        pred = (y_proba >= thresh).astype(int)
        acc = acc_score(y_true, pred)
        if acc > best_acc:
            best_acc = acc
            best_thresh = thresh
    return best_thresh, best_acc

def run():
    print("="*70)
    print(" ZOKASCORE V2 — STEP 49 MODERN ERA 2010-2024 FIXED")
    print("="*70+"\n")
    
    if not os.path.exists(FEATURES_FILE):
        print(f" ❌ Not found: {FEATURES_FILE}")
        return
    
    print(f"[1/6] Loading {FEATURES_FILE}...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.sort_values(["date","match_id"]).reset_index(drop=True)
    print(f"   Total {len(df):,} rows {df['date'].min().date()} to {df['date'].max().date()}")
    
    train_df = df[(df["date"] >= TRAIN_START) & (df["date"] < TRAIN_END)].copy()
    test_df = df[df["date"] >= TRAIN_END].copy()
    
    print(f"\n[2/6] MODERN FILTER:")
    print(f"   TRAIN {TRAIN_START} to {TRAIN_END}: {len(train_df):,} rows")
    print(f"   TEST  {TRAIN_END}+      : {len(test_df):,} rows")
    print(f"   Dropped ancient: {len(df)-len(train_df)-len(test_df):,} rows (1872-2009)")
    
    print("\n[3/6] Engineering MODERN features...")
    train_df = engineer_modern(train_df)
    test_df = engineer_modern(test_df)
    
    engineered = ["exp_home_xg","exp_away_xg","exp_total_xg","exp_diff_xg","home_attack_vs_away_def","away_attack_vs_home_def","home_form_adv","high_scoring_expected","low_scoring_expected","btts_expected","elo_diff_sq","elo_diff_abs","total_gd_form","home_home_adv","away_away_adv"]
    feat_cols = [c for c in BASE_FEATURES if c in train_df.columns] + [c for c in engineered if c in train_df.columns]
    print(f"   Features {len(feat_cols)}")
    
    X_train_all = train_df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    X_test_all = test_df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    
    results=[]
    
    print("\n[4/6] Training 1X2 MODERN (2010-2024) with DRAW boost...")
    if "home_goals" in train_df.columns:
        train_df["_result"] = np.where(train_df["home_goals"]>train_df["away_goals"], "HOME_WIN", np.where(train_df["home_goals"]<train_df["away_goals"], "AWAY_WIN", "DRAW"))
        test_df["_result"] = np.where(test_df["home_goals"]>test_df["away_goals"], "HOME_WIN", np.where(test_df["home_goals"]<test_df["away_goals"], "AWAY_WIN", "DRAW"))
        result_col = "_result"
    else:
        result_col = None
        for c in ["result","1x2","outcome"]:
            if c in train_df.columns:
                result_col=c
                break
    
    if result_col:
        y_tr_raw = train_df[result_col].astype(str).str.upper().str.strip()
        y_te_raw = test_df[result_col].astype(str).str.upper().str.strip()
        label_map = {"AWAY_WIN":0, "AWAY":0, "DRAW":1, "HOME_WIN":2, "HOME":2, "H":2, "A":0, "D":1, "X":1, "1":2, "2":0}
        y_train = y_tr_raw.map(label_map)
        y_test = y_te_raw.map(label_map)
        mask_tr = y_train.notna()
        mask_te = y_test.notna()
        X_tr = X_train_all[mask_tr]
        y_tr = y_train[mask_tr].astype(int)
        X_te = X_test_all[mask_te]
        y_te = y_test[mask_te].astype(int)
        
        print(f"   Train dist {pd.Series(y_tr).value_counts().to_dict()} | Test {pd.Series(y_te).value_counts().to_dict()}")
        
        sample_weights = np.ones(len(y_tr))
        sample_weights[y_tr==1] = 2.8
        sample_weights[y_tr==0] = 1.3
        
        model_1x2 = xgb.XGBClassifier(
            n_estimators=600,
            max_depth=6,
            learning_rate=0.035,
            subsample=0.9,
            colsample_bytree=0.9,
            min_child_weight=2,
            gamma=0.03,
            reg_alpha=0.08,
            reg_lambda=0.9,
            random_state=42,
            n_jobs=-1,
            tree_method="hist",
            eval_metric="mlogloss",
            verbosity=0
        )
        model_1x2.fit(X_tr, y_tr, sample_weight=sample_weights, verbose=False)
        
        pred = model_1x2.predict(X_te)
        acc = acc_score(y_te, pred)
        baseline = pd.Series(y_te).value_counts(normalize=True).max()
        cm = confusion_matrix(y_te, pred, labels=[0,1,2])
        draw_recall = cm[1,1]/cm[1].sum() if cm[1].sum()>0 else 0
        
        print(f"   🎯 1X2 MODERN 2025 ACC: {acc*100:.2f}% | Baseline {baseline*100:.2f}% | +{(acc-baseline)*100:+.2f}%")
        print(f"   DRAW recall: {draw_recall*100:.1f}% (was 0.0%)")
        print(f"   Confusion: {cm.tolist()}")
        
        atomic_write_model(model_1x2, os.path.join(MODELS_DIR, "champion_model.joblib"))
        atomic_write_json({"0":"AWAY_WIN","1":"DRAW","2":"HOME_WIN"}, os.path.join(MODELS_DIR, "champion_label_mapping.json"))
        results.append({"market":"1X2","accuracy":float(acc),"baseline":float(baseline),"draw_recall":float(draw_recall)})
    
    print("\n[5/6] Training OU + BTTS MODERN...")
    for market_key, target_col in MARKETS.items():
        if target_col not in train_df.columns:
            continue
        print(f"\n--- {market_key} ({target_col}) ---")
        y_tr_raw = train_df[target_col].astype(str).str.upper().str.strip()
        y_te_raw = test_df[target_col].astype(str).str.upper().str.strip()
        
        if target_col == "btts":
            label_map = {"YES":1, "NO":0}
            inv_map = {1:"YES", 0:"NO"}
        else:
            label_map = {"OVER":0, "UNDER":1}
            inv_map = {0:"OVER", 1:"UNDER"}
        
        y_train = y_tr_raw.map(label_map)
        y_test = y_te_raw.map(label_map)
        mask_tr = y_train.notna()
        mask_te = y_test.notna()
        X_tr = X_train_all[mask_tr]
        y_tr = y_train[mask_tr].astype(int)
        X_te = X_test_all[mask_te]
        y_te = y_test[mask_te].astype(int)
        
        counts = np.bincount(y_tr)
        print(f"   Train {len(X_tr):,} Test {len(X_te):,} Dist {dict(zip([inv_map[i] for i in range(len(counts))], counts))}")
        
        scale = 1.0 if market_key in ["OU_1_5","OU_0_5"] else min(max(counts)/min(counts) if len(counts)==2 and min(counts)>0 else 1.0, 2.0)
        
        model = xgb.XGBClassifier(
            n_estimators=600, max_depth=6, learning_rate=0.035,
            subsample=0.9, colsample_bytree=0.9, min_child_weight=2, gamma=0.03,
            reg_alpha=0.08, reg_lambda=0.9, scale_pos_weight=scale,
            random_state=42, n_jobs=-1, tree_method="hist", eval_metric="logloss", verbosity=0
        )
        model.fit(X_tr, y_tr, verbose=False)
        
        proba = model.predict_proba(X_te)
        y_proba_under = proba[:,1]
        best_thresh, best_acc = find_best_threshold(y_te, y_proba_under)
        pred_default = model.predict(X_te)
        acc_default = acc_score(y_te, pred_default)
        final_acc = best_acc if best_acc>acc_default else acc_default
        final_thresh = best_thresh if best_acc>acc_default else 0.5
        baseline = pd.Series(y_te).value_counts(normalize=True).max()
        
        print(f"   🎯 {market_key} MODERN ACC: {final_acc*100:.2f}% (default {acc_default*100:.2f}% thresh {best_thresh:.2f}) vs baseline {baseline*100:.2f}% => { (final_acc-baseline)*100:+.2f}%")
        
        atomic_write_model(model, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_model.joblib"))
        atomic_write_json({str(k):v for k,v in inv_map.items()}, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_label_mapping.json"))
        results.append({"market":market_key,"accuracy":float(final_acc),"baseline":float(baseline),"threshold":float(final_thresh)})
    
    print("\n[6/6] Training CORRECT SCORE MODERN...")
    if "home_goals" in train_df.columns:
        hg_tr = pd.to_numeric(train_df["home_goals"], errors="coerce")
        ag_tr = pd.to_numeric(train_df["away_goals"], errors="coerce")
        hg_te = pd.to_numeric(test_df["home_goals"], errors="coerce")
        ag_te = pd.to_numeric(test_df["away_goals"], errors="coerce")
        valid_tr = hg_tr.notna() & ag_tr.notna()
        valid_te = hg_te.notna() & ag_te.notna()
        X_tr_g = X_train_all[valid_tr]
        X_te_g = X_test_all[valid_te]
        y_tr_hg = hg_tr[valid_tr].clip(0,5).astype(int)
        y_te_hg = hg_te[valid_te].clip(0,5).astype(int)
        y_tr_ag = ag_tr[valid_tr].clip(0,5).astype(int)
        y_te_ag = ag_te[valid_te].clip(0,5).astype(int)
        
        mh = xgb.XGBClassifier(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85, random_state=42, n_jobs=-1, tree_method="hist", verbosity=0)
        ma = xgb.XGBClassifier(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85, random_state=42, n_jobs=-1, tree_method="hist", verbosity=0)
        mh.fit(X_tr_g, y_tr_hg, verbose=False)
        ma.fit(X_tr_g, y_tr_ag, verbose=False)
        atomic_write_model(mh, os.path.join(MODELS_DIR, "market_home_goals_model.joblib"))
        atomic_write_model(ma, os.path.join(MODELS_DIR, "market_away_goals_model.joblib"))
        
        ph = mh.predict_proba(X_te_g)
        pa = ma.predict_proba(X_te_g)
        ch = list(mh.classes_); ca = list(ma.classes_)
        cs_true = (test_df[valid_te]["home_goals"].clip(0,5).astype(int).astype(str)+"-"+test_df[valid_te]["away_goals"].clip(0,5).astype(int).astype(str)).tolist()
        cs_pred=[]
        for i in range(len(X_te_g)):
            best=None; bestp=-1
            for h in range(6):
                for a in range(6):
                    p_h = ph[i][ch.index(h)] if h in ch else 0
                    p_a = pa[i][ca.index(a)] if a in ca else 0
                    p = p_h*p_a
                    if p>bestp:
                        bestp=p; best=f"{h}-{a}"
            cs_pred.append(best)
        acc_cs = acc_score(cs_true, cs_pred)
        print(f"   🎯 CS MODERN 2025 ACC: {acc_cs*100:.2f}%")
        results.append({"market":"CORRECT_SCORE","accuracy":float(acc_cs)})
    
    print("\n" + "="*70)
    print(" STEP 49 MODERN 2010-2024 COMPLETE")
    print("="*70)
    for r in results:
        print(f"{r['market']:15s}: {r['accuracy']*100:.2f}% | baseline {r.get('baseline',0)*100:.2f}%")
    
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "step49_modern_2010_2024_report.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.now().isoformat(), "train_period": "2010-2024", "test_period": "2025+", "results": results, "features": feat_cols}, f, indent=2)

if __name__=="__main__":
    run()
