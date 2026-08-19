# pipeline/51-build-unified-api.py
import os
import json
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES_DIR = os.path.join(BASE_DIR, "public_data", "fixtures")
RESULTS_DIR = os.path.join(BASE_DIR, "public_data", "results")
PREDICTIONS_FILE = os.path.join(BASE_DIR, "public_data", "predictions.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "public_data", "api_matches.json")

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 51: BUILD UNIFIED API ENDPOINT")
    print("=" * 60)

    predictions = {}
    if os.path.exists(PREDICTIONS_FILE):
        with open(PREDICTIONS_FILE, "r", encoding="utf-8") as f:
            pred_list = json.load(f)
            predictions = {str(p["match_id"]): p for p in pred_list}
        print(f"[1/3] Loaded {len(predictions)} predictions.")

    unified_matches = {}
    
    for folder in [FIXTURES_DIR, RESULTS_DIR]:
        if not os.path.exists(folder): continue
        
        for filepath in glob.glob(os.path.join(folder, "*.json")):
            with open(filepath, "r", encoding="utf-8") as f:
                try: data = json.load(f)
                except: continue
            
            matches = data.get("data", []) if isinstance(data, dict) else data
            
            for match in matches:
                if not isinstance(match, dict): continue
                match_id = str(match.get("id", ""))
                if not match_id: continue

                home_team = match.get("homeTeam", {})
                away_team = match.get("awayTeam", {})
                
                clean_match = {
                    "match_id": match_id,
                    "date": match.get("utcDate") or match.get("date"),
                    "status": match.get("status", "NS"),
                    "league": match.get("leagueName"),
                    "league_id": match.get("leagueId"),
                    "home_team": {
                        "id": home_team.get("id"),
                        "name": home_team.get("name"),
                        "short_name": home_team.get("shortName")
                    },
                    "away_team": {
                        "id": away_team.get("id"),
                        "name": away_team.get("name"),
                        "short_name": away_team.get("shortName")
                    },
                    "scores": {
                        "home": match.get("homeScore", 0),
                        "away": match.get("awayScore", 0)
                    },
                    "minute": match.get("minute", 0),
                    "prediction": None
                }

                if match_id in predictions:
                    pred = predictions[match_id]
                    clean_match["prediction"] = pred.get("markets", {})

                unified_matches[match_id] = clean_match

    final_list = list(unified_matches.values())
    final_list.sort(key=lambda x: x.get("date") or "9999")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_list, f, indent=2, ensure_ascii=False)

    print(f"[2/3] Merged fixtures, results, and predictions.")
    print(f"[3/3] Saved {len(final_list)} unified matches to:")
    print(f"      {OUTPUT_FILE}")
    print("\n🚀 Your frontend can now fetch ONE single file for all match data!")

if __name__ == "__main__":
    run()