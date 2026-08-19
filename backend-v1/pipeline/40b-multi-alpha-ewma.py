import os
import pandas as pd
import numpy as np

# ============================================================
# ZOKASCORE V2 — STEP 40B
# MULTI-ALPHA EWMA FEATURE EXTRACTION (extends Step 40)
# ============================================================
# Adds fast- and slow-decay EWMA tracks alongside the existing
# alpha=0.20 features from Step 40, without changing any of the
# original values or column names. Output is a strict superset
# of features_v3.csv — Step 41 keeps working unchanged if you
# just point it at features_v4.csv and add the new columns to
# its feature list.
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "ml")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "features_v4.csv")

EXPECTED_ROWS = 484354  # set to None, or update, if your population has changed

# "medium" == original Step 40 alpha. Its columns reproduce
# features_v3.csv exactly (same names, same values).
ALPHAS = {
    "fast": 0.35,    # hot-streak / recent-form-heavy
    "medium": 0.20,  # identical to original Step 40
    "slow": 0.08,    # long-memory team quality
}

REQUIRED_COLUMNS = [
    "zokascore_match_id", "date", "home_team_id", "away_team_id",
    "home_score", "away_score", "home_elo_pre", "away_elo_pre"
]

STAT_KEYS = ["pts", "gd", "gf", "ga"]


def get_target(home_score, away_score):
    if home_score > away_score:
        return "HOME_WIN"
    if home_score < away_score:
        return "AWAY_WIN"
    return "DRAW"


def col_name(prefix, alpha_label, stat, venue_suffix=None):
    """
    Reproduces Step 40's original flat names for alpha_label == "medium"
    (e.g. home_ewma_gd, home_ewma_home_gd) and adds an alpha tag for
    fast/slow (e.g. home_ewma_fast_gd, home_ewma_fast_home_gd).
    """
    parts = [prefix, "ewma"]
    if alpha_label != "medium":
        parts.append(alpha_label)
    if venue_suffix:
        parts.append(venue_suffix)
    parts.append(stat)
    return "_".join(parts)


def create_team_state():
    state = {}
    for alpha_label in ALPHAS:
        for stat in STAT_KEYS:
            init = 1.0 if stat in ("pts", "gf", "ga") else 0.0
            state[(alpha_label, "overall", stat)] = init
            state[(alpha_label, "home", stat)] = init
            state[(alpha_label, "away", stat)] = init
    state["matches"] = 0
    state["home_matches"] = 0
    state["away_matches"] = 0
    return state


def ewma_update(previous, current, alpha):
    return (alpha * current) + ((1.0 - alpha) * previous)


def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 40B: MULTI-ALPHA EWMA FEATURES")
    print("=" * 60)

    print("\n[1/7] Checking source dataset...")
    if not os.path.exists(SOURCE_FILE):
        raise FileNotFoundError(f"Source dataset not found:\n{SOURCE_FILE}")

    print("\n[2/7] Loading master_with_elo.csv...")
    df = pd.read_csv(SOURCE_FILE, low_memory=False)
    print(f"   ↳ Rows loaded: {len(df):,}")
    if EXPECTED_ROWS and len(df) != EXPECTED_ROWS:
        print(f"   ⚠️  Row count {len(df):,} differs from EXPECTED_ROWS "
              f"({EXPECTED_ROWS:,}) — continuing, confirm this is expected.")

    print("\n[3/7] Validating source dataset...")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns: {missing}")

    if df["zokascore_match_id"].isna().any() or df["zokascore_match_id"].duplicated().any():
        raise RuntimeError("Match IDs are missing or duplicated.")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any():
        raise RuntimeError("Invalid dates detected.")

    for col in ("home_score", "away_score", "home_elo_pre", "away_elo_pre"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            raise RuntimeError(f"{col} contains invalid/missing values.")

    df["target"] = df.apply(lambda r: get_target(r["home_score"], r["away_score"]), axis=1)
    print("   ✅ Structural integrity verified.")

    print("\n[4/7] Preparing deterministic chronology...")
    df = df.sort_values(by=["date", "zokascore_match_id"], kind="mergesort").reset_index(drop=True)

    print("\n[5/7] Calculating chronological multi-alpha EWMA features...")
    team_states = {}

    def get_state(team_id):
        if team_id not in team_states:
            team_states[team_id] = create_team_state()
        return team_states[team_id]

    rows_out = []

    for row in df.itertuples(index=False):
        home_id = str(row.home_team_id)
        away_id = str(row.away_team_id)
        home_score = int(row.home_score)
        away_score = int(row.away_score)

        hs = get_state(home_id)
        as_ = get_state(away_id)

        home_elo = float(row.home_elo_pre)
        away_elo = float(row.away_elo_pre)

        rec = {
            "match_id": row.zokascore_match_id,
            "date": row.date.strftime("%Y-%m-%d"),
            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_elo_pre": round(home_elo, 2),
            "away_elo_pre": round(away_elo, 2),
            "elo_diff": round(home_elo - away_elo, 2),
            "home_matches_before": hs["matches"],
            "away_matches_before": as_["matches"],
            "home_home_matches_before": hs["home_matches"],
            "away_away_matches_before": as_["away_matches"],
        }

        for alpha_label in ALPHAS:
            for stat in STAT_KEYS:
                rec[col_name("home", alpha_label, stat)] = round(hs[(alpha_label, "overall", stat)], 4)
                rec[col_name("away", alpha_label, stat)] = round(as_[(alpha_label, "overall", stat)], 4)
                rec[col_name("home", alpha_label, stat, "home")] = round(hs[(alpha_label, "home", stat)], 4)
                rec[col_name("away", alpha_label, stat, "away")] = round(as_[(alpha_label, "away", stat)], 4)

        rec["target"] = row.target
        rows_out.append(rec)

        # ---- update state AFTER feature extraction (strictly pre-match) ----
        if home_score > away_score:
            home_pts, away_pts = 3, 0
        elif home_score < away_score:
            home_pts, away_pts = 0, 3
        else:
            home_pts, away_pts = 1, 1

        home_gd, away_gd = home_score - away_score, away_score - home_score
        current_vals = {
            "pts": (home_pts, away_pts),
            "gd": (home_gd, away_gd),
            "gf": (home_score, away_score),
            "ga": (away_score, home_score),
        }

        for alpha_label, alpha in ALPHAS.items():
            for stat in STAT_KEYS:
                h_cur, a_cur = current_vals[stat]
                hs[(alpha_label, "overall", stat)] = ewma_update(hs[(alpha_label, "overall", stat)], h_cur, alpha)
                as_[(alpha_label, "overall", stat)] = ewma_update(as_[(alpha_label, "overall", stat)], a_cur, alpha)
                hs[(alpha_label, "home", stat)] = ewma_update(hs[(alpha_label, "home", stat)], h_cur, alpha)
                as_[(alpha_label, "away", stat)] = ewma_update(as_[(alpha_label, "away", stat)], a_cur, alpha)

        hs["matches"] += 1
        as_["matches"] += 1
        hs["home_matches"] += 1
        as_["away_matches"] += 1

    print("\n[6/7] Validating generated feature dataset...")
    out_df = pd.DataFrame(rows_out)
    if len(out_df) != len(df):
        raise RuntimeError(f"FEATURE POPULATION MISMATCH: expected {len(df):,}, got {len(out_df):,}.")
    if out_df["match_id"].isna().any() or out_df["match_id"].duplicated().any():
        raise RuntimeError("Generated match_id contains missing or duplicate values.")

    numeric_cols = [c for c in out_df.columns
                    if c not in ("match_id", "date", "home_team_id", "away_team_id", "target")]
    for col in numeric_cols:
        vals = pd.to_numeric(out_df[col], errors="coerce")
        if vals.isna().any() or not np.isfinite(vals.to_numpy()).all():
            raise RuntimeError(f"Generated feature contains invalid/non-finite values: {col}")
    print("   ✅ Population, schema, and numeric integrity verified.")

    print("\n[7/7] Writing ML feature dataset atomically...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    temp_output = OUTPUT_FILE + ".tmp"
    out_df.to_csv(temp_output, index=False)
    reloaded = pd.read_csv(temp_output, low_memory=False)
    if len(reloaded) != len(out_df):
        raise RuntimeError("Output reload validation failed.")
    os.replace(temp_output, OUTPUT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 40B COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 Rows:              {len(out_df):,}")
    print(f"📐 Alphas:            {ALPHAS}")
    print(f"🧩 Feature columns:   {len(out_df.columns)}")
    print(f"📁 Output:            {OUTPUT_FILE}")
    print("🔒 Features are strictly pre-match.")
    print("🔒 medium=0.20 columns are identical to original Step 40 output.")
    print("=" * 60)


if __name__ == "__main__":
    run()