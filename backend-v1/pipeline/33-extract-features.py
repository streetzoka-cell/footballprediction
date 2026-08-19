import os
import pandas as pd

# ============================================================
# ZOKASCORE V2 — STEP 33
# CANONICAL ELO FEATURE EXTRACTION
# ============================================================
#
# Source of truth:
#   data/processed/master_with_elo.csv
#
# Output:
#   data/ml/features_elo.csv
#
# Step 33 is a pure projection of the validated Step 32 ELO
# dataset.
#
# It does NOT:
#   - scan historical JSON
#   - rebuild team identity
#   - recalculate ELO
#   - use a separate ELO index
#   - modify Step 32 output
#
# Expected population:
#   484,354
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "master_with_elo.csv"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "ml"
)

OUTPUT_FILE = os.path.join(
    OUTPUT_DIR,
    "features_elo.csv"
)

EXPECTED_ROWS = 484354


# ============================================================
# REQUIRED SOURCE COLUMNS
# ============================================================

REQUIRED_COLUMNS = [
    "zokascore_match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "home_score",
    "away_score",
    "home_elo_pre",
    "away_elo_pre",
]


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 33: CANONICAL ELO FEATURES")
    print("=" * 60)
    print()

    # --------------------------------------------------------
    # [1/6] SOURCE CHECK
    # --------------------------------------------------------

    print("[1/6] Checking Step 32 output...")

    if not os.path.exists(SOURCE_FILE):
        raise FileNotFoundError(
            f"Step 32 output not found:\n{SOURCE_FILE}"
        )

    print(f"   ↳ Source: {SOURCE_FILE}")

    # --------------------------------------------------------
    # [2/6] LOAD STEP 32 DATASET
    # --------------------------------------------------------

    print("\n[2/6] Loading master_with_elo.csv...")

    df = pd.read_csv(
        SOURCE_FILE,
        low_memory=False
    )

    source_rows = len(df)

    print(f"   ↳ Rows loaded: {source_rows:,}")

    if source_rows != EXPECTED_ROWS:
        raise RuntimeError(
            f"STEP 32 POPULATION MISMATCH: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {source_rows:,}."
        )

    print(
        f"   ✅ Exact Step 32 population: "
        f"{EXPECTED_ROWS:,}"
    )

    # --------------------------------------------------------
    # [3/6] STRUCTURAL VALIDATION
    # --------------------------------------------------------

    print("\n[3/6] Validating Step 32 dataset...")

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise RuntimeError(
            "Missing required Step 32 columns: "
            + ", ".join(missing_columns)
        )

    print("   ✅ Required columns present.")

    # Match IDs
    if df["zokascore_match_id"].isna().any():
        count = int(
            df["zokascore_match_id"].isna().sum()
        )

        raise RuntimeError(
            f"Found {count:,} missing Match IDs."
        )

    duplicate_count = int(
        df["zokascore_match_id"].duplicated().sum()
    )

    if duplicate_count > 0:
        raise RuntimeError(
            f"Found {duplicate_count:,} duplicate Match IDs."
        )

    print("   ✅ Match IDs present and unique.")

    # Team IDs
    if df[
        ["home_team_id", "away_team_id"]
    ].isna().any().any():

        raise RuntimeError(
            "Missing canonical team IDs detected."
        )

    if (
        df["home_team_id"].astype(str)
        == df["away_team_id"].astype(str)
    ).any():

        count = int(
            (
                df["home_team_id"].astype(str)
                == df["away_team_id"].astype(str)
            ).sum()
        )

        raise RuntimeError(
            f"Found {count:,} self-match rows."
        )

    print("   ✅ Canonical team IDs valid.")

    # Dates
    parsed_dates = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    invalid_dates = int(
        parsed_dates.isna().sum()
    )

    if invalid_dates > 0:
        raise RuntimeError(
            f"Found {invalid_dates:,} invalid dates."
        )

    print("   ✅ Dates valid.")

    # Scores
    home_scores = pd.to_numeric(
        df["home_score"],
        errors="coerce"
    )

    away_scores = pd.to_numeric(
        df["away_score"],
        errors="coerce"
    )

    invalid_scores = (
        home_scores.isna()
        | away_scores.isna()
        | ~home_scores.mod(1).eq(0)
        | ~away_scores.mod(1).eq(0)
        | home_scores.lt(0)
        | away_scores.lt(0)
    )

    invalid_score_count = int(
        invalid_scores.sum()
    )

    if invalid_score_count > 0:
        raise RuntimeError(
            f"Found {invalid_score_count:,} invalid scores."
        )

    print("   ✅ Scores valid.")

        # ELO
    home_elo = pd.to_numeric(
        df["home_elo_pre"], 
        errors="coerce"
    )

    away_elo = pd.to_numeric(
        df["away_elo_pre"],
        errors="coerce"
    )
    invalid_elo = (
        ~home_elo.notna()
        | ~away_elo.notna()
        | ~home_elo.apply(pd.api.types.is_number)
        | ~away_elo.apply(pd.api.types.is_number)
    )

    # More reliable finite-number validation.
    invalid_elo = (
        home_elo.isna()
        | away_elo.isna()
        | ~home_elo.isin(home_elo[home_elo.notna()])
        | ~away_elo.isin(away_elo[away_elo.notna()])
    )

    # Explicit finite check.
    finite_home = pd.Series(
        pd.api.types.is_number(x) and pd.notna(x)
        for x in home_elo
    )

    finite_away = pd.Series(
        pd.api.types.is_number(x) and pd.notna(x)
        for x in away_elo
    )

    if not finite_home.all() or not finite_away.all():
        raise RuntimeError(
            "Non-finite or invalid ELO values detected."
        )

    if not (
        home_elo.abs() < float("inf")
    ).all() or not (
        away_elo.abs() < float("inf")
    ).all():

        raise RuntimeError(
            "Infinite ELO values detected."
        )

    print("   ✅ Pre-match ELO values valid.")

    # --------------------------------------------------------
    # [4/6] EXTRACT FEATURES
    # --------------------------------------------------------

    print("\n[4/6] Extracting ML features...")

    features_df = pd.DataFrame({
        "match_id": df["zokascore_match_id"],
        "date": parsed_dates.dt.strftime("%Y-%m-%d"),
        "home_team_id": df["home_team_id"],
        "away_team_id": df["away_team_id"],
        "home_elo_pre": home_elo.round(2),
        "away_elo_pre": away_elo.round(2),
    })

    features_df["elo_diff"] = (
        features_df["home_elo_pre"]
        - features_df["away_elo_pre"]
    ).round(2)

    # Vectorized target generation.
    features_df["target"] = "DRAW"

    features_df.loc[
        home_scores > away_scores,
        "target"
    ] = "HOME_WIN"

    features_df.loc[
        home_scores < away_scores,
        "target"
    ] = "AWAY_WIN"

    # --------------------------------------------------------
    # [5/6] FEATURE ACCOUNTING
    # --------------------------------------------------------

    print("\n[5/6] Validating generated features...")

    if len(features_df) != EXPECTED_ROWS:
        raise RuntimeError(
            f"Feature row count failure: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {len(features_df):,}."
        )

    if features_df["match_id"].isna().any():
        raise RuntimeError(
            "Generated features contain missing Match IDs."
        )

    if features_df["match_id"].duplicated().any():
        raise RuntimeError(
            "Generated features contain duplicate Match IDs."
        )

    expected_targets = {
        "HOME_WIN",
        "DRAW",
        "AWAY_WIN"
    }

    actual_targets = set(
        features_df["target"].unique()
    )

    if not actual_targets.issubset(
        expected_targets
    ):
        raise RuntimeError(
            f"Unexpected target values: "
            f"{actual_targets - expected_targets}"
        )

    target_total = len(
        features_df[
            features_df["target"].isin(expected_targets)
        ]
    )

    if target_total != EXPECTED_ROWS:
        raise RuntimeError(
            "Target accounting failure."
        )

    home_wins = int(
        (features_df["target"] == "HOME_WIN").sum()
    )

    draws = int(
        (features_df["target"] == "DRAW").sum()
    )

    away_wins = int(
        (features_df["target"] == "AWAY_WIN").sum()
    )

    if home_wins + draws + away_wins != EXPECTED_ROWS:
        raise RuntimeError(
            "Result accounting does not equal "
            f"{EXPECTED_ROWS:,}."
        )

    print(
        f"   ✅ Feature rows: {len(features_df):,}"
    )

    print(
        f"   ✅ Unique Match IDs: "
        f"{features_df['match_id'].nunique():,}"
    )

    print(
        f"   ✅ HOME_WIN: {home_wins:,}"
    )

    print(
        f"   ✅ DRAW:     {draws:,}"
    )

    print(
        f"   ✅ AWAY_WIN: {away_wins:,}"
    )

    # --------------------------------------------------------
    # [6/6] WRITE + RELOAD VALIDATION
    # --------------------------------------------------------

    print("\n[6/6] Writing ML feature dataset...")

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    temp_output = OUTPUT_FILE + ".tmp"

    features_df.to_csv(
        temp_output,
        index=False
    )

    # Reload the actual written file.
    verification = pd.read_csv(
        temp_output,
        low_memory=False
    )

    if len(verification) != EXPECTED_ROWS:
        raise RuntimeError(
            f"Output validation failed: "
            f"expected {EXPECTED_ROWS:,}, "
            f"got {len(verification):,}."
        )

    expected_output_columns = [
        "match_id",
        "date",
        "home_team_id",
        "away_team_id",
        "home_elo_pre",
        "away_elo_pre",
        "elo_diff",
        "target",
    ]

    if list(verification.columns) != expected_output_columns:
        raise RuntimeError(
            "Output column structure mismatch.\n"
            f"Expected: {expected_output_columns}\n"
            f"Got:      {list(verification.columns)}"
        )

    if verification["match_id"].duplicated().any():
        raise RuntimeError(
            "Output validation failed: duplicate Match IDs."
        )

    if verification["target"].isna().any():
        raise RuntimeError(
            "Output validation failed: missing targets."
        )

    os.replace(
        temp_output,
        OUTPUT_FILE
    )

    # --------------------------------------------------------
    # FINAL REPORT
    # --------------------------------------------------------

    print("\n" + "=" * 60)
    print(" STEP 33 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"📊 Step 32 source rows:  {source_rows:,}"
    )

    print(
        f"📊 Feature rows:        {len(features_df):,}"
    )

    print(
        f"📊 Unique Match IDs:    "
        f"{features_df['match_id'].nunique():,}"
    )

    print(
        f"📊 Home wins:           {home_wins:,}"
    )

    print(
        f"📊 Draws:               {draws:,}"
    )

    print(
        f"📊 Away wins:           {away_wins:,}"
    )

    print(
        f"📁 ML Features:         {OUTPUT_FILE}"
    )

    print()

    print(
        "🔒 Step 32 ELO dataset was NOT modified."
    )

    print(
        "🔒 Historical JSON files were NOT scanned."
    )

    print(
        "🔒 No ELO was recalculated."
    )

    print(
        "🔒 No team identity was re-resolved."
    )

    print(
        "🔒 Feature population exactly matches "
        "Step 32: 484,354."
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    try:
        run()

    except Exception as error:

        temp_output = OUTPUT_FILE + ".tmp"

        if os.path.exists(temp_output):
            try:
                os.remove(temp_output)
            except OSError:
                pass

        print()
        print("=" * 60)
        print(" ❌ STEP 33 FAILED")
        print("=" * 60)
        print(str(error))
        print("=" * 60)

        raise