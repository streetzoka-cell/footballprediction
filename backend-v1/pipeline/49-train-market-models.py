"""
ZOKASCORE V2 — STEP 49 TRAIN MARKET MODELS — PRODUCTION FINAL
================================================================
Location:
    backend-v1/pipeline/49-train-market-models.py

PURPOSE:
    Train ZOKASCORE market models on the modern football era
    (2010-2024) and evaluate honestly on completely unseen
    future data (2025+).

DATA:
    Input:
        data/ml/features_v4_unified.csv

    Training:
        2010-01-01 <= date < 2025-01-01

    Test:
        date >= 2025-01-01

    Rows before 2010:
        Dropped.

    Rows with invalid/unparsable dates:
        Dropped.

MODELS:
    1. champion_model
       - 1X2
       - AWAY / DRAW / HOME
       - DRAW reweighted

    2. Binary market models
       - OU 1.5
       - OU 2.5
       - OU 3.5
       - BTTS
       - OU 0.5

       Threshold selection:
       - Chronological validation slice inside training period.
       - NEVER selected using 2025+ test data.

    3. Correct Score
       - Home goals 0-5
       - Away goals 0-5
       - Combined through vectorized joint probability grid.

IMPORTANT METHODOLOGY:
    The test set is NEVER used to choose:
        - threshold
        - model
        - hyperparameter
        - fallback
        - deployment decision

    The validation slice is used only for threshold selection.

    The final binary model is then retrained on the COMPLETE
    2010-2024 training period using the validation-selected threshold.

OUTPUT:
    data/models/champion_model.joblib
    data/models/champion_label_mapping.json
    data/models/champion_metadata.json

    data/models/market_ou_1_5_model.joblib
    data/models/market_ou_1_5_label_mapping.json
    data/models/market_ou_1_5_metadata.json

    data/models/market_ou_2_5_model.joblib
    data/models/market_ou_2_5_label_mapping.json
    data/models/market_ou_2_5_metadata.json

    data/models/market_ou_3_5_model.joblib
    data/models/market_ou_3_5_label_mapping.json
    data/models/market_ou_3_5_metadata.json

    data/models/market_btts_model.joblib
    data/models/market_btts_label_mapping.json
    data/models/market_btts_metadata.json

    data/models/market_ou_0_5_model.joblib
    data/models/market_ou_0_5_label_mapping.json
    data/models/market_ou_0_5_metadata.json

    data/models/market_home_goals_model.joblib
    data/models/market_away_goals_model.joblib

    data/processed/step49_production_report.json

USAGE:
    python pipeline/49-train-market-models.py
"""

import os
import sys
import json
import joblib
import tempfile
import logging
from datetime import datetime
from typing import Dict, List, Tuple

import pandas as pd
import numpy as np
import xgboost as xgb

from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
)


# ======================================================================
# CONFIG
# ======================================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

FEATURES_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ml",
    "features_v4_unified.csv",
)

MODELS_DIR = os.path.join(
    BASE_DIR,
    "data",
    "models",
)

REPORTS_DIR = os.path.join(
    BASE_DIR,
    "data",
    "processed",
)


# Modern football era
TRAIN_START = "2010-01-01"

# Strict chronological holdout boundary
SPLIT_DATE = "2025-01-01"

# Last 15% of training data becomes validation
VAL_HOLDOUT_FRAC = 0.15

MIN_TRAIN_ROWS = 100
MIN_TEST_ROWS = 20
MIN_VAL_ROWS = 20


# ======================================================================
# FEATURES
# ======================================================================

BASE_FEATURES = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

    "home_ewma_pts",
    "away_ewma_pts",

    "home_ewma_gd",
    "away_ewma_gd",

    "home_ewma_gf",
    "away_ewma_gf",

    "home_ewma_ga",
    "away_ewma_ga",

    "home_ewma_home_pts",
    "away_ewma_away_pts",

    "home_ewma_home_gd",
    "away_ewma_away_gd",

    "home_ewma_home_gf",
    "away_ewma_away_gf",

    "home_ewma_home_ga",
    "away_ewma_away_ga",

    "home_matches_before",
    "away_matches_before",

    "home_home_matches_before",
    "away_away_matches_before",
]


ENGINEERED_FEATURES = [
    "exp_home_xg",
    "exp_away_xg",
    "exp_total_xg",
    "exp_diff_xg",

    "home_attack_vs_away_def",
    "away_attack_vs_home_def",

    "home_form_adv",

    "high_scoring_expected",
    "low_scoring_expected",
    "btts_expected",

    "elo_diff_sq",
    "elo_diff_abs",

    "total_gd_form",

    "home_home_adv",
    "away_away_adv",
]


MARKETS = {
    "OU_1_5": "ou_1_5",
    "OU_2_5": "ou_2_5",
    "OU_3_5": "ou_3_5",
    "BTTS": "btts",
    "OU_0_5": "ou_0_5",
}


# ======================================================================
# XGBOOST CONFIG
# ======================================================================

XGB_COMMON_PARAMS = dict(
    n_estimators=600,
    max_depth=6,
    learning_rate=0.035,

    subsample=0.90,
    colsample_bytree=0.90,

    min_child_weight=2,
    gamma=0.03,

    reg_alpha=0.08,
    reg_lambda=0.90,

    random_state=42,
    n_jobs=-1,

    tree_method="hist",
    verbosity=0,
)


GOAL_MODEL_PARAMS = dict(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.05,

    subsample=0.85,
    colsample_bytree=0.85,

    min_child_weight=2,

    random_state=42,
    n_jobs=-1,

    tree_method="hist",

    eval_metric="mlogloss",
    verbosity=0,
)


# ======================================================================
# LOGGING
# ======================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)

log = logging.getLogger("step49")


# ======================================================================
# FILE UTILITIES
# ======================================================================

def atomic_write_json(data: dict, path: str) -> None:
    """
    Safely write JSON using temporary file + atomic replacement.
    """

    os.makedirs(
        os.path.dirname(path),
        exist_ok=True,
    )

    fd, tmp = tempfile.mkstemp(
        suffix=".json",
        dir=os.path.dirname(path),
    )

    os.close(fd)

    try:
        with open(
            tmp,
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(
                data,
                f,
                indent=2,
                ensure_ascii=False,
            )

        os.replace(
            tmp,
            path,
        )

    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def atomic_write_model(model, path: str) -> None:
    """
    Safely serialize a model.
    """

    os.makedirs(
        os.path.dirname(path),
        exist_ok=True,
    )

    fd, tmp = tempfile.mkstemp(
        suffix=".joblib",
        dir=os.path.dirname(path),
    )

    os.close(fd)

    try:
        joblib.dump(
            model,
            tmp,
        )

        os.replace(
            tmp,
            path,
        )

    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ======================================================================
# FEATURE ENGINEERING
# ======================================================================

def engineer_features(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Generate production-safe engineered football features.

    All calculations are deterministic and use only columns already
    present in the feature dataset.
    """

    df = df.copy()

    # --------------------------------------------------------------
    # Numeric football scoring features
    # --------------------------------------------------------------

    gf_ga_cols = [
        "home_ewma_gf",
        "away_ewma_gf",

        "home_ewma_ga",
        "away_ewma_ga",

        "home_ewma_home_gf",
        "away_ewma_away_gf",

        "home_ewma_home_ga",
        "away_ewma_away_ga",
    ]

    for col in gf_ga_cols:
        if col in df.columns:

            df[col] = (
                pd.to_numeric(
                    df[col],
                    errors="coerce",
                )
                .fillna(1.2)
                .clip(0.3, 2.5)
            )

    # --------------------------------------------------------------
    # ELO
    # --------------------------------------------------------------

    if "elo_diff" in df.columns:

        df["elo_diff"] = (
            pd.to_numeric(
                df["elo_diff"],
                errors="coerce",
            )
            .fillna(0)
            .clip(-400, 400)
        )

    # --------------------------------------------------------------
    # Expected goals
    # --------------------------------------------------------------

    if all(
        c in df.columns
        for c in [
            "home_ewma_gf",
            "away_ewma_ga",
            "elo_diff",
        ]
    ):

        df["exp_home_xg"] = (
            1.22
            + df["elo_diff"] * 0.0011
            + (df["home_ewma_gf"] - 1.2) * 0.32
            + (1.2 - df["away_ewma_ga"]) * 0.14
        ).clip(
            0.35,
            2.30,
        )

    else:

        df["exp_home_xg"] = 1.22

    if all(
        c in df.columns
        for c in [
            "away_ewma_gf",
            "home_ewma_ga",
            "elo_diff",
        ]
    ):

        df["exp_away_xg"] = (
            1.02
            - df["elo_diff"] * 0.0011
            + (df["away_ewma_gf"] - 1.2) * 0.32
            + (1.2 - df["home_ewma_ga"]) * 0.14
        ).clip(
            0.25,
            1.90,
        )

    else:

        df["exp_away_xg"] = 1.02

    # --------------------------------------------------------------
    # Derived expected-goal features
    # --------------------------------------------------------------

    df["exp_total_xg"] = (
        df["exp_home_xg"]
        + df["exp_away_xg"]
    ).clip(
        0.60,
        4.00,
    )

    df["exp_diff_xg"] = (
        df["exp_home_xg"]
        - df["exp_away_xg"]
    ).clip(
        -1.80,
        1.80,
    )

    # --------------------------------------------------------------
    # Attack vs defence
    # --------------------------------------------------------------

    if all(
        c in df.columns
        for c in [
            "home_ewma_gf",
            "away_ewma_ga",
        ]
    ):

        df["home_attack_vs_away_def"] = (
            df["home_ewma_gf"]
            - df["away_ewma_ga"]
        ).clip(
            -1.40,
            1.40,
        )

    else:

        df["home_attack_vs_away_def"] = 0.0

    if all(
        c in df.columns
        for c in [
            "away_ewma_gf",
            "home_ewma_ga",
        ]
    ):

        df["away_attack_vs_home_def"] = (
            df["away_ewma_gf"]
            - df["home_ewma_ga"]
        ).clip(
            -1.40,
            1.40,
        )

    else:

        df["away_attack_vs_home_def"] = 0.0

    # --------------------------------------------------------------
    # Form
    # --------------------------------------------------------------

    if all(
        c in df.columns
        for c in [
            "home_ewma_pts",
            "away_ewma_pts",
        ]
    ):

        df["home_form_adv"] = (
            df["home_ewma_pts"]
            - df["away_ewma_pts"]
        ).clip(
            -7,
            7,
        )

    else:

        df["home_form_adv"] = 0.0

    # --------------------------------------------------------------
    # Home / away advantage
    # --------------------------------------------------------------

    if "home_ewma_home_pts" in df.columns:

        df["home_home_adv"] = (
            df["home_ewma_home_pts"]
            - 7.0
        ).clip(
            -4,
            4,
        )

    else:

        df["home_home_adv"] = 0.0

    if "away_ewma_away_pts" in df.columns:

        df["away_away_adv"] = (
            df["away_ewma_away_pts"]
            - 7.0
        ).clip(
            -4,
            4,
        )

    else:

        df["away_away_adv"] = 0.0

    # --------------------------------------------------------------
    # Market expectation flags
    # --------------------------------------------------------------

    df["high_scoring_expected"] = (
        df["exp_total_xg"] > 2.65
    ).astype(int)

    df["low_scoring_expected"] = (
        df["exp_total_xg"] < 1.85
    ).astype(int)

    df["btts_expected"] = (
        (df["exp_home_xg"] > 0.82)
        &
        (df["exp_away_xg"] > 0.72)
    ).astype(int)

    # --------------------------------------------------------------
    # ELO nonlinear features
    # --------------------------------------------------------------

    df["elo_diff_sq"] = (
        df["elo_diff"] ** 2 / 10000.0
    ).clip(
        0,
        16,
    )

    df["elo_diff_abs"] = (
        df["elo_diff"]
        .abs()
        .clip(
            0,
            400,
        )
    )

    # --------------------------------------------------------------
    # Goal-difference form
    # --------------------------------------------------------------

    if all(
        c in df.columns
        for c in [
            "home_ewma_gd",
            "away_ewma_gd",
        ]
    ):

        df["total_gd_form"] = (
            df["home_ewma_gd"]
            - df["away_ewma_gd"]
        ).clip(
            -3.5,
            3.5,
        )

    else:

        df["total_gd_form"] = 0.0

    return df


# ======================================================================
# VALIDATION
# ======================================================================

def chronological_val_mask(
    n_rows: int,
    val_frac: float,
) -> np.ndarray:
    """
    Mark the most recent validation fraction.

    DataFrame MUST already be chronologically sorted.
    """

    if n_rows <= 0:
        return np.zeros(
            0,
            dtype=bool,
        )

    val_size = max(
        int(n_rows * val_frac),
        1,
    )

    val_size = min(
        val_size,
        n_rows - 1,
    )

    mask = np.zeros(
        n_rows,
        dtype=bool,
    )

    mask[
        n_rows - val_size:
    ] = True

    return mask


def find_best_threshold(
    y_true: np.ndarray,
    y_proba: np.ndarray,
) -> Tuple[float, float]:
    """
    Find the probability threshold maximizing validation accuracy.

    IMPORTANT:
        This function MUST ONLY receive validation data.
    """

    best_thresh = 0.50
    best_acc = -1.0

    for thresh in np.arange(
        0.15,
        0.851,
        0.01,
    ):

        pred = (
            y_proba >= thresh
        ).astype(int)

        acc = accuracy_score(
            y_true,
            pred,
        )

        # Deterministic tie-breaking:
        # prefer threshold closer to 0.50.
        if (
            acc > best_acc
            or (
                np.isclose(acc, best_acc)
                and abs(thresh - 0.50)
                < abs(best_thresh - 0.50)
            )
        ):

            best_acc = float(acc)
            best_thresh = float(
                round(thresh, 2)
            )

    return (
        best_thresh,
        best_acc,
    )


# ======================================================================
# PROBABILITY UTILITIES
# ======================================================================

def expand_proba(
    proba: np.ndarray,
    classes: List[int],
    n_classes: int = 6,
) -> np.ndarray:
    """
    Expand predict_proba() into fixed class columns 0..5.

    Useful when a rare goal class is absent from the training data.
    """

    out = np.zeros(
        (
            proba.shape[0],
            n_classes,
        ),
        dtype=float,
    )

    for col_idx, cls in enumerate(classes):

        cls_int = int(cls)

        if 0 <= cls_int < n_classes:

            out[
                :,
                cls_int,
            ] = proba[
                :,
                col_idx
            ]

    return out


# ======================================================================
# MAIN
# ======================================================================

def run() -> None:

    log.info("=" * 72)
    log.info(
        "ZOKASCORE V2 — STEP 49 — PRODUCTION FINAL"
    )
    log.info(
        "MODERN ERA: %s -> %s",
        TRAIN_START,
        SPLIT_DATE,
    )
    log.info(
        "VALIDATION HOLDOUT: %.1f%%",
        VAL_HOLDOUT_FRAC * 100,
    )
    log.info("=" * 72)

    # --------------------------------------------------------------
    # Validate input
    # --------------------------------------------------------------

    if not os.path.exists(FEATURES_FILE):

        log.error(
            "Features file not found: %s",
            FEATURES_FILE,
        )

        sys.exit(1)

    # --------------------------------------------------------------
    # Load
    # --------------------------------------------------------------

    log.info(
        "Loading features: %s",
        FEATURES_FILE,
    )

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False,
    )

    if df.empty:

        log.error(
            "Features file is empty."
        )

        sys.exit(1)

    # --------------------------------------------------------------
    # Parse dates
    # --------------------------------------------------------------

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce",
    )

    n_bad_dates = int(
        df["date"].isna().sum()
    )

    if n_bad_dates:

        log.warning(
            "Dropping %d rows with invalid dates.",
            n_bad_dates,
        )

    df = (
        df.dropna(
            subset=["date"]
        )
        .sort_values(
            ["date", "match_id"],
            kind="mergesort",
        )
        .reset_index(drop=True)
    )

    if df.empty:

        log.error(
            "No valid rows remain after date parsing."
        )

        sys.exit(1)

    # --------------------------------------------------------------
    # Train / test split
    # --------------------------------------------------------------

    train_df = df[
        (df["date"] >= TRAIN_START)
        &
        (df["date"] < SPLIT_DATE)
    ].copy()

    test_df = df[
        df["date"] >= SPLIT_DATE
    ].copy()

    dropped_pre_2010 = len(df) - len(train_df) - len(test_df)

    log.info(
        "Dataset range: %s -> %s",
        df["date"].min().date(),
        df["date"].max().date(),
    )

    log.info(
        "Training: %s -> %s | %s rows",
        TRAIN_START,
        SPLIT_DATE,
        f"{len(train_df):,}",
    )

    log.info(
        "Test: %s+ | %s rows",
        SPLIT_DATE,
        f"{len(test_df):,}",
    )

    log.info(
        "Dropped pre-2010: %s rows",
        f"{dropped_pre_2010:,}",
    )

    if (
        len(train_df) < MIN_TRAIN_ROWS
        or
        len(test_df) < MIN_TEST_ROWS
    ):

        log.error(
            "Insufficient train/test data. "
            "train=%d test=%d",
            len(train_df),
            len(test_df),
        )

        sys.exit(1)

    # --------------------------------------------------------------
    # Yearly training breakdown
    # --------------------------------------------------------------

    yearly = (
        train_df["date"]
        .dt.year
        .value_counts()
        .sort_index()
    )

    log.info(
        "Training yearly breakdown:"
    )

    for year in range(
        2010,
        2025,
    ):

        count = int(
            yearly.get(
                year,
                0,
            )
        )

        log.info(
            "  %d: %s",
            year,
            f"{count:,}",
        )

    # --------------------------------------------------------------
    # Feature engineering
    # --------------------------------------------------------------

    log.info(
        "Engineering features..."
    )

    train_df = engineer_features(
        train_df
    )

    test_df = engineer_features(
        test_df
    )

    # --------------------------------------------------------------
    # Select features
    # --------------------------------------------------------------

    feat_cols = [
        c
        for c in BASE_FEATURES
        if c in train_df.columns
    ]

    feat_cols += [
        c
        for c in ENGINEERED_FEATURES
        if c in train_df.columns
    ]

    # Remove accidental duplicates while preserving order
    feat_cols = list(
        dict.fromkeys(feat_cols)
    )

    if not feat_cols:

        log.error(
            "No usable features found."
        )

        sys.exit(1)

    log.info(
        "Using %d features.",
        len(feat_cols),
    )

    log.info(
        "Features: %s",
        ", ".join(feat_cols),
    )

    # --------------------------------------------------------------
    # Numeric matrices
    # --------------------------------------------------------------

    X_train_all = (
        train_df[feat_cols]
        .apply(
            pd.to_numeric,
            errors="coerce",
        )
        .replace(
            [np.inf, -np.inf],
            np.nan,
        )
        .fillna(0)
        .astype(float)
    )

    X_test_all = (
        test_df[feat_cols]
        .apply(
            pd.to_numeric,
            errors="coerce",
        )
        .replace(
            [np.inf, -np.inf],
            np.nan,
        )
        .fillna(0)
        .astype(float)
    )

    # --------------------------------------------------------------
    # Chronological validation split
    # --------------------------------------------------------------
    #
    # IMPORTANT:
    # This validation set belongs entirely to 2010-2024.
    # 2025+ remains untouched until final evaluation.
    # --------------------------------------------------------------

    is_val_row = chronological_val_mask(
        len(train_df),
        VAL_HOLDOUT_FRAC,
    )

    val_count = int(
        is_val_row.sum()
    )

    fit_count = int(
        (~is_val_row).sum()
    )

    if (
        val_count < MIN_VAL_ROWS
        or
        fit_count < MIN_TRAIN_ROWS
    ):

        log.error(
            "Training/validation split unsafe: "
            "fit=%d validation=%d",
            fit_count,
            val_count,
        )

        sys.exit(1)

    val_start_date = train_df.loc[
        is_val_row,
        "date"
    ].min()

    val_end_date = train_df.loc[
        is_val_row,
        "date"
    ].max()

    fit_end_date = train_df.loc[
        ~is_val_row,
        "date"
    ].max()

    log.info(
        "Validation split: fit=%s -> %s | validation=%s -> %s",
        TRAIN_START,
        fit_end_date.date(),
        val_start_date.date(),
        val_end_date.date(),
    )

    results: List[Dict] = []

    # ==================================================================
    # 1X2
    # ==================================================================

    log.info("=" * 72)
    log.info(
        "[1X2] TRAINING CHAMPION MODEL"
    )
    log.info("=" * 72)

    if (
        "home_goals" in train_df.columns
        and
        "away_goals" in train_df.columns
    ):

        train_df["_result"] = np.where(
            train_df["home_goals"]
            >
            train_df["away_goals"],
            "HOME_WIN",

            np.where(
                train_df["home_goals"]
                <
                train_df["away_goals"],
                "AWAY_WIN",
                "DRAW",
            ),
        )

        test_df["_result"] = np.where(
            test_df["home_goals"]
            >
            test_df["away_goals"],
            "HOME_WIN",

            np.where(
                test_df["home_goals"]
                <
                test_df["away_goals"],
                "AWAY_WIN",
                "DRAW",
            ),
        )

        result_col = "_result"

    else:

        result_col = next(
            (
                c
                for c in [
                    "result",
                    "1x2",
                    "outcome",
                ]
                if c in train_df.columns
            ),
            None,
        )

    if result_col is None:

        log.warning(
            "No 1X2 target available — skipping."
        )

    else:

        label_map = {
            "AWAY_WIN": 0,
            "AWAY": 0,
            "A": 0,
            "2": 0,

            "DRAW": 1,
            "D": 1,
            "X": 1,

            "HOME_WIN": 2,
            "HOME": 2,
            "H": 2,
            "1": 2,
        }

        y_train = (
            train_df[result_col]
            .astype(str)
            .str.upper()
            .str.strip()
            .map(label_map)
        )

        y_test = (
            test_df[result_col]
            .astype(str)
            .str.upper()
            .str.strip()
            .map(label_map)
        )

        mask_tr = y_train.notna()
        mask_te = y_test.notna()

        X_tr = X_train_all.loc[mask_tr]
        y_tr = y_train.loc[mask_tr].astype(int)

        X_te = X_test_all.loc[mask_te]
        y_te = y_test.loc[mask_te].astype(int)

        if (
            len(X_tr) < MIN_TRAIN_ROWS
            or
            len(X_te) < MIN_TEST_ROWS
        ):

            log.warning(
                "1X2 skipped — insufficient valid rows."
            )

        else:

            train_dist = (
                y_tr.value_counts()
                .sort_index()
                .to_dict()
            )

            test_dist = (
                y_te.value_counts()
                .sort_index()
                .to_dict()
            )

            log.info(
                "Train distribution: %s",
                train_dist,
            )

            log.info(
                "Test distribution: %s",
                test_dist,
            )

            # DRAW boost
            sample_weights = np.ones(
                len(y_tr),
                dtype=float,
            )

            sample_weights[
                y_tr.values == 1
            ] = 2.8

            # Mild AWAY compensation
            sample_weights[
                y_tr.values == 0
            ] = 1.3

            model_1x2 = xgb.XGBClassifier(
                **XGB_COMMON_PARAMS,
                eval_metric="mlogloss",
            )

            model_1x2.fit(
                X_tr,
                y_tr,
                sample_weight=sample_weights,
                verbose=False,
            )

            pred = model_1x2.predict(
                X_te
            )

            acc = accuracy_score(
                y_te,
                pred,
            )

            baseline = float(
                y_te.value_counts(
                    normalize=True
                ).max()
            )

            cm = confusion_matrix(
                y_te,
                pred,
                labels=[0, 1, 2],
            )

            draw_recall = (
                float(
                    cm[1, 1]
                    /
                    cm[1].sum()
                )
                if cm[1].sum() > 0
                else 0.0
            )

            log.info(
                "1X2 test accuracy: %.2f%%",
                acc * 100,
            )

            log.info(
                "1X2 baseline: %.2f%%",
                baseline * 100,
            )

            log.info(
                "1X2 delta: %+.2f%%",
                (acc - baseline) * 100,
            )

            log.info(
                "DRAW recall: %.1f%%",
                draw_recall * 100,
            )

            log.info(
                "Confusion [AWAY,DRAW,HOME]: %s",
                cm.tolist(),
            )

            atomic_write_model(
                model_1x2,
                os.path.join(
                    MODELS_DIR,
                    "champion_model.joblib",
                ),
            )

            atomic_write_json(
                {
                    "0": "AWAY_WIN",
                    "1": "DRAW",
                    "2": "HOME_WIN",
                },
                os.path.join(
                    MODELS_DIR,
                    "champion_label_mapping.json",
                ),
            )

            atomic_write_json(
                {
                    "step": 49,
                    "model": "champion_model",
                    "market": "1X2",

                    "accuracy": float(acc),
                    "baseline": baseline,
                    "improvement": float(
                        acc - baseline
                    ),

                    "draw_recall": draw_recall,

                    "confusion_matrix": (
                        cm.tolist()
                    ),

                    "features": feat_cols,
                    "feature_count": len(feat_cols),

                    "train_period": (
                        f"{TRAIN_START} to {SPLIT_DATE}"
                    ),

                    "test_period": f"{SPLIT_DATE}+",

                    "train_rows": len(X_tr),
                    "test_rows": len(X_te),

                    "draw_weight": 2.8,
                    "away_weight": 1.3,

                    "generated": (
                        datetime.now()
                        .isoformat()
                    ),
                },
                os.path.join(
                    MODELS_DIR,
                    "champion_metadata.json",
                ),
            )

            results.append(
                {
                    "market": "1X2",
                    "accuracy": float(acc),
                    "baseline": baseline,
                    "improvement": float(
                        acc - baseline
                    ),
                    "draw_recall": draw_recall,
                    "train_rows": len(X_tr),
                    "test_rows": len(X_te),
                }
            )

    # ==================================================================
    # OU / BTTS
    # ==================================================================

    log.info("=" * 72)
    log.info(
        "[OU/BTTS] TRAINING MARKET MODELS"
    )
    log.info(
        "Thresholds are selected ONLY on 2010-2024 validation data."
    )
    log.info("=" * 72)

    for market_key, target_col in MARKETS.items():

        if target_col not in train_df.columns:

            log.warning(
                "%s skipped — target column '%s' not found.",
                market_key,
                target_col,
            )

            continue

        log.info(
            "--- %s ---",
            market_key,
        )

        # ----------------------------------------------------------
        # Labels
        # ----------------------------------------------------------

        y_train_raw = (
            train_df[target_col]
            .astype(str)
            .str.upper()
            .str.strip()
        )

        y_test_raw = (
            test_df[target_col]
            .astype(str)
            .str.upper()
            .str.strip()
        )

        if target_col == "btts":

            label_map = {
                "YES": 1,
                "NO": 0,
            }

            inv_map = {
                1: "YES",
                0: "NO",
            }

        else:

            label_map = {
                "OVER": 0,
                "UNDER": 1,
            }

            inv_map = {
                0: "OVER",
                1: "UNDER",
            }

        y_train = y_train_raw.map(
            label_map
        )

        y_test = y_test_raw.map(
            label_map
        )

        mask_tr = y_train.notna()
        mask_te = y_test.notna()

        X_tr = X_train_all.loc[mask_tr]
        y_tr = y_train.loc[mask_tr].astype(int)

        X_te = X_test_all.loc[mask_te]
        y_te = y_test.loc[mask_te].astype(int)

        if (
            len(X_tr) < MIN_TRAIN_ROWS
            or
            len(X_te) < MIN_TEST_ROWS
        ):

            log.warning(
                "%s skipped — insufficient rows "
                "(train=%d test=%d).",
                market_key,
                len(X_tr),
                len(X_te),
            )

            continue

        # ----------------------------------------------------------
        # Class distribution
        # ----------------------------------------------------------

        counts = np.bincount(
            y_tr,
            minlength=2,
        )

        log.info(
            "%s train=%s test=%s",
            market_key,
            f"{len(X_tr):,}",
            f"{len(X_te):,}",
        )

        log.info(
            "%s distribution: %s:%d, %s:%d",
            market_key,
            inv_map[0],
            counts[0],
            inv_map[1],
            counts[1],
        )

        # ----------------------------------------------------------
        # Class weighting
        # ----------------------------------------------------------

        if (
            market_key == "OU_1_5"
            or
            market_key == "OU_0_5"
        ):

            scale = 1.0

        else:

            if (
                counts[0] > 0
                and
                counts[1] > 0
            ):

                ratio = (
                    max(counts)
                    /
                    min(counts)
                )

                scale = min(
                    float(ratio),
                    2.0,
                )

            else:

                scale = 1.0

        # ----------------------------------------------------------
        # CRITICAL:
        # Validation split is created ONLY from training rows.
        # ----------------------------------------------------------

        train_positions = np.flatnonzero(
            mask_tr.to_numpy()
        )

        market_val_mask = is_val_row[
            train_positions
        ]

        X_fit = X_tr.iloc[
            ~market_val_mask
        ]

        y_fit = y_tr.iloc[
            ~market_val_mask
        ]

        X_val = X_tr.iloc[
            market_val_mask
        ]

        y_val = y_tr.iloc[
            market_val_mask
        ]

        # ----------------------------------------------------------
        # Threshold selection
        # ----------------------------------------------------------

        best_thresh = 0.50
        val_accuracy = None

        if (
            len(X_fit) >= MIN_TRAIN_ROWS
            and
            len(X_val) >= MIN_VAL_ROWS
            and
            len(np.unique(y_fit)) >= 2
            and
            len(np.unique(y_val)) >= 2
        ):

            log.info(
                "%s threshold selector: fit=%d validation=%d",
                market_key,
                len(X_fit),
                len(X_val),
            )

            selector = xgb.XGBClassifier(
                **XGB_COMMON_PARAMS,
                scale_pos_weight=float(scale),
                eval_metric="logloss",
            )

            selector.fit(
                X_fit,
                y_fit,
                verbose=False,
            )

            val_proba = selector.predict_proba(
                X_val
            )

            if val_proba.shape[1] >= 2:

                (
                    best_thresh,
                    val_accuracy,
                ) = find_best_threshold(
                    y_val.to_numpy(),
                    val_proba[:, 1],
                )

                log.info(
                    "%s validation-selected threshold: %.2f | validation accuracy: %.2f%%",
                    market_key,
                    best_thresh,
                    val_accuracy * 100,
                )

        else:

            log.warning(
                "%s: validation threshold tuning unavailable; "
                "using 0.50.",
                market_key,
            )

        # ----------------------------------------------------------
        # FINAL DEPLOYED MODEL
        #
        # IMPORTANT:
        # This model is trained on ALL 2010-2024 training data.
        #
        # The threshold was already selected above.
        #
        # NO test-set comparison is performed to change it.
        # ----------------------------------------------------------

        model = xgb.XGBClassifier(
            **XGB_COMMON_PARAMS,
            scale_pos_weight=float(scale),
            eval_metric="logloss",
        )

        model.fit(
            X_tr,
            y_tr,
            verbose=False,
        )

        # ----------------------------------------------------------
        # ONLY NOW touch the 2025+ test set for evaluation
        # ----------------------------------------------------------

        proba = model.predict_proba(
            X_te
        )

        if proba.shape[1] < 2:

            log.warning(
                "%s skipped — deployed model learned only one class.",
                market_key,
            )

            continue

        # Default threshold evaluation
        pred_default = (
            proba[:, 1] >= 0.50
        ).astype(int)

        acc_default = accuracy_score(
            y_te,
            pred_default,
        )

        # Validation-selected threshold evaluation
        pred_tuned = (
            proba[:, 1] >= best_thresh
        ).astype(int)

        acc_tuned = accuracy_score(
            y_te,
            pred_tuned,
        )

        # ----------------------------------------------------------
        # IMPORTANT:
        # DEPLOYED threshold is ALWAYS the validation-selected
        # threshold.
        #
        # We do NOT choose whichever test accuracy is higher.
        # ----------------------------------------------------------

        final_thresh = float(
            best_thresh
        )

        final_acc = float(
            acc_tuned
        )

        baseline = float(
            y_te.value_counts(
                normalize=True
            ).max()
        )

        improvement = (
            final_acc - baseline
        )

        log.info(
            "%s test accuracy: %.2f%%",
            market_key,
            final_acc * 100,
        )

        log.info(
            "%s default @ 0.50: %.2f%%",
            market_key,
            acc_default * 100,
        )

        log.info(
            "%s validation threshold @ %.2f: %.2f%%",
            market_key,
            final_thresh,
            final_acc * 100,
        )

        log.info(
            "%s baseline: %.2f%% | delta %+0.2f%%",
            market_key,
            baseline * 100,
            improvement * 100,
        )

        # ----------------------------------------------------------
        # Save model
        # ----------------------------------------------------------

        model_path = os.path.join(
            MODELS_DIR,
            f"market_{market_key.lower()}_model.joblib",
        )

        atomic_write_model(
            model,
            model_path,
        )

        # ----------------------------------------------------------
        # Save mapping
        # ----------------------------------------------------------

        mapping_path = os.path.join(
            MODELS_DIR,
            f"market_{market_key.lower()}_label_mapping.json",
        )

        atomic_write_json(
            {
                str(k): v
                for k, v in inv_map.items()
            },
            mapping_path,
        )

        # ----------------------------------------------------------
        # Metadata
        # ----------------------------------------------------------

        metadata_path = os.path.join(
            MODELS_DIR,
            f"market_{market_key.lower()}_metadata.json",
        )

        atomic_write_json(
            {
                "step": 49,
                "model": f"market_{market_key.lower()}_model",
                "market": market_key,
                "target_column": target_col,

                "accuracy": final_acc,
                "accuracy_default": float(
                    acc_default
                ),
                "accuracy_tuned": final_acc,

                "best_threshold": final_thresh,

                "threshold_selected_on":
                    "chronological_validation_slice_of_training",

                "validation_accuracy":
                    (
                        float(val_accuracy)
                        if val_accuracy is not None
                        else None
                    ),

                "baseline": baseline,
                "improvement": float(
                    improvement
                ),

                "scale_pos_weight": float(
                    scale
                ),

                "features": feat_cols,
                "feature_count": len(feat_cols),

                "train_period":
                    f"{TRAIN_START} to {SPLIT_DATE}",

                "test_period":
                    f"{SPLIT_DATE}+",

                "train_rows": len(X_tr),
                "validation_rows": len(X_val),
                "test_rows": len(X_te),

                "validation_start":
                    (
                        str(val_start_date.date())
                        if val_start_date is not None
                        else None
                    ),

                "validation_end":
                    (
                        str(val_end_date.date())
                        if val_end_date is not None
                        else None
                    ),

                "test_threshold_selection":
                    False,

                "test_used_for_threshold_selection":
                    False,

                "generated":
                    datetime.now().isoformat(),
            },
            metadata_path,
        )

        results.append(
            {
                "market": market_key,

                "accuracy": final_acc,
                "accuracy_default": float(
                    acc_default
                ),

                "baseline": baseline,

                "improvement": float(
                    improvement
                ),

                "best_threshold":
                    final_thresh,

                "validation_accuracy":
                    (
                        float(val_accuracy)
                        if val_accuracy is not None
                        else None
                    ),

                "scale":
                    float(scale),

                "train_rows":
                    len(X_tr),

                "validation_rows":
                    len(X_val),

                "test_rows":
                    len(X_te),
            }
        )

    # ==================================================================
    # CORRECT SCORE
    # ==================================================================

    log.info("=" * 72)
    log.info(
        "[CORRECT SCORE] TRAINING 0-5 GOAL MODELS"
    )
    log.info("=" * 72)

    if (
        "home_goals" in train_df.columns
        and
        "away_goals" in train_df.columns
    ):

        hg_tr = pd.to_numeric(
            train_df["home_goals"],
            errors="coerce",
        )

        ag_tr = pd.to_numeric(
            train_df["away_goals"],
            errors="coerce",
        )

        hg_te = pd.to_numeric(
            test_df["home_goals"],
            errors="coerce",
        )

        ag_te = pd.to_numeric(
            test_df["away_goals"],
            errors="coerce",
        )

        # Valid score rows
        valid_tr = (
            hg_tr.notna()
            &
            ag_tr.notna()
            &
            (hg_tr >= 0)
            &
            (ag_tr >= 0)
        )

        valid_te = (
            hg_te.notna()
            &
            ag_te.notna()
            &
            (hg_te >= 0)
            &
            (ag_te >= 0)
        )

        X_tr_g = X_train_all.loc[
            valid_tr
        ]

        X_te_g = X_test_all.loc[
            valid_te
        ]

        # 0-5 goal classes.
        # 5 represents 5+ for matches exceeding five goals
        # in either side.
        y_tr_hg = (
            hg_tr.loc[valid_tr]
            .clip(0, 5)
            .astype(int)
        )

        y_te_hg = (
            hg_te.loc[valid_te]
            .clip(0, 5)
            .astype(int)
        )

        y_tr_ag = (
            ag_tr.loc[valid_tr]
            .clip(0, 5)
            .astype(int)
        )

        y_te_ag = (
            ag_te.loc[valid_te]
            .clip(0, 5)
            .astype(int)
        )

        if (
            len(X_tr_g) < MIN_TRAIN_ROWS
            or
            len(X_te_g) < MIN_TEST_ROWS
        ):

            log.warning(
                "Correct Score skipped — insufficient rows."
            )

        else:

            model_hg = xgb.XGBClassifier(
                **GOAL_MODEL_PARAMS
            )

            model_ag = xgb.XGBClassifier(
                **GOAL_MODEL_PARAMS
            )

            # ------------------------------------------------------
            # Train
            # ------------------------------------------------------

            model_hg.fit(
                X_tr_g,
                y_tr_hg,
                verbose=False,
            )

            model_ag.fit(
                X_tr_g,
                y_tr_ag,
                verbose=False,
            )

            # ------------------------------------------------------
            # Individual goal accuracy
            # ------------------------------------------------------

            pred_hg = model_hg.predict(
                X_te_g
            )

            pred_ag = model_ag.predict(
                X_te_g
            )

            acc_hg = accuracy_score(
                y_te_hg,
                pred_hg,
            )

            acc_ag = accuracy_score(
                y_te_ag,
                pred_ag,
            )

            log.info(
                "Home goals 0-5 accuracy: %.2f%%",
                acc_hg * 100,
            )

            log.info(
                "Away goals 0-5 accuracy: %.2f%%",
                acc_ag * 100,
            )

            # ------------------------------------------------------
            # Save goal models
            # ------------------------------------------------------

            atomic_write_model(
                model_hg,
                os.path.join(
                    MODELS_DIR,
                    "market_home_goals_model.joblib",
                ),
            )

            atomic_write_model(
                model_ag,
                os.path.join(
                    MODELS_DIR,
                    "market_away_goals_model.joblib",
                ),
            )

            # ------------------------------------------------------
            # Probability distributions
            # ------------------------------------------------------

            proba_hg = expand_proba(
                model_hg.predict_proba(
                    X_te_g
                ),
                list(model_hg.classes_),
                n_classes=6,
            )

            proba_ag = expand_proba(
                model_ag.predict_proba(
                    X_te_g
                ),
                list(model_ag.classes_),
                n_classes=6,
            )

            # ------------------------------------------------------
            # Joint probability
            #
            # P(H=h,A=a)
            # =
            # P(H=h) * P(A=a)
            #
            # Vectorized:
            # shape = (rows, 6, 6)
            # ------------------------------------------------------

            joint = (
                proba_hg[:, :, None]
                *
                proba_ag[:, None, :]
            )

            flat = joint.reshape(
                joint.shape[0],
                -1,
            )

            best_flat_idx = (
                flat.argmax(axis=1)
            )

            best_h = (
                best_flat_idx // 6
            )

            best_a = (
                best_flat_idx % 6
            )

            cs_pred = np.array(
                [
                    f"{h}-{a}"
                    for h, a in zip(
                        best_h,
                        best_a,
                    )
                ]
            )

            cs_true = np.array(
                [
                    f"{h}-{a}"
                    for h, a in zip(
                        y_te_hg,
                        y_te_ag,
                    )
                ]
            )

            acc_cs = accuracy_score(
                cs_true,
                cs_pred,
            )

            log.info(
                "Correct Score test accuracy: %.2f%%",
                acc_cs * 100,
            )

            # ------------------------------------------------------
            # Goal model metadata
            # ------------------------------------------------------

            atomic_write_json(
                {
                    "step": 49,
                    "market": "CORRECT_SCORE",

                    "goal_range":
                        "0-5 with 5 representing 5+",

                    "home_goals_accuracy":
                        float(acc_hg),

                    "away_goals_accuracy":
                        float(acc_ag),

                    "correct_score_accuracy":
                        float(acc_cs),

                    "train_period":
                        f"{TRAIN_START} to {SPLIT_DATE}",

                    "test_period":
                        f"{SPLIT_DATE}+",

                    "train_rows":
                        len(X_tr_g),

                    "test_rows":
                        len(X_te_g),

                    "features":
                        feat_cols,

                    "feature_count":
                        len(feat_cols),

                    "joint_probability":
                        "P(home=h,away=a)=P(home=h)*P(away=a)",

                    "generated":
                        datetime.now().isoformat(),
                },
                os.path.join(
                    MODELS_DIR,
                    "market_correct_score_metadata.json",
                ),
            )

            results.append(
                {
                    "market":
                        "CORRECT_SCORE",

                    "accuracy":
                        float(acc_cs),

                    "home_goals_acc":
                        float(acc_hg),

                    "away_goals_acc":
                        float(acc_ag),

                    "train_rows":
                        len(X_tr_g),

                    "test_rows":
                        len(X_te_g),
                }
            )

    else:

        log.warning(
            "home_goals/away_goals unavailable — "
            "Correct Score models skipped."
        )

    # ==================================================================
    # FINAL REPORT
    # ==================================================================

    log.info("=" * 72)
    log.info(
        "STEP 49 COMPLETE"
    )
    log.info("=" * 72)

    for r in results:

        market = r["market"]

        if market == "1X2":

            log.info(
                "%-18s | accuracy %6.2f%% | baseline %6.2f%% | "
                "delta %+6.2f%% | DRAW recall %5.1f%%",

                market,

                r["accuracy"] * 100,

                r["baseline"] * 100,

                r["improvement"] * 100,

                r.get(
                    "draw_recall",
                    0,
                ) * 100,
            )

        elif market == "CORRECT_SCORE":

            log.info(
                "%-18s | accuracy %6.2f%% | home goals %6.2f%% | "
                "away goals %6.2f%%",

                market,

                r["accuracy"] * 100,

                r["home_goals_acc"] * 100,

                r["away_goals_acc"] * 100,
            )

        else:

            log.info(
                "%-18s | accuracy %6.2f%% | baseline %6.2f%% | "
                "delta %+6.2f%% | threshold %.2f",

                market,

                r["accuracy"] * 100,

                r["baseline"] * 100,

                r["improvement"] * 100,

                r.get(
                    "best_threshold",
                    0.50,
                ),
            )

    # ==================================================================
    # PRODUCTION REPORT
    # ==================================================================

    os.makedirs(
        REPORTS_DIR,
        exist_ok=True,
    )

    report_path = os.path.join(
        REPORTS_DIR,
        "step49_production_report.json",
    )

    report = {
        "version":
            "production_modern_2010_v3_final",

        "step":
            49,

        "generated":
            datetime.now().isoformat(),

        "train_period":
            f"{TRAIN_START} to {SPLIT_DATE}",

        "test_period":
            f"{SPLIT_DATE}+",

        "validation_holdout_fraction":
            VAL_HOLDOUT_FRAC,

        "validation_period":
            {
                "start":
                    (
                        str(val_start_date.date())
                        if val_start_date is not None
                        else None
                    ),

                "end":
                    (
                        str(val_end_date.date())
                        if val_end_date is not None
                        else None
                    ),
            },

        "train_rows":
            len(train_df),

        "validation_rows":
            val_count,

        "test_rows":
            len(test_df),

        "dropped_pre_2010":
            dropped_pre_2010,

        "dropped_invalid_dates":
            n_bad_dates,

        "total_dropped":
            dropped_pre_2010 + n_bad_dates,

        "features":
            feat_cols,

        "feature_count":
            len(feat_cols),

        "results":
            results,

        "methodology":
            [
                "Only modern-era matches from 2010 onward are used.",
                "Rows before 2010 are excluded.",
                "Rows with invalid dates are excluded.",
                "Training ends strictly before 2025-01-01.",
                "The 2025+ dataset is treated as unseen test data.",
                "A chronological validation slice is carved from the end of the 2010-2024 training period.",
                "OU and BTTS thresholds are selected exclusively on the validation slice.",
                "The final binary models are retrained on the complete 2010-2024 training period.",
                "The validation-selected threshold is then applied unchanged to the 2025+ test set.",
                "The test set is never used to choose a threshold.",
                "The test set is never used to choose between two thresholds.",
                "The 1X2 model uses DRAW sample-weight boosting.",
                "Correct Score uses separate home-goal and away-goal classifiers.",
                "Correct Score probabilities are combined using a vectorized joint-probability grid.",
                "Correct Score uses classes 0-5, with class 5 representing 5 or more goals.",
            ],

        "leakage_protection":
            {
                "threshold_selected_on_test":
                    False,

                "model_selected_on_test":
                    False,

                "hyperparameters_selected_on_test":
                    False,

                "test_used_for_deployment_decision":
                    False,
            },

        "models":
            {
                "champion":
                    "champion_model.joblib",

                "ou_1_5":
                    "market_ou_1_5_model.joblib",

                "ou_2_5":
                    "market_ou_2_5_model.joblib",

                "ou_3_5":
                    "market_ou_3_5_model.joblib",

                "btts":
                    "market_btts_model.joblib",

                "ou_0_5":
                    "market_ou_0_5_model.joblib",

                "home_goals":
                    "market_home_goals_model.joblib",

                "away_goals":
                    "market_away_goals_model.joblib",
            },
    }

    atomic_write_json(
        report,
        report_path,
    )

    log.info(
        "Production report saved: %s",
        report_path,
    )

    log.info(
        "Models saved: %s/",
        MODELS_DIR,
    )

    log.info("=" * 72)
    log.info(
        "ZOKASCORE STEP 49 — SUCCESS"
    )
    log.info("=" * 72)


# ======================================================================
# ENTRY POINT
# ======================================================================

if __name__ == "__main__":

    try:

        run()

    except KeyboardInterrupt:

        log.error(
            "Step 49 interrupted by user."
        )

        sys.exit(130)

    except Exception:

        log.exception(
            "Step 49 failed."
        )

        sys.exit(1)