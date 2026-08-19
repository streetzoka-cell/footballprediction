import os
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import poisson

# ============================================================
# ZOKASCORE V2 — STEP 42
# DIXON-COLES GOAL MODEL (ensemble partner for XGBoost)
# ============================================================
# Fits per-team attack/defense strength + home advantage from
# goals scored, refitting periodically (not per-match — that's
# computationally infeasible at 450k+ rows). Every match is
# still scored using only ratings fit on strictly earlier
# matches, so there is no leakage.
#
# Output: dc_p_home / dc_p_draw / dc_p_away per match_id.
# Merge onto features_v3/v4 by match_id and either:
#   (a) feed the three probabilities into XGBoost as extra
#       input features, or
#   (b) blend post-hoc: p_final = w * xgb_probs + (1-w) * dc_probs
# Draws are Dixon-Coles' strength relative to a plain classifier
# — worth comparing draw recall specifically against Step 41.
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_FILE = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "ml")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "dixon_coles_probs.csv")

REQUIRED_COLUMNS = ["zokascore_match_id", "date", "home_team_id", "away_team_id", "home_score", "away_score"]

# ---- tuning knobs -------------------------------------------------
REFIT_EVERY_N_MATCHES = 5000   # bigger = faster but staler ratings between refits
MIN_TRAIN_MATCHES = 2000       # don't fit until we have at least this much history
MAX_GOALS = 10                 # scoreline grid size for probability integration
XI = 0.0018                    # daily time-decay: recent matches weighted more
MIN_APPEARANCES_TO_FIT = 5     # teams below this get pooled into a generic prior
                                # instead of their own free parameter — matters a
                                # lot if your 450k matches span many divisions
                                # with a long tail of teams that rarely appear
# ---------------------------------------------------------------------


def dixon_coles_tau_vec(hg, ag, lam_h, lam_a, rho):
    """Vectorized low-score correlation correction (Dixon & Coles, 1997)."""
    tau = np.ones_like(lam_h)
    m00 = (hg == 0) & (ag == 0)
    m01 = (hg == 0) & (ag == 1)
    m10 = (hg == 1) & (ag == 0)
    m11 = (hg == 1) & (ag == 1)
    tau[m00] = 1 - (lam_h[m00] * lam_a[m00] * rho)
    tau[m01] = 1 + (lam_h[m01] * rho)
    tau[m10] = 1 + (lam_a[m10] * rho)
    tau[m11] = 1 - rho
    return tau


def dixon_coles_tau_scalar(hg, ag, lam_h, lam_a, rho):
    if hg == 0 and ag == 0:
        return 1 - (lam_h * lam_a * rho)
    if hg == 0 and ag == 1:
        return 1 + (lam_h * rho)
    if hg == 1 and ag == 0:
        return 1 + (lam_a * rho)
    if hg == 1 and ag == 1:
        return 1 - rho
    return 1.0


def fit_dixon_coles(train_df, teams):
    """
    Fits attack[team], defense[team], home_adv, rho by maximizing
    time-weighted Dixon-Coles log-likelihood on train_df. Recent
    matches are weighted more heavily via exponential time decay.
    Teams below MIN_APPEARANCES_TO_FIT share a pooled index so
    thin-history teams don't get an unconstrained free parameter.
    """
    appearances = pd.concat([train_df["home_team_id"], train_df["away_team_id"]]).value_counts()
    fitted_teams = sorted(appearances[appearances >= MIN_APPEARANCES_TO_FIT].index.tolist())
    team_idx = {t: i for i, t in enumerate(fitted_teams)}
    pooled_idx = len(fitted_teams)  # one extra "generic team" slot
    n_params_teams = len(fitted_teams) + 1

    def idx_of(team_id):
        return team_idx.get(team_id, pooled_idx)

    max_date = train_df["date"].max()
    days_ago = (max_date - train_df["date"]).dt.days.values
    weights = np.exp(-XI * days_ago)

    home_idx = train_df["home_team_id"].map(idx_of).values
    away_idx = train_df["away_team_id"].map(idx_of).values
    hg = train_df["home_score"].values.astype(float)
    ag = train_df["away_score"].values.astype(float)
    log_fact_h = gammaln(hg + 1)
    log_fact_a = gammaln(ag + 1)

    def unpack(params):
        attack = params[:n_params_teams]
        defense = params[n_params_teams:2 * n_params_teams]
        home_adv = params[2 * n_params_teams]
        rho = params[2 * n_params_teams + 1]
        return attack, defense, home_adv, rho

    def neg_log_likelihood(params):
        attack, defense, home_adv, rho = unpack(params)
        lam_h = np.clip(np.exp(attack[home_idx] + defense[away_idx] + home_adv), 1e-6, 15)
        lam_a = np.clip(np.exp(attack[away_idx] + defense[home_idx]), 1e-6, 15)

        log_pmf_h = hg * np.log(lam_h) - lam_h - log_fact_h
        log_pmf_a = ag * np.log(lam_a) - lam_a - log_fact_a
        tau = dixon_coles_tau_vec(hg, ag, lam_h, lam_a, rho)
        tau = np.clip(tau, 1e-10, None)

        log_lik = log_pmf_h + log_pmf_a + np.log(tau)
        return -np.sum(weights * log_lik)

    x0 = np.concatenate([np.zeros(n_params_teams), np.zeros(n_params_teams), [0.25], [0.0]])
    bounds = [(-3, 3)] * n_params_teams + [(-3, 3)] * n_params_teams + [(-1, 1), (-0.3, 0.3)]

    result = minimize(neg_log_likelihood, x0, method="L-BFGS-B", bounds=bounds,
                       options={"maxiter": 150})

    attack, defense, home_adv, rho = unpack(result.x)
    attack = attack - attack[:len(fitted_teams)].mean()
    defense = defense - defense[:len(fitted_teams)].mean()

    ratings = {t: (attack[team_idx[t]], defense[team_idx[t]]) for t in fitted_teams}
    pooled_rating = (attack[pooled_idx], defense[pooled_idx])
    return ratings, pooled_rating, home_adv, rho


def match_probs(lam_h, lam_a, rho, max_goals=MAX_GOALS):
    """Home/draw/away probabilities from a Dixon-Coles scoreline grid."""
    hg_range = np.arange(0, max_goals + 1)
    ag_range = np.arange(0, max_goals + 1)
    ph = poisson.pmf(hg_range, lam_h)
    pa = poisson.pmf(ag_range, lam_a)
    grid = np.outer(ph, pa)

    for h in (0, 1):
        for a in (0, 1):
            grid[h, a] *= dixon_coles_tau_scalar(h, a, lam_h, lam_a, rho)
    grid = grid / grid.sum()  # renormalize after the tau adjustment

    p_home = np.tril(grid, -1).sum()
    p_draw = np.trace(grid)
    p_away = np.triu(grid, 1).sum()
    return p_home, p_draw, p_away


def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 42: DIXON-COLES GOAL MODEL")
    print("=" * 60)

    print("\n[1/6] Loading source data...")
    df = pd.read_csv(SOURCE_FILE, low_memory=False)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns: {missing}")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.sort_values(by=["date", "zokascore_match_id"], kind="mergesort").reset_index(drop=True)
    print(f"   ↳ Rows loaded: {len(df):,}")

    print("\n[2/6] Preparing rolling refit schedule...")
    print(f"   ↳ Refitting every {REFIT_EVERY_N_MATCHES:,} matches, "
          f"starting after {MIN_TRAIN_MATCHES:,}")

    print("\n[3/6] Rolling fit + chronological scoring...")
    results = []
    current_ratings, pooled_rating, current_home_adv, current_rho = None, None, 0.25, 0.0
    next_refit_at = MIN_TRAIN_MATCHES

    for i, row in enumerate(df.itertuples(index=False)):
        if i >= next_refit_at:
            train_slice = df.iloc[:i]
            teams = pd.unique(pd.concat([train_slice["home_team_id"], train_slice["away_team_id"]]))
            print(f"   ↳ Refitting at match {i:,} ({len(teams)} teams seen)...")
            current_ratings, pooled_rating, current_home_adv, current_rho = fit_dixon_coles(train_slice, teams)
            next_refit_at += REFIT_EVERY_N_MATCHES

        if current_ratings is None:
            results.append({"match_id": row.zokascore_match_id, "dc_p_home": np.nan,
                             "dc_p_draw": np.nan, "dc_p_away": np.nan})
            continue

        att_h, def_h = current_ratings.get(row.home_team_id, pooled_rating)
        att_a, def_a = current_ratings.get(row.away_team_id, pooled_rating)
        lam_h = float(np.clip(np.exp(att_h + def_a + current_home_adv), 1e-6, 15))
        lam_a = float(np.clip(np.exp(att_a + def_h), 1e-6, 15))
        p_home, p_draw, p_away = match_probs(lam_h, lam_a, current_rho)

        results.append({"match_id": row.zokascore_match_id, "dc_p_home": p_home,
                         "dc_p_draw": p_draw, "dc_p_away": p_away})

    print("\n[4/6] Assembling output...")
    out_df = pd.DataFrame(results)
    coverage = out_df["dc_p_home"].notna().mean()
    print(f"   ↳ Coverage: {coverage:.1%} of matches scored "
          f"(remainder are pre-history, before the first refit)")

    print("\n[5/6] Validating output...")
    scored = out_df.dropna()
    prob_sums = scored[["dc_p_home", "dc_p_draw", "dc_p_away"]].sum(axis=1)
    if not np.allclose(prob_sums, 1.0, atol=1e-6):
        raise RuntimeError("Dixon-Coles probabilities do not sum to 1 for all scored matches.")
    print("   ✅ Probabilities validated (sum to 1.0 for every scored match).")

    print("\n[6/6] Writing output atomically...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    temp_output = OUTPUT_FILE + ".tmp"
    out_df.to_csv(temp_output, index=False)
    os.replace(temp_output, OUTPUT_FILE)

    print("\n" + "=" * 60)
    print(" STEP 42 COMPLETE: PASS")
    print("=" * 60)
    print(f"📊 Matches scored:     {scored.shape[0]:,} / {len(out_df):,}")
    print(f"📁 Output:             {OUTPUT_FILE}")
    print("🔒 Every rating used to score a match was fit strictly on earlier matches.")
    print("=" * 60)
    print("\nNext: merge dc_p_home/dc_p_draw/dc_p_away onto features_v3/v4 by match_id,")
    print("then either feed them into XGBoost as extra input features, or blend")
    print("probabilities post-hoc against Step 41's output and compare draw recall.")


if __name__ == "__main__":
    run()