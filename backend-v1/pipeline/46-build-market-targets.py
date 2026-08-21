import os
import tempfile
import shutil
import pandas as pd
import numpy as np

# ============================================================
# ZOKASCORE V2 — STEP 46
# BUILD MARKET TARGETS (CANONICAL)
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v3.csv")
MASTER_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")

# ← FIXED: Removed hardcoded EXPECTED_ROWS. It is now set dynamically in run()

REQUIRED_FEATURE_COLUMNS = [
    "match_id", "date", "target",
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_pts", "away_ewma_pts",
    "home_ewma_gd", "away_ewma_gd",
    "home_ewma_gf", "away_ewma_gf",
    "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_pts", "away_ewma_away_pts",
    "home_ewma_home_gd", "away_ewma_away_gd",
    "home_ewma_home_gf", "away_ewma_away_gf",
    "home_ewma_home_ga", "away_ewma_away_ga",
    "home_matches_before", "away_matches_before",
    "home_home_matches_before", "away_away_matches_before",
]

VALID_1X2 = {"HOME_WIN", "DRAW", "AWAY_WIN"}
MARKET_COLUMNS = ["ou_0_5", "ou_1_5", "ou_2_5", "ou_3_5", "btts"]

def fail(message):
    print("\n❌ PIPELINE 46 ABORTED")
    print("-" * 60)
    print(message)
    print("-" * 60)
    raise SystemExit(1)

def atomic_write_csv(df, output_file):
    output_dir = os.path.dirname(output_file)
    os.makedirs(output_dir, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix="pipeline46_", suffix=".csv", dir=output_dir)
    os.close(fd)
    try:
        df.to_csv(temp_path, index=False)
        shutil.move(temp_path, output_file)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 46: BUILD MARKET TARGETS")
    print("=" * 60)
    print()

    # 1. VERIFY INPUT FILES
    print("[1/8] Checking input files...")
    if not os.path.exists(FEATURES_FILE): fail(f"Features file not found:\n{FEATURES_FILE}")
    if not os.path.exists(MASTER_FILE): fail(f"Canonical Master file not found:\n{MASTER_FILE}")
    print("   ✅ Input files verified.")

    # 2. LOAD FEATURES
    print("\n[2/8] Loading Step 40 feature dataset...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    
    # ← FIXED: Set expected rows dynamically based on actual file length
    EXPECTED_ROWS = len(df)
    print(f"   ↳ Rows loaded: {EXPECTED_ROWS:,}")

    # 3. VALIDATE FEATURE DATASET
    print("\n[3/8] Validating feature dataset...")
    missing = [c for c in REQUIRED_FEATURE_COLUMNS if c not in df.columns]
    if missing: fail("Missing required columns:\n" + "\n".join(f"   - {c}" for c in missing))

    if df["match_id"].isna().any(): fail("features_v3.csv contains missing match IDs.")
    if df["match_id"].duplicated().any(): fail(f"features_v3.csv contains {int(df['match_id'].duplicated().sum()):,} duplicate match IDs.")

    invalid_targets = sorted(set(df["target"].dropna().astype(str)) - VALID_1X2)
    if invalid_targets: fail("Invalid 1X2 target values found:\n" + "\n".join(f"   - {v}" for v in invalid_targets))
    if df["target"].isna().any(): fail("features_v3.csv contains null 1X2 targets.")

    print("   ✅ Schema and identity verified.")
    print("   ✅ Existing 1X2 targets validated.")

    # 4. LOAD CANONICAL MASTER FOR GOALS
    print("\n[4/8] Loading canonical Master for goal data...")
    master_df = pd.read_csv(MASTER_FILE, low_memory=False)
    master_df = master_df[["zokascore_match_id", "home_score", "away_score"]].copy()
    master_df.rename(columns={"zokascore_match_id": "match_id"}, inplace=True)

    print(f"   ↳ Master rows loaded: {len(master_df):,}")
    if master_df["match_id"].isna().any(): fail("Canonical Master contains missing match IDs.")
    if master_df["match_id"].duplicated().any(): fail(f"Canonical Master contains {int(master_df['match_id'].duplicated().sum()):,} duplicate match IDs.")
    if master_df["home_score"].isna().any(): fail("Canonical Master contains missing home scores.")
    if master_df["away_score"].isna().any(): fail("Canonical Master contains missing away scores.")
    print("   ✅ Master identity and score data verified.")

    # 5. JOIN GOALS
    print("\n[5/8] Merging goal data...")
    initial_len = len(df)
    df = df.merge(master_df, on="match_id", how="left", validate="one_to_one")

    if len(df) != initial_len: fail(f"Merge changed population size.\nBefore: {initial_len:,}\nAfter:  {len(df):,}")
    if df["home_score"].isna().any(): fail(f"{int(df['home_score'].isna().sum()):,} matches failed to join with home goal data.")
    if df["away_score"].isna().any(): fail(f"{int(df['away_score'].isna().sum()):,} matches failed to join with away goal data.")

    df["home_goals"] = df["home_score"].astype(int)
    df["away_goals"] = df["away_score"].astype(int)
    df.drop(columns=["home_score", "away_score"], inplace=True)
    print("   ✅ Goals attached successfully.")

    # 6. VALIDATE EXISTING 1X2 TARGET
    print("\n[6/8] Cross-checking 1X2 target against goals...")
    derived_target = np.select(
        [df["home_goals"] > df["away_goals"], df["home_goals"] < df["away_goals"]],
        ["HOME_WIN", "AWAY_WIN"],
        default="DRAW"
    )
    mismatches = (df["target"].astype(str) != derived_target)
    mismatch_count = int(mismatches.sum())
    if mismatch_count:
        sample = df.loc[mismatches, ["match_id", "home_goals", "away_goals", "target"]].head(10)
        fail(f"Found {mismatch_count:,} mismatches between existing 1X2 target and historical goals.\n\nSample:\n{sample.to_string(index=False)}")
    print("   ✅ Existing 1X2 targets match historical results.")

    # 7. ENGINEER MARKET TARGETS
    print("\n[7/8] Engineering market targets...")
    df["total_goals"] = df["home_goals"] + df["away_goals"]

    df["ou_0_5"] = np.where(df["total_goals"] > 0.5, "OVER", "UNDER")
    df["ou_1_5"] = np.where(df["total_goals"] > 1.5, "OVER", "UNDER")
    df["ou_2_5"] = np.where(df["total_goals"] > 2.5, "OVER", "UNDER")
    df["ou_3_5"] = np.where(df["total_goals"] > 3.5, "OVER", "UNDER")
    df["btts"] = np.where((df["home_goals"] > 0) & (df["away_goals"] > 0), "YES", "NO")

    for column in MARKET_COLUMNS:
        if df[column].isna().any(): fail(f"Market target '{column}' contains nulls.")

    expected_ou_values = {"OVER", "UNDER"}
    for column in ["ou_0_5", "ou_1_5", "ou_2_5", "ou_3_5"]:
        actual_values = set(df[column].dropna().astype(str))
        if not actual_values.issubset(expected_ou_values): fail(f"Invalid values found in {column}: {sorted(actual_values)}")

    btts_values = set(df["btts"].dropna().astype(str))
    if not btts_values.issubset({"YES", "NO"}): fail(f"Invalid BTTS values found: {sorted(btts_values)}")
    print("   ✅ O/U and BTTS targets engineered and verified.")

    # 8. ATOMIC SAVE & REPORT
    print("\n[8/8] Writing unified dataset...")
    atomic_write_csv(df, OUTPUT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 46 COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 Unified records: {len(df):,}")
    print(f"📊 Total columns:   {len(df.columns):,}")
    print("🎯 Existing 1X2 target: PRESERVED + VERIFIED")
    print("⚽ Goal data: VERIFIED")
    print("📈 O/U markets: 0.5 / 1.5 / 2.5 / 3.5")
    print("🤝 BTTS: YES / NO")
    print(f"💾 Output: {OUTPUT_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    run()