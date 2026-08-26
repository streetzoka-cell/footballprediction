
import os
import json
import csv
import pandas as pd
import unicodedata
import re

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
HOME_ADVANTAGE = 0.0  # Set to e.g. 75.0 if you want explicit HFA, else keep 0 and let ML learn home feature
FIX_PROPOSAL_PATH = os.path.join(BASE_DIR, "data_audit","canonical_gate","fix-proposals.json")

def clean_name(value):
    val = str(value if pd.notna(value) else "")
    val = val.strip().lower()
    val = unicodedata.normalize("NFKD", val)
    val = "".join(c for c in val if not unicodedata.combining(c))
    val = val.replace("&", " and ")
    # Fixed regex: triple-quoted to avoid " termination
    val = re.sub(r"""[.'’‘`"]""", "", val)
    val = re.sub(r"[^a-z0-9]+", " ", val)
    val = re.sub(r"\s+", " ", val).strip()
    return val

def compact_name(value):
    return clean_name(value).replace(" ", "")

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
    print("[1/7] Loading canonical team identity (KEEP-FIRST + COMPACT)...")
    if not os.path.exists(TEAMS_INDEX_FILE):
        raise FileNotFoundError(f"Canonical team index not found:\n{TEAMS_INDEX_FILE}")
    with open(TEAMS_INDEX_FILE, "r", encoding="utf-8") as f:
        teams_index = json.load(f)
    name_to_ids = {}
    for team_id, profile in teams_index.items():
        name = profile.get("name")
        if not name: continue
        key = compact_name(name)
        if not key: continue
        name_to_ids.setdefault(key, []).append(team_id)
    unique_name_to_id = {}
    ambiguous = 0
    for name, ids in name_to_ids.items():
        if len(ids)==1:
            unique_name_to_id[name]=ids[0]
        else:
            ambiguous+=1
            keep=ids[0]
            unique_name_to_id[name]=keep
            print(f"[ELO-32] KEEP-FIRST: {keep} for \"{name}\" dups: {ids}")
    print(f"   ↳ Canonical teams:      {len(teams_index):,}")
    print(f"   ↳ Unique compact names: {len(unique_name_to_id):,} | Ambiguous: {ambiguous}")
    print(f"   ↳ Note: keep-first uses country/competition context upstream (00-gate). See data_audit/canonical_gate/fix-proposals.json for audit trail\n")
    return unique_name_to_id

def calculate_elo():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 32: CANONICAL ELO ENGINE")
    print(" Architecture: MASTER -> dedup -> identity -> validation -> chrono -> ELO -> ML")
    print("=" * 60 + "\n")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    name_to_id = load_team_identity()

    alias_to_keep=set()
    if os.path.exists(FIX_PROPOSAL_PATH):
        try:
            with open(FIX_PROPOSAL_PATH,'r',encoding='utf-8') as f:
                fp=json.load(f)
            for g in fp.get('duplicate_match_ids',[]):
                keep=g.get('keep')
                for _id in g.get('ids',[]):
                    if _id!=keep: alias_to_keep.add(_id)
            print(f"[ELO-32] Alias dedup: {len(fp.get('duplicate_match_ids',[]))} groups, skipping {len(alias_to_keep)} IDs\n")
        except Exception as e:
            print(f"[ELO-32] No fix-proposals: {e}")

    print("[2/7] Loading MASTER (streaming, alias dedup)...")
    matches = []
    with open(MASTER_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mid=row.get("zokascore_match_id","").strip()
            if not mid or mid in alias_to_keep: continue
            matches.append({
                "zokascore_match_id": mid,
                "date": row.get("date", ""),
                "home_team": row.get("home_team", ""),
                "away_team": row.get("away_team", ""),
                "home_score": row.get("home_score", ""),
                "away_score": row.get("away_score", ""),
                "competition": row.get("competition", "")
            })
    df = pd.DataFrame(matches)
    master_rows = len(df)
    print(f"   ↳ MASTER rows after dedup: {master_rows:,} (expected 436,441)")

    print("\n[3/7] Structural validation...")
    if df["zokascore_match_id"].duplicated().sum() > 0:
        raise RuntimeError("Duplicate Match IDs after dedup")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().sum() > 0: raise RuntimeError("Invalid dates")

    print("\n[4/7] Resolving canonical identity (compact)...")
    df["home_key"] = df["home_team"].map(compact_name)
    df["away_key"] = df["away_team"].map(compact_name)
    df["home_team_id"] = df["home_key"].map(name_to_id)
    df["away_team_id"] = df["away_key"].map(name_to_id)
    unresolved = int((df["home_team_id"].isna() | df["away_team_id"].isna()).sum())
    self_match = int((df["home_team_id"].notna() & df["away_team_id"].notna() & (df["home_team_id"]==df["away_team_id"])).sum())
    print(f"   ↳ Unresolved: {unresolved} | Self: {self_match}")

    print("\n[5/7] Score validation...")
    df["home_score_num"] = pd.to_numeric(df["home_score"], errors="coerce")
    df["away_score_num"] = pd.to_numeric(df["away_score"], errors="coerce")
    invalid = int((df["home_score_num"].isna() | df["away_score_num"].isna()).sum())
    valid_mask = ~(df["home_team_id"].isna() | df["away_team_id"].isna()) & ~(df["home_team_id"]==df["away_team_id"]) & ~(df["home_score_num"].isna() | df["away_score_num"].isna())
    valid_count = int(valid_mask.sum())
    print(f"   ↳ Invalid scores: {invalid} | Valid ELO population: {valid_count:,} (expected 436,433)")

    print("\n[6/7] Chronological ordering...")
    elo_df = df.loc[valid_mask].copy().sort_values(by=["date","zokascore_match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[7/7] Calculating ELO (pre-match features, no leakage)...")
    team_elos = {}
    home_pre_list, away_pre_list = [], []
    home_exp_list, away_exp_list = [], []
    home_delta_list, away_delta_list = [], []
    home_post_list, away_post_list = [], []
    mov_list = []
    hw, dr, aw = 0,0,0

    for row in elo_df.itertuples(index=False):
        hid, aid = row.home_team_id, row.away_team_id
        if hid not in team_elos: team_elos[hid]=BASE_ELO
        if aid not in team_elos: team_elos[aid]=BASE_ELO
        home_pre = team_elos[hid]
        away_pre = team_elos[aid]
        # Optional HOME_ADVANTAGE applied only for expected calc, not stored
        effective_home = home_pre + HOME_ADVANTAGE
        expected_home = 1.0 / (1.0 + 10.0 ** ((away_pre - effective_home) / 400.0))
        expected_away = 1.0 - expected_home

        home_score = float(row.home_score_num)
        away_score = float(row.away_score_num)
        actual_home, actual_away = result_value(home_score, away_score)
        if actual_home==1.0: hw+=1
        elif actual_home==0.5: dr+=1
        else: aw+=1

        mov = mov_multiplier(home_score, away_score)
        home_delta = K_FACTOR * mov * (actual_home - expected_home)
        away_delta = K_FACTOR * mov * (actual_away - expected_away)

        home_pre_list.append(home_pre)
        away_pre_list.append(away_pre)
        home_exp_list.append(expected_home)
        away_exp_list.append(expected_away)
        home_delta_list.append(home_delta)
        away_delta_list.append(away_delta)
        home_post_list.append(home_pre+home_delta)
        away_post_list.append(away_pre+away_delta)
        mov_list.append(mov)

        team_elos[hid] = home_pre + home_delta
        team_elos[aid] = away_pre + away_delta

    elo_df["home_elo_pre"]=home_pre_list
    elo_df["away_elo_pre"]=away_pre_list
    elo_df["home_elo_expected"]=home_exp_list
    elo_df["away_elo_expected"]=away_exp_list
    elo_df["home_elo_delta"]=home_delta_list
    elo_df["away_elo_delta"]=away_delta_list
    elo_df["home_elo_post"]=home_post_list
    elo_df["away_elo_post"]=away_post_list
    elo_df["elo_mov_multiplier"]=mov_list
    elo_df = elo_df.drop(columns=["home_key","away_key","home_score_num","away_score_num"])

    tmp = OUTPUT_FILE+".tmp"
    elo_df.to_csv(tmp, index=False)
    os.replace(tmp, OUTPUT_FILE)

    report = {"step":"32","status":"PASS","master_rows":master_rows,"elo_rows":valid_count,"params":{"base":BASE_ELO,"k":K_FACTOR,"home_adv":HOME_ADVANTAGE},"results":{"home":hw,"draw":dr,"away":aw},"teams":len(team_elos),"output":OUTPUT_FILE}
    with open(REPORT_FILE,"w",encoding="utf-8") as f: json.dump(report,f,indent=2)

    print("\n" + "="*60)
    print(" STEP 32 COMPLETE: PASS")
    print("="*60)
    print(f"MASTER: {master_rows:,} | ELO: {valid_count:,} | Teams: {len(team_elos):,}")
    print(f"Home wins: {hw:,} | Draws: {dr:,} | Away wins: {aw:,}")
    print(f"Dataset: {OUTPUT_FILE}")
    print("Pre-match ELO = no leakage ✅ | MOV aware ✅")
    print("="*60)

if __name__=="__main__":
    calculate_elo()
