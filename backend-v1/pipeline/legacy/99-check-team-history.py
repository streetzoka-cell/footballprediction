import os
import json
import pandas as pd
import unicodedata
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
UNRESOLVED_FILE = os.path.join(BASE_DIR, "data", "predictions", "step48_unresolved_fixtures.json")

def clean_name(value):
    val = str(value if pd.notna(value) else "")
    val = val.strip().lower()
    val = unicodedata.normalize("NFKD", val)
    val = "".join(c for c in val if not unicodedata.combining(c))
    val = val.replace("&", " and ")
    val = re.sub(r"[.'’‘`\"]", "", val)
    val = re.sub(r"[^a-z0-9]+", " ", val)
    val = re.sub(r"\s+", " ", val).strip()
    return val

df = pd.read_csv(MASTER_FILE, low_memory=False)
home_names = set(df["home_team"].map(clean_name))
away_names = set(df["away_team"].map(clean_name))
all_names = home_names.union(away_names)

with open(UNRESOLVED_FILE, "r", encoding="utf-8") as f:
    unresolved = json.load(f)

print(f"Total historical teams in master: {len(all_names)}")
print(f"Total unresolved fixtures: {len(unresolved)}")
print("\nChecking first 10 unresolved teams:")

for fx in unresolved[:10]:
    home = fx.get("home_team")
    away = fx.get("away_team")
    
    home_in_master = clean_name(home) in all_names
    away_in_master = clean_name(away) in all_names
    
    print(f"\n{home} vs {away}")
    print(f"   {home} in master: {home_in_master}")
    print(f"   {away} in master: {away_in_master}")