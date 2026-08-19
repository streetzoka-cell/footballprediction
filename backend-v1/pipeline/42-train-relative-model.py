import os
import json
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb

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
# ZOKASCORE V2 — STEP 42
# RELATIVE FEATURE ENGINEERING & TRAINING
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ml",
    "features_v3.csv"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "models"
)

REPORT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "processed"
)

MODEL_FILE = os.path.join(
    OUTPUT_DIR,
    "xgboost_relative_v1.joblib"
)

REPORT_FILE = os.path.join(
    REPORT_DIR,
    "xgboost_relative_model_report.json"
)


# ============================================================
# DATA CONTRACT
# ============================================================

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80

LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]


# ============================================================
# REFERENCE MODELS
# ============================================================

BASELINE_ACCURACY = 47.97
ELO_ONLY_ACCURACY = 51.23
XGB_BALANCED_ACCURACY = 48.17
XGB_NATURAL_ACCURACY = 51.50
XGB_EWMA_ACCURACY = 48.19


# ============================================================
# STEP 40 SOURCE FEATURES
# ============================================================

RAW_FEATURE_COLUMNS = [

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
    "away_ewma_away_ga"
]


# ============================================================
# ENGINEERED FEATURES
# ============================================================

ENGINEERED_FEATURES = [

    # ELO relationship
    "elo_diff_relative",

    # Overall form
    "form_diff",
    "gd_diff",

    # Overall attack / defense
    "home_att_vs_away_def",
    "away_att_vs_home_def",

    # Venue form
    "venue_form_diff",
    "venue_gd_diff",

    # Venue attack / defense
    "venue_home_att_vs_away_def",
    "venue_away_att_vs_home_def",

    # Interaction / conflict
    "elo_form_conflict",
    "venue_elo_form_conflict"
]


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 42: RELATIVE FEATURE ENGINEERING")
    print("=" * 60)
    print()

    # --------------------------------------------------------
    # 1. SOURCE CHECK
    # --------------------------------------------------------

    print("[1/8] Checking Step 40 feature dataset...")

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Feature dataset not found:\n{FEATURES_FILE}"
        )

    print("   ✅ Step 40 feature dataset found.")

    # --------------------------------------------------------
    # 2. LOAD
    # --------------------------------------------------------

    print("\n[2/8] Loading features...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(
            f"POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, got {len(df):,}."
        )

    print(f"   ↳ Rows loaded: {len(df):,}")

    # --------------------------------------------------------
    # 3. VALIDATE
    # --------------------------------------------------------

    print("\n[3/8] Validating Step 40 source dataset...")

    required_columns = (
        RAW_FEATURE_COLUMNS
        + [
            "match_id",
            "date",
            "target"
        ]
    )

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        raise RuntimeError(
            f"Missing required columns: {missing}"
        )

    # Match identity
    if df["match_id"].isna().any():
        raise RuntimeError(
            "Match IDs contain missing values."
        )

    if df["match_id"].duplicated().any():
        raise RuntimeError(
            "Duplicate match IDs detected."
        )

    # Dates
    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    if df["date"].isna().any():
        raise RuntimeError(
            "Invalid dates detected."
        )

    # Numeric validation
    for column in RAW_FEATURE_COLUMNS:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        if df[column].isna().any():

            raise RuntimeError(
                f"{column} contains "
                f"invalid or missing values."
            )

        if not np.isfinite(df[column].to_numpy()).all():

            raise RuntimeError(
                f"{column} contains "
                f"non-finite values."
            )

    # Target validation
    invalid_targets = (
        set(df["target"].unique())
        - set(LABELS)
    )

    if invalid_targets:

        raise RuntimeError(
            f"Invalid target values: "
            f"{invalid_targets}"
        )

    print(
        "   ✅ Structural, numeric, identity, "
        "and target integrity verified."
    )

    # --------------------------------------------------------
    # 4. CHRONOLOGICAL SPLIT
    # --------------------------------------------------------

    print(
        "\n[4/8] Preparing deterministic "
        "chronological split..."
    )

    df = df.sort_values(
        by=[
            "date",
            "match_id"
        ],
        kind="mergesort"
    ).reset_index(drop=True)

    split_idx = int(
        len(df) * TRAIN_RATIO
    )

    train_df = df.iloc[
        :split_idx
    ].copy()

    test_df = df.iloc[
        split_idx:
    ].copy()

    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(
        f"   ↳ Training: {len(train_df):,} "
        f"matches "
        f"(Through {train_end_date.date()})"
    )

    print(
        f"   ↳ Testing:  {len(test_df):,} "
        f"matches "
        f"(From {test_start_date.date()})"
    )

    # --------------------------------------------------------
    # 5. RELATIVE FEATURE ENGINEERING
    # --------------------------------------------------------

    print(
        "\n[5/8] Engineering relative "
        "interaction features..."
    )

    def engineer_features(data):

        # ----------------------------------------------------
        # ELO relationship
        #
        # Signed difference:
        # positive = home ELO advantage
        # negative = away ELO advantage
        # ----------------------------------------------------

        data["elo_diff_relative"] = (
            data["home_elo_pre"]
            - data["away_elo_pre"]
        )

        # ----------------------------------------------------
        # Overall form
        # ----------------------------------------------------

        data["form_diff"] = (
            data["home_ewma_pts"]
            - data["away_ewma_pts"]
        )

        data["gd_diff"] = (
            data["home_ewma_gd"]
            - data["away_ewma_gd"]
        )

        # ----------------------------------------------------
        # Overall attack vs defense
        # ----------------------------------------------------

        data["home_att_vs_away_def"] = (
            data["home_ewma_gf"]
            - data["away_ewma_ga"]
        )

        data["away_att_vs_home_def"] = (
            data["away_ewma_gf"]
            - data["home_ewma_ga"]
        )

        # ----------------------------------------------------
        # Venue-specific form
        # ----------------------------------------------------

        data["venue_form_diff"] = (
            data["home_ewma_home_pts"]
            - data["away_ewma_away_pts"]
        )

        data["venue_gd_diff"] = (
            data["home_ewma_home_gd"]
            - data["away_ewma_away_gd"]
        )

        # ----------------------------------------------------
        # Venue-specific attack vs defense
        # ----------------------------------------------------

        data["venue_home_att_vs_away_def"] = (
            data["home_ewma_home_gf"]
            - data["away_ewma_away_ga"]
        )

        data["venue_away_att_vs_home_def"] = (
            data["away_ewma_away_gf"]
            - data["home_ewma_home_ga"]
        )

        # ----------------------------------------------------
        # ELO / form interactions
        # ----------------------------------------------------

        data["elo_form_conflict"] = (
            data["elo_diff_relative"]
            * data["form_diff"]
        )

        data["venue_elo_form_conflict"] = (
            data["elo_diff_relative"]
            * data["venue_form_diff"]
        )

        return data

    train_df = engineer_features(train_df)
    test_df = engineer_features(test_df)

    # Verify generated features
    for column in ENGINEERED_FEATURES:

        if column not in train_df.columns:
            raise RuntimeError(
                f"Engineered feature missing: {column}"
            )

        if train_df[column].isna().any():
            raise RuntimeError(
                f"{column} contains missing "
                "training values."
            )

        if test_df[column].isna().any():
            raise RuntimeError(
                f"{column} contains missing "
                "testing values."
            )

        if not np.isfinite(
            train_df[column].to_numpy()
        ).all():

            raise RuntimeError(
                f"{column} contains non-finite "
                "training values."
            )

        if not np.isfinite(
            test_df[column].to_numpy()
        ).all():

            raise RuntimeError(
                f"{column} contains non-finite "
                "testing values."
            )

    X_train = train_df[
        ENGINEERED_FEATURES
    ].astype(float)

    X_test = test_df[
        ENGINEERED_FEATURES
    ].astype(float)

    y_train_raw = (
        train_df["target"]
        .astype(str)
    )

    y_test_raw = (
        test_df["target"]
        .astype(str)
    )

    print(
        f"   ↳ Engineered features: "
        f"{len(ENGINEERED_FEATURES)}"
    )

    print(
        "   ✅ Relative features generated "
        "from pre-match information only."
    )

    # --------------------------------------------------------
    # 6. TARGET ENCODING
    # --------------------------------------------------------

    print(
        "\n[6/8] Encoding targets "
        "(fit on train only)..."
    )

    le = LabelEncoder()

    y_train = le.fit_transform(
        y_train_raw
    )

    y_test = le.transform(
        y_test_raw
    )

    print("   ↳ Target mapping:")

    for encoded, label in enumerate(
        le.classes_
    ):
        print(
            f"      {encoded} → {label}"
        )

    # --------------------------------------------------------
    # 7. TRAIN MODEL
    # --------------------------------------------------------

    print(
        "\n[7/8] Training XGBoost "
        "(Balanced + Relative Features)..."
    )

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train
    )

    model = xgb.XGBClassifier(

        objective="multi:softprob",

        num_class=3,

        n_estimators=300,

        learning_rate=0.05,

        max_depth=6,

        min_child_weight=3,

        subsample=0.85,

        colsample_bytree=0.85,

        gamma=0.0,

        reg_alpha=0.0,

        reg_lambda=1.0,

        random_state=42,

        n_jobs=-1,

        eval_metric="mlogloss",

        tree_method="hist"
    )

    model.fit(
        X_train,
        y_train,
        sample_weight=sample_weights
    )

    print(
        "   ✅ Model trained."
    )

    # --------------------------------------------------------
    # 8. EVALUATE + SAVE
    # --------------------------------------------------------

    print(
        "\n[8/8] Evaluating on unseen "
        "chronological test data..."
    )

    y_pred = model.predict(
        X_test
    )

    y_prob = model.predict_proba(
        X_test
    )

    y_test_str = le.inverse_transform(
        y_test
    )

    y_pred_str = le.inverse_transform(
        y_pred
    )

    # Metrics
    accuracy = accuracy_score(
        y_test_str,
        y_pred_str
    )

    balanced_accuracy = (
        balanced_accuracy_score(
            y_test_str,
            y_pred_str
        )
    )

    macro_f1 = f1_score(
        y_test_str,
        y_pred_str,
        average="macro"
    )

    weighted_f1 = f1_score(
        y_test_str,
        y_pred_str,
        average="weighted"
    )

    logloss = log_loss(
        y_test,
        y_prob,
        labels=np.arange(
            len(le.classes_)
        )
    )

    # Differences
    diff_baseline = (
        accuracy * 100
        - BASELINE_ACCURACY
    )

    diff_elo = (
        accuracy * 100
        - ELO_ONLY_ACCURACY
    )

    diff_xgb_bal = (
        accuracy * 100
        - XGB_BALANCED_ACCURACY
    )

    diff_xgb_nat = (
        accuracy * 100
        - XGB_NATURAL_ACCURACY
    )

    diff_xgb_ewma = (
        accuracy * 100
        - XGB_EWMA_ACCURACY
    )

    # Classification
    report = classification_report(
        y_test_str,
        y_pred_str,
        labels=LABELS,
        output_dict=True,
        zero_division=0
    )

    cm = confusion_matrix(
        y_test_str,
        y_pred_str,
        labels=LABELS
    )

    importances = (
        model.feature_importances_
    )

    # --------------------------------------------------------
    # SAVE MODEL
    # --------------------------------------------------------

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORT_DIR,
        exist_ok=True
    )

    temp_model = (
        MODEL_FILE + ".tmp"
    )

    joblib.dump(
        model,
        temp_model
    )

    os.replace(
        temp_model,
        MODEL_FILE
    )

    # --------------------------------------------------------
    # SIGNAL CONTRIBUTION
    # --------------------------------------------------------

    elo_features = {
        "elo_diff_relative"
    }

    elo_importance = float(
        sum(
            importance
            for feature, importance
            in zip(
                ENGINEERED_FEATURES,
                importances
            )
            if feature in elo_features
        )
    )

    relative_features = float(
        1.0 - elo_importance
    )

    # --------------------------------------------------------
    # REPORT
    # --------------------------------------------------------

    model_report = {

        "pipeline_step": "42",

        "status": "PASS",

        "source": (
            "data/ml/features_v3.csv"
        ),

        "population": {

            "total_rows": EXPECTED_ROWS,

            "training_rows": len(
                train_df
            ),

            "testing_rows": len(
                test_df
            ),

            "train_ratio": TRAIN_RATIO
        },

        "date_range": {

            "training_through":
                train_end_date.strftime(
                    "%Y-%m-%d"
                ),

            "testing_from":
                test_start_date.strftime(
                    "%Y-%m-%d"
                )
        },

        "source_features":
            RAW_FEATURE_COLUMNS,

        "engineered_features":
            ENGINEERED_FEATURES,

        "target": "target",

        "target_classes": LABELS,

        "model": {

            "type":
                "XGBoostClassifier "
                "(Relative Engineered Features)",

            "n_estimators": 300,

            "max_depth": 6,

            "learning_rate": 0.05,

            "min_child_weight": 3,

            "subsample": 0.85,

            "colsample_bytree": 0.85,

            "objective":
                "multi:softprob",

            "sample_weight":
                "balanced "
                "(calculated from "
                "training set only)"
        },

        "evaluation": {

            "accuracy":
                accuracy,

            "accuracy_percent":
                accuracy * 100,

            "balanced_accuracy":
                balanced_accuracy,

            "macro_f1":
                macro_f1,

            "weighted_f1":
                weighted_f1,

            "log_loss":
                logloss,

            "baseline_accuracy_percent":
                BASELINE_ACCURACY,

            "elo_only_accuracy_percent":
                ELO_ONLY_ACCURACY,

            "xgb_balanced_accuracy_percent":
                XGB_BALANCED_ACCURACY,

            "xgb_natural_accuracy_percent":
                XGB_NATURAL_ACCURACY,

            "xgb_ewma_accuracy_percent":
                XGB_EWMA_ACCURACY,

            "difference_vs_baseline_pp":
                diff_baseline,

            "difference_vs_elo_only_pp":
                diff_elo,

            "difference_vs_xgb_balanced_pp":
                diff_xgb_bal,

            "difference_vs_xgb_natural_pp":
                diff_xgb_nat,

            "difference_vs_xgb_ewma_pp":
                diff_xgb_ewma,

            "classification_report":
                report,

            "confusion_matrix":
                cm.tolist(),

            "feature_importances":
                dict(
                    zip(
                        ENGINEERED_FEATURES,
                        importances.tolist()
                    )
                ),

            "signal_contribution": {

                "elo_relative":
                    elo_importance,

                "non_elo_relative":
                    relative_features
            }
        },

        "leakage_control": {

            "chronological_split":
                True,

            "same_day_order":
                "date + match_id",

            "target_mapping_applied_after_split":
                True,

            "sample_weights_from_train_only":
                True,

            "feature_engineering":
                "deterministic row-local "
                "transformations",

            "source_features":
                "strictly pre-match",

            "future_match_results_used":
                False
        },

        "output":
            MODEL_FILE
    }

    # --------------------------------------------------------
    # ATOMIC REPORT WRITE
    # --------------------------------------------------------

    temp_report = (
        REPORT_FILE + ".tmp"
    )

    with open(
        temp_report,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            model_report,
            f,
            indent=2
        )

    os.replace(
        temp_report,
        REPORT_FILE
    )

    # ========================================================
    # CONSOLE OUTPUT
    # ========================================================

    print()
    print("=" * 60)
    print(" STEP 42 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"🎯 Accuracy:              "
        f"{accuracy * 100:.2f}%"
    )

    print(
        f"⚖️ Balanced Accuracy:     "
        f"{balanced_accuracy * 100:.2f}%"
    )

    print(
        f"🧠 Macro F1:              "
        f"{macro_f1 * 100:.2f}%"
    )

    print(
        f"📊 Weighted F1:           "
        f"{weighted_f1 * 100:.2f}%"
    )

    print(
        f"📉 Log Loss:              "
        f"{logloss:.4f}"
    )

    print()
    print("📊 Reference Models")
    print("-" * 60)

    print(
        f"   Original baseline:     "
        f"{BASELINE_ACCURACY:.2f}%"
    )

    print(
        f"   ELO-only:              "
        f"{ELO_ONLY_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (Balanced):    "
        f"{XGB_BALANCED_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (Natural):     "
        f"{XGB_NATURAL_ACCURACY:.2f}%"
    )

    print(
        f"   XGBoost (EWMA):        "
        f"{XGB_EWMA_ACCURACY:.2f}%"
    )

    print()
    print("🚀 Model Comparison")
    print("-" * 60)

    print(
        f"   vs XGBoost (EWMA):     "
        f"{diff_xgb_ewma:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Natural):  "
        f"{diff_xgb_nat:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Balanced): "
        f"{diff_xgb_bal:+.2f} pp"
    )

    print(
        f"   vs ELO-only:           "
        f"{diff_elo:+.2f} pp"
    )

    print(
        f"   vs Original baseline:  "
        f"{diff_baseline:+.2f} pp"
    )

    print()
    print("📋 Classification Report")
    print("-" * 60)

    print(
        classification_report(
            y_test_str,
            y_pred_str,
            labels=LABELS,
            zero_division=0
        )
    )

    print("🧩 Confusion Matrix")
    print("-" * 60)

    print(
        f"{'':>12}"
        f"{'HOME_WIN':>12}"
        f"{'DRAW':>12}"
        f"{'AWAY_WIN':>12}"
    )

    for i, label in enumerate(LABELS):

        print(
            f"{label:>12}"
            f"{cm[i, 0]:>12,}"
            f"{cm[i, 1]:>12,}"
            f"{cm[i, 2]:>12,}"
        )

    print()
    print("🧠 Feature Importances")
    print("-" * 60)

    importance_rows = sorted(
        zip(
            ENGINEERED_FEATURES,
            importances
        ),
        key=lambda x: x[1],
        reverse=True
    )

    for rank, (
        feature,
        importance
    ) in enumerate(
        importance_rows,
        start=1
    ):

        print(
            f"   {rank:>2}. "
            f"{feature:<32} "
            f"{importance * 100:>7.2f}%"
        )

    print()
    print("🧠 Signal Contribution")
    print("-" * 60)

    print(
        f"   ELO relative:       "
        f"{elo_importance * 100:>6.2f}%"
    )

    print(
        f"   Other relative:     "
        f"{relative_features * 100:>6.2f}%"
    )

    print()
    print(
        f"📁 Model:               "
        f"{MODEL_FILE}"
    )

    print(
        f"📁 Report:              "
        f"{REPORT_FILE}"
    )

    print()

    print(
        "🔒 Step 40 feature dataset "
        "was NOT modified."
    )

    print(
        "🔒 Features are strictly "
        "pre-match."
    )

    print(
        "🔒 Chronological split enforced."
    )

    print(
        "🔒 Target encoder fitted "
        "on training data only."
    )

    print(
        "🔒 Sample weights derived "
        "strictly from training data."
    )

    print(
        "🔒 Relative features are "
        "deterministic row-local transforms."
    )

    print(
        "🔒 No future match results "
        "entered the model."
    )

    print(
        "🔒 Exact population preserved: "
        "484,354."
    )

    print("=" * 60)


if __name__ == "__main__":
    run()