import os
import json
import pandas as pd

# ============================================================
# ZOKASCORE V2 — PIPELINE 46
# BUILD MARKET TARGETS — HARDENED
#
# Purpose:
#   Extend the validated Pipeline 41 feature dataset with
#   historical goal data and market targets.
#
# Existing 1X2 target is PRESERVED.
#
# New targets:
#   - O/U 0.5
#   - O/U 1.5
#   - O/U 2.5
#   - O/U 3.5
#   - BTTS
#
# Safety:
#   - Validates required files
#   - Validates required columns
#   - Detects duplicate match IDs
#   - Validates goal joins
#   - Checks target consistency
#   - Preserves chronological order
#   - Refuses suspicious joins
#   - Reports class distributions
#   - Writes atomically
# ============================================================

import tempfile
import shutil


# ============================================================
# CONFIGURATION
# ============================================================

FEATURES_FILE = os.path.join(
    "data",
    "ml",
    "features_v3.csv"
)

ELO_INDEX_FILE = os.path.join(
    "data",
    "elo",
    "elo_processed_matches.json"
)

OUTPUT_FILE = os.path.join(
    "data",
    "ml",
    "features_v4_unified.csv"
)

RANDOM_STATE = 42

REQUIRED_FEATURE_COLUMNS = [
    "match_id",
    "date",
    "target",

    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

    "home_ewma_points",
    "away_ewma_points",
    "home_ewma_gd",
    "away_ewma_gd",
    "home_ewma_gf",
    "away_ewma_gf",
    "home_ewma_ga",
    "away_ewma_ga",

    "home_ewma_home_points",
    "away_ewma_away_points",
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
    "btts"
]


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    print()
    print("❌ PIPELINE 46 ABORTED")
    print("-" * 60)
    print(message)
    print("-" * 60)
    raise SystemExit(1)


def require_file(path, description):
    if not os.path.isfile(path):
        fail(
            f"{description} not found:\n"
            f"   {path}"
        )


def atomic_write_csv(df, output_file):
    """
    Write CSV to a temporary file first, then replace the
    destination only after a successful write.
    """

    output_dir = os.path.dirname(output_file)

    os.makedirs(output_dir, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(
        prefix="pipeline46_",
        suffix=".csv",
        dir=output_dir
    )

    os.close(fd)

    try:
        df.to_csv(
            temp_path,
            index=False
        )

        if not os.path.isfile(temp_path):
            fail(
                "Temporary output file was not created."
            )

        shutil.move(
            temp_path,
            output_file
        )

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ============================================================
# START
# ============================================================

print(
    "🧠 ZOKASCORE V2 - Pipeline 46: "
    "Build Market Targets (Hardened)"
)

print("=" * 60)
print()


# ============================================================
# 1. VERIFY INPUT FILES
# ============================================================

print("🔍 Checking input files...")

require_file(
    FEATURES_FILE,
    "Pipeline 41 feature dataset"
)

require_file(
    ELO_INDEX_FILE,
    "ELO processed match index"
)

print(f"   ✅ Features: {FEATURES_FILE}")
print(f"   ✅ ELO index: {ELO_INDEX_FILE}")


# ============================================================
# 2. LOAD FEATURES
# ============================================================

print("\n📊 Loading Pipeline 41 feature dataset...")

df = pd.read_csv(
    FEATURES_FILE,
    low_memory=False
)

print(
    f"   ✅ Loaded {len(df):,} matches."
)


# ============================================================
# 3. VALIDATE FEATURE DATASET
# ============================================================

print("\n🔐 Validating feature dataset...")

missing_columns = [
    column
    for column in REQUIRED_FEATURE_COLUMNS
    if column not in df.columns
]

if missing_columns:
    fail(
        "Required columns are missing from features_v3.csv:\n"
        + "\n".join(
            f"   - {column}"
            for column in missing_columns
        )
    )

print(
    f"   ✅ Required columns present: "
    f"{len(REQUIRED_FEATURE_COLUMNS)}/{len(REQUIRED_FEATURE_COLUMNS)}"
)


# ============================================================
# 4. VALIDATE MATCH IDS
# ============================================================

print("\n🆔 Validating match IDs...")

if df["match_id"].isna().any():
    missing_ids = int(
        df["match_id"].isna().sum()
    )

    fail(
        f"features_v3.csv contains "
        f"{missing_ids:,} missing match_id values."
    )

df["match_id"] = df["match_id"].astype(str).str.strip()

if (df["match_id"] == "").any():
    empty_ids = int(
        (df["match_id"] == "").sum()
    )

    fail(
        f"features_v3.csv contains "
        f"{empty_ids:,} empty match_id values."
    )

duplicate_mask = df["match_id"].duplicated(
    keep=False
)

duplicate_count = int(
    duplicate_mask.sum()
)

duplicate_ids = int(
    df.loc[duplicate_mask, "match_id"].nunique()
)

if duplicate_count:
    fail(
        "Duplicate match IDs detected in features_v3.csv:\n"
        f"   Duplicate rows: {duplicate_count:,}\n"
        f"   Duplicate IDs:  {duplicate_ids:,}\n\n"
        "Pipeline 46 refuses to continue because a duplicated "
        "match could contaminate market training."
    )

print(
    f"   ✅ Match IDs unique: {df['match_id'].nunique():,}"
)


# ============================================================
# 5. VALIDATE 1X2 TARGET
# ============================================================

print("\n🎯 Validating existing 1X2 target...")

df["target"] = (
    df["target"]
    .astype(str)
    .str.strip()
)

invalid_targets = sorted(
    set(df["target"].unique()) - VALID_1X2
)

if invalid_targets:
    fail(
        "Unexpected 1X2 target values found:\n"
        + "\n".join(
            f"   - {value}"
            for value in invalid_targets
        )
    )

print("   ✅ Existing Pipeline 41 1X2 target preserved.")

for label in [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]:
    count = int(
        (df["target"] == label).sum()
    )

    percentage = (
        count / len(df) * 100
        if len(df)
        else 0
    )

    print(
        f"   {label:<10} "
        f"{count:>8,} "
        f"({percentage:>6.2f}%)"
    )


# ============================================================
# 6. LOAD ELO MATCH INDEX
# ============================================================

print("\n📚 Loading ELO processed match index...")

try:
    with open(
        ELO_INDEX_FILE,
        "r",
        encoding="utf-8"
    ) as f:
        elo_index = json.load(f)

except json.JSONDecodeError as exc:
    fail(
        "ELO index is not valid JSON:\n"
        f"   {exc}"
    )

if not isinstance(elo_index, dict):
    fail(
        "ELO index must be a JSON object keyed by match ID."
    )

print(
    f"   ✅ Loaded {len(elo_index):,} ELO records."
)


# ============================================================
# 7. VALIDATE ELO RECORD STRUCTURE
# ============================================================

print("\n🔐 Validating ELO records...")

REQUIRED_ELO_FIELDS = [
    "home_team_id",
    "away_team_id",
    "home_goals",
    "away_goals",
    "date",
    "result"
]

bad_records = []

for match_id, match in elo_index.items():

    if not isinstance(match, dict):
        bad_records.append(
            (match_id, "record is not an object")
        )
        continue

    missing = [
        field
        for field in REQUIRED_ELO_FIELDS
        if field not in match
    ]

    if missing:
        bad_records.append(
            (
                match_id,
                "missing: " + ", ".join(missing)
            )
        )

    if len(bad_records) >= 10:
        break

if bad_records:
    print(
        "   ❌ Invalid ELO records detected:"
    )

    for match_id, reason in bad_records:
        print(
            f"      {match_id}: {reason}"
        )

    fail(
        "ELO index validation failed."
    )

print(
    "   ✅ ELO record structure looks valid."
)


# ============================================================
# 8. BUILD GOAL MAP
# ============================================================

print("\n⚽ Building goal index...")

goals_map = {}

for match_id, match in elo_index.items():

    normalized_id = str(match_id).strip()

    if normalized_id in goals_map:
        fail(
            "Duplicate match ID detected in ELO index:\n"
            f"   {normalized_id}"
        )

    try:
        home_goals = int(match["home_goals"])
        away_goals = int(match["away_goals"])

    except (TypeError, ValueError):
        fail(
            "Invalid goal values found in ELO index for:\n"
            f"   match_id={normalized_id}"
        )

    if home_goals < 0 or away_goals < 0:
        fail(
            "Negative goal value found:\n"
            f"   match_id={normalized_id}\n"
            f"   home_goals={home_goals}\n"
            f"   away_goals={away_goals}"
        )

    goals_map[normalized_id] = {
        "home_goals": home_goals,
        "away_goals": away_goals
    }

print(
    f"   ✅ Goal records indexed: "
    f"{len(goals_map):,}"
)


# ============================================================
# 9. CHECK JOIN COVERAGE BEFORE MODIFYING DATA
# ============================================================

print("\n🔗 Checking feature → goal join...")

feature_ids = set(
    df["match_id"]
)

goal_ids = set(
    goals_map
)

matched_ids = feature_ids & goal_ids
missing_ids = feature_ids - goal_ids

match_count = len(feature_ids)
matched_count = len(matched_ids)
missing_count = len(missing_ids)

coverage = (
    matched_count / match_count * 100
    if match_count
    else 0
)

print(
    f"   Feature matches:     {match_count:,}"
)

print(
    f"   Goal matches found:  {matched_count:,}"
)

print(
    f"   Missing goal data:   {missing_count:,}"
)

print(
    f"   Join coverage:       {coverage:.4f}%"
)

# Hardened policy:
# Every Pipeline 41 record should have corresponding historical
# goal data. Do not silently train on a reduced dataset.

if missing_count:
    sample_missing = sorted(
        missing_ids
    )[:20]

    print("\n   ❌ Missing match IDs (first 20):")

    for match_id in sample_missing:
        print(
            f"      {match_id}"
        )

    fail(
        f"{missing_count:,} Pipeline 41 matches have no "
        "corresponding goal record.\n\n"
        "Pipeline 46 refuses to silently drop them. "
        "Investigate the join before continuing."
    )

print(
    "   ✅ 100% of Pipeline 41 matches have goal data."
)


# ============================================================
# 10. ATTACH GOALS
# ============================================================

print("\n⚽ Attaching historical goals...")

df["home_goals"] = df["match_id"].map(
    lambda match_id:
        goals_map[match_id]["home_goals"]
)

df["away_goals"] = df["match_id"].map(
    lambda match_id:
        goals_map[match_id]["away_goals"]
)

if df["home_goals"].isna().any():
    fail(
        "Unexpected missing home_goals after validated join."
    )

if df["away_goals"].isna().any():
    fail(
        "Unexpected missing away_goals after validated join."
    )

df["home_goals"] = df["home_goals"].astype(int)
df["away_goals"] = df["away_goals"].astype(int)

print("   ✅ Goals attached successfully.")


# ============================================================
# 11. VALIDATE EXISTING RESULT AGAINST GOALS
# ============================================================

print("\n⚖️ Cross-checking 1X2 target against actual goals...")

def derive_result(home_goals, away_goals):

    if home_goals > away_goals:
        return "HOME_WIN"

    if home_goals < away_goals:
        return "AWAY_WIN"

    return "DRAW"


df["derived_target"] = [
    derive_result(
        home_goals,
        away_goals
    )
    for home_goals, away_goals
    in zip(
        df["home_goals"],
        df["away_goals"]
    )
]

result_mismatches = (
    df["target"] != df["derived_target"]
)

mismatch_count = int(
    result_mismatches.sum()
)

print(
    f"   Result mismatches: "
    f"{mismatch_count:,}"
)

if mismatch_count:

    mismatch_sample = df.loc[
        result_mismatches,
        [
            "match_id",
            "target",
            "derived_target",
            "home_goals",
            "away_goals"
        ]
    ].head(20)

    print("\n   ❌ Sample mismatches:")

    print(
        mismatch_sample.to_string(
            index=False
        )
    )

    fail(
        "Existing Pipeline 41 1X2 targets do not consistently "
        "match the historical goal results.\n\n"
        "Pipeline 46 will NOT overwrite the existing target."
    )

print(
    "   ✅ Existing 1X2 targets match historical results."
)

# The helper column is no longer needed.
df.drop(
    columns=["derived_target"],
    inplace=True
)


# ============================================================
# 12. ENGINEER TOTAL GOALS
# ============================================================

print("\n⚙️ Engineering market targets...")

df["total_goals"] = (
    df["home_goals"]
    + df["away_goals"]
)


# ============================================================
# 13. OVER / UNDER TARGETS
# ============================================================

df["ou_0_5"] = (
    df["total_goals"]
    .gt(0.5)
    .map({
        True: "OVER",
        False: "UNDER"
    })
)

df["ou_1_5"] = (
    df["total_goals"]
    .gt(1.5)
    .map({
        True: "OVER",
        False: "UNDER"
    })
)

df["ou_2_5"] = (
    df["total_goals"]
    .gt(2.5)
    .map({
        True: "OVER",
        False: "UNDER"
    })
)

df["ou_3_5"] = (
    df["total_goals"]
    .gt(3.5)
    .map({
        True: "OVER",
        False: "UNDER"
    })
)


# ============================================================
# 14. BTTS TARGET
# ============================================================

df["btts"] = (
    (
        df["home_goals"].gt(0)
        &
        df["away_goals"].gt(0)
    )
    .map({
        True: "YES",
        False: "NO"
    })
)


# ============================================================
# 15. VALIDATE MARKET TARGETS
# ============================================================

print("\n🔐 Validating generated market targets...")

for column in MARKET_COLUMNS:

    null_count = int(
        df[column].isna().sum()
    )

    if null_count:
        fail(
            f"Market target '{column}' contains "
            f"{null_count:,} null values."
        )

print(
    "   ✅ No market target nulls."
)


# ============================================================
# 16. VALIDATE MARKET LOGIC
# ============================================================

expected_ou = {
    "ou_0_5": 0.5,
    "ou_1_5": 1.5,
    "ou_2_5": 2.5,
    "ou_3_5": 3.5
}

for column, line in expected_ou.items():

    expected = (
        df["total_goals"]
        .gt(line)
        .map({
            True: "OVER",
            False: "UNDER"
        })
    )

    if not df[column].equals(expected):
        fail(
            f"Market target validation failed for {column}."
        )

expected_btts = (
    (
        df["home_goals"].gt(0)
        &
        df["away_goals"].gt(0)
    )
    .map({
        True: "YES",
        False: "NO"
    })
)

if not df["btts"].equals(expected_btts):
    fail(
        "BTTS target validation failed."
    )

print(
    "   ✅ O/U and BTTS logic validated."
)


# ============================================================
# 17. CHRONOLOGICAL VALIDATION
# ============================================================

print("\n📅 Validating chronological data...")

df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)

bad_dates = int(
    df["date"].isna().sum()
)

if bad_dates:
    fail(
        f"{bad_dates:,} rows have invalid dates."
    )

# Pipeline 41 uses chronological ordering.
# Preserve that contract in v4.

df = (
    df.sort_values(
        "date",
        kind="stable"
    )
    .reset_index(drop=True)
)

print(
    f"   ✅ Chronological ordering preserved."
)

print(
    f"   First date: "
    f"{df['date'].iloc[0]}"
)

print(
    f"   Last date:  "
    f"{df['date'].iloc[-1]}"
)


# ============================================================
# 18. FINAL DATASET VALIDATION
# ============================================================

print("\n🧪 Running final dataset integrity checks...")

if len(df) != match_count:
    fail(
        "Final dataset row count changed unexpectedly:\n"
        f"   Original: {match_count:,}\n"
        f"   Final:   {len(df):,}"
    )

if df["match_id"].duplicated().any():
    fail(
        "Duplicate match IDs appeared in final dataset."
    )

required_output_columns = (
    REQUIRED_FEATURE_COLUMNS
    + [
        "home_goals",
        "away_goals",
        "total_goals"
    ]
    + MARKET_COLUMNS
)

missing_output_columns = [
    column
    for column in required_output_columns
    if column not in df.columns
]

if missing_output_columns:
    fail(
        "Final dataset is missing expected columns:\n"
        + "\n".join(
            f"   - {column}"
            for column in missing_output_columns
        )
    )

print(
    f"   ✅ Rows: {len(df):,}"
)

print(
    f"   ✅ Columns: {len(df.columns):,}"
)

print(
    "   ✅ Match IDs unique."
)

print(
    "   ✅ 1X2 target preserved."
)

print(
    "   ✅ Goal data complete."
)

print(
    "   ✅ Market targets complete."
)


# ============================================================
# 19. TARGET DISTRIBUTIONS
# ============================================================

print("\n🎯 MARKET TARGET DISTRIBUTIONS")
print("-" * 60)

def print_distribution(
    column,
    labels
):

    total = len(df)

    print(f"\n{column.upper()}")

    for label in labels:

        count = int(
            (df[column] == label).sum()
        )

        percentage = (
            count / total * 100
            if total
            else 0
        )

        print(
            f"   {label:<8} "
            f"{count:>8,} "
            f"({percentage:>6.2f}%)"
        )


print_distribution(
    "ou_0_5",
    ["OVER", "UNDER"]
)

print_distribution(
    "ou_1_5",
    ["OVER", "UNDER"]
)

print_distribution(
    "ou_2_5",
    ["OVER", "UNDER"]
)

print_distribution(
    "ou_3_5",
    ["OVER", "UNDER"]
)

print_distribution(
    "btts",
    ["YES", "NO"]
)


# ============================================================
# 20. GOAL DISTRIBUTION
# ============================================================

print("\n⚽ GOAL SUMMARY")
print("-" * 60)

print(
    f"   Average home goals: "
    f"{df['home_goals'].mean():.3f}"
)

print(
    f"   Average away goals: "
    f"{df['away_goals'].mean():.3f}"
)

print(
    f"   Average total goals: "
    f"{df['total_goals'].mean():.3f}"
)

print(
    f"   Maximum total goals: "
    f"{df['total_goals'].max():,}"
)


# ============================================================
# 21. FINAL COLUMN SUMMARY
# ============================================================

print("\n📦 MARKET COLUMNS ADDED")
print("-" * 60)

for column in [
    "home_goals",
    "away_goals",
    "total_goals",
    *MARKET_COLUMNS
]:
    print(f"   ✅ {column}")


# ============================================================
# 22. ATOMIC SAVE
# ============================================================

print("\n💾 Writing unified dataset...")

atomic_write_csv(
    df,
    OUTPUT_FILE
)

if not os.path.isfile(OUTPUT_FILE):
    fail(
        "Output file was not created."
    )

output_size = os.path.getsize(
    OUTPUT_FILE
)

if output_size <= 0:
    fail(
        "Output file is empty."
    )

print(
    f"   ✅ Saved: {OUTPUT_FILE}"
)

print(
    f"   📦 File size: "
    f"{output_size / (1024 * 1024):.2f} MB"
)


# ============================================================
# 23. FINAL SUCCESS
# ============================================================

print()
print("=" * 60)
print("✅ PIPELINE 46 COMPLETE")
print("=" * 60)

print(
    f"📊 Unified records: "
    f"{len(df):,}"
)

print(
    f"📊 Total columns: "
    f"{len(df.columns):,}"
)

print(
    "🎯 Existing 1X2 target: PRESERVED + VERIFIED"
)

print(
    "⚽ Goal data: VERIFIED"
)

print(
    "📈 O/U markets: 0.5 / 1.5 / 2.5 / 3.5"
)

print(
    "🤝 BTTS: YES / NO"
)

print(
    f"💾 Output: {OUTPUT_FILE}"
)

print()
print(
    "🚦 READY FOR PIPELINE 47:"
)

print(
    "   Train and chronologically validate "
    "O/U + BTTS market models."
)

print("=" * 60)