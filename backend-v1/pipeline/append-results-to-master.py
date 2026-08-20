import os
import json
import csv
import glob
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_DIR = os.path.join(BASE_DIR, "public_data", "results")

MASTER_CSV = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
RAW_MASTER_CSV = os.path.join(BASE_DIR, "data", "source", "ZOKASCORE_FINAL", "ZOKASCORE_PUBLIC_MASTER.csv")

def generate_zk_match_id(date_str, home_name, away_name):
    """Generates a unique Zoka ID like ZK_18721130_SCOTLAND_ENGLAND (spaces removed)"""
    date_clean = date_str.replace("-", "")
    home_clean = re.sub(r'[^a-zA-Z0-9]', '', home_name.upper())
    away_clean = re.sub(r'[^a-zA-Z0-9]', '', away_name.upper())
    return f"ZK_{date_clean}_{home_clean}_{away_clean}"

def get_csv_headers(filepath):
    """Dynamically reads headers from the existing CSV."""
    if not os.path.exists(filepath): return []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        return next(reader, [])

def process_csv_memory_safe(filepath, json_updates):
    """Reads CSV line-by-line, updates scores if needed, and appends new matches. Uses near-zero RAM."""
    headers = get_csv_headers(filepath)
    if not headers: return 0, 0, 0
    
    temp_filepath = filepath + ".tmp"
    existing_ids = set()
    updated_count = 0
    
    with open(filepath, "r", encoding="utf-8") as infile, open(temp_filepath, "w", newline="", encoding="utf-8") as outfile:
        reader = csv.DictReader(infile)
        # Use extrasaction='ignore' to drop any unexpected columns gracefully
        writer = csv.DictWriter(outfile, fieldnames=headers, extrasaction='ignore')
        writer.writeheader()
        
        for row in reader:
            zk_id = row.get("zokascore_match_id", "")
            existing_ids.add(zk_id)
            
            # Check if this match has an update in our JSON data
            if zk_id in json_updates:
                new_home = str(json_updates[zk_id]["home_score"])
                new_away = str(json_updates[zk_id]["away_score"])
                
                # Only update if scores are different
                if row.get("home_score") != new_home or row.get("away_score") != new_away:
                    row["home_score"] = new_home
                    row["away_score"] = new_away
                    updated_count += 1
                    
            writer.writerow(row)
            
    # Now append truly new matches
    appended_count = 0
    with open(temp_filepath, "a", newline="", encoding="utf-8") as outfile:
        writer = csv.DictWriter(outfile, fieldnames=headers, extrasaction='ignore')
        
        for zk_id, data in json_updates.items():
            if zk_id not in existing_ids:
                row_data = {header: "" for header in headers}
                row_data.update({
                    "zokascore_match_id": zk_id,
                    "date": data["date_str"],
                    "home_team": data["home_name"],
                    "away_team": data["away_name"],
                    "competition": data["league"],
                    "home_score": data["home_score"],
                    "away_score": data["away_score"]
                })
                
                # Add Elo placeholders if this is the Elo CSV
                if "home_elo_pre" in headers:
                    row_data.update({
                        "home_elo_pre": 1500.0,
                        "away_elo_pre": 1500.0,
                        "home_elo_post": 1500.0,
                        "away_elo_post": 1500.0,
                        "home_elo_delta": 0.0,
                        "away_elo_delta": 0.0
                    })
                    
                writer.writerow(row_data)
                appended_count += 1
                
    # Replace original file with the updated temp file
    os.replace(temp_filepath, filepath)
    return updated_count, appended_count, len(existing_ids)

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — SYNC & UPDATE MASTER CSV (MEMORY SAFE)")
    print("=" * 60)

    # 1. Scan Public Results JSONs into a dictionary (uses very little RAM)
    print("[1/3] Scanning public_data/results for new matches and score updates...")
    json_updates = {}
    
    for filepath in glob.glob(os.path.join(RESULTS_DIR, "*.json")):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                matches = data.get("data", data) if isinstance(data, dict) else data
                if not isinstance(matches, list): continue
                
                for m in matches:
                    if not isinstance(m, dict): continue
                    
                    home_name = m.get("homeTeamName") or m.get("homeTeam", {}).get("name")
                    away_name = m.get("awayTeamName") or m.get("awayTeam", {}).get("name")
                    date_str = m.get("dateStr") or (m.get("date","").split("T")[0] if m.get("date") else "")
                    
                    if not home_name or not away_name or not date_str: continue

                    zk_match_id = generate_zk_match_id(date_str, home_name, away_name)
                    home_score = m.get("homeScore", 0) or 0
                    away_score = m.get("awayScore", 0) or 0
                    league = m.get("leagueName") or m.get("league", {}).get("name", "Unknown")
                    
                    json_updates[zk_match_id] = {
                        "home_name": home_name,
                        "away_name": away_name,
                        "date_str": date_str,
                        "home_score": home_score,
                        "away_score": away_score,
                        "league": league
                    }
        except Exception as e:
            print(f"   ⚠️ Error reading {filepath}: {e}")

    print(f"   ↳ Found {len(json_updates):,} live results to process.")

    # 2. Process Raw Master CSV
    print("\n[2/3] Processing Raw Master CSV (line-by-line)...")
    raw_updated, raw_appended, raw_total = process_csv_memory_safe(RAW_MASTER_CSV, json_updates)
    print(f"   ↳ Scanned {raw_total:,} existing rows.")
    print(f"   ↳ Updated {raw_updated:,} scores.")
    print(f"   ↳ Appended {raw_appended:,} new matches.")

    # 3. Process Elo Master CSV
    print("\n[3/3] Processing Elo Master CSV (line-by-line)...")
    elo_updated, elo_appended, elo_total = process_csv_memory_safe(MASTER_CSV, json_updates)
    print(f"   ↳ Scanned {elo_total:,} existing rows.")
    print(f"   ↳ Updated {elo_updated:,} scores.")
    print(f"   ↳ Appended {elo_appended:,} new matches.")

    print(f"\n✅ Sync Complete: Updated {raw_updated:,} scores, Appended {raw_appended:,} new matches.")
    print("   Run Python Step 32 (build-zokascore-elo.py) to recalculate Elo for these matches.")
    print("=" * 60)

if __name__ == "__main__":
    run()