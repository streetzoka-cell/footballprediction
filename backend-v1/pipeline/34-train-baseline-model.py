import os
import json
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)

# ============================================================
# ZOKASCORE V2 — STEP 34
# BASELINE MODEL TRAINING
# ============================================================
#
# Input:
#   data/ml/features_elo.csv
#
# Population:
#   EXACTLY 484,354 matches
#
# Features:
#   elo_diff
#
# Target:
#   HOME_WIN
#   DRAW
#   AWAY_WIN
#
# Split:
#   Chronological 80/20
#
# IMPORTANT:
#   This is a baseline model only.
#   No future information is used for training.
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
    "baseline_elo_logistic_regression.joblib"
)

REPORT_FILE = os.path.join(
    REPORT_DIR,
    "baseline_model_report.json"
)

EXPECTED_ROWS = 484354
TRAIN_RATIO = 0.80
BASELINE_ACCURACY = 47.97

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


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 34: BASELINE MODEL TRAINING")
    print("=" * 60)
    print()

    # --------------------------------------------------------
    # [1/7] SOURCE CHECK
    # --------------------------------------------------------

    print("[1/7] Checking Step 33 feature dataset...")

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(
            f"Step 33 feature dataset not found:\n"
            f"{FEATURES_FILE}"
        )

    print(f"   ↳ Source: {FEATURES_FILE}")

    # --------------------------------------------------------
    # [2/7] LOAD + POPULATION VALIDATION
    # --------------------------------------------------------

    print("\n[2/7] Loading features...")

    df = pd.read_csv(
        FEATURES_FILE,
        low_memory=False
    )

    row_count = len(df)

    print(f"   ↳ Rows loaded: {row_count:,}")

    if row_count != EXPECTED_ROWS:
        raise RuntimeError(
            f"STEP 33 POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {row_count:,}."
        )

    print(
        f"   ✅ Exact expected population: "
        f"{EXPECTED_ROWS:,}"
    )

    # --------------------------------------------------------
    # [3/7] STRUCTURAL VALIDATION
    # --------------------------------------------------------

    print("\n[3/7] Validating feature dataset...")

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise RuntimeError(
            "Missing required columns: "
            + ", ".join(missing_columns)
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

    if duplicate_ids > 0:
        raise RuntimeError(
            f"Found {duplicate_ids:,} duplicate Match IDs."
        )

    print("   ✅ Match IDs present and unique.")

    # Dates
    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    invalid_dates = int(
        df["date"].isna().sum()
    )

    if invalid_dates > 0:
        raise RuntimeError(
            f"Found {invalid_dates:,} invalid dates."
        )

    print("   ✅ Dates valid.")

    # ELO fields
    numeric_columns = [
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff",
    ]

    for column in numeric_columns:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        if df[column].isna().any():
            raise RuntimeError(
                f"{column} contains invalid/missing values."
            )

        if not df[column].map(
            lambda value: pd.notna(value)
            and abs(float(value)) < float("inf")
        ).all():

            raise RuntimeError(
                f"{column} contains non-finite values."
            )

    print("   ✅ ELO features valid.")

    # Target
    if df["target"].isna().any():
        raise RuntimeError(
            "Target contains missing values."
        )

    invalid_targets = set(
        df["target"].unique()
    ) - TARGETS

    if invalid_targets:
        raise RuntimeError(
            f"Unexpected target values: "
            f"{invalid_targets}"
        )

    print("   ✅ Targets valid.")

    # Verify ELO difference
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
            f"elo_diff integrity failure: "
            f"{mismatch_count:,} mismatches."
        )

    print("   ✅ ELO difference integrity verified.")

    # --------------------------------------------------------
    # [4/7] CHRONOLOGICAL ORDER + SPLIT
    # --------------------------------------------------------

    print("\n[4/7] Preparing chronological train/test split...")

    # Match IDs are used as the deterministic secondary key,
    # matching the Step 32 chronological convention.
    df = df.sort_values(
        by=["date", "match_id"],
        kind="mergesort"
    ).reset_index(drop=True)

    split_idx = int(
        len(df) * TRAIN_RATIO
    )

    if split_idx <= 0 or split_idx >= len(df):
        raise RuntimeError(
            "Invalid chronological split."
        )

    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    train_count = len(train_df)
    test_count = len(test_df)

    if train_count + test_count != EXPECTED_ROWS:
        raise RuntimeError(
            "Train/test population does not equal "
            f"{EXPECTED_ROWS:,}."
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

    print(
        f"   ✅ Chronological 80/20 split: "
        f"{train_count:,} / {test_count:,}"
    )

    # --------------------------------------------------------
    # [5/7] TRAIN
    # --------------------------------------------------------

    print("\n[5/7] Training Logistic Regression...")

    X_train = train_df[
        ["elo_diff"]
    ]

    y_train = train_df[
        "target"
    ]

    X_test = test_df[
        ["elo_diff"]
    ]

    y_test = test_df[
        "target"
    ]

    model = LogisticRegression(
        solver="lbfgs",
        max_iter=1000,
        random_state=42
    )

    model.fit(
        X_train,
        y_train
    )

    print("   ✅ Model trained.")

    # --------------------------------------------------------
    # [6/7] EVALUATE
    # --------------------------------------------------------

    print("\n[6/7] Evaluating unseen chronological test data...")

    y_pred = model.predict(X_test)

    accuracy = accuracy_score(
        y_test,
        y_pred
    )

    difference = (
        accuracy * 100
    ) - BASELINE_ACCURACY

    labels = [
        "HOME_WIN",
        "DRAW",
        "AWAY_WIN",
    ]

    report = classification_report(
        y_test,
        y_pred,
        labels=labels,
        output_dict=True,
        zero_division=0
    )

    matrix = confusion_matrix(
        y_test,
        y_pred,
        labels=labels
    )

    # --------------------------------------------------------
    # [7/7] PERSIST RESULTS
    # --------------------------------------------------------

    print("\n[7/7] Saving baseline model and report...")

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    os.makedirs(
        REPORT_DIR,
        exist_ok=True
    )

    # joblib is the standard persistence mechanism for
    # scikit-learn models.
    import joblib

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
        "pipeline_step": "34",
        "status": "PASS",

        "source": "data/ml/features_elo.csv",

        "population": {
            "total_rows": EXPECTED_ROWS,
            "training_rows": train_count,
            "testing_rows": test_count,
            "train_ratio": TRAIN_RATIO
        },

        "date_range": {
            "first_match": df.iloc[0]["date"].strftime("%Y-%m-%d"),
            "last_match": df.iloc[-1]["date"].strftime("%Y-%m-%d"),
            "training_through": train_end_date.strftime("%Y-%m-%d"),
            "testing_from": test_start_date.strftime("%Y-%m-%d")
        },

        "features": [
            "elo_diff"
        ],

        "target": "target",

        "target_classes": labels,

        "model": {
            "type": "LogisticRegression",
            "solver": "lbfgs",
            "max_iter": 1000,
            "random_state": 42
        },

        "evaluation": {
            "accuracy": accuracy,
            "accuracy_percent": accuracy * 100,
            "historical_baseline_percent": BASELINE_ACCURACY,
            "difference_percentage_points": difference,
            "classification_report": report,
            "confusion_matrix": matrix.tolist()
        },

        "leakage_control": {
            "chronological_split": True,
            "training_before_testing": True,
            "feature": "pre-match ELO difference",
            "same_day_order": "date + match_id"
        },

        "output": MODEL_FILE
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
    # FINAL OUTPUT
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print(" STEP 34 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"📊 Total matches:       {EXPECTED_ROWS:,}"
    )

    print(
        f"📊 Training matches:    {train_count:,}"
    )

    print(
        f"📊 Testing matches:     {test_count:,}"
    )

    print(
        f"📊 Model accuracy:      "
        f"{accuracy * 100:.2f}%"
    )

    print(
        f"📊 Historical baseline: "
        f"{BASELINE_ACCURACY:.2f}%"
    )

    if difference > 0:
        print(
            f"📈 Improvement:         "
            f"+{difference:.2f} percentage points"
        )
    elif difference < 0:
        print(
            f"📉 Difference:          "
            f"{difference:.2f} percentage points"
        )
    else:
        print(
            "➡️ Difference:          0.00 percentage points"
        )

    print()
    print("📋 Classification Report")
    print("-" * 60)

    print(
        classification_report(
            y_test,
            y_pred,
            labels=labels,
            zero_division=0
        )
    )

    print(
        f"📁 Model:               {MODEL_FILE}"
    )

    print(
        f"📁 Report:              {REPORT_FILE}"
    )

    print()
    print(
        "🔒 Step 33 feature dataset was NOT modified."
    )

    print(
        "🔒 No future matches were used for training."
    )

    print(
        "🔒 ELO was NOT recalculated."
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