import os
import json
import joblib
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
)

# ============================================================
# ZOKASCORE V2 — STEP 34.1
# BALANCED ELO BASELINE EXPERIMENT
# ============================================================
#
# Input:
#   data/ml/features_elo.csv
#
# Population:
#   EXACTLY 484,354 matches
#
# Features:
#   home_elo_pre
#   away_elo_pre
#
# Target:
#   HOME_WIN
#   DRAW
#   AWAY_WIN
#
# Model:
#   Logistic Regression
#   class_weight="balanced"
#
# Split:
#   Chronological 80/20
#
# IMPORTANT:
#   This is an experimental alternative to Step 34.
#   Step 34 remains the original baseline.
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

FEATURES_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ml",
    "features_elo.csv"
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
    "balanced_elo_logistic_regression.joblib"
)

REPORT_FILE = os.path.join(
    REPORT_DIR,
    "balanced_elo_baseline_report.json"
)

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80

# Step 34 measured baseline
PREVIOUS_BASELINE_ACCURACY = 51.23

REQUIRED_COLUMNS = [
    "match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",
    "target",
]

TARGETS = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
}

LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
]

FEATURES = [
    "home_elo_pre",
    "away_elo_pre",
]


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 34.1: BALANCED ELO BASELINE")
    print("=" * 60)
    print()

    # --------------------------------------------------------
    # [1/8] SOURCE CHECK
    # --------------------------------------------------------

    print("[1/8] Checking Step 33 feature dataset...")

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Step 33 feature dataset not found:\n"
            f"{FEATURES_FILE}"
        )

    print(f"   ↳ Source: {FEATURES_FILE}")

    # --------------------------------------------------------
    # [2/8] LOAD
    # --------------------------------------------------------

    print("\n[2/8] Loading feature dataset...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    row_count = len(df)

    print(
        f"   ↳ Rows loaded: {row_count:,}"
    )

    if row_count != EXPECTED_ROWS:
        raise RuntimeError(
            f"POPULATION MISMATCH: expected "
            f"{EXPECTED_ROWS:,}, got {row_count:,}."
        )

    print(
        f"   ✅ Exact expected population: "
        f"{EXPECTED_ROWS:,}"
    )

    # --------------------------------------------------------
    # [3/8] STRUCTURAL VALIDATION
    # --------------------------------------------------------

    print("\n[3/8] Validating feature dataset...")

    missing = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing:
        raise RuntimeError(
            f"Missing required columns: {missing}"
        )

    print("   ✅ Required columns present.")

    # Match IDs
    if df["match_id"].isna().any():
        raise RuntimeError(
            "Missing Match IDs detected."
        )

    duplicate_ids = int(
        df["match_id"].duplicated().sum()
    )

    if duplicate_ids != 0:
        raise RuntimeError(
            f"Duplicate Match IDs detected: "
            f"{duplicate_ids:,}"
        )

    print(
        "   ✅ Match IDs present and unique."
    )

    # Dates
    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    invalid_dates = int(
        df["date"].isna().sum()
    )

    if invalid_dates != 0:
        raise RuntimeError(
            f"Invalid dates detected: "
            f"{invalid_dates:,}"
        )

    print("   ✅ Dates valid.")

    # Numeric ELO fields
    for column in [
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff",
    ]:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        if df[column].isna().any():
            raise RuntimeError(
                f"{column} contains missing/non-numeric values."
            )

        if not df[column].map(
            lambda x: pd.notna(x)
            and abs(float(x)) < float("inf")
        ).all():

            raise RuntimeError(
                f"{column} contains non-finite values."
            )

    print("   ✅ ELO values valid.")

    # Verify Elo difference
    calculated_diff = (
        df["home_elo_pre"]
        - df["away_elo_pre"]
    ).round(2)

    stored_diff = df["elo_diff"].round(2)

    if not calculated_diff.equals(stored_diff):

        mismatch_count = int(
            (calculated_diff != stored_diff).sum()
        )

        raise RuntimeError(
            f"ELO difference integrity failure: "
            f"{mismatch_count:,} mismatches."
        )

    print(
        "   ✅ ELO difference integrity verified."
    )

    # Target
    if df["target"].isna().any():
        raise RuntimeError(
            "Missing target values detected."
        )

    invalid_targets = (
        set(df["target"].unique())
        - TARGETS
    )

    if invalid_targets:
        raise RuntimeError(
            f"Unexpected target values: "
            f"{invalid_targets}"
        )

    print("   ✅ Target classes valid.")

    # --------------------------------------------------------
    # [4/8] CHRONOLOGICAL ORDER
    # --------------------------------------------------------

    print(
        "\n[4/8] Preparing deterministic chronological order..."
    )

    df = df.sort_values(
        by=["date", "match_id"],
        kind="mergesort"
    ).reset_index(drop=True)

    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(
            "Population changed during chronological sorting."
        )

    print(
        "   ✅ Ordered by date + match_id."
    )

    # --------------------------------------------------------
    # [5/8] 80/20 SPLIT
    # --------------------------------------------------------

    print(
        "\n[5/8] Creating chronological 80/20 split..."
    )

    split_idx = int(
        EXPECTED_ROWS * TRAIN_RATIO
    )

    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    train_count = len(train_df)
    test_count = len(test_df)

    if train_count + test_count != EXPECTED_ROWS:
        raise RuntimeError(
            "Train/test population mismatch."
        )

    train_end_date = train_df.iloc[-1]["date"]
    test_start_date = test_df.iloc[0]["date"]

    print(
        f"   ↳ Training: {train_count:,} matches"
    )

    print(
        f"      Through: {train_end_date.date()}"
    )

    print(
        f"   ↳ Testing:  {test_count:,} matches"
    )

    print(
        f"      From:    {test_start_date.date()}"
    )

    # --------------------------------------------------------
    # [6/8] TRAIN BALANCED MODEL
    # --------------------------------------------------------

    print(
        "\n[6/8] Training balanced Logistic Regression..."
    )

    X_train = train_df[FEATURES]
    y_train = train_df["target"]

    X_test = test_df[FEATURES]
    y_test = test_df["target"]

    model = LogisticRegression(
        solver="lbfgs",
        max_iter=1000,
        random_state=42,
        class_weight="balanced",
    )

    model.fit(
        X_train,
        y_train
    )

    print(
        "   ✅ Balanced model trained."
    )

    # --------------------------------------------------------
    # [7/8] EVALUATE
    # --------------------------------------------------------

    print(
        "\n[7/8] Evaluating unseen chronological test data..."
    )

    y_pred = model.predict(X_test)

    accuracy = accuracy_score(
        y_test,
        y_pred
    )

    balanced_accuracy = balanced_accuracy_score(
        y_test,
        y_pred
    )

    difference = (
        accuracy * 100
    ) - PREVIOUS_BASELINE_ACCURACY

    report = classification_report(
        y_test,
        y_pred,
        labels=LABELS,
        output_dict=True,
        zero_division=0,
    )

    matrix = confusion_matrix(
        y_test,
        y_pred,
        labels=LABELS,
    )

    print(
        f"   ↳ Accuracy:          "
        f"{accuracy * 100:.2f}%"
    )

    print(
        f"   ↳ Balanced accuracy: "
        f"{balanced_accuracy * 100:.2f}%"
    )

    # --------------------------------------------------------
    # [8/8] SAVE ARTIFACTS
    # --------------------------------------------------------

    print(
        "\n[8/8] Saving model and audit report..."
    )

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORT_DIR,
        exist_ok=True
    )

    temp_model = MODEL_FILE + ".tmp"

    joblib.dump(
        model,
        temp_model
    )

    os.replace(
        temp_model,
        MODEL_FILE
    )

    model_report = {

        "pipeline_step": "34.1",

        "status": "PASS",

        "experiment_type":
            "balanced_alternative_baseline",

        "source":
            "data/ml/features_elo.csv",

        "population": {
            "total_rows": EXPECTED_ROWS,
            "training_rows": train_count,
            "testing_rows": test_count,
            "train_ratio": TRAIN_RATIO,
        },

        "date_range": {
            "training_through":
                train_end_date.strftime("%Y-%m-%d"),
            "testing_from":
                test_start_date.strftime("%Y-%m-%d"),
        },

        "features": FEATURES,

        "target": "target",

        "target_classes": LABELS,

        "model": {
            "type": "LogisticRegression",
            "solver": "lbfgs",
            "max_iter": 1000,
            "random_state": 42,
            "class_weight": "balanced",
        },

        "evaluation": {

            "accuracy":
                float(accuracy),

            "accuracy_percent":
                float(accuracy * 100),

            "balanced_accuracy":
                float(balanced_accuracy),

            "balanced_accuracy_percent":
                float(balanced_accuracy * 100),

            "previous_step_34_accuracy_percent":
                PREVIOUS_BASELINE_ACCURACY,

            "accuracy_difference_percentage_points":
                float(difference),

            "classification_report":
                report,

            "confusion_matrix":
                matrix.tolist(),
        },

        "leakage_control": {

            "chronological_split": True,

            "training_before_testing": True,

            "ordering":
                ["date", "match_id"],

            "features_are_pre_match_elo":
                True,

            "elo_recalculated":
                False,
        },

        "outputs": {
            "model": MODEL_FILE,
            "report": REPORT_FILE,
        },
    }

    temp_report = REPORT_FILE + ".tmp"

    with open(
        temp_report,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            model_report,
            file,
            indent=2
        )

    os.replace(
        temp_report,
        REPORT_FILE
    )

    # --------------------------------------------------------
    # FINAL
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print(" STEP 34.1 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"📊 Total matches:       "
        f"{EXPECTED_ROWS:,}"
    )

    print(
        f"📊 Training matches:    "
        f"{train_count:,}"
    )

    print(
        f"📊 Testing matches:     "
        f"{test_count:,}"
    )

    print(
        f"📊 Accuracy:             "
        f"{accuracy * 100:.2f}%"
    )

    print(
        f"📊 Balanced accuracy:    "
        f"{balanced_accuracy * 100:.2f}%"
    )

    print(
        f"📊 Step 34 baseline:     "
        f"{PREVIOUS_BASELINE_ACCURACY:.2f}%"
    )

    if difference > 0:
        print(
            f"📈 Accuracy difference:  "
            f"+{difference:.2f} pp"
        )
    elif difference < 0:
        print(
            f"📉 Accuracy difference:  "
            f"{difference:.2f} pp"
        )
    else:
        print(
            "➡️ Accuracy difference:  "
            "0.00 pp"
        )

    print()
    print("📋 Classification Report")
    print("-" * 60)

    print(
        classification_report(
            y_test,
            y_pred,
            labels=LABELS,
            zero_division=0,
        )
    )

    print(
        f"📁 Model:  {MODEL_FILE}"
    )

    print(
        f"📁 Report: {REPORT_FILE}"
    )

    print()
    print(
        "🔒 Step 33 dataset was NOT modified."
    )

    print(
        "🔒 Step 34 baseline was NOT overwritten."
    )

    print(
        "🔒 No ELO was recalculated."
    )

    print(
        "🔒 No future matches entered training."
    )

    print(
        "🔒 Exact population preserved: 484,354."
    )

    print("=" * 60)


if __name__ == "__main__":
    run()