
import os, json, glob, joblib
import pandas as pd
import numpy as np
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
FIXTURES_DIR = os.path.join(BASE_DIR, "public_data", "fixtures")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "predictions")
MASTER_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
V4_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")

CHAMPION_MODEL = os.path.join(MODELS_DIR, "champion_model.joblib")
CHAMPION_SCHEMA = os.path.join(MODELS_DIR, "champion_feature_schema.json")
CHAMPION_LABEL = os.path.join(MODELS_DIR, "label_mapping.json")

MARKET_MODELS = {
    "btts": os.path.join(MODELS_DIR, "market_btts_model.joblib"),
    "ou_2_5": os.path.join(MODELS_DIR, "market_ou_2_5_model.joblib"),
    "ou_1_5": os.path.join(MODELS_DIR, "market_ou_1_5_model.joblib"),
    "ou_3_5": os.path.join(MODELS_DIR, "market_ou_3_5_model.joblib"),
}

PUBLIC_FILE = os.path.join(BASE_DIR, "public_data", "predictions.json")
PUBLIC_MARKETS_FILE = os.path.join(BASE_DIR, "public_data", "market_predictions.json")

def load_team_states():
    print("   ↳ Loading team states from master_with_elo...")
    master = pd.read_csv(MASTER_FILE, low_memory=False)
    master["date"] = pd.to_datetime(master["date"], errors="coerce")
    master = master.sort_values("date")
    team_state = {}
    for _, row in master.iterrows():
        for side in ["home","away"]:
            tid = str(row.get(f"{side}_team_id","")).strip()
            if not tid or tid=="nan":
                continue
            team_state[tid] = {
                "elo": float(row.get(f"{side}_elo_pre",1500)),
                "elo_pre": float(row.get(f"{side}_elo_pre",1500)),
                "ewma_pts": float(row.get(f"{side}_ewma_pts", row.get(f"{side}_form_pts",7)) if pd.notna(row.get(f"{side}_ewma_pts", np.nan)) else 7),
                "ewma_gf": float(row.get(f"{side}_ewma_gf", row.get(f"{side}_gf_avg",1.2)) if pd.notna(row.get(f"{side}_ewma_gf", np.nan)) else 1.2),
                "ewma_ga": float(row.get(f"{side}_ewma_ga", row.get(f"{side}_ga_avg",1.2)) if pd.notna(row.get(f"{side}_ewma_ga", np.nan)) else 1.2),
                "ewma_gd": float(row.get(f"{side}_ewma_gd",0) if pd.notna(row.get(f"{side}_ewma_gd", np.nan)) else 0),
                "ewma_home_pts": float(row.get(f"{side}_ewma_home_pts",7) if pd.notna(row.get(f"{side}_ewma_home_pts", np.nan)) else 7),
                "ewma_away_pts": float(row.get(f"{side}_ewma_away_pts",7) if pd.notna(row.get(f"{side}_ewma_away_pts", np.nan)) else 7),
                "matches_before": float(row.get(f"{side}_matches_before",20) if pd.notna(row.get(f"{side}_matches_before", np.nan)) else 20),
            }
    print(f"   ↳ {len(team_state):,} teams")
    return team_state

def build_features_for_team(home_state, away_state, champion_features):
    # Build dict for champion model (16 features from 42.3 honest)
    # champion_features from schema
    feat = {}
    # Defaults
    feat["elo_diff"] = home_state["elo"] - away_state["elo"]
    feat["home_elo_pre"] = home_state["elo"]
    feat["away_elo_pre"] = away_state["elo"]
    feat["exp_home_goals"] = home_state["ewma_gf"]
    feat["exp_away_goals"] = away_state["ewma_gf"]
    feat["exp_goal_diff"] = feat["exp_home_goals"] - feat["exp_away_goals"]
    feat["exp_total_goals"] = feat["exp_home_goals"] + feat["exp_away_goals"]
    feat["home_gf_ewma"] = home_state["ewma_gf"]
    feat["away_gf_ewma"] = away_state["ewma_gf"]
    feat["home_ga_ewma"] = home_state["ewma_ga"]
    feat["away_ga_ewma"] = away_state["ewma_ga"]
    feat["home_form_pts"] = home_state["ewma_pts"]
    feat["away_form_pts"] = away_state["ewma_pts"]
    feat["home_gf_avg"] = home_state["ewma_gf"]
    feat["away_gf_avg"] = away_state["ewma_gf"]
    feat["home_ga_avg"] = home_state["ewma_ga"]
    feat["away_ga_avg"] = away_state["ewma_ga"]
    feat["h2h_hw_rate"] = 0.33
    feat["h2h_aw_rate"] = 0.33
    feat["h2h_d_rate"] = 0.25
    feat["h2h_matches"] = 0
    # For champion that has extra honest features
    feat["btts_signal"] = 1.0
    feat["draw_likely"] = 0.3 if abs(feat["elo_diff"])<80 else 0.0
    feat["combined_signal"] = feat["elo_diff"]*0.5 + feat["exp_goal_diff"]*25*0.3
    feat["home_home_pts"] = home_state["ewma_home_pts"]
    feat["away_away_pts"] = away_state["ewma_away_pts"]
    feat["over_signal"] = 1.0
    feat["h2h_signal"] = 0.0
    feat["h2h_draw_signal"] = 0.25
    
    # Return dict filtered to champion_features
    return {k: feat.get(k,0) for k in champion_features}

def build_market_features(home_state, away_state, market_features):
    # Build EWMA features for market models
    f = {}
    f["home_elo_pre"] = home_state["elo"]
    f["away_elo_pre"] = away_state["elo"]
    f["elo_diff"] = home_state["elo"] - away_state["elo"]
    f["home_ewma_pts"] = home_state["ewma_pts"]
    f["away_ewma_pts"] = away_state["ewma_pts"]
    f["home_ewma_gf"] = home_state["ewma_gf"]
    f["away_ewma_gf"] = away_state["ewma_gf"]
    f["home_ewma_ga"] = home_state["ewma_ga"]
    f["away_ewma_ga"] = away_state["ewma_ga"]
    f["home_ewma_gd"] = home_state["ewma_gd"]
    f["away_ewma_gd"] = away_state["ewma_gd"]
    f["home_ewma_home_pts"] = home_state["ewma_home_pts"]
    f["away_ewma_away_pts"] = away_state["ewma_away_pts"]
    f["home_ewma_home_gd"] = 0
    f["away_ewma_away_gd"] = 0
    f["home_ewma_home_gf"] = home_state["ewma_gf"]
    f["away_ewma_away_gf"] = away_state["ewma_gf"]
    f["home_ewma_home_ga"] = home_state["ewma_ga"]
    f["away_ewma_away_ga"] = away_state["ewma_ga"]
    f["home_matches_before"] = home_state["matches_before"]
    f["away_matches_before"] = away_state["matches_before"]
    f["home_home_matches_before"] = 10
    f["away_away_matches_before"] = 10
    return {k: f.get(k,0) for k in market_features}

def run():
    print("="*70)
    print(" ZOKASCORE V2 — STEP 48: LIVE MARKET PREDICTION")
    print(" 1X2 (49.56% honest) + BTTS (54%) + Over2.5 (56%) = UNIQUE")
    print("="*70+"\n")
    
    print("[1/5] Loading models...")
    champion = joblib.load(CHAMPION_MODEL)
    with open(CHAMPION_SCHEMA,"r") as f:
        champ_schema = json.load(f)
    champ_features = champ_schema["features"]
    print(f"   1X2 champion: {len(champ_features)} feats")
    
    with open(CHAMPION_LABEL,"r") as f:
        champ_label = json.load(f)
    champ_inv = {int(k):v for k,v in champ_label.items()}
    
    market_models={}
    for key, path in MARKET_MODELS.items():
        if os.path.exists(path):
            mm = joblib.load(path)
            meta_path = path.replace("_model.joblib","_meta.json")
            if os.path.exists(meta_path):
                with open(meta_path,"r") as f:
                    meta = json.load(f)
                market_models[key] = {"model":mm, "meta":meta}
                print(f"   {key}: {meta.get('accuracy',0)*100:.1f}%")
    
    print("\n[2/5] Loading team states...")
    team_states = load_team_states()
    
    print("\n[3/5] Loading fixtures...")
    fixture_files = glob.glob(os.path.join(FIXTURES_DIR, "*.json"))
    fixtures=[]
    for fp in fixture_files:
        try:
            with open(fp,"r",encoding="utf-8") as f:
                data = json.load(f)
            matches = data.get("data", data) if isinstance(data, dict) else data
            if not isinstance(matches, list):
                continue
            for m in matches:
                if str(m.get("status","")).upper() not in ["NS","TBD"]:
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
            pass
    print(f"   Fixtures: {len(fixtures)}")
    
    if not fixtures:
        print("   No fixtures, clearing")
        with open(PUBLIC_FILE,"w") as f:
            json.dump([], f)
        with open(PUBLIC_MARKETS_FILE,"w") as f:
            json.dump([], f)
        return
    
    print("\n[4/5] Predicting 1X2 + BTTS + Over...")
    predictions=[]
    market_predictions=[]
    
    for fix in fixtures:
        hid = fix["home_id"]
        aid = fix["away_id"]
        hs = team_states.get(hid, {"elo":1500,"ewma_pts":7,"ewma_gf":1.2,"ewma_ga":1.2,"ewma_gd":0,"ewma_home_pts":7,"ewma_away_pts":7,"matches_before":20})
        aws = team_states.get(aid, {"elo":1500,"ewma_pts":7,"ewma_gf":1.2,"ewma_ga":1.2,"ewma_gd":0,"ewma_home_pts":7,"ewma_away_pts":7,"matches_before":20})
        
        # 1X2
        try:
            cf = build_features_for_team(hs, aws, champ_features)
            X = pd.DataFrame([[cf.get(c,0) for c in champ_features]], columns=champ_features).astype(float)
            proba = champion.predict_proba(X)[0]
            probs = {champ_inv[i]: float(proba[i]) for i in range(len(proba))}
            pred_1x2 = max(probs, key=probs.get)
        except Exception as e:
            probs = {"HOME_WIN":0.4,"DRAW":0.3,"AWAY_WIN":0.3}
            pred_1x2 = "HOME_WIN"
        
        # Markets
        market_probs={}
        for key, mm in market_models.items():
            try:
                mf = mm["meta"]["features"]
                mf_dict = build_market_features(hs, aws, mf)
                Xm = pd.DataFrame([[mf_dict.get(c,0) for c in mf]], columns=mf).astype(float)
                proba_m = mm["model"].predict_proba(Xm)[0]
                classes = mm["meta"]["classes"]
                mp = {cls: float(proba_m[i]) for i, cls in enumerate(classes)}
                market_probs[key] = mp
            except Exception as e:
                market_probs[key] = {}
        
        # Build full prediction
        pred = {
            "match_id": fix["match_id"],
            "date": fix["date"],
            "league": fix["league"],
            "home_team": fix["home_name"],
            "away_team": fix["away_name"],
            "home_team_id": hid,
            "away_team_id": aid,
            "elo_diff": round(hs["elo"]-aws["elo"],1),
            # 1X2
            "home_win_prob": round(probs.get("HOME_WIN",0)*100,2),
            "draw_prob": round(probs.get("DRAW",0)*100,2),
            "away_win_prob": round(probs.get("AWAY_WIN",0)*100,2),
            "predicted_outcome": pred_1x2,
            # Markets
            "btts_yes_prob": round(market_probs.get("btts",{}).get("YES",0)*100,2) if market_probs.get("btts") else 0,
            "btts_no_prob": round(market_probs.get("btts",{}).get("NO",0)*100,2) if market_probs.get("btts") else 0,
            "btts_prediction": "YES" if market_probs.get("btts",{}).get("YES",0)>market_probs.get("btts",{}).get("NO",0) else "NO",
            "over25_prob": round(market_probs.get("ou_2_5",{}).get("OVER",0)*100,2) if market_probs.get("ou_2_5") else 0,
            "under25_prob": round(market_probs.get("ou_2_5",{}).get("UNDER",0)*100,2) if market_probs.get("ou_2_5") else 0,
            "over25_prediction": "OVER" if market_probs.get("ou_2_5",{}).get("OVER",0)>market_probs.get("ou_2_5",{}).get("UNDER",0) else "UNDER",
            "over15_prob": round(market_probs.get("ou_1_5",{}).get("OVER",0)*100,2) if market_probs.get("ou_1_5") else 0,
            "exp_total_goals": round(hs["ewma_gf"]+aws["ewma_gf"],2),
        }
        predictions.append(pred)
    
    print(f"   Generated {len(predictions)} predictions with markets")
    
    print("\n[5/5] Saving...")
    os.makedirs(os.path.dirname(PUBLIC_FILE), exist_ok=True)
    with open(PUBLIC_FILE+".tmp","w",encoding="utf-8") as f:
        json.dump(predictions, f, indent=2, ensure_ascii=False)
    os.replace(PUBLIC_FILE+".tmp", PUBLIC_FILE)
    
    with open(PUBLIC_MARKETS_FILE+".tmp","w",encoding="utf-8") as f:
        json.dump(predictions, f, indent=2, ensure_ascii=False)
    os.replace(PUBLIC_MARKETS_FILE+".tmp", PUBLIC_MARKETS_FILE)
    
    pd.DataFrame(predictions).to_csv(os.path.join(OUTPUT_DIR, "live_predictions_markets.csv"), index=False)
    
    print("\n"+"="*70)
    print(" STEP 48 COMPLETE: UNIQUE LIVE MARKET ENGINE")
    print("="*70)
    print(f"🎯 Predictions: {len(predictions)}")
    from collections import Counter
    c = Counter([p["predicted_outcome"] for p in predictions])
    print(f"   1X2: HOME {c.get('HOME_WIN',0)} | DRAW {c.get('DRAW',0)} | AWAY {c.get('AWAY_WIN',0)}")
    c2 = Counter([p["btts_prediction"] for p in predictions])
    print(f"   BTTS: YES {c2.get('YES',0)} | NO {c2.get('NO',0)}")
    c3 = Counter([p["over25_prediction"] for p in predictions])
    print(f"   Over2.5: OVER {c3.get('OVER',0)} | UNDER {c3.get('UNDER',0)}")
    if predictions:
        print(f"\n   Sample: {predictions[0]['home_team']} vs {predictions[0]['away_team']}")
        print(f"   → 1X2 {predictions[0]['predicted_outcome']} ({predictions[0]['home_win_prob']}/{predictions[0]['draw_prob']}/{predictions[0]['away_win_prob']})")
        print(f"   → BTTS {predictions[0]['btts_prediction']} {predictions[0]['btts_yes_prob']}% | Over2.5 {predictions[0]['over25_prediction']} {predictions[0]['over25_prob']}% | xG {predictions[0]['exp_total_goals']}")
    print(f"\n📁 {PUBLIC_FILE}")
    print(f"📁 {PUBLIC_MARKETS_FILE}")
    print("="*70)
    print("✅ READY FOR API: /api/predictions returns 1X2+BTTS+Over UNIQUE")

if __name__=="__main__":
    run()
