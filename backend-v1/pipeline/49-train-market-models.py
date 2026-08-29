"""
ZOKASCORE V2 — STEP 49 TRAIN MARKET MODELS — PRODUCTION FINAL V5.1
================================================================================
THE trainer + champion deployer in the daily pipeline.

V5 RETAINED (evaluation integrity — the boundary is law):
  · 2010→2024 = train (last 15% = chronological validation)
  · 2025+     = LOCKED test, used exactly once for honest reporting
  · Thresholds: validation-selected ONLY, frozen before test is touched
  · No test-based tuned-vs-default flips. No test-based model selection.
  · Feature contract verified (34) — hard exit on mismatch
  · Step 49 owns: champion_manifest / champion_feature_schema / label_mapping

V5.1 NEW — 1X2 PROBABILITY CALIBRATION (the draw fix, done honestly):
  · Problem: natural-weight training compresses P(DRAW) far below its true
    base rate (validation: predicted << ~25% actual). Argmax then almost
    never selects DRAW and HOME probs run hot.
  · Fix: multinomial logistic calibration on LOG-probabilities, fitted on the
    VALIDATION slice only, against a fit-slice clone model (out-of-sample for
    the calibration data — the deployed champion itself is never the fitting
    source, and is NOT retrained; the 51.10% anchor is preserved).
  · Ship gate: calibration is ENABLED only if validation log-loss improves.
    Otherwise an explicit disabled artifact is written (no silent risk).
  · Output: champion_calibration.json  ->  Step 50 applies p_cal = softmax(
    W·log(p_raw) + b) to the champion's 1X2 probabilities before picks/UI.
  · Effect: P(DRAW) rises toward its true rate on draw-ish profiles, HOME
    sharpness is honestly tempered, and a UI "Draw risk" (P(DRAW)>=30%)
    signal becomes meaningful — WITHOUT forcing draw picks.

TRANSFER ASSUMPTION (documented): the map is fitted on a fit-slice clone's
validation probabilities and applied to the full-train champion. The DRAW
compression is structural (class imbalance + objective), not fold-specific,
so the correction transfers. Stricter alternative (K-fold OOF calibration)
is a future option if validation deltas disappoint.
"""

import os
import sys
import json
import joblib
import tempfile
import logging
from datetime import datetime
from typing import List, Tuple

import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    balanced_accuracy_score,
    precision_recall_fscore_support,
    log_loss,
)

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
CAL_MIN_VAL_ROWS = 5000   # calibration needs a healthy slice to be trustworthy

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
    # V3: NO matches_before noise features
]
ENGINEERED_FEATURES = [
    "exp_home_xg", "exp_away_xg", "exp_total_xg", "exp_diff_xg",
    "home_attack_vs_away_def", "away_attack_vs_home_def",
    "home_form_adv", "high_scoring_expected", "low_scoring_expected",
    "btts_expected", "elo_diff_sq", "elo_diff_abs", "total_gd_form",
    "home_home_adv", "away_away_adv",
]
EXPECTED_FEATURE_COUNT = len(BASE_FEATURES) + len(ENGINEERED_FEATURES)  # 34

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


# =============================================================================
# ATOMIC WRITERS
# =============================================================================

def atomic_write_json(data: dict, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".json", dir=os.path.dirname(path))
    os.close(fd)
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
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


# =============================================================================
# FEATURE ENGINEERING — THE 34-FEATURE CONTRACT
# Step 50's build_feature_row() must mirror this EXACTLY.
# =============================================================================

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    gf_ga_cols = ["home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga",
                  "home_ewma_home_gf","away_ewma_away_gf","home_ewma_home_ga","away_ewma_away_ga"]
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


# =============================================================================
# VALIDATION THRESHOLD SELECTION (validation ONLY, deterministic tie-break)
# =============================================================================

def find_best_threshold(y_true: np.ndarray, y_proba: np.ndarray) -> Tuple[float, float]:
    best_thresh, best_acc = 0.50, -1.0
    for thresh in np.arange(0.15, 0.851, 0.01):
        thresh = float(round(thresh, 2))
        acc = accuracy_score(y_true, (y_proba >= thresh).astype(int))
        if acc > best_acc:
            best_acc, best_thresh = float(acc), thresh
        elif np.isclose(acc, best_acc, atol=1e-12):
            if abs(thresh - 0.50) < abs(best_thresh - 0.50):
                best_thresh = thresh
    return float(best_thresh), float(best_acc)


def expand_proba(proba: np.ndarray, classes: List[int], n_classes: int = 6) -> np.ndarray:
    out = np.zeros((proba.shape[0], n_classes), dtype=float)
    for col_idx, cls in enumerate(classes):
        if 0 <= int(cls) < n_classes:
            out[:, int(cls)] = proba[:, col_idx]
    return out


def chronological_val_mask(n_rows: int, val_frac: float) -> np.ndarray:
    if n_rows <= 0:
        return np.zeros(0, dtype=bool)
    val_size = max(int(n_rows * val_frac), 1)
    if val_size >= n_rows:
        val_size = max(n_rows - 1, 1)
    mask = np.zeros(n_rows, dtype=bool)
    mask[n_rows - val_size:] = True
    return mask


# =============================================================================
# METRICS
# =============================================================================

def binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1], zero_division=0)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "class_0_precision": float(precision[0]), "class_0_recall": float(recall[0]), "class_0_f1": float(f1[0]),
        "class_1_precision": float(precision[1]), "class_1_recall": float(recall[1]), "class_1_f1": float(f1[1]),
    }


def multiclass_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    labels = [0, 1, 2]
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "away_precision": float(precision[0]), "away_recall": float(recall[0]), "away_f1": float(f1[0]),
        "draw_precision": float(precision[1]), "draw_recall": float(recall[1]), "draw_f1": float(f1[1]),
        "home_precision": float(precision[2]), "home_recall": float(recall[2]), "home_f1": float(f1[2]),
        "support_away": int(support[0]), "support_draw": int(support[1]), "support_home": int(support[2]),
        "confusion_matrix": cm.tolist(),
    }


# =============================================================================
# V5.1 — MULTICAST PROBABILITY CALIBRATION (validation slice ONLY)
# =============================================================================

CLASSES_ORDER = ["AWAY_WIN", "DRAW", "HOME_WIN"]   # int label order 0,1,2


def fit_multiclass_calibration(P: np.ndarray, y: np.ndarray) -> dict:
    """Multiclass logistic regression on LOG-probabilities. Produces a full
    simplex-respecting correction: p_cal = softmax(W @ log(p_raw) + b)."""
    X = np.log(np.clip(P, 1e-12, 1.0))
    clf = LogisticRegression(max_iter=2000, C=1e6)
    clf.fit(X, y)
    return {"W": clf.coef_.tolist(), "b": clf.intercept_.tolist()}


def apply_calibration_matrix(P: np.ndarray, cal: dict) -> np.ndarray:
    W = np.asarray(cal["W"], dtype=float)
    b = np.asarray(cal["b"], dtype=float)
    Z = np.log(np.clip(P, 1e-12, 1.0)) @ W.T + b
    Z -= Z.max(axis=1, keepdims=True)
    E = np.exp(Z)
    return E / E.sum(axis=1, keepdims=True)


def class_probability_diagnostics(P: np.ndarray, y: np.ndarray) -> list:
    out = []
    for c in range(P.shape[1]):
        out.append({
            "class": CLASSES_ORDER[c] if c < len(CLASSES_ORDER) else str(c),
            "mean_predicted": round(float(P[:, c].mean()), 4),
            "actual_frequency": round(float((y == c).mean()), 4),
        })
    return out


def calibrate_1x2(X_tr, y_tr, is_val_masked: np.ndarray) -> dict:
    """
    Fit the 1X2 calibration map on the VALIDATION slice using a fit-slice
    clone model (out-of-sample probabilities for the calibration data).
    The deployed champion is NOT retrained and NOT used as the fitting source.

    SHIP GATE: enabled only if validation log-loss improves.
    """
    result = {
        "enabled": False,
        "reason": "not_attempted",
        "version": "production_final_v5.1",
        "classes": CLASSES_ORDER,   # column order = int labels [0,1,2]
        "fitted_on": "validation_slice (last 15% of 2010-2024, chronological)",
        "source_model": "fit-slice XGB clone (deployed champion NOT retrained)",
        "transfer_note": "structural DRAW compression transfers across folds; K-fold OOF is the stricter future option",
    }

    mask = is_val_masked
    X_fit_c, y_fit_c = X_tr[~mask], y_tr[~mask]
    X_val_c, y_val_c = X_tr[mask], y_tr[mask]

    if len(np.unique(y_fit_c)) < 3:
        result["reason"] = "fit slice missing a class"
        return result
    if len(X_val_c) < max(MIN_VAL_ROWS, CAL_MIN_VAL_ROWS):
        result["reason"] = f"validation slice too small ({len(X_val_c)})"
        return result
    if len(np.unique(y_val_c)) < 3:
        result["reason"] = "validation slice missing a class"
        return result

    log.info("[CALIB] Training fit-slice clone for calibration (validation is OOF for it)...")
    calib_model = xgb.XGBClassifier(**XGB_COMMON_PARAMS, eval_metric="mlogloss")
    calib_model.fit(X_fit_c, y_fit_c, verbose=False)

    P_val_raw = calib_model.predict_proba(X_val_c)
    y_val = y_val_c.values

    pre_ll = float(log_loss(y_val, P_val_raw, labels=[0, 1, 2]))

    cal = fit_multiclass_calibration(P_val_raw, y_val)
    P_val_cal = apply_calibration_matrix(P_val_raw, cal)
    post_ll = float(log_loss(y_val, P_val_cal, labels=[0, 1, 2]))

    diag_pre = class_probability_diagnostics(P_val_raw, y_val)
    diag_post = class_probability_diagnostics(P_val_cal, y_val)

    draw_pre = diag_pre[1]["mean_predicted"]
    draw_post = diag_post[1]["mean_predicted"]
    draw_actual = diag_pre[1]["actual_frequency"]

    enabled = post_ll < pre_ll
    result.update({
        "enabled": bool(enabled),
        "reason": "validation_logloss_improved" if enabled else "validation_logloss_not_improved — identity shipped",
        "W": cal["W"],
        "b": cal["b"],
        "validation": {
            "rows": int(len(X_val_c)),
            "logloss_pre": round(pre_ll, 6),
            "logloss_post": round(post_ll, 6),
            "logloss_delta": round(post_ll - pre_ll, 6),
        },
        "diagnostics_pre": diag_pre,
        "diagnostics_post": diag_post,
        "draw_summary": {
            "mean_predicted_pre": round(draw_pre, 4),
            "mean_predicted_post": round(draw_post, 4),
            "actual_frequency": round(draw_actual, 4),
            "note": "calibration raises P(DRAW) toward the true rate; argmax picks remain honest (no forced draws)",
        },
        "step50_usage": "p_cal = softmax(W @ log(p_raw) + b) on champion probabilities before picks/UI",
        "generated": datetime.now().isoformat(),
    })

    log.info(f"[CALIB] validation log-loss: pre {pre_ll:.6f} -> post {post_ll:.6f} "
             f"({'✅ improved' if enabled else '⛔ NOT improved — disabled'})")
    log.info(f"[CALIB] mean P(DRAW): {draw_pre*100:.1f}% -> {draw_post*100:.1f}% "
             f"(actual {draw_actual*100:.1f}%)")

    return result


# =============================================================================
# MAIN
# =============================================================================

def run():
    log.info("=" * 70)
    log.info("ZOKASCORE V2 — STEP 49 FINAL V5.1 — HONEST VALIDATION + GOVERNANCE + 1X2 CALIBRATION")
    log.info("=" * 70)

    if not os.path.exists(FEATURES_FILE):
        log.error(f"Features file not found: {FEATURES_FILE}")
        sys.exit(1)

    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    n_bad = int(df["date"].isna().sum())
    if n_bad:
        log.warning(f"Dropping {n_bad} rows bad date")
    df = df.dropna(subset=["date"]).sort_values(["date", "match_id"]).reset_index(drop=True)
    log.info(f"Total {len(df):,} from {df['date'].min().date()} to {df['date'].max().date()}")

    train_df = df[(df["date"] >= TRAIN_START) & (df["date"] < SPLIT_DATE)].copy()
    test_df = df[df["date"] >= SPLIT_DATE].copy()
    dropped = len(df) - len(train_df) - len(test_df)
    log.info(f"Train {TRAIN_START} to {SPLIT_DATE}: {len(train_df):,} | Test {SPLIT_DATE}+: {len(test_df):,} | Dropped {dropped:,}")

    if len(train_df) < MIN_TRAIN_ROWS: log.error(f"Insufficient training rows: {len(train_df)}"); sys.exit(1)
    if len(test_df) < MIN_TEST_ROWS: log.error(f"Insufficient test rows: {len(test_df)}"); sys.exit(1)

    yearly = train_df["date"].dt.year.value_counts().sort_index()
    log.info(f"Yearly 2010={yearly.get(2010,0)} 2015={yearly.get(2015,0)} 2020={yearly.get(2020,0)} 2024={yearly.get(2024,0)}")

    log.info("Engineering features (34-feature production contract)...")
    train_df = engineer_features(train_df)
    test_df = engineer_features(test_df)
    feat_cols = [c for c in BASE_FEATURES if c in train_df.columns] + [c for c in ENGINEERED_FEATURES if c in train_df.columns]
    log.info(f"Using {len(feat_cols)} features: {feat_cols[:6]}...")

    if len(feat_cols) != EXPECTED_FEATURE_COUNT:
        log.error(f"FEATURE CONTRACT FAILURE: expected {EXPECTED_FEATURE_COUNT}, found {len(feat_cols)}")
        missing = [c for c in (BASE_FEATURES + ENGINEERED_FEATURES) if c not in feat_cols]
        if missing: log.error(f"Missing features: {missing}")
        sys.exit(1)
    log.info(f"✅ Feature contract verified: {len(feat_cols)} features")

    X_train_all = train_df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)
    X_test_all = test_df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).astype(float)

    is_val_row = chronological_val_mask(len(train_df), VAL_HOLDOUT_FRAC)
    log.info(f"Chronological validation: fit={int((~is_val_row).sum()):,} "
             f"validation={int(is_val_row.sum()):,} ({VAL_HOLDOUT_FRAC:.0%} of training period)")
    log.info("🔒 TEST SET LOCKED: 2025+ is evaluation-only. No threshold/model/calibration selection from test.")

    results = []
    calibration_summary = None

    # =========================================================================
    # 1X2
    # =========================================================================
    log.info("=" * 70)
    log.info("[1X2] Training WITHOUT sample_weights (natural class distribution)...")

    if "home_goals" in train_df.columns and "away_goals" in train_df.columns:
        train_df["_result"] = np.where(train_df["home_goals"] > train_df["away_goals"], "HOME_WIN",
                              np.where(train_df["home_goals"] < train_df["away_goals"], "AWAY_WIN", "DRAW"))
        test_df["_result"] = np.where(test_df["home_goals"] > test_df["away_goals"], "HOME_WIN",
                              np.where(test_df["home_goals"] < test_df["away_goals"], "AWAY_WIN", "DRAW"))
        result_col = "_result"
    else:
        result_col = next((c for c in ["result", "1x2", "outcome"] if c in train_df.columns), None)

    if result_col is None:
        log.warning("No result column - skip 1X2")
    else:
        y_tr_raw = train_df[result_col].astype(str).str.upper().str.strip()
        y_te_raw = test_df[result_col].astype(str).str.upper().str.strip()
        label_map = {"AWAY_WIN": 0, "AWAY": 0, "A": 0, "2": 0,
                     "DRAW": 1, "D": 1, "X": 1,
                     "HOME_WIN": 2, "HOME": 2, "H": 2, "1": 2}
        y_train = y_tr_raw.map(label_map)
        y_test = y_te_raw.map(label_map)
        mask_tr = y_train.notna()
        mask_te = y_test.notna()
        X_tr = X_train_all[mask_tr]
        y_tr = y_train[mask_tr].astype(int)
        X_te = X_test_all[mask_te]
        y_te = y_test[mask_te].astype(int)
        log.info(f"Train dist {pd.Series(y_tr).value_counts().to_dict()} | Test {pd.Series(y_te).value_counts().to_dict()}")

        if len(X_tr) < MIN_TRAIN_ROWS or len(X_te) < MIN_TEST_ROWS:
            log.error("1X2 insufficient data")
            sys.exit(1)

        # ---- FINAL CHAMPION: natural weights, full 2010-2024, no test contact ----
        model_1x2 = xgb.XGBClassifier(**XGB_COMMON_PARAMS, eval_metric="mlogloss")
        model_1x2.fit(X_tr, y_tr, verbose=False)

        pred = model_1x2.predict(X_te)
        metrics_1x2 = multiclass_metrics(y_te.values, pred)
        acc = metrics_1x2["accuracy"]
        baseline = pd.Series(y_te).value_counts(normalize=True).max()

        log.info(f"🎯 1X2 FINAL: {acc*100:.2f}% | baseline {baseline*100:.2f}% | delta {(acc-baseline)*100:+.2f}%")
        log.info(f"1X2 macro-F1: {metrics_1x2['macro_f1']*100:.2f}% | balanced accuracy: {metrics_1x2['balanced_accuracy']*100:.2f}%")
        log.info(f"AWAY recall: {metrics_1x2['away_recall']*100:.1f}% | "
                 f"DRAW recall: {metrics_1x2['draw_recall']*100:.1f}% | "
                 f"HOME recall: {metrics_1x2['home_recall']*100:.1f}%")
        log.info(f"Confusion [AWAY,DRAW,HOME]: {metrics_1x2['confusion_matrix']}")

        # ---- V5.1: CALIBRATION (validation slice ONLY; champion untouched) ----
        log.info("[CALIB] Fitting 1X2 probability calibration (validation slice only)...")
        is_val_masked_1x2 = is_val_row[mask_tr.values]
        calibration = calibrate_1x2(X_tr, y_tr, is_val_masked_1x2)
        atomic_write_json(calibration, os.path.join(MODELS_DIR, "champion_calibration.json"))
        calibration_summary = {
            "enabled": calibration["enabled"],
            "reason": calibration["reason"],
            "validation": calibration.get("validation"),
            "draw_summary": calibration.get("draw_summary"),
            "provenance": "validation_slice_only — 2025+ test never consulted",
        }

        # ---- DEPLOY CHAMPION ----
        atomic_write_model(model_1x2, os.path.join(MODELS_DIR, "champion_model.joblib"))
        atomic_write_json({"0": "AWAY_WIN", "1": "DRAW", "2": "HOME_WIN"},
                          os.path.join(MODELS_DIR, "champion_label_mapping.json"))

        atomic_write_json({
            "step": 49,
            "version": "production_final_v5.1",
            "market": "1X2",
            "accuracy": float(acc),
            "baseline": float(baseline),
            "improvement": float(acc - baseline),
            "macro_f1": float(metrics_1x2["macro_f1"]),
            "weighted_f1": float(metrics_1x2["weighted_f1"]),
            "balanced_accuracy": float(metrics_1x2["balanced_accuracy"]),
            "away_recall": float(metrics_1x2["away_recall"]),
            "draw_recall": float(metrics_1x2["draw_recall"]),
            "home_recall": float(metrics_1x2["home_recall"]),
            "confusion_matrix": metrics_1x2["confusion_matrix"],
            "features": feat_cols,
            "feature_count": len(feat_cols),
            "train_period": f"{TRAIN_START} to {SPLIT_DATE}",
            "train_rows": int(len(X_tr)),
            "test_rows": int(len(X_te)),
            "fix": "natural class distribution; NO sample_weight",
            "calibration": {
                "enabled": calibration["enabled"],
                "artifact": "champion_calibration.json",
                "validation_logloss": calibration.get("validation"),
                "provenance": "validation_slice_only",
            },
            "evaluation_integrity": {
                "test_used_for_training": False,
                "test_used_for_threshold_selection": False,
                "test_used_for_calibration": False,
                "test_period": f"{SPLIT_DATE}+",
            },
            "generated": datetime.now().isoformat(),
        }, os.path.join(MODELS_DIR, "champion_metadata.json"))

        results.append({
            "market": "1X2",
            "accuracy": float(acc),
            "baseline": float(baseline),
            "improvement": float(acc - baseline),
            "macro_f1": float(metrics_1x2["macro_f1"]),
            "weighted_f1": float(metrics_1x2["weighted_f1"]),
            "balanced_accuracy": float(metrics_1x2["balanced_accuracy"]),
            "away_recall": float(metrics_1x2["away_recall"]),
            "draw_recall": float(metrics_1x2["draw_recall"]),
            "home_recall": float(metrics_1x2["home_recall"]),
            "confusion_matrix": metrics_1x2["confusion_matrix"],
            "calibration_enabled": calibration["enabled"],
            "train_rows": int(len(X_tr)),
            "test_rows": int(len(X_te)),
        })

        # ---- GOVERNANCE ARTIFACTS ----
        try:
            atomic_write_json({"0": "AWAY_WIN", "1": "DRAW", "2": "HOME_WIN"},
                              os.path.join(MODELS_DIR, "label_mapping.json"))

            atomic_write_json({
                "pipeline_step": "49",
                "version": "production_final_v5.1",
                "champion_source": "step49_production_report.json",
                "feature_count": len(feat_cols),
                "features": feat_cols,
                "target_classes": ["AWAY_WIN", "DRAW", "HOME_WIN"],
                "training_rows": int(len(X_tr)),
                "contract_status": "VERIFIED",
                "step50_must_mirror": "engineer_features()",
            }, os.path.join(MODELS_DIR, "champion_feature_schema.json"))

            atomic_write_json({
                "pipeline_step": "49",
                "version": "production_final_v5.1",
                "status": "DEPLOYED",
                "champion": {
                    "market": "1X2",
                    "accuracy": float(acc),
                    "baseline": float(baseline),
                    "improvement": float(acc - baseline),
                    "macro_f1": float(metrics_1x2["macro_f1"]),
                    "balanced_accuracy": float(metrics_1x2["balanced_accuracy"]),
                    "draw_recall": float(metrics_1x2["draw_recall"]),
                    "features": feat_cols,
                    "feature_count": len(feat_cols),
                    "train_period": f"{TRAIN_START} to {SPLIT_DATE}",
                    "weights": "natural (no sample_weight)",
                    "note": "34-feature contract · OVER=1 markets · serves via Step 50 unified engine",
                },
                "deployment": {
                    "model_file": os.path.join(MODELS_DIR, "champion_model.joblib"),
                    "label_mapping_file": os.path.join(MODELS_DIR, "champion_label_mapping.json"),
                    "feature_schema_file": os.path.join(MODELS_DIR, "champion_feature_schema.json"),
                    "calibration_file": os.path.join(MODELS_DIR, "champion_calibration.json"),
                },
                "probability_calibration": {
                    "enabled": calibration["enabled"],
                    "reason": calibration["reason"],
                    "fitted_on": calibration["fitted_on"],
                    "applies_to": "1X2 probabilities only (Step 50 pre-match path)",
                    "validation_logloss": calibration.get("validation"),
                    "draw_summary": calibration.get("draw_summary"),
                },
                "governance": {
                    "min_accuracy": 48.0,
                    "min_macro_f1": 38.0,
                    "min_draw_recall": 10.0,
                    "draw_gate": "WAIVED — accuracy-first product decision; calibration now makes P(DRAW) honest for UI Draw-risk signals",
                    "test_contamination": "NONE",
                    "threshold_selection": "NOT APPLICABLE — multiclass 1X2",
                },
                "evaluation_integrity": {
                    "training_period": f"{TRAIN_START} to {SPLIT_DATE}",
                    "test_period": f"{SPLIT_DATE}+",
                    "test_used_for_training": False,
                    "test_used_for_threshold_selection": False,
                    "test_used_for_calibration": False,
                    "threshold_source": None,
                },
                "deployed_at": datetime.now().isoformat(),
            }, os.path.join(MODELS_DIR, "champion_manifest.json"))

            log.info("Governance artifacts updated: manifest · feature_schema · label_mapping(alias) · calibration")
        except Exception as e:
            log.warning(f"Governance artifact write failed: {e}")

    # =========================================================================
    # OU / BTTS — V5 semantics (threshold frozen from validation; test reported, never decisive)
    # =========================================================================
    log.info("=" * 70)
    log.info("[OU/BTTS] Training with OVER=1 directionality...")

    for market_key, target_col in MARKETS.items():
        if target_col not in train_df.columns:
            log.warning(f"{market_key} skip - col {target_col} not in file")
            continue
        log.info(f"--- {market_key} ({target_col}) ---")

        y_tr_raw = train_df[target_col].astype(str).str.upper().str.strip()
        y_te_raw = test_df[target_col].astype(str).str.upper().str.strip()

        if target_col == "btts":
            label_map, inv_map = {"YES": 1, "NO": 0}, {1: "YES", 0: "NO"}
        else:
            label_map, inv_map = {"OVER": 1, "UNDER": 0}, {1: "OVER", 0: "UNDER"}

        y_train = y_tr_raw.map(label_map)
        y_test = y_te_raw.map(label_map)
        mask_tr = y_train.notna()
        mask_te = y_test.notna()
        X_tr = X_train_all[mask_tr]
        y_tr = y_train[mask_tr].astype(int)
        X_te = X_test_all[mask_te]
        y_te = y_test[mask_te].astype(int)

        if len(X_tr) < MIN_TRAIN_ROWS or len(X_te) < MIN_TEST_ROWS:
            log.warning(f"{market_key} skip - too few rows")
            continue

        counts = np.bincount(y_tr, minlength=2)
        dist_str = ", ".join(f"{inv_map[i]}:{c}" for i, c in enumerate(counts))
        log.info(f"Train {len(X_tr):,} Test {len(X_te):,} | dist {dist_str} (1 = OVER/YES)")

        if market_key in ("OU_1_5", "OU_0_5"):
            scale = 1.0
        else:
            ratio = max(counts) / min(counts) if min(counts) > 0 else 1.0
            scale = min(ratio, 2.0)

        is_val_masked = is_val_row[mask_tr.values]
        X_fit, y_fit = X_tr[~is_val_masked], y_tr[~is_val_masked]
        X_val, y_val = X_tr[is_val_masked], y_tr[is_val_masked]

        best_thresh, val_acc, val_metrics = 0.50, None, None
        if (len(np.unique(y_fit)) >= 2 and len(X_val) >= MIN_VAL_ROWS
                and len(np.unique(y_val)) >= 2):
            selector = xgb.XGBClassifier(**XGB_COMMON_PARAMS, scale_pos_weight=float(scale), eval_metric="logloss")
            selector.fit(X_fit, y_fit, verbose=False)
            val_proba = selector.predict_proba(X_val)
            if val_proba.shape[1] >= 2:
                best_thresh, val_acc = find_best_threshold(y_val.values, val_proba[:, 1])
                val_pred = (val_proba[:, 1] >= best_thresh).astype(int)
                val_metrics = binary_metrics(y_val.values, val_pred)
                log.info(f"  Validation threshold {market_key}: {best_thresh:.2f} (P(OVER) direction)")
                log.info(f"  Validation accuracy: {val_metrics['accuracy']*100:.2f}% | "
                         f"macro-F1: {val_metrics['macro_f1']*100:.2f}%")
            else:
                log.warning(f"{market_key}: validation probabilities < 2 classes; using 0.50")
        else:
            log.warning(f"{market_key}: not enough validation diversity; using 0.50")

        # FINAL MODEL: all 2010-2024 rows; threshold already frozen from validation
        model = xgb.XGBClassifier(**XGB_COMMON_PARAMS, scale_pos_weight=float(scale), eval_metric="logloss")
        model.fit(X_tr, y_tr, verbose=False)

        proba = model.predict_proba(X_te)
        if proba.shape[1] < 2:
            log.warning(f"{market_key} skip - one class")
            continue

        pred_default = (proba[:, 1] >= 0.50).astype(int)
        pred_selected = (proba[:, 1] >= best_thresh).astype(int)

        metrics_default = binary_metrics(y_te.values, pred_default)
        metrics_selected = binary_metrics(y_te.values, pred_selected)
        baseline = pd.Series(y_te).value_counts(normalize=True).max()

        # V5 RULE: production threshold = validation threshold. ALWAYS.
        final_acc = metrics_selected["accuracy"]
        final_thresh = best_thresh
        test_delta = final_acc - baseline
        default_delta = metrics_default["accuracy"] - baseline

        log.info(f"🎯 {market_key} FINAL: {final_acc*100:.2f}% (validation-selected threshold={final_thresh:.2f})")
        log.info(f"    Test default@0.50: {metrics_default['accuracy']*100:.2f}% | "
                 f"Test selected@{final_thresh:.2f}: {final_acc*100:.2f}%")
        log.info(f"    Baseline: {baseline*100:.2f}% | selected delta: {test_delta*100:+.2f}%")
        log.info(f"    Selected macro-F1: {metrics_selected['macro_f1']*100:.2f}% | "
                 f"balanced accuracy: {metrics_selected['balanced_accuracy']*100:.2f}%")

        atomic_write_model(model, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_model.joblib"))
        atomic_write_json({str(k): v for k, v in inv_map.items()},
                          os.path.join(MODELS_DIR, f"market_{market_key.lower()}_label_mapping.json"))

        metadata = {
            "step": 49,
            "version": "production_final_v5.1",
            "market": market_key,
            "target_column": target_col,
            "accuracy": float(final_acc),
            "accuracy_default": float(metrics_default["accuracy"]),
            "accuracy_selected": float(metrics_selected["accuracy"]),
            "macro_f1": float(metrics_selected["macro_f1"]),
            "balanced_accuracy": float(metrics_selected["balanced_accuracy"]),
            "baseline": float(baseline),
            "improvement": float(test_delta),
            "default_improvement": float(default_delta),
            "best_threshold": float(final_thresh),
            "threshold": float(final_thresh),
            "threshold_direction": "P(OVER) >= threshold => OVER",
            "threshold_source": "chronological_validation_only",
            "threshold_selection_metric": "validation_accuracy",
            "validation_accuracy": (float(val_acc) if val_acc is not None else None),
            "validation_rows": int(len(X_val)),
            "validation_threshold": float(best_thresh),
            "scale_pos_weight": float(scale),
            "features": feat_cols,
            "feature_count": len(feat_cols),
            "train_period": f"{TRAIN_START} to {SPLIT_DATE}",
            "train_rows": int(len(X_tr)),
            "test_period": f"{SPLIT_DATE}+",
            "test_rows": int(len(X_te)),
            "evaluation_integrity": {
                "test_used_for_training": False,
                "test_used_for_threshold_selection": False,
                "test_used_for_model_selection": False,
                "threshold_selected_before_test": True,
                "threshold_source": "training_period_chronological_validation",
            },
            "generated": datetime.now().isoformat(),
        }
        if val_metrics is not None:
            metadata["validation_metrics"] = val_metrics
        metadata["test_metrics_selected"] = metrics_selected
        metadata["test_metrics_default"] = metrics_default

        atomic_write_json(metadata, os.path.join(MODELS_DIR, f"market_{market_key.lower()}_metadata.json"))

        results.append({
            "market": market_key,
            "accuracy": float(final_acc),
            "accuracy_default": float(metrics_default["accuracy"]),
            "accuracy_selected": float(metrics_selected["accuracy"]),
            "macro_f1": float(metrics_selected["macro_f1"]),
            "balanced_accuracy": float(metrics_selected["balanced_accuracy"]),
            "baseline": float(baseline),
            "improvement": float(test_delta),
            "default_improvement": float(default_delta),
            "best_threshold": float(final_thresh),
            "threshold_source": "validation_only",
            "validation_accuracy": (float(val_acc) if val_acc is not None else None),
            "scale": float(scale),
            "train_rows": int(len(X_tr)),
            "validation_rows": int(len(X_val)),
            "test_rows": int(len(X_te)),
        })

    # =========================================================================
    # CORRECT SCORE
    # =========================================================================
    log.info("=" * 70)
    log.info("[CORRECT SCORE] Training home_goals + away_goals...")

    if "home_goals" in train_df.columns and "away_goals" in train_df.columns:
        hg_tr = pd.to_numeric(train_df["home_goals"], errors="coerce")
        ag_tr = pd.to_numeric(train_df["away_goals"], errors="coerce")
        hg_te = pd.to_numeric(test_df["home_goals"], errors="coerce")
        ag_te = pd.to_numeric(test_df["away_goals"], errors="coerce")
        valid_tr = hg_tr.notna() & ag_tr.notna() & (hg_tr >= 0) & (ag_tr >= 0)
        valid_te = hg_te.notna() & ag_te.notna() & (hg_te >= 0) & (ag_te >= 0)
        X_tr_g = X_train_all[valid_tr]
        X_te_g = X_test_all[valid_te]
        y_tr_hg = hg_tr[valid_tr].clip(0, 5).astype(int)
        y_te_hg = hg_te[valid_te].clip(0, 5).astype(int)
        y_tr_ag = ag_tr[valid_tr].clip(0, 5).astype(int)
        y_te_ag = ag_te[valid_te].clip(0, 5).astype(int)

        if len(X_tr_g) >= MIN_TRAIN_ROWS and len(X_te_g) >= MIN_TEST_ROWS:
            goal_params = dict(n_estimators=400, max_depth=5, learning_rate=0.05,
                               subsample=0.85, colsample_bytree=0.85,
                               random_state=42, n_jobs=-1, tree_method="hist",
                               eval_metric="mlogloss", verbosity=0)
            mh = xgb.XGBClassifier(**goal_params)
            ma = xgb.XGBClassifier(**goal_params)
            mh.fit(X_tr_g, y_tr_hg, verbose=False)
            ma.fit(X_tr_g, y_tr_ag, verbose=False)

            acc_hg = accuracy_score(y_te_hg, mh.predict(X_te_g))
            acc_ag = accuracy_score(y_te_ag, ma.predict(X_te_g))
            log.info(f"Home goals 0-5: {acc_hg*100:.2f}% | Away goals 0-5: {acc_ag*100:.2f}%")

            atomic_write_model(mh, os.path.join(MODELS_DIR, "market_home_goals_model.joblib"))
            atomic_write_model(ma, os.path.join(MODELS_DIR, "market_away_goals_model.joblib"))

            proba_hg = expand_proba(mh.predict_proba(X_te_g), list(mh.classes_))
            proba_ag = expand_proba(ma.predict_proba(X_te_g), list(ma.classes_))
            joint = proba_hg[:, :, None] * proba_ag[:, None, :]
            flat = joint.reshape(joint.shape[0], -1)
            best_flat = flat.argmax(axis=1)
            cs_pred = [f"{h}-{a}" for h, a in zip(best_flat // 6, best_flat % 6)]
            cs_true = (y_te_hg.astype(str) + "-" + y_te_ag.astype(str)).tolist()
            acc_cs = accuracy_score(cs_true, cs_pred)
            log.info(f"🎯 Correct Score: {acc_cs*100:.2f}%")

            atomic_write_json({
                "step": 49,
                "version": "production_final_v5.1",
                "market": "CORRECT_SCORE",
                "home_goals_accuracy": float(acc_hg),
                "away_goals_accuracy": float(acc_ag),
                "correct_score_accuracy": float(acc_cs),
                "goal_classes": [0, 1, 2, 3, 4, 5],
                "features": feat_cols,
                "feature_count": len(feat_cols),
                "train_period": f"{TRAIN_START} to {SPLIT_DATE}",
                "test_period": f"{SPLIT_DATE}+",
                "train_rows": int(len(X_tr_g)),
                "test_rows": int(len(X_te_g)),
                "evaluation_integrity": {
                    "test_used_for_training": False,
                    "test_used_for_model_selection": False,
                },
                "generated": datetime.now().isoformat(),
            }, os.path.join(MODELS_DIR, "market_correct_score_metadata.json"))

            results.append({
                "market": "CORRECT_SCORE",
                "accuracy": float(acc_cs),
                "home_goals_acc": float(acc_hg),
                "away_goals_acc": float(acc_ag),
                "train_rows": int(len(X_tr_g)),
                "test_rows": int(len(X_te_g)),
            })

    # =========================================================================
    # SUMMARY
    # =========================================================================
    log.info("=" * 70)
    log.info("STEP 49 FINAL V5.1 COMPLETE")
    log.info("=" * 70)
    for r in results:
        if r["market"] == "1X2":
            log.info(f"{r['market']:15s}: {r['accuracy']*100:6.2f}% | baseline {r['baseline']*100:5.2f}% | "
                     f"delta {r['improvement']*100:+5.2f}% | macro-F1 {r['macro_f1']*100:5.2f}% | "
                     f"DRAW {r.get('draw_recall',0)*100:5.1f}% | calibration={'ON' if r.get('calibration_enabled') else 'OFF'}")
        elif r["market"] == "CORRECT_SCORE":
            log.info(f"{r['market']:15s}: {r['accuracy']*100:6.2f}%")
        else:
            log.info(f"{r['market']:15s}: {r['accuracy']*100:6.2f}% | baseline {r['baseline']*100:5.2f}% | "
                     f"delta {r['improvement']*100:+5.2f}% | thresh {r.get('best_threshold',0.5):.2f} (VALIDATION-SELECTED)")

    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_path = os.path.join(REPORTS_DIR, "step49_production_report.json")
    report = {
        "version": "production_final_v5.1",
        "generated": datetime.now().isoformat(),
        "train_period": f"{TRAIN_START} to {SPLIT_DATE}",
        "test_period": f"{SPLIT_DATE}+",
        "validation_holdout_fraction": VAL_HOLDOUT_FRAC,
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "dropped": int(dropped + n_bad),
        "features": feat_cols,
        "feature_count": len(feat_cols),
        "feature_contract": {
            "expected": EXPECTED_FEATURE_COUNT,
            "actual": len(feat_cols),
            "status": "VERIFIED",
            "step50_must_mirror": "engineer_features()",
        },
        "validation_policy": {
            "type": "chronological",
            "fraction": VAL_HOLDOUT_FRAC,
            "threshold_selection": "validation_only",
            "test_contamination": False,
        },
        "calibration": calibration_summary,
        "evaluation_integrity": {
            "test_used_for_training": False,
            "test_used_for_threshold_selection": False,
            "test_used_for_model_selection": False,
            "test_used_for_calibration": False,
            "test_period_locked": True,
        },
        "results": results,
        "fixes": [
            "V3: Removed sample_weights for 1X2",
            "V3: Flipped OU label_map OVER=1 UNDER=0",
            "V3: Removed matches_before noise features",
            "V3: Validation threshold on chronological training slice",
            "V4: Governance artifacts written by Step 49",
            "V5: Removed test-set tuned-vs-default selection",
            "V5: Production threshold frozen from validation",
            "V5: Added macro-F1 and balanced accuracy",
            "V5: Added per-class 1X2 precision/recall/F1",
            "V5: Added explicit test-contamination governance",
            "V5.1: 1X2 probability calibration fitted on validation slice only",
            "V5.1: champion_calibration.json artifact (log-loss gated)",
            "V5.1: P(DRAW) honestly raised toward base rate for UI Draw-risk",
        ],
        "role": "THE trainer + champion deployer in daily pipeline",
    }
    atomic_write_json(report, report_path)

    log.info(f"Report {report_path}")
    log.info(f"Models {MODELS_DIR}/")
    log.info("🔒 V5.1 EVALUATION INTEGRITY: TEST SET WAS NOT USED FOR THRESHOLD, MODEL, OR CALIBRATION SELECTION")
    log.info("✅ STEP 49 V5.1 READY FOR STEP 50")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        log.exception("Step 49 failed")
        sys.exit(1)