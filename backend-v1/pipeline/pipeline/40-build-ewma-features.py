import os
import pandas as pd
import numpy as np

# ============================================================
# ZOKASCORE V2 — STEP 40
# BUILD EWMA FEATURES V3
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "ml")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "features_v3.csv")

# ← DELETED: EXPECTED_ROWS = 484354  (was hardcoded; now set dynamically after load)

ALPHA = 0.20

REQUIRED_COLUMNS = [
    "zokascore_match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "home_score",
    "away_score",
    "home_elo_pre",
    "away_elo_pre"
]

def get_target(home_score, away_score):
    if home_score > away_score: return "HOME_WIN"
    if home_score < away_score: return "AWAY_WIN"
    return "DRAW"

def ewma(previous, current):
    return (ALPHA * current) + ((1.0 - ALPHA) * previous)

def create_team_state():
    return {
        "pts": 1.0, "gd": 0.0, "gf": 1.0, "ga": 1.0, "matches": 0,
        "home_pts": 1.0, "home_gd": 0.0, "home_gf": 1.0, "home_ga": 1.0, "home_matches": 0,
        "away_pts": 1.0, "away_gd": 0.0, "away_gf": 1.0, "away_ga": 1.0, "away_matches": 0
    }

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 40: EWMA FEATURE EXTRACTION")
    print("=" * 60)
    print()

    print("[1/7] Checking Step 32 source...")
    if not os.path.exists(SOURCE_FILE):
        raise FileNotFoundError(f"Step 32 dataset not found:\n{SOURCE_FILE}")

    print("\n[2/7] Loading master_with_elo.csv...")
    df = pd.read_csv(SOURCE_FILE, low_memory=False)

    # ← NEW: set EXPECTED_ROWS dynamically from the actual CSV population
    EXPECTED_ROWS = len(df)
    print(f"   ↳ Rows loaded: {EXPECTED_ROWS:,}")

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

    if (df["home_score"] < 0).any() or (df["away_score"] < 0).any():
        raise RuntimeError("Negative scores detected.")

    if not np.all(np.equal(df["home_score"], np.floor(df["home_score"]))) or \
       not np.all(np.equal(df["away_score"], np.floor(df["away_score"]))):
        raise RuntimeError("Non-integer scores detected.")

    df["target"] = df.apply(lambda row: get_target(row["home_score"], row["away_score"]), axis=1)

    for col in ["home_elo_pre", "away_elo_pre"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            raise RuntimeError(f"{col} contains invalid/missing values.")
    print("   ✅ Structural integrity verified.")

    print("\n[4/7] Preparing deterministic chronology...")
    df = df.sort_values(by=["date", "zokascore_match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[5/7] Calculating chronological EWMA features...")
    team_states = {}

    def get_state(team_id):
        if team_id not in team_states:
            team_states[team_id] = create_team_state()
        return team_states[team_id]

    features = []

    for row in df.itertuples(index=False):
        home_id = str(row.home_team_id)
        away_id = str(row.away_team_id)
        home_score = int(row.home_score)
        away_score = int(row.away_score)

        home_state = get_state(home_id)
        away_state = get_state(away_id)

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

            "home_ewma_pts": round(home_state["pts"], 4),
            "away_ewma_pts": round(away_state["pts"], 4),
            "home_ewma_gd": round(home_state["gd"], 4),
            "away_ewma_gd": round(away_state["gd"], 4),
            "home_ewma_gf": round(home_state["gf"], 4),
            "away_ewma_gf": round(away_state["gf"], 4),
            "home_ewma_ga": round(home_state["ga"], 4),
            "away_ewma_ga": round(away_state["ga"], 4),

            "home_ewma_home_pts": round(home_state["home_pts"], 4),
            "away_ewma_away_pts": round(away_state["away_pts"], 4),
            "home_ewma_home_gd": round(home_state["home_gd"], 4),
            "away_ewma_away_gd": round(away_state["away_gd"], 4),
            "home_ewma_home_gf": round(home_state["home_gf"], 4),
            "away_ewma_away_gf": round(away_state["away_gf"], 4),
            "home_ewma_home_ga": round(home_state["home_ga"], 4),
            "away_ewma_away_ga": round(away_state["away_ga"], 4),

            "home_matches_before": home_state["matches"],
            "away_matches_before": away_state["matches"],
            "home_home_matches_before": home_state["home_matches"],
            "away_away_matches_before": away_state["away_matches"],

            "target": row.target
        })

        if home_score > away_score:
            home_pts, away_pts = 3, 0
        elif home_score < away_score:
            home_pts, away_pts = 0, 3
        else:
            home_pts, away_pts = 1, 1

        home_gd = home_score - away_score
        away_gd = away_score - home_score

        home_state["pts"] = ewma(home_state["pts"], home_pts)
        home_state["gd"] = ewma(home_state["gd"], home_gd)
        home_state["gf"] = ewma(home_state["gf"], home_score)
        home_state["ga"] = ewma(home_state["ga"], away_score)
        home_state["matches"] += 1

        away_state["pts"] = ewma(away_state["pts"], away_pts)
        away_state["gd"] = ewma(away_state["gd"], away_gd)
        away_state["gf"] = ewma(away_state["gf"], away_score)
        away_state["ga"] = ewma(away_state["ga"], home_score)
        away_state["matches"] += 1

        home_state["home_pts"] = ewma(home_state["home_pts"], home_pts)
        home_state["home_gd"] = ewma(home_state["home_gd"], home_gd)
        home_state["home_gf"] = ewma(home_state["home_gf"], home_score)
        home_state["home_ga"] = ewma(home_state["home_ga"], away_score)
        home_state["home_matches"] += 1

        away_state["away_pts"] = ewma(away_state["away_pts"], away_pts)
        away_state["away_gd"] = ewma(away_state["away_gd"], away_gd)
        away_state["away_gf"] = ewma(away_state["away_gf"], away_score)
        away_state["away_ga"] = ewma(away_state["away_ga"], home_score)
        away_state["away_matches"] += 1

    print("\n[6/7] Validating generated EWMA feature dataset...")
    features_df = pd.DataFrame(features)

    if len(features_df) != EXPECTED_ROWS:
        raise RuntimeError(f"FEATURE POPULATION MISMATCH: expected {EXPECTED_ROWS:,}, got {len(features_df):,}.")

    if features_df["match_id"].isna().any() or features_df["match_id"].duplicated().any():
        raise RuntimeError("Generated match_id contains missing or duplicate values.")

    numeric_features = [c for c in features_df.columns if c not in ["match_id", "date", "home_team_id", "away_team_id", "target"]]
    for col in numeric_features:
        values = pd.to_numeric(features_df[col], errors="coerce")
        if values.isna().any() or not np.isfinite(values.to_numpy()).all():
            raise RuntimeError(f"Generated feature contains invalid/non-finite values: {col}")

    invalid_targets = set(features_df["target"].unique()) - {"HOME_WIN", "DRAW", "AWAY_WIN"}
    if invalid_targets:
        raise RuntimeError(f"Invalid output targets: {sorted(invalid_targets)}")

    print("   ✅ Population, schema, and numeric integrity verified.")

    print("\n[7/7] Writing ML feature dataset atomically...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    temp_output = OUTPUT_FILE + ".tmp"
    features_df.to_csv(temp_output, index=False)

    verification = pd.read_csv(temp_output, low_memory=False)
    if len(verification) != EXPECTED_ROWS:
        raise RuntimeError(f"Output reload validation failed: expected {EXPECTED_ROWS:,}, got {len(verification):,}.")

    os.replace(temp_output, OUTPUT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 40 COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 Source rows:             {EXPECTED_ROWS:,}")
    print(f"📊 Feature rows:            {len(features_df):,}")
    print(f"📐 EWMA alpha:              {ALPHA}")
    print(f"🧩 Feature columns:         {len(features_df.columns)}")
    print(f"📁 ML Features V3:          {OUTPUT_FILE}")
    print()
    print("🔒 Step 32 ELO dataset was NOT modified.")
    print("🔒 Features are strictly pre-match.")
    print("🔒 Current match result is applied AFTER extraction.")
    # ← FIXED: was hardcoded "484,354"
    print(f"🔒 Exact population preserved: {EXPECTED_ROWS:,}.")
    print("=" * 60)

if __name__ == "__main__":
    run()