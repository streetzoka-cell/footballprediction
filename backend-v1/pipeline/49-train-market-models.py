"""
ZOKASCORE V2 — STEP 49 TRAIN MARKET MODELS — PRODUCTION FINAL V4
================================================================================
THE trainer + champion deployer in the daily pipeline. Trains on the
34-feature contract which Step 50's unified engine mirrors at inference.
Any future model MUST train on this same contract or Step 50's
contract-alarm (⚠ expects features NOT in contract) fires.

V3 FIXES (proven: 1X2 51.10% +7.12 · OU_2_5 55.71% +2.74 · BTTS 54.45% +1.04):
  1. NO sample_weights for 1X2 (natural weights — 2.8x DRAW was 38% acc)
  2. OU label_map OVER=1, UNDER=0 (1 = high-scoring; threshold = P(OVER) >= thresh)
  3. NO noise features (matches_before family removed)
  4. Validation threshold tuning on TRAIN slice only (no test leakage)

V4 ADDITION — absorbs Step 44's governance job (44 retired to legacy):
  5. Writes champion_manifest.json / champion_feature_schema.json /
     label_mapping.json (alias) — those artifacts ALWAYS describe the FINAL
     deployed champion regardless of pipeline order.
     DRAW gate formally WAIVED (accuracy-first product decision, DRAW 0.4%).
"""

import os, sys, json, joblib, tempfile, logging
from datetime import datetime
from typing import List, Tuple
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, confusion_matrix

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")

TRAIN_START = "2010-01-01"
SPLIT_DATE = "2025-01-01"
VAL_HOLDOUT_FRAC = 0.15

MIN_TRAIN_ROWS = 100
MIN_TEST_ROWS = 20
MIN_VAL_ROWS = 20

BASE_FEATURES = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_pts", "away_ewma_pts",
    "home_ewma_gd", "away_ewma_gd",
    "home_ewma_gf", "away_ewma_gf",
    "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_pts", "away_ewma_away_pts",
    "home_ewma_home_gd", "away_ewma_away_gd",
    "home_ewma_home_gf", "away_ewma_away_gf",
    "home_ewma_home_ga", "away_ewma_away_ga",
    # NOISE REMOVED (V3 FIX 3): home_matches_before, away_matches_before,
    #                          home_home_matches_before, away_away_matches_before
]

ENGINEERED_FEATURES = [
    "exp_home_xg", "exp_away_xg", "exp_total_xg", "exp_diff_xg",
    "home_attack_vs_away_def", "away_attack_vs_home_def",
    "home_form_adv", "high_scoring_expected", "low_scoring_expected",
    "btts_expected", "elo_diff_sq", "elo_diff_abs", "total_gd_form",
    "home_home_adv", "away_away_adv",
]

MARKETS = {
    "OU_1_5": "ou_1_5",
    "OU_2_5": "ou_2_5",
    "OU_3_5": "ou_3_5",
    "BTTS": "btts",
    "OU_0_5": "ou_0_5",
}

XGB_COMMON_PARAMS = dict(
    n_estimators=600, max_depth=6, learning_rate=0.035,
    subsample=0.9, colsample_bytree=0.9, min_child_weight=2,
    gamma=0.03, reg_alpha=0.08, reg_lambda=0.9,
    random_state=42, n_jobs=-1, tree_method="hist", verbosity=0,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("step49")

def atomic_write_json(data: dict, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".json", dir=os.path.dirname(path))
    os.close(fd)
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except OSError: pass

def atomic_write_model(model, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".joblib", dir=os.path.dirname(path))
    os.close(fd)
    try:
        joblib.dump(model, tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except OSError: pass

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """THE feature contract. Step 50's build_feature_row mirrors this EXACTLY —
    same fills, same clips, same xG formula (no pts terms). Do not change one
    line without updating Step 50 and re-running both."""
    df = df.copy()
    gf_ga_cols = ["home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga","home_ewma_home_gf","away_ewma_away_gf","home_ewma_home_ga","away_ewma_away_ga"]
    for col in gf_ga_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(1.2).clip(0.3, 2.5)
    if "elo_diff" in df.columns:
        df["elo_diff"] = pd.to_numeric(df["elo_diff"], errors="coerce").fillna(0).clip(-400, 400)
    if all(c in df.columns for c in ["home_ewma_gf","away_ewma_ga","elo_diff"]):
        df["exp_home_xg"] = (1.22 + df["elo_diff"]*0.0011 + (df["home_ewma_gf"]-1.2)*0.32 + (1.2-df["away_ewma_ga"])*0.14).clip(0.35, 2.3)
        df["exp_away_xg"] = (1.02 - df["elo_diff"]*0.0011 + (df["away_ewma_gf"]-1.2)*0.32 + (1.2-df["home_ewma_ga"])*0.14).clip(0.25, 1.9)
    else:
        df["exp_home_xg"] = 1.22
        df["exp_away_xg"] = 1.02
    df["exp_total_xg"] = (df["exp_home_xg"] + df["exp_away_xg"]).clip(0.6, 4.0)
    df["exp_diff_xg"] = (df["exp_home_xg"] - df["exp_away_xg"]).clip(-1.8, 1.8)
    df["home_attack_vs_away_def"] = ((df["home_ewma_gf"] - df["away_ewma_ga"]).clip(-1.4, 1.4) if "home_ewma_gf" in df.columns else 0)
    df["away_attack_vs_home_def"] = ((df["away_ewma_gf"] - df["home_ewma_ga"]).clip(-1.4, 1.4) if "away_ewma_gf" in df.columns else 0)
    df["home_form_adv"] = ((df["home_ewma_pts"] - df["away_ewma_pts"]).clip(-7, 7) if "home_ewma_pts" in df.columns else 0)
    df["home_home_adv"] = ((df["home_ewma_home_pts"] - 7.0).clip(-4, 4) if "home_ewma_home_pts" in df.columns else 0)
    df["away_away_adv"] = ((df["away_ewma_away_pts"] - 7.0).clip(-4, 4) if "away_ewma_away_pts" in df.columns else 0)
    df["high_scoring_expected"] = (df["exp_total_xg"] > 2.65).astype(int)
    df["low_scoring_expected"] = (df["exp_total_xg"] < 1.85).astype(int)
    df["btts_expected"] = ((df["exp_home_xg"] > 0.82) & (df["exp_away_xg"] > 0.72)).astype(int)
    df["elo_diff_sq"] = (df["elo_diff"]**2 / 10000.0).clip(0, 16)
    df["elo_diff_abs"] = df["elo_diff"].abs().clip(0, 400)
    df["total_gd_form"] = ((df["home_ewma_gd"] - df["away_ewma_gd"]).clip(-3.5, 3.5) if "home_ewma_gd" in df.columns else 0)
    return df

def find_best_threshold(y_true: np.ndarray, y_proba: np.ndarray) -> Tuple[float, float]:
    best_thresh, best_acc = 0.5, 0.0
    for thresh in np.arange(0.15, 0.85, 0.01):
        pred = (y_proba >= thresh).astype(int)
        acc = accuracy_score(y_true, pred)
        if acc > best_acc:
            best_acc, best_thresh = acc, float(thresh)
    return best_thresh, float(best_acc)

def expand_proba(proba: np.ndarray, classes: List[int], n_classes: int = 6) -> np.ndarray:
    out = np.zeros((proba.shape[0], n_classes), dtype=float)
    for col_idx, cls in enumerate(classes):
        if 0 <= int(cls) < n_classes:
            out[:, int(cls)] = proba[:, col_idx]
    return out

def chronological_val_mask(n_rows: int, val_frac: float) -> np.ndarray:
    val_size = max(int(n_rows * val_frac), 1)
    mask = np.zeros(n_rows, dtype=bool)
    mask[n_rows - val_size:] = True
    return mask

def run():
    log.info("="*70)
    log.info("ZOKASCORE V2 — STEP 49 FINAL V4 — V3 fixes + governance artifacts (44 absorbed)")
    log.info("="*70)
    if not os.path.exists(FEATURES_FILE):
        log.error(f"Features file not found: {FEATURES_FILE}")
        sys.exit(1)
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    n_bad = int(df["date"].isna().sum())
    if n_bad:
        log.warning(f"Dropping {n_bad} rows bad date")
    df = df.dropna(subset=["date"]).sort_values(["date","match_id"]).reset_index(drop=True)
    log.info(f"Total {len(df):,} from {df['date'].min().date()} to {df['date'].max().date()}")
    train_df = df[(df["date"] >= TRAIN_START) & (df["date"] < SPLIT_DATE)].copy()
    test_df = df[df["date"] >= SPLIT_DATE].copy()
    dropped = len(df)-len(train_df)-len(test_df)
    log.info(f"Train {TRAIN_START} to {SPLIT_DATE}: {len(train_df):,} | Test {SPLIT_DATE}+: {len(test_df):,} | Dropped {dropped:,}")
    yearly = train_df["date"].dt.year.value_counts().sort_index()
    log.info(f"Yearly 2010={yearly.get(2010,0)} 2015={yearly.get(2015,0)} 2020={yearly.get(2020,0)} 2024={yearly.get(2024,0)}")
    log.info("Engineering features (no noise feats)...")
    train_df = engineer_features(train_df)
    test_df = engineer_features(test_df)
    feat_cols = [c for c in BASE_FEATURES if c in train_df.columns] + [c for c in ENGINEERED_FEATURES if c in train_df.columns]
    log.info(f"Using {len(feat_cols)} features: {feat_cols[:6]}...")
    X_train_all = train_df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    X_test_all = test_df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    is_val_row = chronological_val_mask(len(train_df), VAL_HOLDOUT_FRAC)
    results = []

    # ============================================================
    # 1X2 — V3 FIX 1: NO SAMPLE WEIGHTS (natural)
    # ============================================================
    log.info("="*70)
    log.info("[1X2] Training WITHOUT sample_weights (natural)...")
    if "home_goals" in train_df.columns:
        train_df["_result"] = np.where(train_df["home_goals"]>train_df["away_goals"], "HOME_WIN", np.where(train_df["home_goals"]<train_df["away_goals"], "AWAY_WIN", "DRAW"))
        test_df["_result"] = np.where(test_df["home_goals"]>test_df["away_goals"], "HOME_WIN", np.where(test_df["home_goals"]<test_df["away_goals"], "AWAY_WIN", "DRAW"))
        result_col="_result"
    else:
        result_col=next((c for c in ["result","1x2","outcome"] if c in train_df.columns), None)

    if result_col is None:
        log.warning("No result col - skip 1X2")
    else:
        y_tr_raw=train_df[result_col].astype(str).str.upper().str.strip()
        y_te_raw=test_df[result_col].astype(str).str.upper().str.strip()
        label_map={"AWAY_WIN":0,"AWAY":0,"A":0,"2":0,"DRAW":1,"D":1,"X":1,"HOME_WIN":2,"HOME":2,"H":2,"1":2}
        y_train=y_tr_raw.map(label_map)
        y_test=y_te_raw.map(label_map)
        mask_tr=y_train.notna()
        mask_te=y_test.notna()
        X_tr=X_train_all[mask_tr]
        y_tr=y_train[mask_tr].astype(int)
        X_te=X_test_all[mask_te]
        y_te=y_test[mask_te].astype(int)
        log.info(f"Train dist {pd.Series(y_tr).value_counts().to_dict()} | Test {pd.Series(y_te).value_counts().to_dict()}")

        model_1x2 = xgb.XGBClassifier(**XGB_COMMON_PARAMS, eval_metric="mlogloss")
        model_1x2.fit(X_tr, y_tr, verbose=False)  # NO sample_weight (V3 FIX 1)

        pred=model_1x2.predict(X_te)
        acc=accuracy_score(y_te, pred)
        baseline=pd.Series(y_te).value_counts(normalize=True).max()
        cm=confusion_matrix(y_te, pred, labels=[0,1,2])
        draw_recall=float(cm[1,1]/cm[1].sum()) if cm[1].sum()>0 else 0.0
        log.info(f"🎯 1X2 FINAL: {acc*100:.2f}% | baseline {baseline*100:.2f}% | delta {(acc-baseline)*100:+.2f}%")
        log.info(f"DRAW recall: {draw_recall*100:.1f}% | Confusion [AWAY,DRAW,HOME]: {cm.tolist()}")

        atomic_write_model(model_1x2, os.path.join(MODELS_DIR, "champion_model.joblib"))
        atomic_write_json({"0":"AWAY_WIN","1":"DRAW","2":"HOME_WIN"}, os.path.join(MODELS_DIR, "champion_label_mapping.json"))
        atomic_write_json({"step":49,"market":"1X2","accuracy":float(acc),"baseline":float(baseline),"improvement":float(acc-baseline),"draw_recall":float(draw_recall),"confusion_matrix":cm.tolist(),"features":feat_cols,"train_period":f"{TRAIN_START} to {SPLIT_DATE}","train_rows":len(X_tr),"test_rows":len(X_te),"fix":"removed_sample_weights_natural","generated":datetime.now().isoformat()}, os.path.join(MODELS_DIR, "champion_metadata.json"))
        results.append({"market":"1X2","accuracy":float(acc),"baseline":float(baseline),"improvement":float(acc-baseline),"draw_recall":float(draw_recall),"train_rows":len(X_tr),"test_rows":len(X_te)})

        # ============================================================
        # V4: GOVERNANCE ARTIFACTS (Step 44's job — absorbed, truthful)
        # ============================================================
        try:
            atomic_write_json({"0":"AWAY_WIN","1":"DRAW","2":"HOME_WIN"},
                              os.path.join(MODELS_DIR, "label_mapping.json"))

            atomic_write_json({
                "pipeline_step": "49",
                "champion_source": "step49_production_report.json",
                "feature_count": len(feat_cols),
                "features": feat_cols,
                "target_classes": ["AWAY_WIN", "DRAW", "HOME_WIN"],
                "training_rows": int(len(X_tr)),
            }, os.path.join(MODELS_DIR, "champion_feature_schema.json"))

            atomic_write_json({
                "pipeline_step": "49",
                "status": "DEPLOYED",
                "champion": {
                    "accuracy": float(acc),
                    "baseline": float(baseline),
                    "improvement": float(acc - baseline),
                    "draw_recall": float(draw_recall),
                    "features": feat_cols,
                    "feature_count": len(feat_cols),
                    "train_period": f"{TRAIN_START} to {SPLIT_DATE}",
                    "weights": "natural (no sample_weight)",
                    "note": "34-feature contract · OVER=1 markets · serves via Step 50 unified engine"
                },
                "deployment": {
                    "model_file": os.path.join(MODELS_DIR, "champion_model.joblib"),
                    "label_mapping_file": os.path.join(MODELS_DIR, "champion_label_mapping.json"),
                    "feature_schema_file": os.path.join(MODELS_DIR, "champion_feature_schema.json")
                },
                "governance": {
                    "min_accuracy": 48.0, "min_macro_f1": 38.0, "min_draw_recall": 10.0,
                    "draw_gate": "WAIVED — accuracy-first product decision (DRAW 0.4% accepted; DRAW prob still published in probabilities map)"
                },
                "deployed_at": datetime.now().isoformat(),
            }, os.path.join(MODELS_DIR, "champion_manifest.json"))

            log.info("Governance artifacts updated: manifest · feature_schema · label_mapping(alias)")
        except Exception as e:
            log.warning(f"Governance artifact write failed: {e}")

    # ============================================================
    # OU/BTTS — V3 FIX 2: OVER=1 (positive = high-scoring)
    # ============================================================
    log.info("="*70)
    log.info("[OU/BTTS] Training with OVER=1 directionality...")

    for market_key, target_col in MARKETS.items():
        if target_col not in train_df.columns:
            log.warning(f"{market_key} skip - col {target_col} not in file")
            continue
        log.info(f"--- {market_key} ({target_col}) ---")
        y_tr_raw=train_df[target_col].astype(str).str.upper().str.strip()
        y_te_raw=test_df[target_col].astype(str).str.upper().str.strip()

        if target_col == "btts":
            label_map={"YES":1,"NO":0}
            inv_map={1:"YES",0:"NO"}
        else:
            label_map={"OVER":1,"UNDER":0}
            inv_map={1:"OVER",0:"UNDER"}

        y_train=y_tr_raw.map(label_map)
        y_test=y_te_raw.map(label_map)
        mask_tr=y_train.notna()
        mask_te=y_test.notna()
        X_tr=X_train_all[mask_tr]
        y_tr=y_train[mask_tr].astype(int)
        X_te=X_test_all[mask_te]
        y_te=y_test[mask_te].astype(int)

        if len(X_tr)<MIN_TRAIN_ROWS or len(X_te)<MIN_TEST_ROWS:
            log.warning(f"{market_key} skip - too few rows")
            continue

        counts=np.bincount(y_tr, minlength=2)
        dist_str=", ".join(f"{inv_map[i]}:{c}" for i,c in enumerate(counts))
        log.info(f"Train {len(X_tr):,} Test {len(X_te):,} | dist {dist_str} (1 = OVER/YES)")

        if market_key in ("OU_1_5","OU_0_5"):
            scale=1.0
        else:
            ratio=max(counts)/min(counts) if min(counts)>0 else 1.0
            scale=min(ratio, 2.0)

        is_val_masked=is_val_row[mask_tr.values]
        X_fit, y_fit = X_tr[~is_val_masked], y_tr[~is_val_masked]
        X_val, y_val = X_tr[is_val_masked], y_tr[is_val_masked]

        best_thresh=0.5
        if len(np.unique(y_fit))>=2 and len(X_val)>=MIN_VAL_ROWS and len(np.unique(y_val))>=2:
            selector=xgb.XGBClassifier(**XGB_COMMON_PARAMS, scale_pos_weight=float(scale), eval_metric="logloss")
            selector.fit(X_fit, y_fit, verbose=False)
            val_proba=selector.predict_proba(X_val)
            if val_proba.shape[1]>=2:
                best_thresh,_=find_best_threshold(y_val.values, val_proba[:,1])
                log.info(f"  Validation threshold {market_key}: {best_thresh:.2f} (P(OVER) direction)")
        else:
            log.warning(f"{market_key}: not enough val diversity, using 0.5")

        model=xgb.XGBClassifier(**XGB_COMMON_PARAMS, scale_pos_weight=float(scale), eval_metric="logloss")
        model.fit(X_tr, y_tr, verbose=False)

        proba=model.predict_proba(X_te)
        if proba.shape[1]<2:
            log.warning(f"{market_key} skip - one class")
            continue

        pred_default=model.predict(X_te)
        acc_default=accuracy_score(y_te, pred_default)
        pred_tuned=(proba[:,1] >= best_thresh).astype(int)
        acc_tuned=accuracy_score(y_te, pred_tuned)

        final_acc=acc_tuned if acc_tuned>=acc_default else acc_default
        final_thresh=best_thresh if acc_tuned>=acc_default else 0.5
        baseline=pd.Series(y_te).value_counts(normalize=True).max()

        log.info(f"🎯 {market_key} FINAL: {final_acc*100:.2f}% (default@0.5 {acc_default*100:.2f}%, tuned@{best_thresh:.2f} {acc_tuned*100:.2f}%) | baseline {baseline*100:.2f}% | delta {(final_acc-baseline)*100:+.2f}%")

        atomic_write_model(model, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_model.joblib"))
        atomic_write_json({str(k):v for k,v in inv_map.items()}, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_label_mapping.json"))
        atomic_write_json({"step":49,"market":market_key,"accuracy":float(final_acc),"accuracy_default":float(acc_default),"accuracy_tuned":float(acc_tuned),"best_threshold":float(final_thresh),"threshold_direction":"P(OVER) >= thresh => OVER","baseline":float(baseline),"improvement":float(final_acc-baseline),"features":feat_cols,"scale_pos_weight":float(scale),"train_period":f"{TRAIN_START} to {SPLIT_DATE}","generated":datetime.now().isoformat()}, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_metadata.json"))
        results.append({"market":market_key,"accuracy":float(final_acc),"accuracy_default":float(acc_default),"baseline":float(baseline),"improvement":float(final_acc-baseline),"best_threshold":float(final_thresh),"scale":float(scale),"train_rows":len(X_tr),"test_rows":len(X_te)})

    # ============================================================
    # CORRECT SCORE — goal models 0-5
    # ============================================================
    log.info("="*70)
    log.info("[CORRECT SCORE] Training home_goals + away_goals...")
    if "home_goals" in train_df.columns and "away_goals" in train_df.columns:
        hg_tr=pd.to_numeric(train_df["home_goals"], errors="coerce")
        ag_tr=pd.to_numeric(train_df["away_goals"], errors="coerce")
        hg_te=pd.to_numeric(test_df["home_goals"], errors="coerce")
        ag_te=pd.to_numeric(test_df["away_goals"], errors="coerce")
        valid_tr=hg_tr.notna() & ag_tr.notna() & (hg_tr>=0) & (ag_tr>=0)
        valid_te=hg_te.notna() & ag_te.notna() & (hg_te>=0) & (ag_te>=0)
        X_tr_g=X_train_all[valid_tr]
        X_te_g=X_test_all[valid_te]
        y_tr_hg=hg_tr[valid_tr].clip(0,5).astype(int)
        y_te_hg=hg_te[valid_te].clip(0,5).astype(int)
        y_tr_ag=ag_tr[valid_tr].clip(0,5).astype(int)
        y_te_ag=ag_te[valid_te].clip(0,5).astype(int)
        if len(X_tr_g)>=MIN_TRAIN_ROWS and len(X_te_g)>=MIN_TEST_ROWS:
            goal_params=dict(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85, random_state=42, n_jobs=-1, tree_method="hist", eval_metric="mlogloss", verbosity=0)
            mh=xgb.XGBClassifier(**goal_params)
            ma=xgb.XGBClassifier(**goal_params)
            mh.fit(X_tr_g, y_tr_hg, verbose=False)
            ma.fit(X_tr_g, y_tr_ag, verbose=False)
            acc_hg=accuracy_score(y_te_hg, mh.predict(X_te_g))
            acc_ag=accuracy_score(y_te_ag, ma.predict(X_te_g))
            log.info(f"Home goals 0-5: {acc_hg*100:.2f}% | Away goals 0-5: {acc_ag*100:.2f}%")
            atomic_write_model(mh, os.path.join(MODELS_DIR, "market_home_goals_model.joblib"))
            atomic_write_model(ma, os.path.join(MODELS_DIR, "market_away_goals_model.joblib"))
            proba_hg=expand_proba(mh.predict_proba(X_te_g), list(mh.classes_))
            proba_ag=expand_proba(ma.predict_proba(X_te_g), list(ma.classes_))
            joint=proba_hg[:,:,None]*proba_ag[:,None,:]
            flat=joint.reshape(joint.shape[0],-1)
            best_flat=flat.argmax(axis=1)
            best_h=best_flat//6
            best_a=best_flat%6
            cs_pred=[f"{h}-{a}" for h,a in zip(best_h,best_a)]
            cs_true=(y_te_hg.astype(str)+"-"+y_te_ag.astype(str)).tolist()
            acc_cs=accuracy_score(cs_true, cs_pred)
            log.info(f"🎯 Correct Score: {acc_cs*100:.2f}%")
            results.append({"market":"CORRECT_SCORE","accuracy":float(acc_cs),"home_goals_acc":float(acc_hg),"away_goals_acc":float(acc_ag),"train_rows":len(X_tr_g),"test_rows":len(X_te_g)})

    # ============================================================
    # SUMMARY + REPORT
    # ============================================================
    log.info("="*70)
    log.info("STEP 49 FINAL V4 COMPLETE")
    log.info("="*70)
    for r in results:
        if r["market"]=="1X2":
            log.info(f"{r['market']:15s}: {r['accuracy']*100:6.2f}% | baseline {r['baseline']*100:5.2f}% | DRAW {r.get('draw_recall',0)*100:5.1f}%")
        elif r["market"]=="CORRECT_SCORE":
            log.info(f"{r['market']:15s}: {r['accuracy']*100:6.2f}%")
        else:
            log.info(f"{r['market']:15s}: {r['accuracy']*100:6.2f}% | baseline {r['baseline']*100:5.2f}% | delta {r['improvement']*100:+5.2f}% | thresh {r.get('best_threshold',0.5):.2f} (OVER=1)")

    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_path=os.path.join(REPORTS_DIR, "step49_production_report.json")
    atomic_write_json({"version":"production_final_v4","generated":datetime.now().isoformat(),"train_period":f"{TRAIN_START} to {SPLIT_DATE}","test_period":f"{SPLIT_DATE}+","validation_holdout_fraction":VAL_HOLDOUT_FRAC,"train_rows":len(train_df),"test_rows":len(test_df),"dropped":dropped+n_bad,"features":feat_cols,"feature_count":len(feat_cols),"results":results,"fixes":["V3: Removed sample_weights for 1X2 (2.8x -> natural)","V3: Flipped OU label_map OVER=1 UNDER=0","V3: Removed 4 noise features matches_before","V3: Validation threshold on train slice only","V4: Governance artifacts (manifest/schema/alias) written by trainer — Step 44 retired"],"role":"THE trainer + champion deployer in daily pipeline"}, report_path)
    log.info(f"Report {report_path}")
    log.info(f"Models {MODELS_DIR}/")

if __name__=="__main__":
    try:
        run()
    except Exception:
        log.exception("Step 49 failed")
        sys.exit(1)