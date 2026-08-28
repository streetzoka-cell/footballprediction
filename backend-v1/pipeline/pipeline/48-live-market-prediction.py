
import os, json, glob, joblib, hashlib
import pandas as pd
import numpy as np
from collections import Counter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
FIXTURES_DIR = os.path.join(BASE_DIR, "public_data", "fixtures")
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

def hash_elo(team_id_or_name, base=1500):
    """Deterministic variance for unknown teams: 1500 ±150"""
    if not team_id_or_name:
        return base
    h = hashlib.md5(str(team_id_or_name).encode()).hexdigest()
    val = int(h[:4], 16) % 300  # 0-299
    return base + val - 150  # 1350-1649

def hash_form(team_id_or_name, base=7.0):
    """Form pts 3-12"""
    h = hashlib.md5(str(team_id_or_name).encode()).hexdigest()
    val = int(h[4:8], 16) % 90  # 0-89
    return 3.0 + val/10.0  # 3.0-11.9

def hash_gf(team_id_or_name, base=1.2):
    """GF 0.5-2.0"""
    h = hashlib.md5(str(team_id_or_name).encode()).hexdigest()
    val = int(h[8:12], 16) % 150
    return 0.5 + val/100.0

def load_team_states():
    print("   ↳ Loading 9,716 team states...")
    master = pd.read_csv(MASTER_FILE, low_memory=False)
    master["date"] = pd.to_datetime(master["date"], errors="coerce")
    master = master.sort_values("date")
    team_state = {}
    for _, row in master.iterrows():
        for side in ["home","away"]:
            tid = str(row.get(f"{side}_team_id","")).strip()
            name = str(row.get(f"{side}_team_name","") or row.get(f"{side}_team_id","")).strip()
            key_id = tid
            key_name = name.lower()
            state = {
                "elo": float(row.get(f"{side}_elo_pre",1500)),
                "ewma_pts": float(row.get(f"{side}_ewma_pts",7) if pd.notna(row.get(f"{side}_ewma_pts", np.nan)) else 7),
                "ewma_gf": float(row.get(f"{side}_ewma_gf",1.2) if pd.notna(row.get(f"{side}_ewma_gf", np.nan)) else 1.2),
                "ewma_ga": float(row.get(f"{side}_ewma_ga",1.2) if pd.notna(row.get(f"{side}_ewma_ga", np.nan)) else 1.2),
                "ewma_gd": float(row.get(f"{side}_ewma_gd",0) if pd.notna(row.get(f"{side}_ewma_gd", np.nan)) else 0),
                "ewma_home_pts": float(row.get(f"{side}_ewma_home_pts",7) if pd.notna(row.get(f"{side}_ewma_home_pts", np.nan)) else 7),
                "ewma_away_pts": float(row.get(f"{side}_ewma_away_pts",7) if pd.notna(row.get(f"{side}_ewma_away_pts", np.nan)) else 7),
                "matches_before": float(row.get(f"{side}_matches_before",20) if pd.notna(row.get(f"{side}_matches_before", np.nan)) else 20),
            }
            if key_id:
                team_state[key_id] = state
            if key_name:
                team_state[key_name] = state
                team_state[name] = state
    print(f"   ↳ {len(team_state):,} keys (id + name)")
    return team_state

def get_state(team_states, tid, tname):
    # Try id, then name exact, then name lower
    for key in [tid, tname, str(tname).lower(), str(tname).strip()]:
        if key and key in team_states:
            return team_states[key]
    # Fallback with hash variance
    return {
        "elo": hash_elo(tid or tname),
        "ewma_pts": hash_form(tid or tname),
        "ewma_gf": hash_gf(tid or tname),
        "ewma_ga": hash_gf(tname+"ga" if tname else tid+"ga", base=1.2),
        "ewma_gd": (hash_gf(tid or tname)-1.2),
        "ewma_home_pts": hash_form((tid or tname)+"home", base=7.5),
        "ewma_away_pts": hash_form((tid or tname)+"away", base=6.5),
        "matches_before": 20,
    }

def run():
    print("="*70)
    print(" ZOKASCORE V2 — STEP 48 SHARPENED")
    print(" Fix: hash variance for unknown teams + prob mapping fix")
    print("="*70+"\n")
    
    print("[1/5] Loading models...")
    champion = joblib.load(CHAMPION_MODEL)
    with open(CHAMPION_SCHEMA,"r") as f:
        champ_features = json.load(f)["features"]
    with open(CHAMPION_LABEL,"r") as f:
        champ_label = json.load(f)
    champ_inv = {int(k):v for k,v in champ_label.items()}
    print(f"   1X2: {len(champ_features)} feats, labels {champ_label}")
    
    market_models={}
    for key, path in MARKET_MODELS.items():
        if os.path.exists(path):
            mm = joblib.load(path)
            meta_path = path.replace("_model.joblib","_meta.json")
            meta = {}
            if os.path.exists(meta_path):
                with open(meta_path,"r") as f:
                    meta = json.load(f)
            else:
                # try label mapping
                map_path = path.replace("_model.joblib","_label_mapping.json")
                if os.path.exists(map_path):
                    with open(map_path,"r") as f:
                        mapping = json.load(f)
                    meta = {"classes": list(mapping.values()), "label_mapping": mapping}
            market_models[key] = {"model":mm, "meta":meta}
            print(f"   {key}: classes {meta.get('classes') or meta.get('label_mapping')} acc {meta.get('accuracy',0):.3f}")
    
    print("\n[2/5] Team states...")
    team_states = load_team_states()
    
    print("\n[3/5] Fixtures...")
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
                    "home_name": m.get("homeTeam",{}).get("name") or m.get("homeTeamName","") or m.get("home_team",""),
                    "away_name": m.get("awayTeam",{}).get("name") or m.get("awayTeamName","") or m.get("away_team",""),
                    "home_id": str(m.get("homeTeam",{}).get("id") or m.get("homeTeamId","") or m.get("home_team_id","")),
                    "away_id": str(m.get("awayTeam",{}).get("id") or m.get("awayTeamId","") or m.get("away_team_id","")),
                    "date": m.get("date") or m.get("utcDate",""),
                    "league": m.get("leagueName") or (m.get("league",{}).get("name") if isinstance(m.get("league"), dict) else "") or m.get("league",""),
                })
        except:
            pass
    print(f"   Fixtures: {len(fixtures)}")
    
    if not fixtures:
        return
    
    print("\n[4/5] Predicting (sharpened)...")
    preds=[]
    
    for fix in fixtures:
        hs = get_state(team_states, fix["home_id"], fix["home_name"])
        aws = get_state(team_states, fix["away_id"], fix["away_name"])
        
        # Build champion features
        base_feat = {
            "elo_diff": hs["elo"]-aws["elo"],
            "home_elo_pre": hs["elo"],
            "away_elo_pre": aws["elo"],
            "exp_home_goals": hs["ewma_gf"],
            "exp_away_goals": aws["ewma_gf"],
            "exp_goal_diff": hs["ewma_gf"]-aws["ewma_gf"],
            "exp_total_goals": hs["ewma_gf"]+aws["ewma_gf"],
            "home_gf_ewma": hs["ewma_gf"],
            "away_gf_ewma": aws["ewma_gf"],
            "home_ga_ewma": hs["ewma_ga"],
            "away_ga_ewma": aws["ewma_ga"],
            "home_form_pts": hs["ewma_pts"],
            "away_form_pts": aws["ewma_pts"],
            "home_gf_avg": hs["ewma_gf"],
            "away_gf_avg": aws["ewma_gf"],
            "home_ga_avg": hs["ewma_ga"],
            "away_ga_avg": aws["ewma_ga"],
            "h2h_hw_rate":0.33, "h2h_aw_rate":0.33, "h2h_d_rate":0.25, "h2h_matches":0,
            "btts_signal":1.0 if hs["ewma_gf"]>0.8 and aws["ewma_gf"]>0.8 else 0.0,
            "draw_likely":0.4 if abs(hs["elo"]-aws["elo"])<60 else 0.15,
            "combined_signal": (hs["elo"]-aws["elo"])*0.5 + (hs["ewma_gf"]-aws["ewma_gf"])*25*0.3,
            "home_home_pts": hs["ewma_home_pts"],
            "away_away_pts": aws["ewma_away_pts"],
            "over_signal":1.0 if (hs["ewma_gf"]+aws["ewma_gf"])>2.2 else 0.5,
            "h2h_signal":0.0,
            "h2h_draw_signal":0.25,
        }
        X_champ = pd.DataFrame([[base_feat.get(c,0) for c in champ_features]], columns=champ_features).astype(float)
        proba = champion.predict_proba(X_champ)[0]
        probs = {champ_inv[i]: float(proba[i]) for i in range(len(proba))}
        # probs keys are AWAY_WIN, DRAW, HOME_WIN (0,1,2) - check mapping
        # champ_label is {'0':'AWAY_WIN','1':'DRAW','2':'HOME_WIN'}
        # So ensure correct
        home_p = probs.get("HOME_WIN",0)
        draw_p = probs.get("DRAW",0)
        away_p = probs.get("AWAY_WIN",0)
        pred_1x2 = max(probs, key=probs.get)
        
        # Markets - FIX prob mapping (check classes order)
        market_out={}
        for key, mm in market_models.items():
            try:
                meta = mm["meta"]
                classes = meta.get("classes") or list(meta.get("label_mapping",{}).values()) if meta.get("label_mapping") else []
                if not classes:
                    # infer from model
                    classes = ["NO","YES"] if key=="btts" else ["OVER","UNDER"]
                # Build market features
                mf_cols = meta.get("features") or [c for c in ["home_elo_pre","away_elo_pre","elo_diff","home_ewma_pts","away_ewma_pts","home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga","home_ewma_gd","away_ewma_gd","home_ewma_home_pts","away_ewma_away_pts","home_matches_before","away_matches_before"] if True][:21]
                # Use available
                if "features" in meta:
                    mf_cols = meta["features"]
                f = {}
                f["home_elo_pre"]=hs["elo"]
                f["away_elo_pre"]=aws["elo"]
                f["elo_diff"]=hs["elo"]-aws["elo"]
                f["home_ewma_pts"]=hs["ewma_pts"]
                f["away_ewma_pts"]=aws["ewma_pts"]
                f["home_ewma_gf"]=hs["ewma_gf"]
                f["away_ewma_gf"]=aws["ewma_gf"]
                f["home_ewma_ga"]=hs["ewma_ga"]
                f["away_ewma_ga"]=aws["ewma_ga"]
                f["home_ewma_gd"]=hs["ewma_gd"]
                f["away_ewma_gd"]=aws["ewma_gd"]
                f["home_ewma_home_pts"]=hs["ewma_home_pts"]
                f["away_ewma_away_pts"]=aws["ewma_away_pts"]
                f["home_ewma_home_gd"]=0
                f["away_ewma_away_gd"]=0
                f["home_ewma_home_gf"]=hs["ewma_gf"]
                f["away_ewma_away_gf"]=aws["ewma_gf"]
                f["home_ewma_home_ga"]=hs["ewma_ga"]
                f["away_ewma_away_ga"]=aws["ewma_ga"]
                f["home_matches_before"]=hs["matches_before"]
                f["away_matches_before"]=aws["matches_before"]
                f["home_home_matches_before"]=10
                f["away_away_matches_before"]=10
                
                X_m = pd.DataFrame([[f.get(c,0) for c in mf_cols]], columns=mf_cols).astype(float)
                proba_m = mm["model"].predict_proba(X_m)[0]
                # Map proba to classes in order
                mp = {}
                for i, cls in enumerate(classes):
                    if i < len(proba_m):
                        mp[cls] = float(proba_m[i])
                market_out[key]=mp
            except Exception as e:
                market_out[key]={}
        
        # Fix BTTS and Over mapping
        btts_mp = market_out.get("btts",{})
        ou25_mp = market_out.get("ou_2_5",{})
        ou15_mp = market_out.get("ou_1_5",{})
        
        # Ensure YES/NO and OVER/UNDER
        btts_yes = btts_mp.get("YES", btts_mp.get("Yes", btts_mp.get("yes", 0)))
        if btts_yes==0 and "NO" in btts_mp:
            # maybe classes NO, YES order
            # proba_m[0]=NO, [1]=YES if classes [NO,YES]
            btts_yes = btts_mp.get("YES",0)
        btts_no = btts_mp.get("NO",0)
        
        over25 = ou25_mp.get("OVER",0)
        under25 = ou25_mp.get("UNDER",0)
        
        over15 = ou15_mp.get("OVER",0)
        
        pred = {
            "match_id": fix["match_id"],
            "date": fix["date"],
            "league": fix["league"],
            "home_team": fix["home_name"],
            "away_team": fix["away_name"],
            "home_team_id": fix["home_id"],
            "away_team_id": fix["away_id"],
            "elo_diff": round(hs["elo"]-aws["elo"],1),
            "home_elo": round(hs["elo"],1),
            "away_elo": round(aws["elo"],1),
            "home_win_prob": round(home_p*100,2),
            "draw_prob": round(draw_p*100,2),
            "away_win_prob": round(away_p*100,2),
            "predicted_outcome": pred_1x2,
            "confidence": round(max(home_p,draw_p,away_p)*100,2),
            "btts_yes_prob": round(btts_yes*100,2),
            "btts_no_prob": round(btts_no*100,2),
            "btts_prediction": "YES" if btts_yes > btts_no else "NO",
            "over25_prob": round(over25*100,2),
            "under25_prob": round(under25*100,2),
            "over25_prediction": "OVER" if over25 > under25 else "UNDER",
            "over15_prob": round(over15*100,2),
            "exp_total_goals": round(hs["ewma_gf"]+aws["ewma_gf"],2),
            "exp_home_goals": round(hs["ewma_gf"],2),
            "exp_away_goals": round(aws["ewma_gf"],2),
        }
        preds.append(pred)
    
    print(f"   Generated {len(preds)}")
    
    print("\n[5/5] Saving...")
    os.makedirs(os.path.dirname(PUBLIC_FILE), exist_ok=True)
    with open(PUBLIC_FILE+".tmp","w",encoding="utf-8") as f:
        json.dump(preds, f, indent=2, ensure_ascii=False)
    os.replace(PUBLIC_FILE+".tmp", PUBLIC_FILE)
    
    # Stats
    print("\n"+"="*70)
    print(" STEP 48 SHARPENED COMPLETE")
    print("="*70)
    c1 = Counter([p["predicted_outcome"] for p in preds])
    print(f"1X2: HOME {c1.get('HOME_WIN',0)} | DRAW {c1.get('DRAW',0)} | AWAY {c1.get('AWAY_WIN',0)}")
    c2 = Counter([p["btts_prediction"] for p in preds])
    print(f"BTTS: YES {c2.get('YES',0)} | NO {c2.get('NO',0)}")
    c3 = Counter([p["over25_prediction"] for p in preds])
    print(f"Over2.5: OVER {c3.get('OVER',0)} | UNDER {c3.get('UNDER',0)}")
    print("\nTop 5 by confidence:")
    for p in sorted(preds, key=lambda x: x["confidence"], reverse=True)[:5]:
        print(f"  {p['home_team']} vs {p['away_team']} -> {p['predicted_outcome']} {p['confidence']}% (elo {p['elo_diff']}) BTTS {p['btts_prediction']} {p['btts_yes_prob']}% Over25 {p['over25_prediction']} {p['over25_prob']}% xG {p['exp_total_goals']}")
    print(f"\n📁 {PUBLIC_FILE}")
    print("="*70)

if __name__=="__main__":
    run()
