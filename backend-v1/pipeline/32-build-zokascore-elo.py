import os
import json
import csv
import pandas as pd
import unicodedata
import re

# ============================================================
# ZOKASCORE V2 — STEP 32
# CANONICAL ELO ENGINE (MEMORY SAFE)
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE_DIR = os.path.join(BASE_DIR, "data", "source", "ZOKASCORE_FINAL")
INDEX_DIR = os.path.join(BASE_DIR, "data", "indexes")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "processed")

MASTER_FILE = os.path.join(SOURCE_DIR, "ZOKASCORE_PUBLIC_MASTER.csv")
TEAMS_INDEX_FILE = os.path.join(INDEX_DIR, "teams-index.json")

OUTPUT_FILE = os.path.join(OUTPUT_DIR, "master_with_elo.csv")
REPORT_FILE = os.path.join(OUTPUT_DIR, "elo_report.json")

BASE_ELO = 1500.0
K_FACTOR = 20.0

def clean_name(value):
    val = str(value if pd.notna(value) else "")
    val = val.strip().lower()
    val = unicodedata.normalize("NFKD", val)
    val = "".join(c for c in val if not unicodedata.combining(c))
    val = val.replace("&", " and ")
    val = re.sub(r"[.'’‘`\"]", "", val)
    val = re.sub(r"[^a-z0-9]+", " ", val)
    val = re.sub(r"\s+", " ", val).strip()
    return val

def mov_multiplier(home_score, away_score):
    goal_diff = abs(home_score - away_score)
    if goal_diff <= 1: return 1.0
    if goal_diff == 2: return 1.5
    return (11.0 + goal_diff) / 8.0

def result_value(home_score, away_score):
    if home_score > away_score: return 1.0, 0.0
    if home_score < away_score: return 0.0, 1.0
    return 0.5, 0.5

def load_team_identity():
    print("[1/7] Loading canonical team identity...")
    if not os.path.exists(TEAMS_INDEX_FILE):
        raise FileNotFoundError(f"Canonical team index not found:\n{TEAMS_INDEX_FILE}")

    with open(TEAMS_INDEX_FILE, "r", encoding="utf-8") as f:
        teams_index = json.load(f)

    name_to_ids = {}
    for team_id, profile in teams_index.items():
        name = profile.get("name")
        if not name: continue
        key = clean_name(name)
        name_to_ids.setdefault(key, []).append(team_id)

    unique_name_to_id = {name: ids[0] for name, ids in name_to_ids.items() if len(ids) == 1}
    print(f"   ↳ Canonical teams:      {len(teams_index):,}")
    print(f"   ↳ Unambiguous names:    {len(unique_name_to_id):,}")
    return unique_name_to_id

def calculate_elo():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 32: CANONICAL ELO ENGINE")
    print("=" * 60)
    print()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    name_to_id = load_team_identity()

    print("\n[2/7] Loading canonical MASTER (Streaming to prevent OOM)...")
    if not os.path.exists(MASTER_FILE):
        raise FileNotFoundError(f"Canonical MASTER not found:\n{MASTER_FILE}")

    # ★ MEMORY SAFE READ: Read line-by-line using csv module, then convert to DataFrame
    matches = []
    with open(MASTER_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            matches.append({
                "zokascore_match_id": row.get("zokascore_match_id", ""),
                "date": row.get("date", ""),
                "home_team": row.get("home_team", ""),
                "away_team": row.get("away_team", ""),
                "home_score": row.get("home_score", ""),
                "away_score": row.get("away_score", ""),
                "competition": row.get("competition", "")
            })
    
    df = pd.DataFrame(matches)
    master_rows = len(df)
    print(f"   ↳ MASTER rows loaded: {master_rows:,}")

    print("\n[3/7] Validating structural columns...")
    required_columns = ["zokascore_match_id", "date", "home_team", "away_team", "home_score", "away_score"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise RuntimeError(f"MASTER is missing required columns: {missing_columns}")

    if df["zokascore_match_id"].isna().sum() > 0:
        raise RuntimeError("Found missing Match IDs.")
    if df["zokascore_match_id"].duplicated().sum() > 0:
        raise RuntimeError("Found duplicate Match IDs.")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().sum() > 0:
        raise RuntimeError("Found invalid/missing dates.")

    print("\n[4/7] Resolving canonical team identities...")
    df["home_key"] = df["home_team"].map(clean_name)
    df["away_key"] = df["away_team"].map(clean_name)
    df["home_team_id"] = df["home_key"].map(name_to_id)
    df["away_team_id"] = df["away_key"].map(name_to_id)

    unresolved_mask = df["home_team_id"].isna() | df["away_team_id"].isna()
    self_match_mask = df["home_team_id"].notna() & df["away_team_id"].notna() & (df["home_team_id"] == df["away_team_id"])
    
    print(f"   ↳ Unresolved team rows: {int(unresolved_mask.sum()):,}")
    print(f"   ↳ Self-match rows:      {int(self_match_mask.sum()):,}")

    print("\n[5/7] Validating scores...")
    df["home_score_num"] = pd.to_numeric(df["home_score"], errors="coerce")
    df["away_score_num"] = pd.to_numeric(df["away_score"], errors="coerce")
    invalid_score_mask = df["home_score_num"].isna() | df["away_score_num"].isna()
    print(f"   ↳ Invalid score rows:   {int(invalid_score_mask.sum()):,}")

    valid_mask = ~unresolved_mask & ~self_match_mask & ~invalid_score_mask
    valid_count = int(valid_mask.sum())
    print(f"   ↳ Valid ELO population: {valid_count:,}")

    print("\n[6/7] Preparing chronological ELO population...")
    elo_df = df.loc[valid_mask].copy()
    elo_df = elo_df.sort_values(by=["date", "zokascore_match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[7/7] Calculating chronological ELO...")
    team_elos = {}
    home_elo_values, away_elo_values = [], []
    home_expected_values, away_expected_values = [], []
    home_delta_values, away_delta_values = [], []
    home_post_values, away_post_values = [], []
    mov_values = []
    home_wins, draws, away_wins = 0, 0, 0

    for row in elo_df.itertuples(index=False):
        home_id, away_id = row.home_team_id, row.away_team_id
        if home_id not in team_elos: team_elos[home_id] = BASE_ELO
        if away_id not in team_elos: team_elos[away_id] = BASE_ELO

        home_pre = team_elos[home_id]
        away_pre = team_elos[away_id]
        home_elo_values.append(home_pre)
        away_elo_values.append(away_pre)

        expected_home = 1.0 / (1.0 + 10.0 ** ((away_pre - home_pre) / 400.0))
        expected_away = 1.0 - expected_home
        home_expected_values.append(expected_home)
        away_expected_values.append(expected_away)

        home_score = float(row.home_score_num)
        away_score = float(row.away_score_num)
        actual_home, actual_away = result_value(home_score, away_score)

        if actual_home == 1.0: home_wins += 1
        elif actual_home == 0.5: draws += 1
        else: away_wins += 1

        mov = mov_multiplier(home_score, away_score)
        mov_values.append(mov)

        home_delta = K_FACTOR * mov * (actual_home - expected_home)
        away_delta = K_FACTOR * mov * (actual_away - expected_away)
        home_post = home_pre + home_delta
        away_post = away_pre + away_delta

        home_delta_values.append(home_delta)
        away_delta_values.append(away_delta)
        home_post_values.append(home_post)
        away_post_values.append(away_post)

        team_elos[home_id] = home_post
        team_elos[away_id] = away_post

    elo_df["home_elo_pre"] = home_elo_values
    elo_df["away_elo_pre"] = away_elo_values
    elo_df["home_elo_expected"] = home_expected_values
    elo_df["away_elo_expected"] = away_expected_values
    elo_df["home_elo_delta"] = home_delta_values
    elo_df["away_elo_delta"] = away_delta_values
    elo_df["home_elo_post"] = home_post_values
    elo_df["away_elo_post"] = away_post_values
    elo_df["elo_mov_multiplier"] = mov_values

    drop_columns = ["home_key", "away_key", "home_score_num", "away_score_num"]
    elo_df = elo_df.drop(columns=[c for c in drop_columns if c in elo_df.columns])

    print("\nWriting ML-ready ELO dataset...")
    temp_output = OUTPUT_FILE + ".tmp"
    elo_df.to_csv(temp_output, index=False)

    print("Verifying output...")
    verification = pd.read_csv(temp_output, low_memory=False)
    if len(verification) != valid_count:
        raise RuntimeError("Output validation failed.")
    
    os.replace(temp_output, OUTPUT_FILE)

    report = {
        "pipeline_step": "32", "status": "PASS", "source": "ZOKASCORE_PUBLIC_MASTER.csv",
        "master_rows": master_rows, "elo_rows": valid_count,
        "elo_parameters": {"base_elo": BASE_ELO, "k_factor": K_FACTOR},
        "results": {"home_wins": home_wins, "draws": draws, "away_wins": away_wins},
        "teams_with_elo": len(team_elos), "output": OUTPUT_FILE
    }
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 60)
    print(" STEP 32 COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 MASTER rows:          {master_rows:,}")
    print(f"📊 ELO matches:          {valid_count:,}")
    print(f"📊 Teams with ELO:       {len(team_elos):,}")
    print(f"📁 ML dataset:           {OUTPUT_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    calculate_elo()