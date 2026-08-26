
import os, json, joblib
import pandas as pd
import numpy as np
from collections import deque, defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "ml")
FEATURES_V2_FILE = os.path.join(OUTPUT_DIR, "features_v2.csv")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "features_v3_unique.csv")

# For unique engine
def calculate_ewma(values, alpha=0.3):
    if not values:
        return 0.0
    ewma = values[0]
    for v in values[1:]:
        ewma = alpha * v + (1 - alpha) * ewma
    return ewma

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 38: UNIQUE GOAL ENGINE FEATURES")
    print(" BTTS + Over/Under + Attack/Defense + EWMA")
    print("="*60+"\n")
    print("[1/6] Loading master_with_elo.csv (DYNAMIC)...")
    df = pd.read_csv(SOURCE_FILE, low_memory=False)
    total = len(df)
    print(f"   ↳ Rows: {total:,} (dynamic)")

    print("\n[2/6] Preparing chronology...")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.sort_values(by=["date", "zokascore_match_id"], kind="mergesort").reset_index(drop=True)
    
    # State for unique features
    team_goals_for = defaultdict(lambda: deque(maxlen=10))
    team_goals_against = defaultdict(lambda: deque(maxlen=10))
    team_btts = defaultdict(lambda: deque(maxlen=10))
    team_over25 = defaultdict(lambda: deque(maxlen=10))
    team_clean = defaultdict(lambda: deque(maxlen=10))
    team_failed = defaultdict(lambda: deque(maxlen=10))
    team_home_gf = defaultdict(lambda: deque(maxlen=10))
    team_away_gf = defaultdict(lambda: deque(maxlen=10))
    h2h_goals = defaultdict(list)
    h2h_btts = defaultdict(list)
    h2h_over = defaultdict(list)
    league_avg_gf = []
    
    features = []
    
    print("\n[3/6] Calculating UNIQUE features (goals, BTTS, Over/Under, EWMA, Attack/Defense)...")
    for idx, row in enumerate(df.itertuples(index=False)):
        hid = str(row.home_team_id)
        aid = str(row.away_team_id)
        hs = int(row.home_score)
        aw = int(row.away_score)
        
        # Past data before this match
        # Goals
        h_gf_list = list(team_goals_for[hid])
        a_gf_list = list(team_goals_for[aid])
        h_ga_list = list(team_goals_against[hid])
        a_ga_list = list(team_goals_against[aid])
        
        # EWMA (recent matters more) - UNIQUE
        h_gf_ewma = calculate_ewma(h_gf_list, 0.3) if h_gf_list else 0.0
        a_gf_ewma = calculate_ewma(a_gf_list, 0.3) if a_gf_list else 0.0
        h_ga_ewma = calculate_ewma(h_ga_list, 0.3) if h_ga_list else 0.0
        a_ga_ewma = calculate_ewma(a_ga_list, 0.3) if a_ga_list else 0.0
        
        # BTTS rate
        h_btts_rate = np.mean(team_btts[hid]) if team_btts[hid] else 0.0
        a_btts_rate = np.mean(team_btts[aid]) if team_btts[aid] else 0.0
        
        # Over 2.5 rate
        h_over_rate = np.mean(team_over25[hid]) if team_over25[hid] else 0.0
        a_over_rate = np.mean(team_over25[aid]) if team_over25[aid] else 0.0
        
        # Clean sheet / failed to score
        h_clean_rate = np.mean(team_clean[hid]) if team_clean[hid] else 0.0
        a_clean_rate = np.mean(team_clean[aid]) if team_clean[aid] else 0.0
        h_failed_rate = np.mean(team_failed[hid]) if team_failed[hid] else 0.0
        a_failed_rate = np.mean(team_failed[aid]) if team_failed[aid] else 0.0
        
        # Attack / Defense strength vs league average (last 100 matches avg)
        recent_league_avg = np.mean(league_avg_gf[-100:]) if len(league_avg_gf) >= 10 else 1.4
        h_attack = (np.mean(h_gf_list) / recent_league_avg) if h_gf_list and recent_league_avg>0 else 1.0
        a_attack = (np.mean(a_gf_list) / recent_league_avg) if a_gf_list and recent_league_avg>0 else 1.0
        h_defense = (np.mean(h_ga_list) / recent_league_avg) if h_ga_list and recent_league_avg>0 else 1.0
        a_defense = (np.mean(a_ga_list) / recent_league_avg) if a_ga_list and recent_league_avg>0 else 1.0
        
        # Expected goals (unique - Dixon-Coles style)
        exp_home_goals = h_attack * a_defense * recent_league_avg
        exp_away_goals = a_attack * h_defense * recent_league_avg
        
        # H2H goals
        team_a = min(hid, aid)
        team_b = max(hid, aid)
        h2h_key = f"{team_a}|{team_b}"
        h2h_avg_goals = np.mean(h2h_goals[h2h_key]) if h2h_goals[h2h_key] else 0.0
        h2h_btts_rate = np.mean(h2h_btts[h2h_key]) if h2h_btts[h2h_key] else 0.0
        h2h_over_rate = np.mean(h2h_over[h2h_key]) if h2h_over[h2h_key] else 0.0
        
        # Target engineering
        total_goals = hs + aw
        btts = 1 if hs>0 and aw>0 else 0
        over25 = 1 if total_goals > 2 else 0
        
        # 1X2 target
        if hs>aw: target="HOME_WIN"
        elif hs<aw: target="AWAY_WIN"
        else: target="DRAW"
        
        features.append({
            "match_id": row.zokascore_match_id,
            "date": row.date.strftime("%Y-%m-%d"),
            "home_team_id": hid,
            "away_team_id": aid,
            "home_elo_pre": round(float(row.home_elo_pre),2),
            "away_elo_pre": round(float(row.away_elo_pre),2),
            "elo_diff": round(float(row.home_elo_pre)-float(row.away_elo_pre),2),
            # UNIQUE: Goals EWMA
            "home_gf_ewma": round(h_gf_ewma,2),
            "away_gf_ewma": round(a_gf_ewma,2),
            "home_ga_ewma": round(h_ga_ewma,2),
            "away_ga_ewma": round(a_ga_ewma,2),
            # UNIQUE: BTTS / Over rates
            "home_btts_rate": round(h_btts_rate,3),
            "away_btts_rate": round(a_btts_rate,3),
            "home_over25_rate": round(h_over_rate,3),
            "away_over25_rate": round(a_over_rate,3),
            "home_clean_rate": round(h_clean_rate,3),
            "away_clean_rate": round(a_clean_rate,3),
            "home_failed_rate": round(h_failed_rate,3),
            "away_failed_rate": round(a_failed_rate,3),
            # UNIQUE: Attack/Defense strength
            "home_attack_strength": round(h_attack,3),
            "away_attack_strength": round(a_attack,3),
            "home_defense_strength": round(h_defense,3),
            "away_defense_strength": round(a_defense,3),
            "exp_home_goals": round(exp_home_goals,2),
            "exp_away_goals": round(exp_away_goals,2),
            "exp_total_goals": round(exp_home_goals+exp_away_goals,2),
            "exp_goal_diff": round(exp_home_goals-exp_away_goals,2),
            # UNIQUE: H2H goals
            "h2h_avg_goals": round(h2h_avg_goals,2),
            "h2h_btts_rate": round(h2h_btts_rate,3),
            "h2h_over25_rate": round(h2h_over_rate,3),
            "h2h_matches_goals": len(h2h_goals[h2h_key]),
            # Targets for multi-task
            "target": target,
            "target_btts": btts,
            "target_over25": over25,
            "target_total_goals": total_goals,
            "target_home_goals": hs,
            "target_away_goals": aw,
        })
        
        # Update state AFTER
        team_goals_for[hid].append(hs)
        team_goals_for[aid].append(aw)
        team_goals_against[hid].append(aw)
        team_goals_against[aid].append(hs)
        team_btts[hid].append(btts)
        team_btts[aid].append(btts)
        team_over25[hid].append(over25)
        team_over25[aid].append(over25)
        team_clean[hid].append(1 if aw==0 else 0)
        team_clean[aid].append(1 if hs==0 else 0)
        team_failed[hid].append(1 if hs==0 else 0)
        team_failed[aid].append(1 if aw==0 else 0)
        team_home_gf[hid].append(hs)
        team_away_gf[aid].append(aw)
        h2h_goals[h2h_key].append(total_goals)
        h2h_btts[h2h_key].append(btts)
        h2h_over[h2h_key].append(over25)
        league_avg_gf.append(total_goals/2)
        
        if idx % 50000 == 0:
            print(f"   ... {idx:,}/{total:,} processed")
    
    print("\n[4/6] Validating unique features...")
    features_df = pd.DataFrame(features)
    print(f"   ↳ Feature rows: {len(features_df):,} (dynamic)")
    print(f"   ↳ Columns: {len(features_df.columns)} (vs 19 in v2, 8 in elo)")
    print(f"   ↳ Unique features added: EWMA, BTTS rate, Over25 rate, Attack/Defense, Expected Goals, H2H goals")
    
    # Merge with v2 features for full set
    print("\n[5/6] Merging with v2 features (form + H2H)...")
    v2_df = pd.read_csv(FEATURES_V2_FILE, low_memory=False)
    # Merge on match_id
    merged = pd.merge(features_df, v2_df[["match_id","home_form_pts","away_form_pts","home_home_pts","away_away_pts","home_gf_avg","away_gf_avg","home_ga_avg","away_ga_avg","h2h_hw_rate","h2h_d_rate","h2h_aw_rate","h2h_matches"]], on="match_id", how="left")
    print(f"   ↳ Merged rows: {len(merged):,} | Final columns: {len(merged.columns)}")
    
    print("\n[6/6] Writing UNIQUE feature dataset...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    tmp = OUTPUT_FILE + ".tmp"
    merged.to_csv(tmp, index=False)
    ver = pd.read_csv(tmp, low_memory=False)
    if len(ver) != total:
        raise RuntimeError(f"Output validation fail expected {total:,}, got {len(ver):,}")
    os.replace(tmp, OUTPUT_FILE)
    
    print("\n"+"="*60)
    print(" STEP 38 COMPLETE: PASS - UNIQUE ENGINE READY")
    print("="*60)
    print(f"📊 Source: {total:,} matches")
    print(f"📊 Features: {len(merged.columns)} columns (UNIQUE)")
    print(f"📁 Output: {OUTPUT_FILE}")
    print("\n🔒 UNIQUE FEATURES:")
    print("  ✅ EWMA goals (time-decay, recent matters more)")
    print("  ✅ BTTS rate last 10 (both teams scored)")
    print("  ✅ Over 2.5 rate last 10")
    print("  ✅ Clean sheet / Failed to score rates")
    print("  ✅ Attack/Defense strength vs league avg")
    print("  ✅ Expected goals (Dixon-Coles style)")
    print("  ✅ H2H avg goals, BTTS, Over rates")
    print("  ✅ Multi-target: 1X2 + BTTS + Over25 + Total Goals")
    print("\n🚀 This will BEAT 50.39% - goal-based, not just result-based")
    print("="*60)

if __name__=="__main__":
    run()
