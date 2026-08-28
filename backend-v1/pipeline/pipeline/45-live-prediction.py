
import os, json, glob, joblib
import pandas as pd
import numpy as np
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
FIXTURES_DIR = os.path.join(BASE_DIR, "public_data", "fixtures")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "predictions")
MASTER_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")

CHAMPION_MODEL_FILE = os.path.join(MODELS_DIR, "champion_model.joblib")
FEATURE_SCHEMA_FILE = os.path.join(MODELS_DIR, "champion_feature_schema.json")
LABEL_MAPPING_FILE = os.path.join(MODELS_DIR, "label_mapping.json")
PUBLIC_PREDICTIONS_FILE = os.path.join(BASE_DIR, "public_data", "predictions.json")

def run():
    print("="*70)
    print(" ZOKASCORE V2 — STEP 45: CLEAN LIVE PREDICTION")
    print(" Uses honest 42.3 champion (19 features)")
    print("="*70+"\n")
    
    print("[1/4] Loading champion...")
    if not os.path.exists(CHAMPION_MODEL_FILE):
        raise FileNotFoundError(f"Missing {CHAMPION_MODEL_FILE} - run 44 first")
    model = joblib.load(CHAMPION_MODEL_FILE)
    
    with open(FEATURE_SCHEMA_FILE, "r", encoding="utf-8") as f:
        schema = json.load(f)
    features = schema["features"]
    print(f"   Features: {len(features)} - {features[:5]}...")
    print(f"   Model: {type(model).__name__}")
    
    with open(LABEL_MAPPING_FILE, "r", encoding="utf-8") as f:
        label_map = json.load(f)
    print(f"   Labels: {label_map}")
    
    # Build inverse mapping: class_id -> label
    inv_map = {int(k): v for k, v in label_map.items()}
    print(f"   Inverse: {inv_map}")
    
    print("\n[2/4] Loading master_with_elo for latest team states...")
    master = pd.read_csv(MASTER_FILE, low_memory=False)
    master["date"] = pd.to_datetime(master["date"], errors="coerce")
    master = master.sort_values("date").dropna(subset=["home_team_id","away_team_id"])
    print(f"   Master rows: {len(master):,}")
    
    # Build latest team state from master (last elo + form)
    team_state = {}
    for _, row in master.iterrows():
        for side in ["home","away"]:
            tid = str(row[f"{side}_team_id"])
            if tid not in team_state:
                team_state[tid] = {}
            team_state[tid][f"{side}_elo_pre"] = row.get(f"{side}_elo_pre", 1500)
            team_state[tid]["elo"] = row.get(f"{side}_elo_pre", 1500) + row.get(f"{side}_elo_delta", 0)
            # Form approximations from master
            team_state[tid]["form_pts"] = row.get(f"{side}_form_pts", 7) if f"{side}_form_pts" in row else 7
            team_state[tid]["gf_avg"] = row.get(f"{side}_gf_avg", 1.2) if f"{side}_gf_avg" in row else 1.2
            team_state[tid]["ga_avg"] = row.get(f"{side}_ga_avg", 1.2) if f"{side}_ga_avg" in row else 1.2
            team_state[tid]["gf_ewma"] = row.get(f"{side}_gf_ewma", 1.2) if f"{side}_gf_ewma" in row else 1.2
            team_state[tid]["ga_ewma"] = row.get(f"{side}_ga_ewma", 1.2) if f"{side}_ga_ewma" in row else 1.2
    
    print(f"   Team states: {len(team_state):,}")
    
    print("\n[3/4] Loading fixtures...")
    fixture_files = glob.glob(os.path.join(FIXTURES_DIR, "*.json"))
    print(f"   Fixture files: {len(fixture_files)}")
    
    fixtures=[]
    for fp in fixture_files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                data = json.load(f)
            matches = data.get("data", data) if isinstance(data, dict) else data
            if not isinstance(matches, list):
                continue
            for m in matches:
                if not isinstance(m, dict):
                    continue
                status = str(m.get("status","")).upper()
                if status not in ["NS","TBD"]:
                    continue
                fixtures.append({
                    "match_id": str(m.get("id") or m.get("match_id","")),
                    "home_name": m.get("homeTeam",{}).get("name") or m.get("homeTeamName",""),
                    "away_name": m.get("awayTeam",{}).get("name") or m.get("awayTeamName",""),
                    "home_id": str(m.get("homeTeam",{}).get("id") or m.get("homeTeamId","")),
                    "away_id": str(m.get("awayTeam",{}).get("id") or m.get("awayTeamId","")),
                    "date": m.get("date") or m.get("utcDate",""),
                    "league": m.get("leagueName") or (m.get("league",{}).get("name") if isinstance(m.get("league"), dict) else ""),
                })
        except Exception as e:
            print(f"   ⚠ Skip {os.path.basename(fp)}: {e}")
    
    print(f"   Upcoming fixtures: {len(fixtures)}")
    
    if not fixtures:
        print("\n   ⚠ No fixtures, clearing predictions")
        os.makedirs(os.path.dirname(PUBLIC_PREDICTIONS_FILE), exist_ok=True)
        with open(PUBLIC_PREDICTIONS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)
        return
    
    print("\n[4/4] Predicting...")
    predictions=[]
    # Try to map provider IDs to canonical via master team names? Simple: use elo from team_state if available, else 1500
    for fix in fixtures:
        try:
            hid = fix["home_id"]
            aid = fix["away_id"]
            
            # Get team states - fallback to 1500 elo if not found
            h_state = team_state.get(hid, {"elo":1500, "form_pts":7, "gf_avg":1.2, "ga_avg":1.2, "gf_ewma":1.2, "ga_ewma":1.2, "home_elo_pre":1500})
            a_state = team_state.get(aid, {"elo":1500, "form_pts":7, "gf_avg":1.2, "ga_avg":1.2, "gf_ewma":1.2, "ga_ewma":1.2, "away_elo_pre":1500})
            
            # Build features matching 42.3 champion (19 features)
            # From schema
            feat_dict = {}
            # Defaults
            feat_dict["elo_diff"] = h_state.get("elo",1500) - a_state.get("elo",1500)
            feat_dict["home_elo_pre"] = h_state.get("elo",1500)
            feat_dict["away_elo_pre"] = a_state.get("elo",1500)
            feat_dict["exp_home_goals"] = h_state.get("gf_ewma",1.2)
            feat_dict["exp_away_goals"] = a_state.get("gf_ewma",1.2)
            feat_dict["exp_goal_diff"] = feat_dict["exp_home_goals"] - feat_dict["exp_away_goals"]
            feat_dict["exp_total_goals"] = feat_dict["exp_home_goals"] + feat_dict["exp_away_goals"]
            feat_dict["home_gf_ewma"] = h_state.get("gf_ewma",1.2)
            feat_dict["away_gf_ewma"] = a_state.get("gf_ewma",1.2)
            feat_dict["home_ga_ewma"] = h_state.get("ga_ewma",1.2)
            feat_dict["away_ga_ewma"] = a_state.get("ga_ewma",1.2)
            feat_dict["home_form_pts"] = h_state.get("form_pts",7)
            feat_dict["away_form_pts"] = a_state.get("form_pts",7)
            feat_dict["home_gf_avg"] = h_state.get("gf_avg",1.2)
            feat_dict["away_gf_avg"] = a_state.get("gf_avg",1.2)
            feat_dict["home_ga_avg"] = h_state.get("ga_avg",1.2)
            feat_dict["away_ga_avg"] = a_state.get("ga_avg",1.2)
            feat_dict["h2h_hw_rate"] = 0.33
            feat_dict["h2h_aw_rate"] = 0.33
            feat_dict["h2h_d_rate"] = 0.25
            feat_dict["h2h_matches"] = 0
            # New honest features - estimate
            feat_dict["btts_signal"] = 1.0
            feat_dict["draw_likely"] = 0.3 if abs(feat_dict["elo_diff"])<80 else 0.0
            feat_dict["combined_signal"] = feat_dict["elo_diff"]*0.5 + feat_dict["exp_goal_diff"]*25*0.3
            feat_dict["home_home_pts"] = h_state.get("form_pts",7)
            feat_dict["away_away_pts"] = a_state.get("form_pts",7)
            feat_dict["over_signal"] = 1.0
            feat_dict["h2h_signal"] = 0.0
            feat_dict["h2h_draw_signal"] = 0.25
            
            # Build X in exact order
            X = pd.DataFrame([[feat_dict.get(c,0) for c in features]], columns=features).astype(float)
            
            proba = model.predict_proba(X)[0]
            # Map proba to labels
            probs = {inv_map[i]: float(proba[i]) for i in range(len(proba))}
            
            pred_label = max(probs, key=probs.get)
            
            predictions.append({
                "match_id": fix["match_id"],
                "date": fix["date"],
                "league": fix["league"],
                "home_team": fix["home_name"],
                "away_team": fix["away_name"],
                "home_team_id": hid,
                "away_team_id": aid,
                "home_win_prob": round(probs.get("HOME_WIN",0)*100,2),
                "draw_prob": round(probs.get("DRAW",0)*100,2),
                "away_win_prob": round(probs.get("AWAY_WIN",0)*100,2),
                "predicted_outcome": pred_label,
                "elo_diff": round(feat_dict["elo_diff"],1),
                "exp_total_goals": round(feat_dict["exp_total_goals"],2)
            })
        except Exception as e:
            print(f"   ⚠ Failed {fix.get('home_name')} vs {fix.get('away_name')}: {e}")
    
    print(f"   Generated {len(predictions)} predictions")
    
    os.makedirs(os.path.dirname(PUBLIC_PREDICTIONS_FILE), exist_ok=True)
    with open(PUBLIC_PREDICTIONS_FILE+".tmp", "w", encoding="utf-8") as f:
        json.dump(predictions, f, indent=2, ensure_ascii=False)
    os.replace(PUBLIC_PREDICTIONS_FILE+".tmp", PUBLIC_PREDICTIONS_FILE)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    pd.DataFrame(predictions).to_csv(os.path.join(OUTPUT_DIR, "live_predictions.csv"), index=False)
    
    print("\n"+"="*70)
    print(" STEP 45 COMPLETE: CLEAN LIVE")
    print("="*70)
    print(f"🎯 Predictions: {len(predictions)}")
    if predictions:
        from collections import Counter
        c = Counter([p["predicted_outcome"] for p in predictions])
        print(f"   HOME: {c.get('HOME_WIN',0)} | DRAW: {c.get('DRAW',0)} | AWAY: {c.get('AWAY_WIN',0)}")
        print(f"   Sample: {predictions[0]['home_team']} vs {predictions[0]['away_team']} -> {predictions[0]['predicted_outcome']} ({predictions[0]['home_win_prob']}/{predictions[0]['draw_prob']}/{predictions[0]['away_win_prob']})")
    print(f"📁 {PUBLIC_PREDICTIONS_FILE}")
    print("="*70)

if __name__=="__main__":
    run()
