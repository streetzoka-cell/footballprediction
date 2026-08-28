import os
import tempfile
import shutil
import pandas as pd
import numpy as np


# ============================================================
# ZOKASCORE V2 — STEP 46
# BUILD MARKET TARGETS — PRODUCTION / UNIFIED
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURE_CANDIDATES = [
    os.path.join(BASE_DIR, "data", "ml", "features_v3.csv"),
    os.path.join(BASE_DIR, "data", "ml", "features_v3_unique.csv"),
    os.path.join(BASE_DIR, "data", "ml", "features_v2.csv"),
    os.path.join(BASE_DIR, "data", "ml", "features_elo.csv"),
]

MASTER_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "master_with_elo.csv"
)

OUTPUT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ml",
    "features_v4_unified.csv"
)

REPORT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ml",
    "features_v4_unified_report.txt"
)

VALID_1X2 = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
}

MARKET_COLUMNS = [
    "ou_0_5",
    "ou_1_5",
    "ou_2_5",
    "ou_3_5",
    "btts",
]

REQUIRED_FEATURE_COLUMNS = [
    "match_id",
    "target",
]


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    print("\n" + "=" * 70)
    print("❌ PIPELINE 46 ABORTED")
    print("=" * 70)
    print(message)
    print("=" * 70)
    raise SystemExit(1)


def info(message):
    print(f"   ↳ {message}")


def success(message):
    print(f"   ✅ {message}")


def warning(message):
    print(f"   ⚠ {message}")


def section(number, title):
    print(f"\n[{number}/10] {title}...")
    print("-" * 70)


# ============================================================
# FILE DISCOVERY
# ============================================================

def find_features_file():
    for path in FEATURE_CANDIDATES:
        if os.path.isfile(path):
            return path

    fail(
        "No feature file found.\n\n"
        "Tried:\n" +
        "\n".join(f"   • {p}" for p in FEATURE_CANDIDATES)
    )


def verify_input_file(path, label):
    if not os.path.isfile(path):
        fail(f"{label} does not exist:\n{path}")

    if os.path.getsize(path) == 0:
        fail(f"{label} is empty:\n{path}")


# ============================================================
# ATOMIC CSV WRITER
# ============================================================

def atomic_write_csv(df, output_file):
    output_dir = os.path.dirname(output_file)

    os.makedirs(output_dir, exist_ok=True)

    fd, temp_file = tempfile.mkstemp(
        prefix="pipeline46_",
        suffix=".csv",
        dir=output_dir
    )

    os.close(fd)

    try:
        df.to_csv(
            temp_file,
            index=False,
            encoding="utf-8"
        )

        # Basic sanity check before replacing production file.
        if not os.path.isfile(temp_file):
            fail("Temporary output file was not created.")

        if os.path.getsize(temp_file) == 0:
            fail("Temporary output file is empty.")

        shutil.move(temp_file, output_file)

    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)


# ============================================================
# REPORT WRITER
# ============================================================

def write_report(lines):
    os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)

    fd, temp_file = tempfile.mkstemp(
        prefix="pipeline46_report_",
        suffix=".txt",
        dir=os.path.dirname(REPORT_FILE)
    )

    os.close(fd)

    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
            f.write("\n")

        shutil.move(temp_file, REPORT_FILE)

    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)


# ============================================================
# MATCH ID NORMALIZATION
# ============================================================

def normalize_match_ids(series):
    return (
        series
        .astype("string")
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
    )


# ============================================================
# TARGET DERIVATION
# ============================================================

def derive_1x2(home_goals, away_goals):
    return np.select(
        [
            home_goals > away_goals,
            home_goals < away_goals,
        ],
        [
            "HOME_WIN",
            "AWAY_WIN",
        ],
        default="DRAW"
    )


# ============================================================
# MARKET ENGINE
# ============================================================

def build_market_targets(df):

    df["total_goals"] = (
        df["home_goals"] +
        df["away_goals"]
    )

    df["ou_0_5"] = np.where(
        df["total_goals"] > 0.5,
        "OVER",
        "UNDER"
    )

    df["ou_1_5"] = np.where(
        df["total_goals"] > 1.5,
        "OVER",
        "UNDER"
    )

    df["ou_2_5"] = np.where(
        df["total_goals"] > 2.5,
        "OVER",
        "UNDER"
    )

    df["ou_3_5"] = np.where(
        df["total_goals"] > 3.5,
        "OVER",
        "UNDER"
    )

    df["btts"] = np.where(
        (
            (df["home_goals"] > 0) &
            (df["away_goals"] > 0)
        ),
        "YES",
        "NO"
    )

    return df


# ============================================================
# MARKET VALIDATION
# ============================================================

def validate_markets(df):

    allowed = {
        "ou_0_5": {"OVER", "UNDER"},
        "ou_1_5": {"OVER", "UNDER"},
        "ou_2_5": {"OVER", "UNDER"},
        "ou_3_5": {"OVER", "UNDER"},
        "btts": {"YES", "NO"},
    }

    for column, valid_values in allowed.items():

        if column not in df.columns:
            fail(f"Missing generated market column: {column}")

        if df[column].isna().any():
            fail(f"{column} contains NULL values.")

        actual = set(
            df[column]
            .astype(str)
            .unique()
        )

        invalid = actual - valid_values

        if invalid:
            fail(
                f"{column} contains invalid values: "
                f"{sorted(invalid)}"
            )


# ============================================================
# MAIN PIPELINE
# ============================================================

def run():

    print("\n" + "=" * 70)
    print(" ZOKASCORE V2 — STEP 46")
    print(" BUILD MARKET TARGETS — PRODUCTION / UNIFIED")
    print("=" * 70)

    report = []

    report.append("ZOKASCORE V2 — STEP 46 REPORT")
    report.append("=" * 70)

    # --------------------------------------------------------
    # 1. INPUT FILES
    # --------------------------------------------------------

    section(1, "Checking input files")

    features_file = find_features_file()

    verify_input_file(
        features_file,
        "Feature dataset"
    )

    verify_input_file(
        MASTER_FILE,
        "Master dataset"
    )

    info(f"Features: {os.path.basename(features_file)}")
    info(f"Master:   {os.path.basename(MASTER_FILE)}")

    success("Input files verified.")

    report.append(f"Features file: {features_file}")
    report.append(f"Master file:   {MASTER_FILE}")

    # --------------------------------------------------------
    # 2. LOAD FEATURES
    # --------------------------------------------------------

    section(2, "Loading feature dataset")

    try:
        df = pd.read_csv(
            features_file,
            low_memory=False
        )
    except Exception as exc:
        fail(f"Could not read feature dataset:\n{exc}")

    if df.empty:
        fail("Feature dataset contains zero rows.")

    info(f"Rows: {len(df):,}")
    info(f"Columns: {len(df.columns):,}")

    original_feature_rows = len(df)
    original_feature_columns = len(df.columns)

    success("Feature dataset loaded.")

    # --------------------------------------------------------
    # 3. FEATURE VALIDATION
    # --------------------------------------------------------

    section(3, "Validating feature schema")

    missing_columns = [
        column
        for column in REQUIRED_FEATURE_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        fail(
            "Required feature columns missing:\n"
            + "\n".join(
                f"   • {column}"
                for column in missing_columns
            )
        )

    # Match ID validation
    if df["match_id"].isna().any():
        missing_ids = int(
            df["match_id"].isna().sum()
        )
        fail(
            f"Feature dataset contains "
            f"{missing_ids:,} missing match_id values."
        )

    df["match_id"] = normalize_match_ids(
        df["match_id"]
    )

    if (df["match_id"] == "").any():
        fail("Feature dataset contains empty match_id values.")

    # Target validation
    if df["target"].isna().any():
        missing_targets = int(
            df["target"].isna().sum()
        )
        fail(
            f"Feature dataset contains "
            f"{missing_targets:,} missing targets."
        )

    df["target"] = (
        df["target"]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    invalid_targets = sorted(
        set(df["target"].unique()) - VALID_1X2
    )

    if invalid_targets:
        fail(
            "Invalid 1X2 targets found:\n"
            + "\n".join(
                f"   • {value}"
                for value in invalid_targets
            )
        )

    # Duplicate feature IDs
    duplicate_count = int(
        df["match_id"].duplicated().sum()
    )

    if duplicate_count > 0:

        warning(
            f"Found {duplicate_count:,} duplicate "
            f"feature match_ids."
        )

        df = (
            df
            .drop_duplicates(
                subset=["match_id"],
                keep="last"
            )
            .copy()
        )

        info(
            f"After deduplication: "
            f"{len(df):,} rows"
        )

    success("Feature schema verified.")

    report.append(
        f"Original feature rows: {original_feature_rows:,}"
    )

    report.append(
        f"Feature duplicates removed: {duplicate_count:,}"
    )

    # --------------------------------------------------------
    # 4. LOAD MASTER
    # --------------------------------------------------------

    section(4, "Loading canonical match results")

    try:
        master = pd.read_csv(
            MASTER_FILE,
            low_memory=False
        )
    except Exception as exc:
        fail(f"Could not read master dataset:\n{exc}")

    if master.empty:
        fail("Master dataset contains zero rows.")

    # Determine ID column
    if "zokascore_match_id" in master.columns:
        master_id_column = "zokascore_match_id"

    elif "match_id" in master.columns:
        master_id_column = "match_id"

    else:
        fail(
            "Master dataset has neither "
            "'zokascore_match_id' nor 'match_id'."
        )

    required_master_columns = [
        master_id_column,
        "home_score",
        "away_score",
    ]

    missing_master = [
        column
        for column in required_master_columns
        if column not in master.columns
    ]

    if missing_master:
        fail(
            "Master dataset missing required columns:\n"
            + "\n".join(
                f"   • {column}"
                for column in missing_master
            )
        )

    master = master[
        required_master_columns
    ].copy()

    master.rename(
        columns={
            master_id_column: "match_id"
        },
        inplace=True
    )

    master["match_id"] = normalize_match_ids(
        master["match_id"]
    )

    # Master ID validation
    if master["match_id"].isna().any():
        fail("Master contains missing match_ids.")

    if (master["match_id"] == "").any():
        fail("Master contains empty match_ids.")

    master_duplicate_count = int(
        master["match_id"].duplicated().sum()
    )

    if master_duplicate_count > 0:
        fail(
            f"MASTER DATA ERROR: "
            f"{master_duplicate_count:,} duplicate match_ids found."
        )

    # Score validation
    master["home_score"] = pd.to_numeric(
        master["home_score"],
        errors="coerce"
    )

    master["away_score"] = pd.to_numeric(
        master["away_score"],
        errors="coerce"
    )

    invalid_scores = (
        master["home_score"].isna() |
        master["away_score"].isna()
    )

    invalid_score_count = int(
        invalid_scores.sum()
    )

    if invalid_score_count > 0:
        fail(
            f"Master contains "
            f"{invalid_score_count:,} matches "
            f"with invalid/missing scores."
        )

    # Scores must be non-negative integers
    non_integer_scores = (
        (master["home_score"] % 1 != 0) |
        (master["away_score"] % 1 != 0)
    )

    if non_integer_scores.any():
        fail(
            "Master contains non-integer football scores."
        )

    negative_scores = (
        (master["home_score"] < 0) |
        (master["away_score"] < 0)
    )

    if negative_scores.any():
        fail(
            "Master contains negative football scores."
        )

    master["home_score"] = (
        master["home_score"].astype(np.int64)
    )

    master["away_score"] = (
        master["away_score"].astype(np.int64)
    )

    info(f"Master rows: {len(master):,}")
    info(f"Master unique IDs: {master['match_id'].nunique():,}")

    success("Canonical master results verified.")

    report.append(
        f"Master rows: {len(master):,}"
    )

    # --------------------------------------------------------
    # 5. MERGE GOALS
    # --------------------------------------------------------

    section(5, "Attaching canonical goals")

    before_merge = len(df)

    df = df.merge(
        master,
        on="match_id",
        how="left",
        validate="one_to_one",
        indicator=True
    )

    if len(df) != before_merge:
        fail(
            f"Merge changed row count: "
            f"{before_merge:,} → {len(df):,}"
        )

    unmatched = (
        df["_merge"] != "both"
    )

    unmatched_count = int(
        unmatched.sum()
    )

    df.drop(
        columns=["_merge"],
        inplace=True
    )

    if unmatched_count > 0:

        warning(
            f"{unmatched_count:,} feature rows "
            f"have no canonical result."
        )

        df = df.dropna(
            subset=[
                "home_score",
                "away_score"
            ]
        ).copy()

    if df.empty:
        fail(
            "No rows remain after attaching canonical goals."
        )

    df["home_goals"] = (
        df["home_score"]
        .astype(np.int64)
    )

    df["away_goals"] = (
        df["away_score"]
        .astype(np.int64)
    )

    df.drop(
        columns=[
            "home_score",
            "away_score"
        ],
        inplace=True
    )

    success(
        f"Canonical goals attached to "
        f"{len(df):,} matches."
    )

    report.append(
        f"Unmatched feature rows: {unmatched_count:,}"
    )

    # --------------------------------------------------------
    # 6. CANONICAL 1X2
    # --------------------------------------------------------

    section(6, "Validating canonical 1X2 targets")

    derived_target = derive_1x2(
        df["home_goals"].to_numpy(),
        df["away_goals"].to_numpy()
    )

    mismatches = (
        df["target"].astype(str)
        != derived_target
    )

    mismatch_count = int(
        mismatches.sum()
    )

    if mismatch_count > 0:

        warning(
            f"{mismatch_count:,} existing targets "
            f"disagree with canonical scores."
        )

        info(
            "Replacing mismatched targets "
            "with score-derived canonical targets."
        )

        df["target"] = derived_target

    else:
        success(
            "Existing 1X2 targets perfectly match scores."
        )

    # Final target validation
    invalid_targets = sorted(
        set(df["target"].unique())
        - VALID_1X2
    )

    if invalid_targets:
        fail(
            f"Invalid targets remain after reconciliation: "
            f"{invalid_targets}"
        )

    report.append(
        f"1X2 mismatches corrected: {mismatch_count:,}"
    )

    # --------------------------------------------------------
    # 7. MARKET ENGINE
    # --------------------------------------------------------

    section(7, "Engineering market targets")

    df = build_market_targets(df)

    # Impossible sanity checks
    if (df["total_goals"] < 0).any():
        fail("Negative total_goals detected.")

    expected_total_goals = (
        df["home_goals"] +
        df["away_goals"]
    )

    if not np.array_equal(
        df["total_goals"].to_numpy(),
        expected_total_goals.to_numpy()
    ):
        fail(
            "total_goals integrity check failed."
        )

    validate_markets(df)

    success(
        "Market targets generated and validated."
    )

    # --------------------------------------------------------
    # 8. STATISTICS
    # --------------------------------------------------------

    section(8, "Calculating dataset statistics")

    total_rows = len(df)

    home_win_pct = (
        (df["target"] == "HOME_WIN").mean()
        * 100
    )

    draw_pct = (
        (df["target"] == "DRAW").mean()
        * 100
    )

    away_win_pct = (
        (df["target"] == "AWAY_WIN").mean()
        * 100
    )

    btts_yes_pct = (
        (df["btts"] == "YES").mean()
        * 100
    )

    over_05_pct = (
        (df["ou_0_5"] == "OVER").mean()
        * 100
    )

    over_15_pct = (
        (df["ou_1_5"] == "OVER").mean()
        * 100
    )

    over_25_pct = (
        (df["ou_2_5"] == "OVER").mean()
        * 100
    )

    over_35_pct = (
        (df["ou_3_5"] == "OVER").mean()
        * 100
    )

    avg_goals = df["total_goals"].mean()

    max_goals = int(
        df["total_goals"].max()
    )

    info(f"Records: {total_rows:,}")
    info(f"Average goals: {avg_goals:.3f}")
    info(f"Maximum goals: {max_goals}")

    print()
    print("   1X2 DISTRIBUTION")
    print(f"      HOME_WIN : {home_win_pct:6.2f}%")
    print(f"      DRAW     : {draw_pct:6.2f}%")
    print(f"      AWAY_WIN : {away_win_pct:6.2f}%")

    print()
    print("   MARKET DISTRIBUTION")
    print(f"      OVER 0.5 : {over_05_pct:6.2f}%")
    print(f"      OVER 1.5 : {over_15_pct:6.2f}%")
    print(f"      OVER 2.5 : {over_25_pct:6.2f}%")
    print(f"      OVER 3.5 : {over_35_pct:6.2f}%")
    print(f"      BTTS YES : {btts_yes_pct:6.2f}%")

    report.extend([
        "",
        "STATISTICS",
        "-" * 70,
        f"Records: {total_rows:,}",
        f"Columns: {len(df.columns):,}",
        f"Average goals: {avg_goals:.4f}",
        f"Maximum goals: {max_goals}",
        f"HOME_WIN: {home_win_pct:.4f}%",
        f"DRAW: {draw_pct:.4f}%",
        f"AWAY_WIN: {away_win_pct:.4f}%",
        f"OVER 0.5: {over_05_pct:.4f}%",
        f"OVER 1.5: {over_15_pct:.4f}%",
        f"OVER 2.5: {over_25_pct:.4f}%",
        f"OVER 3.5: {over_35_pct:.4f}%",
        f"BTTS YES: {btts_yes_pct:.4f}%",
    ])

    # --------------------------------------------------------
    # 9. FINAL INTEGRITY CHECK
    # --------------------------------------------------------

    section(9, "Running final integrity checks")

    # No duplicate match IDs
    if df["match_id"].duplicated().any():
        fail(
            "FINAL CHECK FAILED: duplicate match_ids."
        )

    # No missing IDs
    if df["match_id"].isna().any():
        fail(
            "FINAL CHECK FAILED: missing match_ids."
        )

    # No missing goals
    if (
        df["home_goals"].isna().any() or
        df["away_goals"].isna().any()
    ):
        fail(
            "FINAL CHECK FAILED: missing goals."
        )

    # No missing target
    if df["target"].isna().any():
        fail(
            "FINAL CHECK FAILED: missing target."
        )

    # No missing market values
    for column in MARKET_COLUMNS:

        if df[column].isna().any():
            fail(
                f"FINAL CHECK FAILED: "
                f"{column} contains NULL values."
            )

    # Target must equal score
    final_target = derive_1x2(
        df["home_goals"].to_numpy(),
        df["away_goals"].to_numpy()
    )

    if not np.array_equal(
        df["target"].to_numpy(),
        final_target
    ):
        fail(
            "FINAL CHECK FAILED: "
            "1X2 target does not match goals."
        )

    # Total goals must equal score sum
    if not np.array_equal(
        df["total_goals"].to_numpy(),
        (
            df["home_goals"] +
            df["away_goals"]
        ).to_numpy()
    ):
        fail(
            "FINAL CHECK FAILED: "
            "total_goals mismatch."
        )

    # Verify market logic
    expected_25 = np.where(
        df["total_goals"] > 2.5,
        "OVER",
        "UNDER"
    )

    if not np.array_equal(
        df["ou_2_5"].to_numpy(),
        expected_25
    ):
        fail(
            "FINAL CHECK FAILED: "
            "OU 2.5 calculation mismatch."
        )

    expected_btts = np.where(
        (
            (df["home_goals"] > 0) &
            (df["away_goals"] > 0)
        ),
        "YES",
        "NO"
    )

    if not np.array_equal(
        df["btts"].to_numpy(),
        expected_btts
    ):
        fail(
            "FINAL CHECK FAILED: "
            "BTTS calculation mismatch."
        )

    success("All integrity checks passed.")

    # --------------------------------------------------------
    # 10. WRITE OUTPUT
    # --------------------------------------------------------

    section(10, "Writing unified production dataset")

    # Deterministic ordering.
    df = df.sort_values(
        by=["match_id"],
        kind="stable"
    ).reset_index(drop=True)

    # Put important columns first.
    priority_columns = [
        "match_id",
        "target",
        "home_goals",
        "away_goals",
        "total_goals",
        "ou_0_5",
        "ou_1_5",
        "ou_2_5",
        "ou_3_5",
        "btts",
    ]

    remaining_columns = [
        column
        for column in df.columns
        if column not in priority_columns
    ]

    df = df[
        priority_columns +
        remaining_columns
    ]

    atomic_write_csv(
        df,
        OUTPUT_FILE
    )

    # Confirm output exists
    if not os.path.isfile(OUTPUT_FILE):
        fail(
            "Output file was not created."
        )

    output_size = os.path.getsize(
        OUTPUT_FILE
    )

    if output_size == 0:
        fail(
            "Output file is empty."
        )

    # Read-back validation
    try:
        verification = pd.read_csv(
            OUTPUT_FILE,
            low_memory=False
        )
    except Exception as exc:
        fail(
            f"Output read-back validation failed:\n{exc}"
        )

    if len(verification) != len(df):
        fail(
            "Output row-count verification failed: "
            f"{len(df):,} expected, "
            f"{len(verification):,} found."
        )

    if list(verification.columns) != list(df.columns):
        fail(
            "Output column-order verification failed."
        )

    success(
        f"Production dataset written: "
        f"{len(df):,} rows × {len(df.columns):,} columns"
    )

    info(
        f"Output size: "
        f"{output_size / (1024 * 1024):.2f} MB"
    )

    # --------------------------------------------------------
    # REPORT
    # --------------------------------------------------------

    report.extend([
        "",
        "OUTPUT",
        "-" * 70,
        f"Output file: {OUTPUT_FILE}",
        f"Output rows: {len(df):,}",
        f"Output columns: {len(df.columns):,}",
        f"Output size: {output_size / (1024 * 1024):.2f} MB",
        "",
        "STATUS: PASS",
    ])

    write_report(report)

    # --------------------------------------------------------
    # FINAL
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print(" STEP 46 COMPLETE — PASS")
    print("=" * 70)

    print(f"📊 Records       : {len(df):,}")
    print(f"📊 Columns       : {len(df.columns):,}")
    print(f"⚽ Avg Goals     : {avg_goals:.3f}")
    print(f"🏠 Home Win      : {home_win_pct:.2f}%")
    print(f"🤝 Draw          : {draw_pct:.2f}%")
    print(f"✈️ Away Win      : {away_win_pct:.2f}%")
    print(f"⚽ Over 2.5      : {over_25_pct:.2f}%")
    print(f"🎯 BTTS Yes      : {btts_yes_pct:.2f}%")
    print()
    print(f"📁 Dataset       : {OUTPUT_FILE}")
    print(f"📄 Report        : {REPORT_FILE}")
    print()
    print("🔒 Canonical 1X2 labels verified")
    print("🔒 Canonical goals verified")
    print("🔒 Market targets verified")
    print("🔒 Duplicate IDs verified")
    print("🔒 Output read-back verified")
    print("=" * 70)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()