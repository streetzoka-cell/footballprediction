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
# ZOKASCORE V2 — STEP 42.1
# COMBINED RAW + RELATIVE FEATURE TRAINING
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
    "xgboost_combined_v1.joblib"
)

REPORT_FILE = os.path.join(
    REPORT_DIR,
    "xgboost_combined_model_report.json"
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
XGB_RELATIVE_ACCURACY = 47.66


# ============================================================
# RAW FEATURES FROM STEP 40
# ============================================================

RAW_FEATURES = [
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
    "away_away_matches_before"
]


# ============================================================
# RELATIVE / INTERACTION FEATURES
# ============================================================

RELATIVE_FEATURES = [
    "elo_diff_relative",
    "form_diff",
    "gd_diff",

    "home_att_vs_away_def",
    "away_att_vs_home_def",

    "venue_form_diff",
    "venue_gd_diff",

    "venue_home_att_vs_away_def",
    "venue_away_att_vs_home_def",

    "elo_form_conflict",
    "venue_elo_form_conflict"
]


# ============================================================
# FINAL MODEL FEATURE SET
# ============================================================

FEATURE_COLUMNS = RAW_FEATURES + RELATIVE_FEATURES


# ============================================================
# FEATURE ENGINEERING
# ============================================================

def engineer_features(data):
    """
    Create deterministic row-local relative features.

    IMPORTANT:
    These transformations use only pre-match features already
    present in Step 40. No target, result, or future information
    is used.
    """

    data = data.copy()

    # --------------------------------------------------------
    # ELO relative strength
    # --------------------------------------------------------
    data["elo_diff_relative"] = (
        data["home_elo_pre"] -
        data["away_elo_pre"]
    )

    # --------------------------------------------------------
    # Overall form difference
    # --------------------------------------------------------
    data["form_diff"] = (
        data["home_ewma_pts"] -
        data["away_ewma_pts"]
    )

    # --------------------------------------------------------
    # Overall goal-difference strength
    # --------------------------------------------------------
    data["gd_diff"] = (
        data["home_ewma_gd"] -
        data["away_ewma_gd"]
    )

    # --------------------------------------------------------
    # Home attack vs away defense
    # --------------------------------------------------------
    data["home_att_vs_away_def"] = (
        data["home_ewma_gf"] -
        data["away_ewma_ga"]
    )

    # --------------------------------------------------------
    # Away attack vs home defense
    # --------------------------------------------------------
    data["away_att_vs_home_def"] = (
        data["away_ewma_gf"] -
        data["home_ewma_ga"]
    )

    # --------------------------------------------------------
    # Venue-specific form
    # --------------------------------------------------------
    data["venue_form_diff"] = (
        data["home_ewma_home_pts"] -
        data["away_ewma_away_pts"]
    )

    # --------------------------------------------------------
    # Venue-specific goal difference
    # --------------------------------------------------------
    data["venue_gd_diff"] = (
        data["home_ewma_home_gd"] -
        data["away_ewma_away_gd"]
    )

    # --------------------------------------------------------
    # Venue-specific attacking strength
    # --------------------------------------------------------
    data["venue_home_att_vs_away_def"] = (
        data["home_ewma_home_gf"] -
        data["away_ewma_away_ga"]
    )

    # --------------------------------------------------------
    # Venue-specific away attacking strength
    # --------------------------------------------------------
    data["venue_away_att_vs_home_def"] = (
        data["away_ewma_away_gf"] -
        data["home_ewma_home_ga"]
    )

    # --------------------------------------------------------
    # ELO / form interaction
    # --------------------------------------------------------
    data["elo_form_conflict"] = (
        data["elo_diff_relative"] *
        data["form_diff"]
    )

    # --------------------------------------------------------
    # ELO / venue-form interaction
    # --------------------------------------------------------
    data["venue_elo_form_conflict"] = (
        data["elo_diff_relative"] *
        data["venue_form_diff"]
    )

    return data


# ============================================================
# MAIN PIPELINE
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 42.1")
    print(" COMBINED RAW + RELATIVE FEATURE TRAINING")
    print("=" * 60)
    print()


    # ========================================================
    # 1. CHECK SOURCE DATASET
    # ========================================================

    print("[1/8] Checking Step 40 feature dataset...")

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Feature dataset not found:\n{FEATURES_FILE}"
        )

    print("   ✅ Step 40 feature dataset found.")


    # ========================================================
    # 2. LOAD DATASET
    # ========================================================

    print("\n[2/8] Loading features...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(
            f"POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {len(df):,}."
        )

    print(f"   ↳ Rows loaded: {len(df):,}")


    # ========================================================
    # 3. VALIDATE SOURCE DATASET
    # ========================================================

    print("\n[3/8] Validating raw source dataset...")

    required_columns = (
        RAW_FEATURES +
        [
            "match_id",
            "date",
            "target"
        ]
    )

    missing = [
        c for c in required_columns
        if c not in df.columns
    ]

    if missing:
        raise RuntimeError(
            f"Missing required columns: {missing}"
        )


    # --------------------------------------------------------
    # Match identity
    # --------------------------------------------------------

    if df["match_id"].isna().any():
        raise RuntimeError(
            "Match IDs are missing."
        )

    if df["match_id"].duplicated().any():
        raise RuntimeError(
            "Duplicate match IDs detected."
        )


    # --------------------------------------------------------
    # Date validation
    # --------------------------------------------------------

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    if df["date"].isna().any():
        raise RuntimeError(
            "Invalid dates found."
        )


    # --------------------------------------------------------
    # Numeric validation
    # --------------------------------------------------------

    for col in RAW_FEATURES:

        df[col] = pd.to_numeric(
            df[col],
            errors="coerce"
        )

        if df[col].isna().any():
            raise RuntimeError(
                f"{col} contains invalid/missing values."
            )


    # --------------------------------------------------------
    # Target validation
    # --------------------------------------------------------

    invalid_targets = (
        set(df["target"].unique()) -
        set(LABELS)
    )

    if invalid_targets:
        raise RuntimeError(
            f"Invalid target values: {invalid_targets}"
        )

    print(
        "   ✅ Structural, numeric, identity, "
        "and target integrity verified."
    )


    # ========================================================
    # 4. CHRONOLOGICAL SPLIT
    # ========================================================

    print(
        "\n[4/8] Preparing deterministic "
        "chronological split..."
    )

    df = df.sort_values(
        by=["date", "match_id"],
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


    print(
        f"   ↳ Training: {len(train_df):,} matches "
        f"(Through "
        f"{train_df.iloc[-1]['date'].date()})"
    )

    print(
        f"   ↳ Testing:  {len(test_df):,} matches "
        f"(From "
        f"{test_df.iloc[0]['date'].date()})"
    )


    # ========================================================
    # 5. ENGINEER RELATIVE FEATURES
    # ========================================================

    print(
        "\n[5/8] Engineering relative interaction "
        "features..."
    )

    train_df = engineer_features(
        train_df
    )

    test_df = engineer_features(
        test_df
    )


    # --------------------------------------------------------
    # Validate engineered features
    # --------------------------------------------------------

    for col in RELATIVE_FEATURES:

        if col not in train_df.columns:
            raise RuntimeError(
                f"Engineered feature missing: {col}"
            )

        if not np.isfinite(
            train_df[col].to_numpy()
        ).all():
            raise RuntimeError(
                f"Non-finite values in training "
                f"feature: {col}"
            )

        if not np.isfinite(
            test_df[col].to_numpy()
        ).all():
            raise RuntimeError(
                f"Non-finite values in testing "
                f"feature: {col}"
            )


    print(
        f"   ↳ Raw features:      {len(RAW_FEATURES)}"
    )

    print(
        f"   ↳ Relative features: {len(RELATIVE_FEATURES)}"
    )

    print(
        f"   ↳ Total features:    {len(FEATURE_COLUMNS)}"
    )

    print(
        "   ✅ Relative features generated "
        "from pre-match information only."
    )


    # ========================================================
    # BUILD MATRICES
    # ========================================================

    X_train = train_df[
        FEATURE_COLUMNS
    ].astype(float)

    X_test = test_df[
        FEATURE_COLUMNS
    ].astype(float)

    y_train_raw = (
        train_df["target"]
        .astype(str)
    )

    y_test_raw = (
        test_df["target"]
        .astype(str)
    )


    # ========================================================
    # 6. TARGET ENCODING
    # ========================================================

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


    if list(le.classes_) != sorted(LABELS):
        raise RuntimeError(
            "Unexpected target class ordering."
        )


    # ========================================================
    # 7. TRAIN XGBOOST
    # ========================================================

    print(
        "\n[7/8] Training XGBoost "
        "(Balanced + Combined Features)..."
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


    # ========================================================
    # 8. EVALUATE + SAVE
    # ========================================================

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


    # --------------------------------------------------------
    # Metrics
    # --------------------------------------------------------

    accuracy = accuracy_score(
        y_test_str,
        y_pred_str
    )

    balanced_accuracy = balanced_accuracy_score(
        y_test_str,
        y_pred_str
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


    # --------------------------------------------------------
    # Reference comparisons
    # --------------------------------------------------------

    accuracy_percent = (
        accuracy * 100
    )

    diff_baseline = (
        accuracy_percent -
        BASELINE_ACCURACY
    )

    diff_elo = (
        accuracy_percent -
        ELO_ONLY_ACCURACY
    )

    diff_xgb_bal = (
        accuracy_percent -
        XGB_BALANCED_ACCURACY
    )

    diff_xgb_nat = (
        accuracy_percent -
        XGB_NATURAL_ACCURACY
    )

    diff_xgb_ewma = (
        accuracy_percent -
        XGB_EWMA_ACCURACY
    )

    diff_xgb_rel = (
        accuracy_percent -
        XGB_RELATIVE_ACCURACY
    )


    # --------------------------------------------------------
    # Classification
    # --------------------------------------------------------

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


    # --------------------------------------------------------
    # Feature importance
    # --------------------------------------------------------

    importances = (
        model.feature_importances_
    )

    importance_rows = sorted(
        zip(
            FEATURE_COLUMNS,
            importances
        ),
        key=lambda x: x[1],
        reverse=True
    )


    importances_dict = {
        feature: float(importance)
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
    }


    # --------------------------------------------------------
    # Signal contribution
    # --------------------------------------------------------

    elo_features = {
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff",
        "elo_diff_relative"
    }

    ewma_features = {
        feature
        for feature in FEATURE_COLUMNS
        if "ewma" in feature
    }

    relative_features = {
        feature
        for feature in RELATIVE_FEATURES
        if feature not in elo_features
    }


    elo_importance = sum(
        importance
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
        if feature in elo_features
    )


    ewma_importance = sum(
        importance
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
        if feature in ewma_features
    )


    relative_other_importance = sum(
        importance
        for feature, importance
        in zip(
            FEATURE_COLUMNS,
            importances
        )
        if feature in relative_features
    )


    # ========================================================
    # SAVE MODEL
    # ========================================================

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORT_DIR,
        exist_ok=True
    )


    temp_model = (
        MODEL_FILE +
        ".tmp"
    )

    joblib.dump(
        model,
        temp_model
    )

    os.replace(
        temp_model,
        MODEL_FILE
    )


    # ========================================================
    # REPORT
    # ========================================================

    model_report = {

        "pipeline_step": "42.1",

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
                train_df.iloc[-1]["date"]
                .strftime("%Y-%m-%d"),

            "testing_from":
                test_df.iloc[0]["date"]
                .strftime("%Y-%m-%d")
        },

        "features": {

            "raw": RAW_FEATURES,

            "relative": RELATIVE_FEATURES,

            "total": FEATURE_COLUMNS
        },

        "target": "target",

        "target_classes": LABELS,

        "model": {

            "type":
                "XGBoostClassifier "
                "(Combined Raw + Relative)",

            "n_estimators": 300,

            "max_depth": 6,

            "learning_rate": 0.05,

            "min_child_weight": 3,

            "subsample": 0.85,

            "colsample_bytree": 0.85,

            "gamma": 0.0,

            "reg_alpha": 0.0,

            "reg_lambda": 1.0,

            "objective":
                "multi:softprob",

            "sample_weight":
                "balanced "
                "(calculated from training "
                "set only)"
        },

        "evaluation": {

            "accuracy":
                float(accuracy),

            "accuracy_percent":
                float(accuracy_percent),

            "balanced_accuracy":
                float(balanced_accuracy),

            "macro_f1":
                float(macro_f1),

            "weighted_f1":
                float(weighted_f1),

            "log_loss":
                float(logloss),

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

            "xgb_relative_accuracy_percent":
                XGB_RELATIVE_ACCURACY,

            "difference_vs_baseline_pp":
                float(diff_baseline),

            "difference_vs_elo_only_pp":
                float(diff_elo),

            "difference_vs_xgb_balanced_pp":
                float(diff_xgb_bal),

            "difference_vs_xgb_natural_pp":
                float(diff_xgb_nat),

            "difference_vs_xgb_ewma_pp":
                float(diff_xgb_ewma),

            "difference_vs_xgb_relative_pp":
                float(diff_xgb_rel),

            "classification_report":
                report,

            "confusion_matrix":
                cm.tolist(),

            "feature_importances":
                importances_dict,

            "signal_contribution": {

                "elo_features":
                    float(elo_importance),

                "ewma_features":
                    float(ewma_importance),

                "relative_non_elo_features":
                    float(
                        relative_other_importance
                    )
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

            "feature_engineering_applied_after_split":
                True,

            "future_results_used":
                False,

            "source_dataset_modified":
                False
        },

        "output": MODEL_FILE
    }


    # ========================================================
    # SAVE REPORT ATOMICALLY
    # ========================================================

    temp_report = (
        REPORT_FILE +
        ".tmp"
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
    print(" STEP 42.1 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"🎯 Accuracy:              "
        f"{accuracy_percent:.2f}%"
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


    # ========================================================
    # REFERENCE MODELS
    # ========================================================

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

    print(
        f"   XGBoost (Relative):    "
        f"{XGB_RELATIVE_ACCURACY:.2f}%"
    )


    # ========================================================
    # MODEL COMPARISON
    # ========================================================

    print()

    print("🚀 Model Comparison")
    print("-" * 60)

    print(
        f"   vs XGBoost (Relative): "
        f"{diff_xgb_rel:+.2f} pp"
    )

    print(
        f"   vs XGBoost (EWMA):     "
        f"{diff_xgb_ewma:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Balanced): "
        f"{diff_xgb_bal:+.2f} pp"
    )

    print(
        f"   vs XGBoost (Natural):  "
        f"{diff_xgb_nat:+.2f} pp"
    )

    print(
        f"   vs ELO-only:           "
        f"{diff_elo:+.2f} pp"
    )

    print(
        f"   vs Original baseline:  "
        f"{diff_baseline:+.2f} pp"
    )


    # ========================================================
    # CLASSIFICATION REPORT
    # ========================================================

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


    # ========================================================
    # CONFUSION MATRIX
    # ========================================================

    print("🧩 Confusion Matrix")
    print("-" * 60)

    print(
        f"{'':>12}"
        f"{'HOME_WIN':>12}"
        f"{'DRAW':>12}"
        f"{'AWAY_WIN':>12}"
    )

    for i, label in enumerate(
        LABELS
    ):

        print(
            f"{label:>12}"
            f"{cm[i, 0]:>12,}"
            f"{cm[i, 1]:>12,}"
            f"{cm[i, 2]:>12,}"
        )


    # ========================================================
    # FEATURE IMPORTANCES
    # ========================================================

    print()

    print("🧠 Top 20 Feature Importances")
    print("-" * 60)

    for rank, (
        feature,
        importance
    ) in enumerate(
        importance_rows[:20],
        start=1
    ):

        print(
            f"   {rank:>2}. "
            f"{feature:<34} "
            f"{importance * 100:>7.2f}%"
        )


    # ========================================================
    # SIGNAL CONTRIBUTION
    # ========================================================

    print()

    print("🧠 Signal Contribution")
    print("-" * 60)

    print(
        f"   ELO features:          "
        f"{elo_importance * 100:>6.2f}%"
    )

    print(
        f"   EWMA features:         "
        f"{ewma_importance * 100:>6.2f}%"
    )

    print(
        f"   Relative non-ELO:      "
        f"{relative_other_importance * 100:>6.2f}%"
    )


    # ========================================================
    # ARTIFACTS
    # ========================================================

    print()

    print(
        f"📁 Model:               "
        f"{MODEL_FILE}"
    )

    print(
        f"📁 Report:              "
        f"{REPORT_FILE}"
    )


    # ========================================================
    # INTEGRITY STATEMENTS
    # ========================================================

    print()

    print(
        "🔒 Step 40 feature dataset was NOT modified."
    )

    print(
        "🔒 Features are strictly pre-match."
    )

    print(
        "🔒 Chronological split enforced."
    )

    print(
        "🔒 Target encoder fitted on training data only."
    )

    print(
        "🔒 Sample weights derived strictly "
        "from training data."
    )

    print(
        "🔒 Relative features are deterministic "
        "row-local transforms."
    )

    print(
        "🔒 No future match results entered the model."
    )

    print(
        "🔒 Exact population preserved: 484,354."
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()