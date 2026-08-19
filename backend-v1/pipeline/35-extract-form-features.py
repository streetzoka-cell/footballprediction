import os
import json
from collections import deque
import pandas as pd
import numpy as np

# ============================================================
# ZOKASCORE V2 — STEP 35
# FORM & H2H FEATURE EXTRACTION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "ml")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "features_v2.csv")

EXPECTED_ROWS = 484354

REQUIRED_COLUMNS = [
    "zokascore_match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "home_score",
    "away_score",
    "home_elo_pre",
    "away_elo_pre",
]

def get_target(home_score, away_score):
    if home_score > away_score: return "HOME_WIN"
    if home_score < away_score: return "AWAY_WIN"
    return "DRAW"

def calculate_form(history):
    if not history:
        return 0, 0.0, 0.0
    relevant = list(history)[-5:]
    points = sum(m["points"] for m in relevant)
    goals_for = sum(m["gf"] for m in relevant)
    goals_against = sum(m["ga"] for m in relevant)
    count = len(relevant)
    return points, goals_for / count, goals_against / count

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 35: FORM & H2H EXTRACTION")
    print("=" * 60)
    print()

    print("[1/7] Checking Step 32 source...")
    if not os.path.exists(SOURCE_FILE):
        raise FileNotFoundError(f"Step 32 dataset not found:\n{SOURCE_FILE}")

    print("\n[2/7] Loading master_with_elo.csv...")
    df = pd.read_csv(SOURCE_FILE, low_memory=False)
    if len(df) != EXPECTED_ROWS:
        raise RuntimeError(f"Population mismatch: expected {EXPECTED_ROWS:,}, got {len(df):,}.")
    print(f"   ↳ Rows loaded: {len(df):,}")

    print("\n[3/7] Validating source dataset...")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns: {missing}")

    if df["zokascore_match_id"].isna().any() or df["zokascore_match_id"].duplicated().any():
        raise RuntimeError("Match IDs are missing or duplicated.")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any():
        raise RuntimeError("Invalid dates detected.")

    if df["home_team_id"].isna().any() or df["away_team_id"].isna().any():
        raise RuntimeError("Missing canonical team IDs detected.")

    df["home_score"] = pd.to_numeric(df["home_score"], errors="coerce")
    df["away_score"] = pd.to_numeric(df["away_score"], errors="coerce")
    if df["home_score"].isna().any() or df["away_score"].isna().any():
        raise RuntimeError("Invalid scores detected.")

    for col in ["home_elo_pre", "away_elo_pre"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            raise RuntimeError(f"{col} contains invalid values.")
    print("   ✅ Structural integrity verified.")

    print("\n[4/7] Preparing deterministic chronology...")
    # Deterministic chronological sort using mergesort
    df = df.sort_values(by=["date", "zokascore_match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[5/7] Calculating chronological form & H2H...")
    team_recent = {}
    team_home_recent = {}
    team_away_recent = {}
    h2h_state = {}
    features = []

    for row in df.itertuples(index=False):
        home_id = str(row.home_team_id)
        away_id = str(row.away_team_id)
        home_score = int(row.home_score)
        away_score = int(row.away_score)

        if home_id not in team_recent: team_recent[home_id] = deque(maxlen=5)
        if away_id not in team_recent: team_recent[away_id] = deque(maxlen=5)
        if home_id not in team_home_recent: team_home_recent[home_id] = deque(maxlen=5)
        if away_id not in team_away_recent: team_away_recent[away_id] = deque(maxlen=5)

        # ----------------------------------------------------
        # PRE-MATCH FORM (Calculated BEFORE state update)
        # ----------------------------------------------------
        home_form_pts, home_gf_avg, home_ga_avg = calculate_form(team_recent[home_id])
        away_form_pts, away_gf_avg, away_ga_avg = calculate_form(team_recent[away_id])
        home_home_pts, _, _ = calculate_form(team_home_recent[home_id])
        away_away_pts, _, _ = calculate_form(team_away_recent[away_id])

        # ----------------------------------------------------
        # PRE-MATCH H2H
        # ----------------------------------------------------
        team_a = min(home_id, away_id)
        team_b = max(home_id, away_id)
        h2h_key = f"{team_a}|{team_b}"

        if h2h_key not in h2h_state:
            h2h_state[h2h_key] = {"team_a_wins": 0, "draws": 0, "team_b_wins": 0}

        state = h2h_state[h2h_key]
        total_h2h = state["team_a_wins"] + state["draws"] + state["team_b_wins"]

        if total_h2h == 0:
            h2h_home_win_rate = 0.0
            h2h_draw_rate = 0.0
            h2h_away_win_rate = 0.0
        else:
            if home_id == team_a:
                h2h_home_wins = state["team_a_wins"]
                h2h_away_wins = state["team_b_wins"]
            else:
                h2h_home_wins = state["team_b_wins"]
                h2h_away_wins = state["team_a_wins"]

            h2h_home_win_rate = h2h_home_wins / total_h2h
            h2h_draw_rate = state["draws"] / total_h2h
            h2h_away_win_rate = h2h_away_wins / total_h2h

        target = get_target(home_score, away_score)
        home_elo = float(row.home_elo_pre)
        away_elo = float(row.away_elo_pre)
        elo_diff = home_elo - away_elo

        features.append({
            "match_id": row.zokascore_match_id,
            "date": row.date.strftime("%Y-%m-%d"),
            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_elo_pre": round(home_elo, 2),
            "away_elo_pre": round(away_elo, 2),
            "elo_diff": round(elo_diff, 2),
            "home_form_pts": home_form_pts,
            "away_form_pts": away_form_pts,
            "home_home_pts": home_home_pts,
            "away_away_pts": away_away_pts,
            "home_gf_avg": round(home_gf_avg, 2),
            "away_gf_avg": round(away_gf_avg, 2),
            "home_ga_avg": round(home_ga_avg, 2),
            "away_ga_avg": round(away_ga_avg, 2),
            "h2h_hw_rate": round(h2h_home_win_rate, 4),
            "h2h_d_rate": round(h2h_draw_rate, 4),
            "h2h_aw_rate": round(h2h_away_win_rate, 4),
            "h2h_matches": total_h2h,
            "target": target,
        })

        # ====================================================
        # UPDATE STATE AFTER FEATURE EXTRACTION (No Leakage)
        # ====================================================
        if home_score > away_score:
            home_points, away_points = 3, 0
        elif home_score < away_score:
            home_points, away_points = 0, 3
        else:
            home_points, away_points = 1, 1

        team_recent[home_id].append({"gf": home_score, "ga": away_score, "points": home_points})
        team_recent[away_id].append({"gf": away_score, "ga": home_score, "points": away_points})
        
        team_home_recent[home_id].append({"gf": home_score, "ga": away_score, "points": home_points})
        team_away_recent[away_id].append({"gf": away_score, "ga": home_score, "points": away_points})

        if target == "DRAW":
            state["draws"] += 1
        elif home_id == team_a:
            if target == "HOME_WIN": state["team_a_wins"] += 1
            else: state["team_b_wins"] += 1
        else:
            if target == "HOME_WIN": state["team_b_wins"] += 1
            else: state["team_a_wins"] += 1

    print("\n[6/7] Validating generated features...")
    features_df = pd.DataFrame(features)
    if len(features_df) != EXPECTED_ROWS:
        raise RuntimeError(f"Feature population mismatch: expected {EXPECTED_ROWS:,}, got {len(features_df):,}.")
    if features_df["match_id"].nunique() != EXPECTED_ROWS:
        raise RuntimeError("Feature Match ID uniqueness failure.")

    feature_columns = [
        "home_elo_pre", "away_elo_pre", "elo_diff",
        "home_form_pts", "away_form_pts", "home_home_pts", "away_away_pts",
        "home_gf_avg", "away_gf_avg", "home_ga_avg", "away_ga_avg",
        "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
    ]
    if features_df[feature_columns].isna().any().any():
        raise RuntimeError("Generated feature dataset contains NaN values.")

    # Floating point safe verification
    calculated_diff = (features_df["home_elo_pre"] - features_df["away_elo_pre"]).round(2)
    if not np.isclose(calculated_diff, features_df["elo_diff"], atol=0.01).all():
        raise RuntimeError("ELO difference integrity failure.")

    home_wins = int((features_df["target"] == "HOME_WIN").sum())
    draws = int((features_df["target"] == "DRAW").sum())
    away_wins = int((features_df["target"] == "AWAY_WIN").sum())

    if home_wins + draws + away_wins != EXPECTED_ROWS:
        raise RuntimeError("Target accounting mismatch.")
    print(f"   ✅ Feature rows: {len(features_df):,}")

    print("\n[7/7] Writing ML feature dataset...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    temp_output = OUTPUT_FILE + ".tmp"
    features_df.to_csv(temp_output, index=False)

    verification = pd.read_csv(temp_output, low_memory=False)
    if len(verification) != EXPECTED_ROWS:
        raise RuntimeError(f"Output validation failed: expected {EXPECTED_ROWS:,}, got {len(verification):,}.")

    os.replace(temp_output, OUTPUT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 35 COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 Source rows:          {EXPECTED_ROWS:,}")
    print(f"📊 Feature rows:         {len(features_df):,}")
    print(f"📊 HOME_WIN:             {home_wins:,}")
    print(f"📊 DRAW:                 {draws:,}")
    print(f"📊 AWAY_WIN:             {away_wins:,}")
    print(f"📁 ML Features:          {OUTPUT_FILE}")
    print()
    print("🔒 Step 32 ELO dataset was NOT modified.")
    print("🔒 No future match entered any feature.")
    print("🔒 Form is strictly pre-match.")
    print("🔒 H2H is strictly pre-match.")
    print("🔒 Exact population preserved: 484,354.")
    print("=" * 60)

if __name__ == "__main__":
    run()