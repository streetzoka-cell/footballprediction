# pipeline/deduplicate-master-csv.py
import pandas as pd
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_MASTER_CSV = os.path.join(BASE_DIR, "data", "source", "ZOKASCORE_FINAL", "ZOKASCORE_PUBLIC_MASTER.csv")
MASTER_CSV = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")

def clean_csv(filepath):
    if not os.path.exists(filepath): return 0
    print(f"  Cleaning {os.path.basename(filepath)}...")
    df = pd.read_csv(filepath, low_memory=False)
    before = len(df)
    
    # Create temporary clean columns to identify true duplicates (ignoring spaces/case)
    df['h_clean'] = df['home_team'].astype(str).str.lower().str.replace(r'\s+', '', regex=True)
    df['a_clean'] = df['away_team'].astype(str).str.lower().str.replace(r'\s+', '', regex=True)
    
    # Drop duplicates based on Date + Clean Home + Clean Away, keeping the first occurrence
    df = df.drop_duplicates(subset=['date', 'h_clean', 'a_clean'], keep='first')
    df = df.drop(columns=['h_clean', 'a_clean'])
    
    after = len(df)
    df.to_csv(filepath, index=False)
    return before - after

print("=" * 60)
print(" ZOKASCORE V2 — MASTER CSV DEDUPLICATOR")
print("=" * 60)

raw_removed = clean_csv(RAW_MASTER_CSV)
elo_removed = clean_csv(MASTER_CSV)

print(f"\n✅ Removed {raw_removed} duplicate rows from Raw Master.")
print(f"✅ Removed {elo_removed} duplicate rows from Elo Master.")
print("=" * 60)