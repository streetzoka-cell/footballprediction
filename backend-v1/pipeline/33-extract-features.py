import os
import tempfile

import numpy as np
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
# CONTRACT:
#   Step 33 is a PURE projection of the validated Step 32
#   master_with_elo.csv dataset.
#
# It does NOT:
#   - rebuild historical data
#   - scan historical JSON
#   - resolve team identities
#   - recalculate ELO
#   - use another ELO source
#   - silently drop malformed rows
#   - use a hard-coded expected row count
#
# Population:
#   Dynamically inherited from the validated Step 32 source.
#
# Every valid Step 32 match must produce exactly one Step 33
# feature row.
# ============================================================


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

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

TEMP_OUTPUT_FILE = OUTPUT_FILE + ".tmp"


# ============================================================
# SOURCE CONTRACT
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


OUTPUT_COLUMNS = [
    "match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",
    "target",
]


VALID_TARGETS = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
}


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    raise RuntimeError(message)


def validate_required_columns(df):
    missing = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing:
        fail(
            "Missing required Step 32 columns: "
            + ", ".join(missing)
        )


def validate_source(df):
    """
    Validate the entire Step 32 population.

    Nothing is silently dropped.
    """

    print("[3/6] Validating Step 32 dataset...")

    validate_required_columns(df)

    # --------------------------------------------------------
    # Match IDs
    # --------------------------------------------------------

    match_ids = (
        df["zokascore_match_id"]
        .astype("string")
        .str.strip()
    )

    if match_ids.isna().any() or (match_ids == "").any():
        count = int(
            match_ids.isna().sum()
            + (match_ids == "").sum()
        )

        fail(
            f"Found {count:,} missing/empty Match IDs."
        )

    duplicate_count = int(
        match_ids.duplicated().sum()
    )

    if duplicate_count:
        fail(
            f"Found {duplicate_count:,} duplicate Match IDs."
        )

    # --------------------------------------------------------
    # Team IDs
    # --------------------------------------------------------

    home_team = (
        df["home_team_id"]
        .astype("string")
        .str.strip()
    )

    away_team = (
        df["away_team_id"]
        .astype("string")
        .str.strip()
    )

    if home_team.isna().any() or (home_team == "").any():
        fail("Missing/empty home_team_id detected.")

    if away_team.isna().any() or (away_team == "").any():
        fail("Missing/empty away_team_id detected.")

    self_matches = (
        home_team == away_team
    )

    if self_matches.any():
        fail(
            f"Found {int(self_matches.sum()):,} self-match rows."
        )

    # --------------------------------------------------------
    # Dates
    # --------------------------------------------------------

    parsed_dates = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    invalid_dates = int(
        parsed_dates.isna().sum()
    )

    if invalid_dates:
        fail(
            f"Found {invalid_dates:,} invalid dates."
        )

    # --------------------------------------------------------
    # Scores
    # --------------------------------------------------------

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
        | ~np.isfinite(home_scores)
        | ~np.isfinite(away_scores)
        | (home_scores < 0)
        | (away_scores < 0)
        | (home_scores % 1 != 0)
        | (away_scores % 1 != 0)
    )

    invalid_score_count = int(
        invalid_scores.sum()
    )

    if invalid_score_count:
        fail(
            f"Found {invalid_score_count:,} invalid score rows."
        )

    # --------------------------------------------------------
    # ELO
    # --------------------------------------------------------

    home_elo = pd.to_numeric(
        df["home_elo_pre"],
        errors="coerce"
    )

    away_elo = pd.to_numeric(
        df["away_elo_pre"],
        errors="coerce"
    )

    invalid_elo = (
        home_elo.isna()
        | away_elo.isna()
        | ~np.isfinite(home_elo)
        | ~np.isfinite(away_elo)
    )

    invalid_elo_count = int(
        invalid_elo.sum()
    )

    if invalid_elo_count:
        fail(
            f"Found {invalid_elo_count:,} invalid ELO rows."
        )

    print("   ✅ Required columns present.")
    print("   ✅ Match IDs present and unique.")
    print("   ✅ Canonical team IDs valid.")
    print("   ✅ Dates valid.")
    print("   ✅ Scores valid.")
    print("   ✅ Pre-match ELO values valid.")

    return {
        "match_ids": match_ids,
        "home_team": home_team,
        "away_team": away_team,
        "dates": parsed_dates,
        "home_scores": home_scores,
        "away_scores": away_scores,
        "home_elo": home_elo,
        "away_elo": away_elo,
    }


# ============================================================
# FEATURE PROJECTION
# ============================================================

def build_features(df, validated):
    print("\n[4/6] Extracting ML features...")

    home_scores = validated["home_scores"]
    away_scores = validated["away_scores"]

    features = pd.DataFrame({
        "match_id": validated["match_ids"].astype(str),
        "date": validated["dates"].dt.strftime("%Y-%m-%d"),
        "home_team_id": validated["home_team"].astype(str),
        "away_team_id": validated["away_team"].astype(str),
        "home_elo_pre": validated["home_elo"].round(2),
        "away_elo_pre": validated["away_elo"].round(2),
    })

    features["elo_diff"] = (
        features["home_elo_pre"]
        - features["away_elo_pre"]
    ).round(2)

    features["target"] = np.select(
        [
            home_scores > away_scores,
            home_scores < away_scores,
        ],
        [
            "HOME_WIN",
            "AWAY_WIN",
        ],
        default="DRAW",
    )

    features = features[OUTPUT_COLUMNS]

    return features


# ============================================================
# OUTPUT VALIDATION
# ============================================================

def validate_output(features, source_rows):
    print("\n[5/6] Validating generated features...")

    if len(features) != source_rows:
        fail(
            "Feature population mismatch: "
            f"source={source_rows:,}, "
            f"features={len(features):,}."
        )

    if list(features.columns) != OUTPUT_COLUMNS:
        fail(
            "Output column structure mismatch."
        )

    if features["match_id"].isna().any():
        fail(
            "Generated features contain missing Match IDs."
        )

    if features["match_id"].duplicated().any():
        fail(
            "Generated features contain duplicate Match IDs."
        )

    if features["target"].isna().any():
        fail(
            "Generated features contain missing targets."
        )

    actual_targets = set(
        features["target"].unique()
    )

    if not actual_targets.issubset(VALID_TARGETS):
        fail(
            "Unexpected target values: "
            + str(
                actual_targets - VALID_TARGETS
            )
        )

    home_wins = int(
        (features["target"] == "HOME_WIN").sum()
    )

    draws = int(
        (features["target"] == "DRAW").sum()
    )

    away_wins = int(
        (features["target"] == "AWAY_WIN").sum()
    )

    if home_wins + draws + away_wins != source_rows:
        fail(
            "Result accounting mismatch."
        )

    print(
        f"   ✅ Feature rows: {len(features):,}"
    )

    print(
        f"   ✅ Unique Match IDs: "
        f"{features['match_id'].nunique():,}"
    )

    print(
        f"   ✅ HOME_WIN: {home_wins:,}"
    )

    print(
        f"   ✅ DRAW: {draws:,}"
    )

    print(
        f"   ✅ AWAY_WIN: {away_wins:,}"
    )

    return {
        "home_wins": home_wins,
        "draws": draws,
        "away_wins": away_wins,
    }


# ============================================================
# ATOMIC WRITE + RELOAD
# ============================================================

def write_output(features):
    print("\n[6/6] Writing ML feature dataset...")

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    features.to_csv(
        TEMP_OUTPUT_FILE,
        index=False
    )

    verification = pd.read_csv(
        TEMP_OUTPUT_FILE,
        low_memory=False
    )

    if len(verification) != len(features):
        fail(
            "Output reload population mismatch."
        )

    if list(verification.columns) != OUTPUT_COLUMNS:
        fail(
            "Output reload column mismatch."
        )

    if verification["match_id"].duplicated().any():
        fail(
            "Output reload contains duplicate Match IDs."
        )

    os.replace(
        TEMP_OUTPUT_FILE,
        OUTPUT_FILE
    )


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
        fail(
            f"Step 32 output not found:\n{SOURCE_FILE}"
        )

    print(
        f"   ↳ Source: {SOURCE_FILE}"
    )

    # --------------------------------------------------------
    # [2/6] LOAD
    # --------------------------------------------------------

    print("\n[2/6] Loading master_with_elo.csv...")

    df = pd.read_csv(
        SOURCE_FILE,
        low_memory=False
    )

    source_rows = len(df)

    if source_rows == 0:
        fail(
            "Step 32 dataset is empty."
        )

    print(
        f"   ↳ Rows loaded: {source_rows:,}"
    )

    # --------------------------------------------------------
    # [3/6] VALIDATE
    # --------------------------------------------------------

    validated = validate_source(df)

    # --------------------------------------------------------
    # [4/6] PROJECT
    # --------------------------------------------------------

    features = build_features(
        df,
        validated
    )

    # --------------------------------------------------------
    # [5/6] VALIDATE FEATURES
    # --------------------------------------------------------

    accounting = validate_output(
        features,
        source_rows
    )

    # --------------------------------------------------------
    # [6/6] WRITE
    # --------------------------------------------------------

    write_output(features)

    # --------------------------------------------------------
    # FINAL
    # --------------------------------------------------------

    print("\n" + "=" * 60)
    print(" STEP 33 COMPLETE: PASS")
    print("=" * 60)

    print(
        f"📊 Source population: {source_rows:,}"
    )

    print(
        f"📊 Feature population: {len(features):,}"
    )

    print(
        f"📊 Unique Match IDs: "
        f"{features['match_id'].nunique():,}"
    )

    print(
        f"📊 Home wins: {accounting['home_wins']:,}"
    )

    print(
        f"📊 Draws: {accounting['draws']:,}"
    )

    print(
        f"📊 Away wins: {accounting['away_wins']:,}"
    )

    print(
        f"📁 Features: {OUTPUT_FILE}"
    )

    print()
    print("🔒 No hard-coded population expectation.")
    print("🔒 Source population inherited dynamically from Step 32.")
    print("🔒 No rows silently dropped.")
    print("🔒 No ELO recalculation.")
    print("🔒 No identity resolution.")
    print("=" * 60)


if __name__ == "__main__":

    try:
        run()

    except Exception:

        if os.path.exists(TEMP_OUTPUT_FILE):
            try:
                os.remove(TEMP_OUTPUT_FILE)
            except OSError:
                pass

        print()
        print("=" * 60)
        print(" ❌ STEP 33 FAILED")
        print("=" * 60)

        raise
