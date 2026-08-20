import os
import json
import joblib
import re
import unicodedata
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
INDEX_DIR = os.path.join(BASE_DIR, "data", "indexes")
CANONICAL_SOURCES_DIR = os.path.join(BASE_DIR, "data", "zokascore_football_data", "canonical_sources")
FIXTURES_DIR = os.path.join(BASE_DIR, "public_data", "fixtures")
PREDICTIONS_DIR = os.path.join(BASE_DIR, "public_data", "predictions")

PUBLIC_KNOWLEDGE_DIR = os.path.join(BASE_DIR, "public_data", "knowledge", "football")
H2H_SUMMARIES_FILE = os.path.join(PUBLIC_KNOWLEDGE_DIR, "history", "entities", "h2h", "summaries.json")
TEAM_INTEL_DIR = os.path.join(PUBLIC_KNOWLEDGE_DIR, "history", "entities", "team_intelligence")

TEAMS_INDEX_FILE = os.path.join(INDEX_DIR, "teams-index.json")
INTERNAL_TEAM_MAP_FILE = os.path.join(CANONICAL_SOURCES_DIR, "internal_team_map.json")
LIVE_STATE_FILE = os.path.join(MODELS_DIR, "live_team_state.json")

MODELS = {
    "1x2": {"file": os.path.join(MODELS_DIR, "champion_model.joblib"), "class_map": {0: "AWAY_WIN", 1: "DRAW", 2: "HOME_WIN"}},
    "ou_0_5": {"file": os.path.join(MODELS_DIR, "market_ou_0_5_model.joblib"), "class_map": {0: "OVER", 1: "UNDER"}},
    "ou_1_5": {"file": os.path.join(MODELS_DIR, "market_ou_1_5_model.joblib"), "class_map": {0: "OVER", 1: "UNDER"}},
    "ou_2_5": {"file": os.path.join(MODELS_DIR, "market_ou_2_5_model.joblib"), "class_map": {0: "OVER", 1: "UNDER"}},
    "ou_3_5": {"file": os.path.join(MODELS_DIR, "market_ou_3_5_model.joblib"), "class_map": {0: "OVER", 1: "UNDER"}},
    "btts": {"file": os.path.join(MODELS_DIR, "market_btts_model.joblib"), "class_map": {0: "NO", 1: "YES"}},
    "correct_score": {"file": os.path.join(MODELS_DIR, "market_correct_score_model.joblib"), "class_map": None}
}

FEATURES_1X2 = ["home_elo_pre", "away_elo_pre", "elo_diff", "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts", "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg", "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"]
FEATURES_MARKET = ["home_elo_pre", "away_elo_pre", "elo_diff", "home_ewma_pts", "away_ewma_pts", "home_ewma_gd", "away_ewma_gd", "home_ewma_gf", "away_ewma_gf", "home_ewma_ga", "away_ewma_ga", "home_ewma_home_pts", "away_ewma_away_pts", "home_ewma_home_gd", "away_ewma_away_gd", "home_ewma_home_gf", "away_ewma_away_gf", "home_ewma_home_ga", "away_ewma_away_ga", "home_matches_before", "away_matches_before", "home_home_matches_before", "away_away_matches_before"]
FEATURES_CS = ["home_elo_pre", "away_elo_pre", "elo_diff", "home_ewma_gf", "away_ewma_gf", "home_ewma_ga", "away_ewma_ga", "home_ewma_home_gf", "away_ewma_away_gf", "home_ewma_home_ga", "away_ewma_away_ga", "home_matches_before", "away_matches_before"]

def clean_name(value):
    if value is None: return ""
    value = str(value).strip().lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.replace("&", " and ")
    value = re.sub(r"[.'\"']", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def name_variants(value):
    original = clean_name(value)
    if not original: return set()
    variants = {original, original.replace(" ", "")}
    for s in [" fc", " cf", " sc", " afc", " ac", " bc", " fk", " sk", " sv", " bv", " cd", " cs", " ca", " as", " ss", " ud", " real"]:
        if original.endswith(s): variants.add(original[:-len(s)].strip())
    return variants

class TeamResolver:
    def __init__(self, teams_index, internal_provider_map):
        self.teams_index = teams_index or {}
        self.internal_provider_map = internal_provider_map or {}
        self.exact = {}
        self.variant = {}
        self.provider = {}
        self._build_indexes()

    def _register_exact(self, name, zk_id):
        norm = clean_name(name)
        if norm: self.exact.setdefault(norm, zk_id)

    def _register_variant(self, name, zk_id):
        for v in name_variants(name): self.variant.setdefault(v, zk_id)

    def _build_indexes(self):
        for zk_id, profile in self.teams_index.items():
            names = []
            if isinstance(profile, dict):
                for f in ["name", "team_name", "short_name", "common_name"]:
                    v = profile.get(f)
                    if isinstance(v, str) and v.strip(): names.append(v)
            for name in names:
                self._register_exact(name, zk_id)
                self._register_variant(name, zk_id)
            if isinstance(profile, dict):
                for pid_key in ["id", "provider_id", "api_id", "isports_id"]:
                    pid = profile.get(pid_key)
                    if pid: self.provider.setdefault(str(pid), zk_id)

        for provider_id, zk_id in self.internal_provider_map.items():
            if zk_id: self.provider[str(provider_id)] = zk_id

    def resolve(self, provider_id, fixture_name):
        if provider_id:
            zk_id = self.provider.get(str(provider_id))
            if zk_id: return {"zk_id": zk_id, "method": "provider_id"}
        zk_id = self.exact.get(clean_name(fixture_name))
        if zk_id: return {"zk_id": zk_id, "method": "exact_name"}
        for v in name_variants(fixture_name):
            zk_id = self.variant.get(v)
            if zk_id: return {"zk_id": zk_id, "method": "variant"}
        return {"zk_id": None, "method": "unresolved"}

def get_team_intel(team_id, live_team_state):
    elo = float(live_team_state.get(team_id, {}).get("elo", 1500.0))
    intel_file = os.path.join(TEAM_INTEL_DIR, f"{team_id}.json")
    form = []
    if os.path.exists(intel_file):
        try:
            with open(intel_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                form = data.get("recent_form", [])[-5:]
        except Exception:
            pass
    return {"elo": round(elo, 2), "form": form}

def get_h2h_intel(home_id, away_id, h2h_summaries):
    team_a = min(home_id, away_id)
    team_b = max(home_id, away_id)
    h2h_key = f"{team_a}_vs_{team_b}"
    data = h2h_summaries.get(h2h_key, {"matches": 0, "team_a_wins": 0, "team_b_wins": 0, "draws": 0})
    total = data.get("matches", 0)
    if total == 0: return {"meetings": 0, "teamA_wins": 0, "teamB_wins": 0, "draws": 0, "hw_rate": 0.0, "d_rate": 0.0, "aw_rate": 0.0}
    if home_id == team_a:
        hw, aw = data.get("team_a_wins", 0), data.get("team_b_wins", 0)
    else:
        hw, aw = data.get("team_b_wins", 0), data.get("team_a_wins", 0)
    return {"meetings": total, "teamA_wins": hw, "teamB_wins": aw, "draws": data.get("draws", 0), "hw_rate": hw/total, "d_rate": data.get("draws", 0)/total, "aw_rate": aw/total}

def enforce_logical_consistency(markets):
    def set_pick(m_key, pick):
        if m_key in markets and "probabilities" in markets[m_key]:
            prob = markets[m_key]["probabilities"].get(pick, 0.0)
            markets[m_key]["pick"] = pick
            markets[m_key]["pick_probability"] = max(prob, 51.0)
    if markets.get("ou_0_5", {}).get("pick") == "UNDER":
        set_pick("btts", "NO"); set_pick("ou_1_5", "UNDER"); set_pick("ou_2_5", "UNDER"); set_pick("ou_3_5", "UNDER"); return markets
    if markets.get("ou_1_5", {}).get("pick") == "UNDER":
        set_pick("btts", "NO"); set_pick("ou_2_5", "UNDER"); set_pick("ou_3_5", "UNDER"); set_pick("ou_0_5", "OVER"); return markets
    if markets.get("ou_2_5", {}).get("pick") == "UNDER": set_pick("ou_3_5", "UNDER")
    if markets.get("ou_3_5", {}).get("pick") == "OVER":
        set_pick("ou_2_5", "OVER"); set_pick("ou_1_5", "OVER"); set_pick("ou_0_5", "OVER"); return markets
    if markets.get("ou_2_5", {}).get("pick") == "OVER": set_pick("ou_1_5", "OVER"); set_pick("ou_0_5", "OVER")
    if markets.get("ou_1_5", {}).get("pick") == "OVER": set_pick("ou_0_5", "OVER")
    if markets.get("btts", {}).get("pick") == "YES": set_pick("ou_0_5", "OVER"); set_pick("ou_1_5", "OVER")
    return markets

def calculate_correct_score_matrix(markets):
    p_1x2 = markets.get("1x2", {}).get("probabilities", {"HOME_WIN": 33.3, "DRAW": 33.3, "AWAY_WIN": 33.4})
    p_ou15 = markets.get("ou_1_5", {}).get("probabilities", {"OVER": 50, "UNDER": 50})
    p_ou25 = markets.get("ou_2_5", {}).get("probabilities", {"OVER": 50, "UNDER": 50})
    p_ou35 = markets.get("ou_3_5", {}).get("probabilities", {"OVER": 30, "UNDER": 70})
    p_btts = markets.get("btts", {}).get("probabilities", {"YES": 50, "NO": 50})

    p_h = max(p_1x2.get("HOME_WIN", 33.3), 1.0)
    p_d = max(p_1x2.get("DRAW", 33.3), 1.0)
    p_a = max(p_1x2.get("AWAY_WIN", 33.4), 1.0)
    
    p_over15 = max(p_ou15.get("OVER", 50), 1.0)
    p_under15 = max(p_ou15.get("UNDER", 50), 1.0)
    p_over25 = max(p_ou25.get("OVER", 50), 1.0)
    p_under25 = max(p_ou25.get("UNDER", 50), 1.0)
    p_over35 = max(p_ou35.get("OVER", 30), 1.0)
    
    p_btts_yes = max(p_btts.get("YES", 50), 1.0)
    p_btts_no = max(p_btts.get("NO", 50), 1.0)

    scores = {}
    for h in range(6):
        for a in range(6):
            weight = 1.0
            if h > a: weight *= (p_h / 33.3)
            elif h < a: weight *= (p_a / 33.3)
            else: weight *= (p_d / 33.3)
            
            total_goals = h + a
            if total_goals > 1: weight *= (p_over15 / 50.0)
            else: weight *= (p_under15 / 50.0)
            
            if total_goals > 2: weight *= (p_over25 / 50.0)
            else: weight *= (p_under25 / 50.0)
            
            if total_goals > 3: weight *= (p_over35 / 30.0)
            
            if h > 0 and a > 0: weight *= (p_btts_yes / 50.0)
            else: weight *= (p_btts_no / 50.0)
            
            if total_goals == 0: weight *= 0.8
            if total_goals >= 5: weight *= 0.2
            if total_goals >= 6: weight *= 0.05
                
            scores[f"{h}-{a}"] = weight
            
    total_weight = sum(scores.values())
    if total_weight > 0:
        for score in scores:
            scores[score] = round((scores[score] / total_weight) * 100, 2)
            
    sorted_scores = dict(sorted(scores.items(), key=lambda item: item[1], reverse=True))
    return sorted_scores

def calculate_correct_score_matrix_ml(cs_model, features_1x2, features_mkt):
    try:
        cs_features = pd.DataFrame([{
            "home_elo_pre": features_1x2["home_elo_pre"].iloc[0],
            "away_elo_pre": features_1x2["away_elo_pre"].iloc[0],
            "elo_diff": features_1x2["elo_diff"].iloc[0],
            "home_ewma_gf": features_mkt["home_ewma_gf"].iloc[0], "away_ewma_gf": features_mkt["away_ewma_gf"].iloc[0],
            "home_ewma_ga": features_mkt["home_ewma_ga"].iloc[0], "away_ewma_ga": features_mkt["away_ewma_ga"].iloc[0],
            "home_ewma_home_gf": features_mkt["home_ewma_home_gf"].iloc[0], "away_ewma_away_gf": features_mkt["away_ewma_away_gf"].iloc[0],
            "home_ewma_home_ga": features_mkt["home_ewma_home_ga"].iloc[0], "away_ewma_away_ga": features_mkt["away_ewma_away_ga"].iloc[0],
            "home_matches_before": features_mkt["home_matches_before"].iloc[0], "away_matches_before": features_mkt["away_matches_before"].iloc[0]
        }])[FEATURES_CS]

        probs = cs_model.predict_proba(cs_features)[0]
        classes = list(cs_model.classes_)
        
        mapping_file = os.path.join(MODELS_DIR, "market_correct_score_label_mapping.json")
        if os.path.exists(mapping_file):
            with open(mapping_file, "r") as f:
                label_map = json.load(f)
            
            score_probs = {}
            for i, c in enumerate(classes):
                c_int = int(c)
                score_str = label_map.get(str(c_int), "1-1")
                score_probs[score_str] = round(float(probs[i]) * 100, 2)
            return dict(sorted(score_probs.items(), key=lambda item: item[1], reverse=True))
    except Exception as e:
        print(f"⚠️ Correct Score ML failed, falling back to math: {e}")
        return None

def generate_zoka_picks(date_str, predictions_list, fixtures_data):
    if not predictions_list: return
    
    zoka_dir = os.path.join(BASE_DIR, "public_data", "zokapicks")
    os.makedirs(zoka_dir, exist_ok=True)
    zoka_file = os.path.join(zoka_dir, f"{date_str}.json")
    
    if os.path.exists(zoka_file):
        print(f"   [SKIP] Zoka Picks for {date_str} already exist. Preserving manual edits.")
        return
        
    sorted_preds = sorted(predictions_list, key=lambda x: x.get("markets", {}).get("1x2", {}).get("pick_probability", 0), reverse=True)
    top_10 = sorted_preds[:10]
    
    zoka_matches = []
    for pred in top_10:
        match_id = pred["matchId"]
        fixture = next((m for m in fixtures_data if str(m.get("id")) == match_id), None)
        if not fixture: continue
        
        home_team = fixture.get("homeTeam", {})
        away_team = fixture.get("awayTeam", {})
        league = fixture.get("league", {})
        
        cs_data = pred.get("markets", {}).get("correct_scores")
        if not cs_data:
            best_score_str = "1-1"
        else:
            best_score_str = next(iter(cs_data), "1-1")
            
        best_h, best_a = map(int, best_score_str.split('-'))
            
        zoka_matches.append({
            "matchId": match_id,
            "homeTeam": {"name": home_team.get("name"), "shortName": home_team.get("shortName"), "crest": home_team.get("crest")},
            "awayTeam": {"name": away_team.get("name"), "shortName": away_team.get("shortName"), "crest": away_team.get("crest")},
            "homeLogo": home_team.get("crest"), "awayLogo": away_team.get("crest"),
            "league": {"name": league.get("name"), "emblem": league.get("emblem")},
            "kickoff": fixture.get("utcDate"),
            "adminPick": {"home": best_h, "away": best_a}, 
            "homeScore": None, "awayScore": None, "status": "upcoming",
            "updatedAt": datetime.now(timezone.utc).isoformat()
        })
        
    zoka_payload = {
        "data": zoka_matches, 
        "matches": zoka_matches, 
        "date": date_str, 
        "totalMatches": len(zoka_matches),
        "isDraft": False, 
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    with open(zoka_file, "w", encoding="utf-8") as f:
        json.dump(zoka_payload, f, indent=2, ensure_ascii=False)
        
    print(f"   [OK] Auto-generated {len(zoka_matches)} Zoka Picks for {date_str}.")

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 50: MASTER DAILY DEPLOYER")
    print("=" * 60)

    print("[1/5] Loading artifacts...")
    models = {}
    for market, cfg in MODELS.items():
        if os.path.exists(cfg["file"]): models[market] = joblib.load(cfg["file"])
            
    live_team_state = json.load(open(LIVE_STATE_FILE, "r", encoding="utf-8"))
    teams_index = json.load(open(TEAMS_INDEX_FILE, "r", encoding="utf-8"))
    internal_team_map = json.load(open(INTERNAL_TEAM_MAP_FILE, "r", encoding="utf-8")).get("by_provider_club_id", {})
    resolver = TeamResolver(teams_index, internal_team_map)

    h2h_summaries = {}
    if os.path.exists(H2H_SUMMARIES_FILE):
        with open(H2H_SUMMARIES_FILE, "r", encoding="utf-8") as f: h2h_summaries = json.load(f)

    print("[2/5] Form & H2H state loaded.")
    
    print("[3/5] Processing dates...")
    os.makedirs(PREDICTIONS_DIR, exist_ok=True)
    now = datetime.now(timezone.utc)
    
    for offset in (0, 1):
        target_date = (now + timedelta(days=offset)).date()
        date_str = target_date.isoformat()
        fixture_file = os.path.join(FIXTURES_DIR, f"{date_str}.json")
        
        if not os.path.exists(fixture_file): continue
            
        print(f"[3/5] Processing {date_str}.json...")
        with open(fixture_file, "r", encoding="utf-8") as f: fixture_data = json.load(f)
            
        matches = fixture_data.get("data", []) if isinstance(fixture_data, dict) else fixture_data
        predictions_list = []
        
        for match in matches:
            if not isinstance(match, dict): continue
            match_id = str(match.get("id", ""))
            if not match_id: continue
            
            home_obj = match.get("homeTeam", {})
            away_obj = match.get("awayTeam", {})
            home_name = match.get("homeTeamName") or home_obj.get("name")
            away_name = match.get("awayTeamName") or away_obj.get("name")
            home_pid = str(match.get("homeTeamId") or home_obj.get("id", "")).strip()
            away_pid = str(match.get("awayTeamId") or away_obj.get("id", "")).strip()
            
            home_res = resolver.resolve(home_pid, home_name)
            away_res = resolver.resolve(away_pid, away_name)
            home_id, away_id = home_res["zk_id"], away_res["zk_id"]
            if not home_id or not away_id: continue
            
            home_intel = get_team_intel(home_id, live_team_state)
            away_intel = get_team_intel(away_id, live_team_state)
            h2h_intel = get_h2h_intel(home_id, away_id, h2h_summaries)
            
            def calc_pts(form):
                pts = 0
                for res in form:
                    if res == 'W': pts += 3
                    elif res == 'D': pts += 1
                return pts

            h_pts = calc_pts(home_intel["form"])
            a_pts = calc_pts(away_intel["form"])

            features_1x2 = pd.DataFrame([{
                "home_elo_pre": home_intel["elo"], "away_elo_pre": away_intel["elo"], "elo_diff": home_intel["elo"] - away_intel["elo"],
                "home_form_pts": h_pts, "away_form_pts": a_pts, "home_home_pts": h_pts, "away_away_pts": a_pts,
                "home_gf_avg": 1.0, "away_gf_avg": 1.0, "home_ga_avg": 1.0, "away_ga_avg": 1.0,
                "h2h_hw_rate": h2h_intel["hw_rate"], "h2h_d_rate": h2h_intel["d_rate"], "h2h_aw_rate": h2h_intel["aw_rate"], "h2h_matches": h2h_intel["meetings"]
            }])[FEATURES_1X2]

            h_state_mkt = live_team_state.get(home_id, {})
            a_state_mkt = live_team_state.get(away_id, {})
            features_mkt = pd.DataFrame([{
                "home_elo_pre": home_intel["elo"], "away_elo_pre": away_intel["elo"], "elo_diff": home_intel["elo"] - away_intel["elo"],
                "home_ewma_pts": h_state_mkt.get("ewma_points", 1.0), "away_ewma_pts": a_state_mkt.get("ewma_points", 1.0),
                "home_ewma_gd": h_state_mkt.get("ewma_gd", 0.0), "away_ewma_gd": a_state_mkt.get("ewma_gd", 0.0),
                "home_ewma_gf": h_state_mkt.get("ewma_gf", 1.0), "away_ewma_gf": a_state_mkt.get("ewma_gf", 1.0),
                "home_ewma_ga": h_state_mkt.get("ewma_ga", 1.0), "away_ewma_ga": a_state_mkt.get("ewma_ga", 1.0),
                "home_ewma_home_pts": h_state_mkt.get("ewma_home_points", 1.0), "away_ewma_away_pts": a_state_mkt.get("ewma_away_points", 1.0),
                "home_ewma_home_gd": h_state_mkt.get("ewma_home_gd", 0.0), "away_ewma_away_gd": a_state_mkt.get("ewma_away_gd", 0.0),
                "home_ewma_home_gf": h_state_mkt.get("ewma_home_gf", 1.0), "away_ewma_away_gf": a_state_mkt.get("ewma_away_gf", 1.0),
                "home_ewma_home_ga": h_state_mkt.get("ewma_home_ga", 1.0), "away_ewma_away_ga": a_state_mkt.get("ewma_away_ga", 1.0),
                "home_matches_before": h_state_mkt.get("matches_played", 0), "away_matches_before": a_state_mkt.get("matches_played", 0),
                "home_home_matches_before": h_state_mkt.get("home_matches_played", 0), "away_away_matches_before": a_state_mkt.get("away_matches_played", 0)
            }])[FEATURES_MARKET]

            match_markets = {}
            for market, model in models.items():
                if market == "correct_score": continue
                
                X = features_1x2 if market == "1x2" else features_mkt
                probs = model.predict_proba(X)[0]
                classes = list(model.classes_)
                prob_map = {}
                for i, c in enumerate(classes):
                    c_int = int(c)
                    label = MODELS[market]["class_map"].get(c_int, str(c_int))
                    prob_map[label] = round(float(probs[i]) * 100, 2)
                pick = max(prob_map, key=prob_map.get)
                match_markets[market] = {"probabilities": prob_map, "pick": pick, "pick_probability": prob_map[pick]}
            
            match_markets = enforce_logical_consistency(match_markets)
            
            cs_matrix = calculate_correct_score_matrix_ml(models.get("correct_score"), features_1x2, features_mkt)
            if cs_matrix is None:
                cs_matrix = calculate_correct_score_matrix(match_markets)
            match_markets["correct_scores"] = cs_matrix
            
            match["prediction"] = match_markets
            match["intelData"] = {
                "home": home_intel, "away": away_intel,
                "h2h": {"meetings": h2h_intel["meetings"], "teamA_wins": h2h_intel["teamA_wins"], "teamB_wins": h2h_intel["teamB_wins"], "draws": h2h_intel["draws"]}
            }
            
            predictions_list.append({
                "matchId": match_id,
                "homeTeam": {"id": home_id, "providerId": home_pid, "name": home_name},
                "awayTeam": {"id": away_id, "providerId": away_pid, "name": away_name},
                "markets": match_markets
            })

        print(f"[4/5] Saving updated fixtures and predictions for {date_str}...")
        with open(fixture_file, "w", encoding="utf-8") as f:
            json.dump(fixture_data, f, indent=2, ensure_ascii=False)
            
        pred_file = os.path.join(PREDICTIONS_DIR, f"{date_str}.json")
        with open(pred_file, "w", encoding="utf-8") as f:
            json.dump({"engine": "ZOKASCORE_V2", "pipeline": "50", "date": date_str, "generated_at": now.isoformat(), "predictions": predictions_list}, f, indent=2, ensure_ascii=False)
            
        generate_zoka_picks(date_str, predictions_list, matches)
            
        print(f"   [OK] {date_str}: Generated {len(predictions_list)} predictions.")

    print("[5/5] Done.")
    print("=" * 60)

if __name__ == "__main__":
    run()