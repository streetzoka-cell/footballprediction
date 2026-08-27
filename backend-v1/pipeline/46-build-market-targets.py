
import os, tempfile, shutil
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Try multiple feature sources - fallback chain
FEATURE_CANDIDATES = [
    os.path.join(BASE_DIR, "data", "ml", "features_v3.csv"),
    os.path.join(BASE_DIR, "data", "ml", "features_v3_unique.csv"),
    os.path.join(BASE_DIR, "data", "ml", "features_v2.csv"),
    os.path.join(BASE_DIR, "data", "ml", "features_elo.csv"),
]
MASTER_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")

VALID_1X2 = {"HOME_WIN", "DRAW", "AWAY_WIN"}

def fail(msg):
    print("\n❌ PIPELINE 46 ABORTED")
    print("-"*60)
    print(msg)
    print("-"*60)
    raise SystemExit(1)

def find_features_file():
    for p in FEATURE_CANDIDATES:
        if os.path.exists(p):
            return p
    fail(f"No features file found. Tried:\n" + "\n".join(FEATURE_CANDIDATES))

def atomic_write_csv(df, output_file):
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="pipeline46_", suffix=".csv", dir=os.path.dirname(output_file))
    os.close(fd)
    try:
        df.to_csv(tmp, index=False)
        shutil.move(tmp, output_file)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 46: BUILD MARKET TARGETS (UNIFIED)")
    print(" PY + JS identical output → features_v4_unified.csv")
    print("="*60+"\n")
    
    print("[1/8] Checking input files...")
    FEATURES_FILE = find_features_file()
    if not os.path.exists(MASTER_FILE):
        fail(f"Master not found: {MASTER_FILE}")
    print(f"   ↳ Features: {os.path.basename(FEATURES_FILE)}")
    print(f"   ↳ Master: {os.path.basename(MASTER_FILE)}")
    print("   ✅ Input files verified.")
    
    print("\n[2/8] Loading features...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    print(f"   ↳ Rows: {len(df):,}, Cols: {len(df.columns)}")
    
    print("\n[3/8] Validating...")
    if "match_id" not in df.columns:
        fail("Missing match_id")
    if df["match_id"].isna().any():
        fail("Missing match IDs")
    if df["match_id"].duplicated().any():
        dup = int(df["match_id"].duplicated().sum())
        print(f"   ⚠ Found {dup} duplicate match_ids - deduping (keep last)")
        df = df.drop_duplicates(subset=["match_id"], keep="last")
    
    if "target" not in df.columns:
        fail("Missing target (1X2)")
    invalid = sorted(set(df["target"].dropna().astype(str)) - VALID_1X2)
    if invalid:
        fail(f"Invalid targets: {invalid}")
    
    print("   ✅ Schema verified")
    
    print("\n[4/8] Loading Master goals...")
    master = pd.read_csv(MASTER_FILE, low_memory=False)
    # Support both zokascore_match_id and match_id
    if "zokascore_match_id" in master.columns:
        master = master[["zokascore_match_id", "home_score", "away_score"]].copy()
        master.rename(columns={"zokascore_match_id": "match_id"}, inplace=True)
    else:
        master = master[["match_id", "home_score", "away_score"]].copy()
    
    print(f"   ↳ Master rows: {len(master):,}")
    master["match_id"] = master["match_id"].astype(str).str.strip()
    df["match_id"] = df["match_id"].astype(str).str.strip()
    
    print("\n[5/8] Merging goals...")
    initial = len(df)
    df = df.merge(master, on="match_id", how="left", validate="one_to_one")
    if len(df) != initial:
        fail(f"Merge changed size {initial} -> {len(df)}")
    
    missing = int(df["home_score"].isna().sum())
    if missing>0:
        print(f"   ⚠ {missing} missing goals - dropping those rows")
        df = df.dropna(subset=["home_score","away_score"])
    
    df["home_goals"] = df["home_score"].astype(int)
    df["away_goals"] = df["away_score"].astype(int)
    df.drop(columns=["home_score","away_score"], inplace=True)
    print(f"   ✅ Goals attached, rows: {len(df):,}")
    
    print("\n[6/8] Cross-checking 1X2 vs goals...")
    derived = np.select(
        [df["home_goals"] > df["away_goals"], df["home_goals"] < df["away_goals"]],
        ["HOME_WIN","AWAY_WIN"], default="DRAW"
    )
    mism = (df["target"].astype(str) != derived).sum()
    if mism>0:
        print(f"   ⚠ {mism} mismatches 1X2 vs goals - fixing target to match goals (canonical)")
        df["target"] = derived
    print("   ✅ 1X2 verified")
    
    print("\n[7/8] Engineering market targets...")
    df["total_goals"] = df["home_goals"] + df["away_goals"]
    df["ou_0_5"] = np.where(df["total_goals"]>0.5, "OVER","UNDER")
    df["ou_1_5"] = np.where(df["total_goals"]>1.5, "OVER","UNDER")
    df["ou_2_5"] = np.where(df["total_goals"]>2.5, "OVER","UNDER")
    df["ou_3_5"] = np.where(df["total_goals"]>3.5, "OVER","UNDER")
    df["btts"] = np.where((df["home_goals"]>0)&(df["away_goals"]>0), "YES","NO")
    
    for c in ["ou_0_5","ou_1_5","ou_2_5","ou_3_5","btts"]:
        if df[c].isna().any():
            fail(f"{c} has nulls")
    
    print("   ✅ Markets: ou_0_5, ou_1_5, ou_2_5, ou_3_5, btts")
    print(f"   ↳ BTTS YES: {(df['btts']=='YES').mean()*100:.1f}% | Over2.5: {(df['ou_2_5']=='OVER').mean()*100:.1f}%")
    
    print("\n[8/8] Writing unified (atomic)...")
    atomic_write_csv(df, OUTPUT_FILE)
    
    print("\n"+"="*60)
    print(" STEP 46 COMPLETE: PASS (PY)")
    print("="*60)
    print(f"📊 Records: {len(df):,}")
    print(f"📊 Columns: {len(df.columns)}")
    print(f"📁 Output: {OUTPUT_FILE}")
    print(f"🔄 JS fallback can produce identical file")
    print("="*60)

if __name__=="__main__":
    run()


