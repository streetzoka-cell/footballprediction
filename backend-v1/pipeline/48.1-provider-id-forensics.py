import os
import json
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
PREDICTIONS_DIR = os.path.join(DATA_DIR, "predictions")
CANONICAL_SOURCES_DIR = os.path.join(DATA_DIR, "zokascore_football_data", "canonical_sources")

UNRESOLVED_FILE = os.path.join(PREDICTIONS_DIR, "step48_unresolved_fixtures.json")
MASTER_FILE = os.path.join(DATA_DIR, "processed", "master_with_elo.csv")
INTERNAL_TEAM_MAP_FILE = os.path.join(CANONICAL_SOURCES_DIR, "internal_team_map.json")

FORENSICS_FILE = os.path.join(PREDICTIONS_DIR, "step48_1_provider_id_forensics.json")
SAFE_MAPPING_PROPOSAL_FILE = os.path.join(PREDICTIONS_DIR, "step48_1_safe_mapping_proposals.json")

def clean_name(value: str) -> str:
    if value is None: return ""
    value = str(value).strip().lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.replace("&", " and ")
    value = re.sub(r"[.'\"']", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value

class ProviderIdForensics:
    def __init__(self, master_df: pd.DataFrame):
        self.hist_name_to_zk = defaultdict(Counter)
        
        # FIX: Master file uses 'home_team' and 'away_team', not 'home_team_name'
        home_name_col = "home_team"
        home_id_col = "home_team_id"
        away_name_col = "away_team"
        away_id_col = "away_team_id"

        if home_name_col in master_df.columns and home_id_col in master_df.columns:
            for name, zk in zip(master_df[home_name_col].astype(str), master_df[home_id_col].astype(str)):
                if name and name.lower() not in {"nan", "none"} and zk and zk.lower() not in {"nan", "none"}:
                    self.hist_name_to_zk[clean_name(name)][zk] += 1
                    
        if away_name_col in master_df.columns and away_id_col in master_df.columns:
            for name, zk in zip(master_df[away_name_col].astype(str), master_df[away_id_col].astype(str)):
                if name and name.lower() not in {"nan", "none"} and zk and zk.lower() not in {"nan", "none"}:
                    self.hist_name_to_zk[clean_name(name)][zk] += 1

    def search_historical_name(self, name: str) -> Dict[str, Any]:
        normalized = clean_name(name)
        if not normalized: return {"appearances": 0, "zk_ids": []}
        
        counter = self.hist_name_to_zk.get(normalized, Counter())
        total = sum(counter.values())
        if total > 0:
            return {
                "appearances": total,
                "zk_ids": [{"zk_id": zk, "count": c} for zk, c in counter.most_common(5)]
            }
        return {"appearances": 0, "zk_ids": []}

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 48.1: PROVIDER-ID FORENSICS")
    print("=" * 60)

    if not os.path.exists(UNRESOLVED_FILE):
        print("❌ Run Step 48 first to generate unresolved fixtures.")
        return

    with open(UNRESOLVED_FILE, "r", encoding="utf-8") as f:
        unresolved = json.load(f)
        
    master_df = pd.read_csv(MASTER_FILE, low_memory=False)
    with open(INTERNAL_TEAM_MAP_FILE, "r", encoding="utf-8") as f:
        internal_team_map = json.load(f).get("by_provider_club_id", {})

    forensics = ProviderIdForensics(master_df)

    seen = {}
    for fixture in unresolved:
        for side in ("home", "away"):
            pid = fixture.get(f"{side}_provider_id")
            name = fixture.get(f"{side}_team")
            resolved = fixture.get(f"{side}_resolved", False)
            if resolved or not pid or not name: continue
            pid = str(pid).strip()
            name = str(name).strip()
            key = f"{pid}|{clean_name(name)}"
            if key not in seen:
                seen[key] = {"provider_id": pid, "fixture_name": name}

    unique_pairs = list(seen.values())
    print(f"   ↳ Unique unresolved pairs: {len(unique_pairs)}")

    safe_proposals = []
    records = []

    for pair in unique_pairs:
        pid = pair["provider_id"]
        name = pair["fixture_name"]
        
        if pid in internal_team_map:
            continue

        hist_name = forensics.search_historical_name(name)
        
        if hist_name["appearances"] > 0:
            zk_ids = [z["zk_id"] for z in hist_name["zk_ids"]]
            distinct_zks = set(zk_ids)

            if len(distinct_zks) == 1:
                zk = zk_ids[0]
                safe_proposals.append({
                    "provider_id": pid,
                    "fixture_name": name,
                    "recommended_zk_id": zk,
                    "confidence": "VERY_HIGH",
                    "category": "C",
                    "reason": f"Historical name match found ({hist_name['appearances']} appearances, maps cleanly to 1 ZK_ID)."
                })
                records.append({"provider_id": pid, "name": name, "status": "SAFE_TO_MAP", "zk_id": zk})
            else:
                records.append({"provider_id": pid, "name": name, "status": "AMBIGUOUS", "zk_ids": list(distinct_zks)[:5]})
        else:
            records.append({"provider_id": pid, "name": name, "status": "NO_HISTORY"})

    with open(FORENSICS_FILE, "w", encoding="utf-8") as f:
        json.dump({"records": records}, f, indent=2)

    with open(SAFE_MAPPING_PROPOSAL_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "pipeline_step": "48.1",
            "count": len(safe_proposals),
            "proposals": safe_proposals,
            "warning": "These are forensic proposals only."
        }, f, indent=2)

    print(f"\n   ✅ Safe mapping proposals generated: {len(safe_proposals)}")
    print(f"   📁 Safe mapping proposals: {SAFE_MAPPING_PROPOSAL_FILE}")

if __name__ == "__main__":
    run()