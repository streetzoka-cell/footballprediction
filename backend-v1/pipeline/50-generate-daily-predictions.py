"""
ZOKASCORE V2 — STEP 50 PRODUCTION FINAL V3.2
Master Picker + Generate + Finalize (single step, live-aware, rollover-safe)
========================================================================================
MODES (per match, from fixture status):
  prematch (NS)  -> 34-feature ML models (Step 49 V4 contract, unchanged)
  live    (1H/2H/HT/ET/..) -> gamma-poisson conditional on CURRENT score +
             derived minute; ML supplies the pre-match xG prior ONLY. Model
             features are NEVER extended with live state (no corruption).
  final   (FT/..) -> NO prediction; stale ones stripped.

CORRECT SCORE (V3.2):
  · Grid widened to N_GOALS=8 (0-7 per side) — headroom for goal-heavy tilts.
  · Prematch CS calibrated by IPF to the model's OWN 1x2 + Over-2.5
    probabilities: a lopsided 1x2 or strong OVER signal moves CS mass off the
    1-0/0-0 family automatically. No fake "1-0 everywhere".
  · Live CS is the conditional grid from the current score (3-1 live -> grid
    starts at 3-1).

V3 FIXES RETAINED:
  1. WINDOW includes yesterday (UTC rollover safety).
  2. MINUTE derived from kickoff timestamp (provider minute=0 mid-match is
     garbage): 1H->min(elapsed,45) · HT->45 · 2H->clamp(elapsed-15,45,90).
  3. THRESHOLD PICKS gated (THRESH_MIN_GAIN pp over default).
  4. SANITY VALIDATOR: live CS keys can never sit below the current score;
     violations logged (⚠ LIVE SANITY FAILURE) and dropped.

RESOLVER (V3.1 full expansion):
  raw pid -> by_provider_id + teams[].provider_ids + provider_club_id ->
  teams-index names (accent-folded + parens-stripped) -> by_source_name
  aliases -> state-key norm -> md5 hash estimate (flagged 'estimated').

RE-RUN SAFE: STRIP -> PREDICT -> MERGE · atomic writes · audit trail.
Serve-time invariant enforced by services/livePredictionSync.js (API layer):
  prediction.live_state == current fixture state at every read.
"""
import os, re, glob, json, math, sys, time, joblib, tempfile, logging, hashlib, unicodedata
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np

# ================= paths =================
BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR      = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR     = os.path.join(BASE_DIR, "data", "processed")
FIXTURES_DIR    = os.path.join(BASE_DIR, "public_data", "fixtures")
PREDICTIONS_DIR = os.path.join(BASE_DIR, "public_data", "predictions")
ZOKAPICKS_DIR   = os.path.join(BASE_DIR, "public_data", "zokapicks")
PUBLIC_DATA     = os.path.join(BASE_DIR, "public_data")
MASTER_FILE     = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
LIVE_STATE_FILE = os.path.join(MODELS_DIR, "live_team_state.json")
PROVIDER_MAP_FILE = os.path.join(BASE_DIR, "data", "zokascore_football_data",
                                  "canonical_sources", "internal_team_map.json")
TEAMS_INDEX_FILES = [
    os.path.join(PUBLIC_DATA, "knowledge", "football", "indexes", "teams-index.json"),
    os.path.join(BASE_DIR, "data", "indexes", "teams-index.json"),
]

# ================= config =================
DAYS_AHEAD      = 3
WINDOW_START    = -1              # include yesterday (UTC rollover safety)
STRICT_XG_FLIP  = False
CS_ML_WEIGHT, CS_POIS_WEIGHT = 0.7, 0.3
LIVE_PRIOR_S    = 3.0             # gamma-prior pseudo-match strength
THRESH_MIN_GAIN = 0.5             # pp — tuned threshold must beat default by this
N_GOALS         = 8               # CS grid 0..7 per side (V3.2 widened)
IPF_ITERS       = 40
DATE_RE         = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INJECTED_KEYS   = ("prediction", "mlPredictions", "mlPrediction", "_tmp_markets")

LIVE_STATUSES     = {"1H", "2H", "HT", "ET", "BT", "P", "LIVE", "IN_PLAY", "PAUSED"}
FINISHED_STATUSES = {"FT", "FIN", "FINISHED", "AET", "AP", "PEN", "AWARDED", "ABAN", "SUSP"}

MODELS_CFG = {
    "1x2":        {"file": "champion_model.joblib",          "mapfile": "champion_label_mapping.json",      "fallback_map": {0:"AWAY_WIN",1:"DRAW",2:"HOME_WIN"}, "positive": None},
    "btts":       {"file": "market_btts_model.joblib",       "mapfile": "market_btts_label_mapping.json",   "fallback_map": {0:"NO",1:"YES"},     "positive": "YES"},
    "ou_0_5":     {"file": "market_ou_0_5_model.joblib",     "mapfile": "market_ou_0_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "ou_1_5":     {"file": "market_ou_1_5_model.joblib",     "mapfile": "market_ou_1_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "ou_2_5":     {"file": "market_ou_2_5_model.joblib",     "mapfile": "market_ou_2_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "ou_3_5":     {"file": "market_ou_3_5_model.joblib",     "mapfile": "market_ou_3_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "home_goals": {"file": "market_home_goals_model.joblib", "mapfile": None, "fallback_map": None, "positive": None},
    "away_goals": {"file": "market_away_goals_model.joblib", "mapfile": None, "fallback_map": None, "positive": None},
}
MARKET_KEYS = ["btts", "ou_0_5", "ou_1_5", "ou_2_5", "ou_3_5"]

# ---- EXACT Step 49 V4 contract (matches champion_manifest.json byte-list) ----
BASE_FEATURES = ["home_elo_pre","away_elo_pre","elo_diff",
    "home_ewma_pts","away_ewma_pts","home_ewma_gd","away_ewma_gd",
    "home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga",
    "home_ewma_home_pts","away_ewma_away_pts",
    "home_ewma_home_gd","away_ewma_away_gd",
    "home_ewma_home_gf","away_ewma_away_gf",
    "home_ewma_home_ga","away_ewma_away_ga"]
ENGINEERED_FEATURES = ["exp_home_xg","exp_away_xg","exp_total_xg","exp_diff_xg",
    "home_attack_vs_away_def","away_attack_vs_home_def","home_form_adv",
    "high_scoring_expected","low_scoring_expected","btts_expected",
    "elo_diff_sq","elo_diff_abs","total_gd_form","home_home_adv","away_away_adv"]
FEATURE_ORDER = BASE_FEATURES + ENGINEERED_FEATURES

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("step50_final")

# ================= io helpers =================
def atomic_write_json(data, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".json", dir=os.path.dirname(path)); os.close(fd)
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except OSError: pass

def convert_floats(o):
    if isinstance(o, dict):  return {k: convert_floats(v) for k, v in o.items()}
    if isinstance(o, list):  return [convert_floats(v) for v in o]
    if isinstance(o, (np.floating, np.integer)): return float(o)
    if hasattr(o, "item"):
        try: return o.item()
        except Exception: return o
    return o

def _num(v, default):
    try:
        f = float(v)
        return f if pd.notna(f) else default
    except (TypeError, ValueError):
        return default

def _norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s)

def _pct(v):
    if not isinstance(v, (int, float)): return None
    return v * 100 if abs(v) <= 1 else float(v)

def load_label_map(key):
    cfg = MODELS_CFG[key]
    if cfg["mapfile"]:
        p = os.path.join(MODELS_DIR, cfg["mapfile"])
        if os.path.exists(p):
            try: return {int(k): v for k, v in json.load(open(p, encoding="utf-8")).items()}
            except Exception as e: log.warning(f"label map {key}: {e}")
    return cfg["fallback_map"] or {}

def load_threshold(key):
    """(threshold, apply). Applied only when tuned beat default by >= THRESH_MIN_GAIN
    pp — degenerate 'always-OVER' thresholds (0.15) have no real edge and would
    expose picks like 'OVER 41.6%'."""
    try:
        meta = json.load(open(os.path.join(MODELS_DIR, f"market_{key}_metadata.json"), encoding="utf-8"))
        th = float(np.clip(float(meta.get("best_threshold", meta.get("threshold", 0.5))), 0.15, 0.85))
        acc_t, acc_d = _pct(meta.get("accuracy_tuned")), _pct(meta.get("accuracy_default"))
        apply = bool(acc_t is not None and acc_d is not None
                     and (acc_t - acc_d) >= THRESH_MIN_GAIN and abs(th - 0.5) > 0.02)
        return th, apply
    except Exception:
        return 0.5, False

def poisson_prob(k, lam):
    lam = float(np.clip(lam, 0.05, 3.0))
    return math.exp(-lam) * (lam ** k) / math.factorial(k)

# ================= MASTER PICKER =================
def select_champion():
    def _report_acc(r):
        return _pct(r.get("accuracy")) or _pct(r.get("accuracy_percent"))
    candidates, table = [], []
    scan = (glob.glob(os.path.join(MODELS_DIR, "*metadata*.json"))
            + glob.glob(os.path.join(REPORTS_DIR, "*report*.json")))
    for fp in sorted(set(scan)):
        try: r = json.load(open(fp, encoding="utf-8"))
        except Exception: continue
        acc = _report_acc(r)
        if acc is None: continue
        feats = r.get("features") or []
        base = _pct(r.get("baseline"))
        imp = round(acc - base, 2) if base is not None else None
        contract_ok = bool(feats) and all(f in FEATURE_ORDER for f in feats)
        row = {"file": os.path.basename(fp), "accuracy": round(acc, 2),
               "baseline": base, "improvement": imp,
               "features": len(feats), "contract_ok": contract_ok}
        table.append(row)
        if contract_ok: candidates.append(row)
    table.sort(key=lambda x: x["improvement"] if x["improvement"] is not None else -999, reverse=True)

    champ_file = os.path.join(MODELS_DIR, "champion_model.joblib")
    champ_meta = next((r for r in candidates if "champion" in r["file"]), None)
    if not os.path.exists(champ_file):
        decision, reason = "HEURISTIC", "no champion_model.joblib on disk"
    elif champ_meta and champ_meta["improvement"] is not None and champ_meta["improvement"] <= 0:
        decision, reason = "HEURISTIC", f"champion report shows no edge: {champ_meta}"
    elif champ_meta:
        decision, reason = "MODEL", f"champion wins: {champ_meta}"
    else:
        decision, reason = "MODEL", "champion exists, no parseable report — serving with audit warning"

    log.info("=" * 70); log.info(" MASTER PICKER — TRAINER COMPARISON"); log.info("=" * 70)
    for t in table[:8]:
        log.info(f"   {t['file'][:44]:44s} acc {t['accuracy']:6.2f}%  "
                 f"delta {('%+.2f' % t['improvement']) if t['improvement'] is not None else '  n/a':>7s}  "
                 f"feats {t['features']:2d}  {'✅ contract' if t['contract_ok'] else '⛔ legacy-contract'}")
    log.info(f"   👉 DECISION: {decision}  ({reason})")
    atomic_write_json({"decided_at": datetime.now(timezone.utc).isoformat(),
                       "decision": decision, "reason": reason,
                       "contract": f"{len(FEATURE_ORDER)}_features",
                       "comparison_table": table},
                      os.path.join(MODELS_DIR, "selection_decision.json"))
    return decision

# ================= feature builder — EXACT Step 49 parity =================
def build_feature_row(h, a, h_elo, a_elo):
    gfc = lambda v: float(np.clip(_num(v, 1.2), 0.3, 2.5))
    f0  = lambda v: _num(v, 0.0)
    row = {
        "home_elo_pre": f0(h_elo), "away_elo_pre": f0(a_elo),
        "elo_diff": float(np.clip(f0(h_elo) - f0(a_elo), -400, 400)),
        "home_ewma_pts": f0(h.get("ewma_points")),           "away_ewma_pts": f0(a.get("ewma_points")),
        "home_ewma_gd": f0(h.get("ewma_gd")),                "away_ewma_gd": f0(a.get("ewma_gd")),
        "home_ewma_gf": gfc(h.get("ewma_gf")),               "away_ewma_gf": gfc(a.get("ewma_gf")),
        "home_ewma_ga": gfc(h.get("ewma_ga")),               "away_ewma_ga": gfc(a.get("ewma_ga")),
        "home_ewma_home_pts": f0(h.get("ewma_home_points")), "away_ewma_away_pts": f0(a.get("ewma_away_points")),
        "home_ewma_home_gd": f0(h.get("ewma_home_gd")),      "away_ewma_away_gd": f0(a.get("ewma_away_gd")),
        "home_ewma_home_gf": gfc(h.get("ewma_home_gf")),     "away_ewma_away_gf": gfc(a.get("ewma_away_gf")),
        "home_ewma_home_ga": gfc(h.get("ewma_home_ga")),     "away_ewma_away_ga": gfc(a.get("ewma_away_ga")),
    }
    d = row["elo_diff"]
    xg_h = float(np.clip(1.22 + d*0.0011 + (row["home_ewma_gf"]-1.2)*0.32 + (1.2-row["away_ewma_ga"])*0.14, 0.35, 2.3))
    xg_a = float(np.clip(1.02 - d*0.0011 + (row["away_ewma_gf"]-1.2)*0.32 + (1.2-row["home_ewma_ga"])*0.14, 0.25, 1.9))
    tot  = float(np.clip(xg_h + xg_a, 0.6, 4.0))
    dif  = float(np.clip(xg_h - xg_a, -1.8, 1.8))
    row.update({
        "exp_home_xg": xg_h, "exp_away_xg": xg_a, "exp_total_xg": tot, "exp_diff_xg": dif,
        "home_attack_vs_away_def": float(np.clip(row["home_ewma_gf"]-row["away_ewma_ga"], -1.4, 1.4)),
        "away_attack_vs_home_def": float(np.clip(row["away_ewma_gf"]-row["home_ewma_ga"], -1.4, 1.4)),
        "home_form_adv": float(np.clip(row["home_ewma_pts"]-row["away_ewma_pts"], -7, 7)),
        "high_scoring_expected": int(tot > 2.65), "low_scoring_expected": int(tot < 1.85),
        "btts_expected": int(xg_h > 0.82 and xg_a > 0.72),
        "elo_diff_sq": float(min(d*d/10000.0, 16.0)), "elo_diff_abs": float(min(abs(d), 400.0)),
        "total_gd_form": float(np.clip(row["home_ewma_gd"]-row["away_ewma_gd"], -3.5, 3.5)),
        "home_home_adv": float(np.clip(row["home_ewma_home_pts"]-7.0, -4, 4)),
        "away_away_adv": float(np.clip(row["away_ewma_away_pts"]-7.0, -4, 4)),
    })
    return row

# ================= TEAM RESOLVER — V3.1 FULL EXPANSION =================
def build_resolver(live_state):
    pid_map, alias_index = {}, {}
    try:
        raw_map = json.load(open(PROVIDER_MAP_FILE, encoding="utf-8"))
        pid_map = dict(raw_map.get("by_provider_id") or raw_map.get("by_provider_club_id") or {})
        teams_dict = raw_map.get("teams") or {}
        for zk_id, info in teams_dict.items():
            if not isinstance(info, dict): continue
            pcid = info.get("provider_club_id")
            if pcid: pid_map[str(pcid)] = zk_id
            pids = info.get("provider_ids") or []
            if isinstance(pids, dict): pids = list(pids.values())
            for pid in pids:
                if pid: pid_map[str(pid)] = zk_id
            for sn in info.get("source_names") or []:
                if sn: alias_index[_norm(str(sn))] = zk_id
        log.info(f"provider map: {len(pid_map)} ids (by_provider_id + {len(teams_dict)} teams)")
        for src_name, zk in (raw_map.get("by_source_name") or {}).items():
            if isinstance(zk, str) and zk.startswith("ZK_TEAM_"):
                n = _norm(src_name)
                if n: alias_index[n] = zk
        log.info(f"source-name aliases: {len(alias_index)}")
    except Exception as e:
        log.warning(f"provider map unavailable ({e})")

    name_index = {}
    for idx_path in TEAMS_INDEX_FILES:
        if os.path.exists(idx_path):
            try:
                idx = json.load(open(idx_path, encoding="utf-8"))
                for zk_id, profile in idx.items():
                    n = profile.get("name") if isinstance(profile, dict) else None
                    if n:
                        name_index[_norm(n)] = zk_id
                        name_index[_norm(re.sub(r"\([^)]*\)", "", n))] = zk_id
                log.info(f"teams index: {len(name_index)} name keys")
                break
            except Exception as e:
                log.warning(f"teams index {idx_path}: {e}")

    state_norm = {_norm(k): v for k, v in live_state.items()}

    def _pid_to_zk(p):
        hit = pid_map.get(p)
        if hit is None: return None
        if isinstance(hit, str): return hit
        if isinstance(hit, dict):
            return hit.get("zkId") or hit.get("id") or hit.get("canonical_id") or hit.get("ZK_TEAM_ID")
        return None

    def resolve(pid, name, is_home):
        p = str(pid or "").strip()
        if p and p in live_state:
            return live_state[p], True
        zk = _pid_to_zk(p)
        if zk and zk in live_state:
            return live_state[zk], True
        n = _norm(name)
        nb = _norm(re.sub(r"\([^)]*\)", "", str(name or "")))
        for key in (n, nb):
            zk = name_index.get(key)
            if zk and zk in live_state:
                return live_state[zk], True
        for key in (n, nb):
            zk = alias_index.get(key)
            if zk and zk in live_state:
                return live_state[zk], True
        for key in (n, nb):
            if key and key in state_norm:
                return state_norm[key], True
        return fallback_state_from_hash(p, name, is_home), False

    def counters():
        return {"live": 0, "hash": 0}

    return resolve, counters

# ================= state + fallbacks =================
def fallback_state_from_hash(pid, name, is_home):
    s = hashlib.md5((pid or name or ("home" if is_home else "away")).encode()).hexdigest()
    return {"elo": 1500+(int(s[:4],16)%200-100), "ewma_points": 6.0+(int(s[4:8],16)%40)/10.0,
            "ewma_gd": (int(s[8:12],16)%60-30)/20.0, "ewma_gf": 1.0+(int(s[12:16],16)%80)/100.0,
            "ewma_ga": 1.0+(int(s[16:20],16)%80)/100.0,
            "ewma_home_points": 7.0, "ewma_away_points": 6.5, "ewma_home_gd": 0.0, "ewma_away_gd": 0.0,
            "ewma_home_gf": 1.15, "ewma_away_gf": 1.1, "ewma_home_ga": 1.1, "ewma_away_ga": 1.15}

def load_live_state():
    state = {}
    if os.path.exists(LIVE_STATE_FILE):
        try:
            state = json.load(open(LIVE_STATE_FILE, encoding="utf-8"))
            log.info(f"live_team_state.json: {len(state)} teams (ZK keys)")
            return state
        except Exception as e: log.warning(f"live state fail {e}")
    log.info("Fallback: master_with_elo tail...")
    if os.path.exists(MASTER_FILE):
        try:
            df = pd.read_csv(MASTER_FILE, low_memory=False).sort_values("date")
            for _, r in df.tail(30000).iterrows():
                for side in ("home","away"):
                    tid = str(r.get(f"{side}_team_id","")).strip()
                    if not tid or tid == "nan" or tid in state: continue
                    state[tid] = {"elo": _num(r.get(f"{side}_elo_pre"),1500),
                        "ewma_points": _num(r.get(f"{side}_ewma_pts"),7), "ewma_gd": _num(r.get(f"{side}_ewma_gd"),0),
                        "ewma_gf": float(np.clip(_num(r.get(f"{side}_ewma_gf"),1.2),0.4,2.4)),
                        "ewma_ga": float(np.clip(_num(r.get(f"{side}_ewma_ga"),1.2),0.4,2.4)),
                        "ewma_home_points": _num(r.get(f"{side}_ewma_home_pts"),7),
                        "ewma_away_points": _num(r.get(f"{side}_ewma_away_pts"),7),
                        "ewma_home_gf": float(np.clip(_num(r.get(f"{side}_ewma_home_gf"),1.2),0.4,2.4)),
                        "ewma_away_gf": float(np.clip(_num(r.get(f"{side}_ewma_away_gf"),1.2),0.4,2.4)),
                        "ewma_home_ga": float(np.clip(_num(r.get(f"{side}_ewma_home_ga"),1.2),0.4,2.4)),
                        "ewma_away_ga": float(np.clip(_num(r.get(f"{side}_ewma_away_ga"),1.2),0.4,2.4)),
                        "ewma_home_gd": 0.0, "ewma_away_gd": 0.0}
        except Exception as e: log.warning(f"master fallback fail {e}")
    log.info(f"Fallback state: {len(state)} teams")
    return state

# ================= pickers / fallbacks =================
def elo_heuristic_1x2(h_elo, a_elo, xg_h, xg_a):
    diff = (h_elo - a_elo) + (xg_h - xg_a) * 120.0
    p_home = 1.0/(1.0+math.exp(-diff/180.0)); p_away = (1.0-p_home)*0.65
    p_draw = max(0.18, min(0.34, 1.0-p_home-p_away))
    rem, den = 1.0-p_draw, p_home+p_away
    p_home = rem*(p_home/den if den > 0 else 0.6); p_away = rem-p_home
    pick = "HOME_WIN" if p_home > p_away and p_home > p_draw else ("AWAY_WIN" if p_away > p_draw else "DRAW")
    pm = {"HOME_WIN": round(p_home*100,2), "DRAW": round(p_draw*100,2), "AWAY_WIN": round(p_away*100,2)}
    return {"probabilities": pm, "pick": pick, "pick_probability": pm[pick], "engine": "elo_heuristic"}

def xg_directional_1x2(xg_h, xg_a):
    d = xg_h - xg_a
    pick = "HOME_WIN" if d > 0.25 else ("AWAY_WIN" if d < -0.25 else "DRAW")
    conf = round(float(np.clip(45.0+abs(d)*20.0, 40.0, 70.0)), 2)
    half = round((100-conf)/2, 2)
    pm = {"HOME_WIN": half, "DRAW": half, "AWAY_WIN": half}; pm[pick] = conf
    return {"probabilities": pm, "pick": pick, "pick_probability": conf, "engine": "xg_directional_degraded"}

def predict_binary(m, label_map, positive, X, thresh, apply_thresh):
    """Pick = threshold-based ONLY when validation proved its gain; else argmax.
    Never exposes a pick whose probability < 50%."""
    proba = m.predict_proba(X)[0]
    labels = [label_map.get(int(c), str(c)) for c in m.classes_]
    pmap = {lb: round(float(p)*100, 2) for lb, p in zip(labels, proba)}
    if positive and positive in labels:
        pi = labels.index(positive); p_pos = float(proba[pi])
        neg = next((lb for lb in labels if lb != positive), positive)
        cutoff = thresh if apply_thresh else 0.5
        pick = positive if p_pos >= cutoff else neg
        return {"probabilities": pmap, "pick": pick, "pick_probability": pmap[pick],
                "threshold": round(thresh, 2), "threshold_applied": bool(apply_thresh)}
    b = int(np.argmax(proba))
    return {"probabilities": pmap, "pick": labels[b], "pick_probability": pmap[labels[b]]}

def audit_consistency(markets):
    warns = []
    if markets.get("mode") != "prematch":
        return warns
    try: xg = float(markets.get("xG", {}).get("total", 2.5))
    except Exception: xg = 2.5
    ou = markets.get("ou_2_5")
    if isinstance(ou, dict) and ou.get("pick"):
        if (xg > 3.2 and ou["pick"] == "UNDER") or (xg < 1.7 and ou["pick"] == "OVER"):
            warns.append(f"xG {xg:.2f} vs OU2.5 {ou['pick']}")
            if STRICT_XG_FLIP:
                other = "OVER" if ou["pick"] == "UNDER" else "UNDER"
                if other in ou.get("probabilities", {}):
                    ou["pick"], ou["pick_probability"] = other, ou["probabilities"][other]
    return warns

def expand_proba(proba, classes, n=N_GOALS):
    out = np.zeros((proba.shape[0], n))
    for i, c in enumerate(classes):
        c = int(c)
        if 0 <= c < n: out[:, c] = proba[:, i]
    return out

# ================= CS CALIBRATION (V3.2: IPF to model's own 1x2 + OU2.5) =================
def pois_matrix(r, n=None):
    n = n or N_GOALS
    return np.array([[poisson_prob(h_, r["exp_home_xg"]) * poisson_prob(a_, r["exp_away_xg"])
                      for a_ in range(n)] for h_ in range(n)])

def ipf_calibrate(grid, p13=None, p_over25=None, iters=IPF_ITERS):
    """Tilt a correct-score grid (fractions, N x N) so its marginals match the
    model's OWN 1x2 and Over-2.5 probabilities — iterative proportional fitting.
    p13: {'HOME_WIN':f,'DRAW':f,'AWAY_WIN':f} (fractions) · p_over25: fraction/None.
    Amplification capped so we tilt, never hallucinate."""
    g = np.array(grid, dtype=float)
    if g.sum() <= 0: return g
    g /= g.sum()
    idx = np.indices(g.shape)
    home_m, draw_m, away_m = idx[0] > idx[1], idx[0] == idx[1], idx[0] < idx[1]
    over_m = (idx[0] + idx[1]) >= 3
    groups = []
    if p13:
        groups = [(home_m, p13.get("HOME_WIN")), (draw_m, p13.get("DRAW")), (away_m, p13.get("AWAY_WIN"))]
    for _ in range(iters):
        for mask, tgt in groups:
            if tgt is None: continue
            cur = g[mask].sum()
            if cur > 1e-6:
                g[mask] *= min(tgt / cur, 8.0)
            g /= (g.sum() or 1.0)
        if p_over25 is not None:
            cur = g[over_m].sum()
            if cur > 1e-6:
                g[over_m] *= min(p_over25 / cur, 8.0)
            g /= (g.sum() or 1.0)
    return g

# ================= LIVE LAYER =================
def derive_minute(item, now_ts):
    """Provider minute unreliable (0 mid-match). Derive from kickoff timestamp
    with halftime adjustment; provider minute used only when sane."""
    disp = item.get("display") or {}
    status = str(item.get("status") or disp.get("status") or "").upper()
    m = _num(item.get("minute") or disp.get("minute"), 0)
    ko = _num(item.get("timestamp"), 0)
    elapsed = max(0.0, (now_ts - ko) / 60.0) if ko > 0 else 0.0
    if status == "1H":
        T = min(elapsed, 45.0)
    elif status == "HT":
        T = 45.0
    elif status == "2H":
        T = min(max(elapsed - 15.0, 45.0), 90.0)
    elif status in ("ET", "BT", "P"):
        T = 90.0
    elif status in LIVE_STATUSES:
        T = min(elapsed, 90.0)
    else:
        T = m if m > 0 else min(elapsed, 90.0)
    if m > 0:
        if status == "1H": T = min(m, 45.0)
        elif status == "2H": T = min(max(m, 45.0), 90.0)
    return max(0.0, T)

def build_live_markets(xg_h, xg_a, H0, A0, minute, team_state_label):
    """Gamma-poisson conditional final-outcome distribution given (score, minute).
    Prior = pre-match xG; shrinkage toward observed scoring via conjugacy.
    Grid N_GOALS wide — final scores start AT the current score by construction."""
    T  = max(0.0, min(float(minute), 90.0))
    R  = max(0.0, 90.0 - T)
    t90 = T / 90.0
    S  = LIVE_PRIOR_S
    th_h = (xg_h * S + H0) / (S + t90)
    th_a = (xg_a * S + A0) / (S + t90)
    lam_h = th_h * (R / 90.0)
    lam_a = th_a * (R / 90.0)

    N = N_GOALS
    finals, p_home, p_draw, p_away, over_r = {}, 0.0, 0.0, 0.0, [0.0]*(2*N)
    for hp in range(N):
        php = poisson_prob(hp, lam_h)
        for ap in range(N):
            p = php * poisson_prob(ap, lam_a)
            Hf, Af = H0 + hp, A0 + ap
            finals[f"{Hf}-{Af}"] = finals.get(f"{Hf}-{Af}", 0.0) + p
            if Hf > Af: p_home += p
            elif Hf == Af: p_draw += p
            else: p_away += p
            over_r[hp + ap] += p

    gsum = p_home + p_draw + p_away
    if gsum <= 0:
        p_home, p_draw, p_away = (1.0,0.0,0.0) if H0>A0 else ((0.0,1.0,0.0) if H0==A0 else (0.0,0.0,1.0))
        finals = {f"{H0}-{A0}": 1.0}; gsum = 1.0
    p_home, p_draw, p_away = p_home/gsum, p_draw/gsum, p_away/gsum
    tot = sum(finals.values()) or 1.0
    cs = dict(sorted(({k: round(v/tot*100, 2) for k, v in finals.items()}).items(),
                     key=lambda x: x[1], reverse=True))
    top_cs = next(iter(cs), f"{H0}-{A0}")

    tot0 = H0 + A0
    ssum = sum(over_r) or 1.0
    def ou(line):
        need = int(math.floor(line)) + 1
        need_rem = max(0, need - tot0)
        return sum(over_r[r] for r in range(len(over_r)) if r >= need_rem) / ssum

    if H0 > 0 and A0 > 0:   btts_yes = 1.0
    elif H0 > 0:            btts_yes = 1.0 - math.exp(-lam_a)
    elif A0 > 0:            btts_yes = 1.0 - math.exp(-lam_h)
    else:                   btts_yes = (1.0 - math.exp(-lam_h)) * (1.0 - math.exp(-lam_a))

    pick13 = "HOME_WIN" if p_home > p_away and p_home > p_draw else ("AWAY_WIN" if p_away > p_draw else "DRAW")
    p13 = {"HOME_WIN": round(p_home*100, 2), "DRAW": round(p_draw*100, 2), "AWAY_WIN": round(p_away*100, 2)}

    def m(probmap, pick, prob):
        return {"probabilities": probmap, "pick": pick, "pick_probability": prob}

    markets = {
        "mode": "live",
        "live_state": {"minute": round(T), "remaining_min": round(R, 1),
                       "score": f"{H0}-{A0}",
                       "rates_remaining": {"home": round(lam_h, 3), "away": round(lam_a, 3)}},
        "1x2":    {**m(p13, pick13, p13[pick13]), "engine": "live_poisson_gamma"},
        "btts":   m({"YES": round(btts_yes*100,2), "NO": round((1-btts_yes)*100,2)},
                    "YES" if btts_yes >= 0.5 else "NO", round(max(btts_yes, 1-btts_yes)*100, 2)),
    }
    for line, key in ((0.5, "ou_0_5"), (1.5, "ou_1_5"), (2.5, "ou_2_5"), (3.5, "ou_3_5")):
        o = ou(line)
        markets[key] = m({"OVER": round(o*100,2), "UNDER": round((1-o)*100,2)},
                         "OVER" if o >= 0.5 else "UNDER", round(max(o, 1-o)*100, 2))
    markets.update({
        "xG": {"home": round(xg_h,2), "away": round(xg_a,2), "total": round(xg_h+xg_a,2),
               "remaining_home": round(lam_h,2), "remaining_away": round(lam_a,2)},
        "team_state": team_state_label,
        "correct_scores": cs,
    })
    return markets, top_cs, cs.get(top_cs, 0.0)

def validate_live_sanity(markets):
    """Final scores can never be below the current score. Returns violation list."""
    if not isinstance(markets, dict) or markets.get("mode") != "live": return []
    ls = markets.get("live_state") or {}
    try: H0, A0 = map(int, str(ls.get("score", "0-0")).split("-"))
    except Exception: return []
    bad = []
    for k in (markets.get("correct_scores") or {}):
        try: h, a = map(int, k.split("-"))
        except Exception: continue
        if h < H0 or a < A0:
            bad.append(f"CS {k} below live {H0}-{A0}")
    return bad

# ================= PHASE 1: GENERATION (re-run safe, mode-aware) =================
def strip_injected(raw):
    clean, stripped = [], 0
    for item in raw:
        if not isinstance(item, dict): continue
        c = {k: v for k, v in item.items() if k not in INJECTED_KEYS}
        if len(c) != len(item): stripped += 1
        clean.append(c)
    return clean, stripped

def match_phase(item):
    disp = item.get("display") or {}
    status = str(item.get("status") or disp.get("status") or "NS").upper()
    if item.get("isFinished") or disp.get("isFinished") or status in FINISHED_STATUSES:
        return "final"
    if item.get("isLive") or disp.get("isLive") or status in LIVE_STATUSES:
        return "live"
    return "prematch"

def generate_day(fixture_data, models, label_maps, thresholds, live_state, resolver, res_ctr, now_ts):
    raw = fixture_data.get("data", []) if isinstance(fixture_data, dict) else fixture_data
    if not isinstance(raw, list): raw = []
    raw, stripped = strip_injected(raw)
    if stripped:
        log.info(f"   re-run safety: stripped stale predictions from {stripped} matches (fresh compute below)")

    daily, updated, cs_flags = [], [], []
    prematch_pairs = []   # (daily_index, feature_row, p13_frac|None, p_over25_frac|None)
                          # recorded AT APPEND TIME — live matches append to daily
                          # without a CS row, so indices must never be reconstructed
    phase_counts = {"prematch": 0, "live": 0, "final": 0}

    for item in raw:
        phase = match_phase(item)
        phase_counts[phase] = phase_counts.get(phase, 0) + 1
        if phase == "final":
            continue   # finished: no prediction (stale already stripped)

        mid = str(item.get("id", ""))
        if not mid: continue
        h_obj = item.get("homeTeam", {}) if isinstance(item.get("homeTeam"), dict) else {}
        a_obj = item.get("awayTeam", {}) if isinstance(item.get("awayTeam"), dict) else {}
        h_name = str(item.get("homeTeamName") or h_obj.get("name") or "")
        a_name = str(item.get("awayTeamName") or a_obj.get("name") or "")
        h_pid  = str(item.get("homeTeamId") or h_obj.get("id") or "")
        a_pid  = str(item.get("awayTeamId") or a_obj.get("id") or "")

        h_st, h_ok = resolver(h_pid, h_name, True);  res_ctr["live" if h_ok else "hash"] += 1
        a_st, a_ok = resolver(a_pid, a_name, False); res_ctr["live" if a_ok else "hash"] += 1
        h_elo = float(np.clip(_num(h_st.get("elo"), 1500), 1200, 2100))
        a_elo = float(np.clip(_num(a_st.get("elo"), 1500), 1200, 2100))

        row = build_feature_row(h_st, a_st, h_elo, a_elo)   # pre-match features ONLY
        X_df = pd.DataFrame([row])
        def prep(m):
            cols = list(m.feature_names_in_) if hasattr(m, "feature_names_in_") else FEATURE_ORDER
            return X_df.reindex(columns=cols, fill_value=0)

        ts_label = "resolved" if (h_ok and a_ok) else "estimated"
        markets = {}

        if phase == "live":
            # -------- LIVE: ML supplies xG prior; conditioning is pure math --------
            H0 = int(_num(item.get("homeScore"), 0))
            A0 = int(_num(item.get("awayScore"), 0))
            minute = derive_minute(item, now_ts)
            markets, top_cs, top_cs_p = build_live_markets(
                row["exp_home_xg"], row["exp_away_xg"], H0, A0, minute, ts_label)
            markets = convert_floats(markets)
            violations = validate_live_sanity(markets)
            if violations:
                log.warning(f"⚠ LIVE SANITY FAILURE {h_name} v {a_name}: {violations} — markets stripped")
                continue
            u = dict(item); u["_tmp_markets"] = markets; updated.append(u)
            daily.append({"matchId": mid,
                "homeTeam": {"id": h_pid, "name": h_name}, "awayTeam": {"id": a_pid, "name": a_name},
                "league": item.get("league",{}).get("name") if isinstance(item.get("league"),dict) else item.get("league",""),
                "date": item.get("utcDate") or item.get("date",""),
                "markets": markets, "top_correct_score": top_cs, "top_cs_prob": top_cs_p})
            continue

        # ---------- PREMATCH ----------
        cs_flags.append(bool(h_ok and a_ok))
        if "1x2" in models:
            try:
                m = models["1x2"]
                proba = m.predict_proba(prep(m))[0]
                lm = label_maps.get("1x2") or MODELS_CFG["1x2"]["fallback_map"]
                pmap = {lm.get(int(c), str(c)): round(float(p)*100, 2) for c, p in zip(m.classes_, proba)}
                pick = max(pmap, key=pmap.get)
                markets["1x2"] = {"probabilities": pmap, "pick": pick, "pick_probability": pmap[pick]}
            except Exception as e:
                log.warning(f"1x2 fail {h_name} v {a_name}: {e} -> heuristic")
                markets["1x2"] = elo_heuristic_1x2(h_elo, a_elo, row["exp_home_xg"], row["exp_away_xg"])
        else:
            markets["1x2"] = elo_heuristic_1x2(h_elo, a_elo, row["exp_home_xg"], row["exp_away_xg"])

        for mk in MARKET_KEYS:
            if mk not in models: continue
            try:
                th, apply = thresholds.get(mk, (0.5, False))
                markets[mk] = predict_binary(models[mk], label_maps.get(mk) or MODELS_CFG[mk]["fallback_map"],
                                             MODELS_CFG[mk]["positive"], prep(models[mk]), th, apply)
            except Exception as e: log.warning(f"{mk} fail {h_name} v {a_name}: {e}")

        markets["xG"] = {"home": round(row["exp_home_xg"], 2), "away": round(row["exp_away_xg"], 2),
                         "total": round(row["exp_total_xg"], 2)}
        markets["mode"] = "prematch"
        markets["team_state"] = ts_label
        markets = convert_floats(markets)

        u = dict(item); u["_tmp_markets"] = markets; updated.append(u)
        daily.append({"matchId": mid,
            "homeTeam": {"id": h_pid, "name": h_name}, "awayTeam": {"id": a_pid, "name": a_name},
            "league": item.get("league",{}).get("name") if isinstance(item.get("league"),dict) else item.get("league",""),
            "date": item.get("utcDate") or item.get("date",""),
            "markets": markets, "top_correct_score": "1-1", "top_cs_prob": 0})

        # capture market probabilities (fractions) for CS calibration — V3.2
        _p13 = (markets.get("1x2") or {}).get("probabilities") or {}
        _o25 = (markets.get("ou_2_5") or {}).get("probabilities") or {}
        p13f = {k: float(v)/100.0 for k, v in _p13.items()} or None
        o25f = float(_o25["OVER"])/100.0 if "OVER" in _o25 else None
        prematch_pairs.append((len(daily) - 1, row, p13f, o25f))

    # ---- PREMATCH hybrid Correct Score: ML joint + Poisson, IPF-calibrated ----
    def cs_apply(di, grid):
        tot = grid.sum() or 1.0
        scores = {f"{h_}-{a_}": round(float(grid[h_, a_] / tot * 100), 2)
                  for h_ in range(grid.shape[0]) for a_ in range(grid.shape[1])}
        scores = dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))
        top = next(iter(scores), "1-1")
        daily[di]["markets"]["correct_scores"] = scores
        daily[di]["top_correct_score"], daily[di]["top_cs_prob"] = top, scores.get(top, 0)
        updated[di]["_tmp_markets"]["correct_scores"] = scores

    def cs_poisson_all(pairs, apply_fn):
        for di, r, p13f, o25f in pairs:
            base = pois_matrix(r); base = base / (base.sum() or 1.0)
            apply_fn(di, ipf_calibrate(base, p13f, o25f))

    if prematch_pairs and "home_goals" in models and "away_goals" in models:
        try:
            X_all = pd.DataFrame([r for _, r, _, _ in prematch_pairs], columns=FEATURE_ORDER)
            def _prep(m):
                cols = list(m.feature_names_in_) if hasattr(m, "feature_names_in_") else FEATURE_ORDER
                return X_all.reindex(columns=cols, fill_value=0)
            mh, ma = models["home_goals"], models["away_goals"]
            hg = expand_proba(mh.predict_proba(_prep(mh)), mh.classes_, N_GOALS)
            ag = expand_proba(ma.predict_proba(_prep(ma)), ma.classes_, N_GOALS)
            joint = (hg[:, :, None] * ag[:, None, :]).reshape(len(prematch_pairs), -1)
            s = joint.sum(axis=1, keepdims=True); s[s == 0] = 1.0
            joint = joint / s
            for bi, (di, r, p13f, o25f) in enumerate(prematch_pairs):
                ml = np.zeros((N_GOALS, N_GOALS))
                ml[:6, :6] = joint[bi].reshape(6, 6)          # goal models trained on 0-5
                base = (CS_ML_WEIGHT * ml + CS_POIS_WEIGHT * pois_matrix(r)) if cs_flags[bi] else pois_matrix(r)
                base = base / (base.sum() or 1.0)
                cs_apply(di, ipf_calibrate(base, p13f, o25f))  # tilt to own 1x2 + OU2.5
        except Exception as e:
            log.warning(f"Hybrid CS failed: {e} -> Poisson+IPF")
            cs_poisson_all(prematch_pairs, cs_apply)
    else:
        cs_poisson_all(prematch_pairs, cs_apply)

    final = []
    for it in updated:
        mk = it.pop("_tmp_markets", {})
        it["prediction"] = mk; it["mlPredictions"] = mk; it["mlPrediction"] = mk
        final.append(it)
    log.info(f"   phases: prematch={phase_counts.get('prematch',0)} live={phase_counts.get('live',0)} final(skipped)={phase_counts.get('final',0)}")
    return daily, final

def run_generation():
    log.info("="*70); log.info(" STEP 50 PRODUCTION FINAL V3.2 — PICKER + GENERATION"); log.info("="*70)
    decision = select_champion()
    models, label_maps, thresholds = {}, {}, {}
    for key, cfg in MODELS_CFG.items():
        if key == "1x2" and decision == "HEURISTIC":
            log.warning("Picker: serving 1x2 via ELO heuristic — skipping champion load")
            continue
        fp = os.path.join(MODELS_DIR, cfg["file"])
        if not os.path.exists(fp): log.warning(f"{key}: missing {cfg['file']}"); continue
        try:
            models[key] = joblib.load(fp)
            label_maps[key] = load_label_map(key)
            if key in MARKET_KEYS: thresholds[key] = load_threshold(key)
            fn = getattr(models[key], "feature_names_in_", None)
            log.info(f"{key}: OK classes={list(getattr(models[key],'classes_',[]))} feats={len(fn) if fn is not None else '?'}")
            if fn is not None:
                extra = [c for c in fn if c not in FEATURE_ORDER]
                if extra: log.warning(f"   ⚠ {key} expects features NOT in contract (will be 0!): {extra}")
        except Exception as e: log.warning(f"{key}: FAIL {e}")

    live_state = load_live_state()
    resolver, make_counters = build_resolver(live_state)
    os.makedirs(PREDICTIONS_DIR, exist_ok=True); os.makedirs(ZOKAPICKS_DIR, exist_ok=True)
    now = datetime.now(timezone.utc); now_ts = time.time(); total = 0
    for off in range(WINDOW_START, DAYS_AHEAD):
        date_str = (now + timedelta(days=off)).date().isoformat()
        fpath = os.path.join(FIXTURES_DIR, f"{date_str}.json")
        if not os.path.exists(fpath): log.info(f"Skip {date_str} — no fixtures"); continue
        fixture_data = json.load(open(fpath, encoding="utf-8"))
        res_ctr = make_counters()
        daily, final = generate_day(fixture_data, models, label_maps, thresholds, live_state, resolver, res_ctr, now_ts)

        # freshness metadata (V3.2) — consumed by frontend + serve-time sync
        for p in daily:
            p["freshness"] = {"generated_at": now.isoformat(),
                              "ttl_minutes": 10 if p["markets"].get("mode") == "live" else 60}

        out = dict(fixture_data) if isinstance(fixture_data, dict) else {}
        out.update({"data": final, "count": len(final), "date": date_str})
        atomic_write_json(out, fpath)

        atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "pipeline": "50_PRODUCTION_FINAL_V3.2",
            "date": date_str, "generated_at": now.isoformat(),
            "features": f"{len(FEATURE_ORDER)}_step49v4_parity", "modes": "prematch|live|final(none)",
            "cs": f"grid {N_GOALS}x{N_GOALS} ipf-calibrated to own 1x2+OU2.5",
            "count": len(daily), "predictions": daily, "data": daily},
            os.path.join(PREDICTIONS_DIR, f"{date_str}.json"))

        if daily:
            top10 = sorted((p for p in daily if p["markets"].get("mode") == "prematch"),
                           key=lambda x: x["markets"].get("1x2",{}).get("pick_probability",0), reverse=True)[:10]
            zp = []
            for p in top10:
                try: hh, aa = map(int, str(p.get("top_correct_score","1-1")).split("-"))
                except Exception: hh, aa = 1, 1
                zp.append({"matchId": p["matchId"], "homeTeam": p["homeTeam"]["name"],
                           "awayTeam": p["awayTeam"]["name"], "league": p.get("league",""),
                           "kickoff": p.get("date",""), "adminPick": {"home": hh, "away": aa},
                           "topCS": p.get("top_correct_score"), "topCSProb": p.get("top_cs_prob",0),
                           "markets": p["markets"]})
            atomic_write_json({"date": date_str, "totalMatches": len(zp), "matches": zp,
                               "data": zp, "publishedAt": now.isoformat()},
                              os.path.join(ZOKAPICKS_DIR, f"{date_str}.json"))
            s = daily[0]; m = s["markets"]
            log.info(f"[OK] {date_str}: {len(daily)} preds | state live={res_ctr['live']} hash={res_ctr['hash']} | "
                     f"sample[{m.get('mode')}] {s['homeTeam']['name']} v {s['awayTeam']['name']} -> "
                     f"{m.get('1x2',{}).get('pick')} {m.get('1x2',{}).get('pick_probability')}% | "
                     f"CS {s['top_correct_score']} {s['top_cs_prob']}% | xG {m.get('xG',{}).get('total')} "
                     f"[{m.get('team_state','?')}]")
            total += len(daily)
    log.info(f"[GEN] {total} predictions across window [{WINDOW_START}..+{DAYS_AHEAD-1}]")
    return 0

# ================= PHASE 2: FINALIZE =================
def run_finalize():
    log.info("="*70); log.info(" STEP 50 PRODUCTION FINAL V3.2 — FINALIZE"); log.info("="*70)
    files = sorted(f for f in glob.glob(os.path.join(PREDICTIONS_DIR, "*.json"))
                   if DATE_RE.match(os.path.splitext(os.path.basename(f))[0]))
    log.info(f"[FINALIZE] {len(files)} daily files")
    by_date, all_preds = {}, []
    for fp in files:
        try: data = json.load(open(fp, encoding="utf-8"))
        except Exception as e: log.warning(f"skip {fp}: {e}"); continue
        date = data.get("date") or os.path.splitext(os.path.basename(fp))[0]
        preds = data.get("predictions") or data.get("data") or []
        kept = []
        for p in preds:
            m = p.get("markets")
            if not isinstance(m, dict): continue
            for w in audit_consistency(m):
                log.warning(f"CONSISTENCY {p.get('matchId')}: {w}")
            violations = validate_live_sanity(m)
            if violations:
                log.warning(f"⚠ LIVE SANITY FAILURE {p.get('matchId')}: {violations} — prediction dropped")
                continue
            if not (isinstance(m.get("1x2"), dict) and m["1x2"].get("pick")):
                m["1x2"] = xg_directional_1x2(float(m.get("xG",{}).get("home",1.2)),
                                              float(m.get("xG",{}).get("away",1.2)))
                log.warning(f"DEGRADED 1x2 via xG for {p.get('matchId')}")
            kept.append(p)
        by_date[date] = len(kept); all_preds.extend(kept)
        log.info(f"   {date}: {len(kept)}")

    seen = {}
    def _ok(x): return isinstance(x, dict) and isinstance(x.get("markets",{}).get("1x2"), dict) and x["markets"]["1x2"].get("pick")
    for p in all_preds:
        mid = p.get("matchId")
        if not mid: continue
        cur = seen.get(mid)
        if cur is None or _ok(p): seen[mid] = p
    deduped = list(seen.values())
    log.info(f"[FINALIZE] dedup: {len(deduped)} unique (from {len(all_preds)})")
    deduped.sort(key=lambda x: (x.get("markets",{}).get("mode","prematch") != "live",
                                -x.get("markets",{}).get("1x2",{}).get("pick_probability",0)))

    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "version": "50_PRODUCTION_FINAL_V3.2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_predictions": len(deduped), "by_date": by_date,
        "features": f"{len(FEATURE_ORDER)}_step49v4_parity",
        "modes": "prematch (ML) · live (gamma-poisson conditional, sanity-validated) · final (none)",
        "models": {"1x2": "champion 51.10% (+7.12%) full-contract (prematch)",
                   "ou_3_5": "threshold 0.67 applied (validated gain)", "btts": "54.45% (+1.04%)",
                   "correct_score": f"prematch: {N_GOALS}x{N_GOALS} hybrid, IPF-calibrated to own 1x2+OU2.5 · live: conditional grid"},
        "predictions": deduped, "data": deduped},
        os.path.join(PUBLIC_DATA, "predictions.json"))

    zp_all = []
    for fp in sorted(glob.glob(os.path.join(ZOKAPICKS_DIR, "*.json"))):
        if not DATE_RE.match(os.path.splitext(os.path.basename(fp))[0]): continue
        try: d = json.load(open(fp, encoding="utf-8"))
        except Exception: continue
        zp_all.extend(d.get("matches") or d.get("data") or [])
    for m in zp_all:
        if isinstance(m.get("markets"), dict): audit_consistency(m["markets"])
    zp_all.sort(key=lambda x: x.get("markets",{}).get("1x2",{}).get("pick_probability",0) if isinstance(x.get("markets"), dict) else 0, reverse=True)
    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": min(len(zp_all),50), "matches": zp_all[:50], "data": zp_all[:50]},
        os.path.join(PUBLIC_DATA, "zokapicks.json"))

    mp = []
    for p in deduped:
        m = p.get("markets", {})
        mp.append({"matchId": p.get("matchId"),
            "homeTeam": p.get("homeTeam",{}).get("name") if isinstance(p.get("homeTeam"),dict) else p.get("homeTeam"),
            "awayTeam": p.get("awayTeam",{}).get("name") if isinstance(p.get("awayTeam"),dict) else p.get("awayTeam"),
            "league": p.get("league",""), "date": p.get("date",""),
            "mode": m.get("mode","prematch"),
            "1x2": m.get("1x2",{}), "btts": m.get("btts",{}),
            "ou_1_5": m.get("ou_1_5",{}), "ou_2_5": m.get("ou_2_5",{}), "ou_3_5": m.get("ou_3_5",{}),
            "correct_scores": m.get("correct_scores",{}), "xG": m.get("xG",{}),
            "live_state": m.get("live_state"),
            "top_correct_score": p.get("top_correct_score","1-1"), "top_cs_prob": p.get("top_cs_prob",0)})
    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(mp), "predictions": mp},
        os.path.join(PUBLIC_DATA, "market_predictions.json"))
    log.info(f"[FINALIZE] predictions.json ({len(deduped)}) · zokapicks.json ({min(len(zp_all),50)}) · market_predictions.json ({len(mp)})")
    log.info("✅ READY FOR API")
    return 0

# ================= MAIN =================
if __name__ == "__main__":
    try:
        rc = run_generation()
        if rc == 0: rc = run_finalize()
        sys.exit(rc)
    except Exception:
        log.exception("Step 50 production final failed"); sys.exit(1)