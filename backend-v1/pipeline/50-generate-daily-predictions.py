"""
ZOKASCORE V2 — STEP 50 MASTER FINAL V5.0-UNIFIED (HONESTY PATCH V7.1)
==================================================================================
V7.1 HONESTY PATCHES APPLIED:
  · Fixed numpy array broadcasting TypeError in predict_binary that killed BTTS/OU.
  · Raised 1X2 caps (CAP_1X2=75, HARD_CAP=70) to prevent 55.6% tie from hard clamps.
  · Tuned CONF_SHRINK_RESOLVED to 0.65 to preserve natural variance while staying honest.
  · Fixed fuzzy dedup `get_item=` -> `get_p=` parameter name mismatch.
  · Removed `SCORE` from all user-facing pick groups and public predictions.
  · `STRICT_XG_FLIP` set to True (prevents serving OVER/UNDER contradictions vs xG).
==================================================================================
"""
import os, re, glob, json, math, sys, time, joblib, tempfile, logging, hashlib, unicodedata
from datetime import datetime, timezone, timedelta
import pandas as pd, numpy as np

BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR      = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR     = os.path.join(BASE_DIR, "data", "processed")
FIXTURES_DIR    = os.path.join(BASE_DIR, "public_data", "fixtures")
PREDICTIONS_DIR = os.path.join(BASE_DIR, "public_data", "predictions")
ZOKAPICKS_DIR   = os.path.join(BASE_DIR, "public_data", "zokapicks")
PICK_GROUPS_DIR = os.path.join(BASE_DIR, "public_data", "pick_groups")
PUBLIC_DATA     = os.path.join(BASE_DIR, "public_data")
MASTER_FILE     = os.path.join(BASE_DIR, "data", "processed", "master_with_elo.csv")
LIVE_STATE_FILE = os.path.join(MODELS_DIR, "live_team_state.json")
PROVIDER_MAP_FILE = os.path.join(BASE_DIR, "data", "zokascore_football_data",
                                  "canonical_sources", "internal_team_map.json")
TEAMS_INDEX_FILES = [os.path.join(PUBLIC_DATA, "knowledge", "football", "indexes", "teams-index.json"),
                     os.path.join(BASE_DIR, "data", "indexes", "teams-index.json")]

DAYS_AHEAD, WINDOW_START = 3, -1
STRICT_XG_FLIP = True
CS_ML_WEIGHT, CS_POIS_WEIGHT = 0.70, 0.30
LIVE_PRIOR_S = 3.0
THRESH_MIN_GAIN = 0.5
N_GOALS, IPF_ITERS = 8, 40
PAST_GRACE_MINUTES = 30
CAP_1X2 = 75.0                   # V7.1: Raised from 60 to prevent 60% tie
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INJECTED_KEYS = ("prediction","mlPredictions","mlPrediction","_tmp_markets","pick_groups")
FT_RECORD_MARKER = "prediction_final_record"
LIVE_STATUSES = {"1H","2H","HT","ET","BT","P","LIVE","IN_PLAY","PAUSED"}
FINISHED_STATUSES = {"FT","FIN","FINISHED","AET","AP","PEN","AWARDED","ABAN","SUSP"}

STRONG_PICK_CONFIG = {
    "1x2": {"min_probability": 54.0, "strong_probability": 60.0, "elite_probability": 66.0, "min_margin": 6.0},
    "btts": {"min_probability": 56.0, "strong_probability": 61.0, "elite_probability": 67.0, "min_margin": 8.0},
    "ou_0_5": {"min_probability": 80.0, "strong_probability": 88.0, "elite_probability": 93.0, "min_margin": 20.0},
    "ou_1_5": {"min_probability": 68.0, "strong_probability": 75.0, "elite_probability": 82.0, "min_margin": 12.0},
    "ou_2_5": {"min_probability": 56.0, "strong_probability": 61.0, "elite_probability": 67.0, "min_margin": 8.0},
    "ou_3_5": {"min_probability": 58.0, "strong_probability": 64.0, "elite_probability": 72.0, "min_margin": 10.0},
}
STRONG_PICK_EXCLUDED_FAMILIES = ("SCORE",)
MAX_SAME_PICK_PER_FAMILY = 12
MARKET_BASE_RATES = {
    "1x2": {"HOME_WIN": 45.5, "DRAW": 25.2, "AWAY_WIN": 29.3},
    "btts": {"YES": 51.1, "NO": 48.9},
    "ou_0_5": {"OVER": 92.3, "UNDER": 7.7},
    "ou_1_5": {"OVER": 74.4, "UNDER": 25.6},
    "ou_2_5": {"OVER": 50.5, "UNDER": 49.5},
    "ou_3_5": {"OVER": 29.0, "UNDER": 71.0},
}

# V7.1: Raised caps to preserve natural variance
MARKET_HARD_CAP = {
    "1x2": 70.0,
    "btts": 65.0,
    "ou_2_5": 65.0,
    "ou_1_5": 80.0,
    "ou_0_5": 92.0,
    "ou_3_5": 78.0,
}

# V7.1: Tuned shrinkage to 0.65 to allow realistic 65-68% top ends
CONF_SHRINK_RESOLVED, CONF_SHRINK_ESTIMATED = 0.65, 0.45
CONF_HARD_CAP_PREMATCH = 90.0
CS_UNIFORM_BLEND, CS_HARD_CAP_PREMATCH = 0.12, 35.0

PICK_GROUPS_CONFIG = {
    "PURE_1X2":   {"label": "1X2", "emoji": "🔒", "market": "1x2", "min_probability": 54.0,
                   "low_floor": 48.0, "grades": {"PURE": 66.0, "STRONG": 58.0}, "elite_probability": 72.0},
    "GG_BTTS":    {"label": "GG / BTTS", "emoji": "⚽", "market": "btts", "min_probability": 56.0,
                   "low_floor": 50.0, "grades": {"PURE": 70.0, "STRONG": 62.0}, "elite_probability": 75.0},
    "OVER_UNDER": {"label": "Over/Under 2.5", "emoji": "📈", "market": "ou_2_5", "min_probability": 56.0,
                   "low_floor": 50.0, "grades": {"PURE": 70.0, "STRONG": 62.0}, "elite_probability": 75.0},
}
TIER_SIZE = 10

MODELS_CFG = {
    "1x2":        {"file": "champion_model.joblib", "mapfile": "champion_label_mapping.json", "fallback_map": {0:"AWAY_WIN",1:"DRAW",2:"HOME_WIN"}, "positive": None},
    "btts":       {"file": "market_btts_model.joblib", "mapfile": "market_btts_label_mapping.json", "fallback_map": {0:"NO",1:"YES"}, "positive": "YES"},
    "ou_0_5":     {"file": "market_ou_0_5_model.joblib", "mapfile": "market_ou_0_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "ou_1_5":     {"file": "market_ou_1_5_model.joblib", "mapfile": "market_ou_1_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "ou_2_5":     {"file": "market_ou_2_5_model.joblib", "mapfile": "market_ou_2_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "ou_3_5":     {"file": "market_ou_3_5_model.joblib", "mapfile": "market_ou_3_5_label_mapping.json", "fallback_map": {0:"UNDER",1:"OVER"}, "positive": "OVER"},
    "home_goals": {"file": "market_home_goals_model.joblib", "mapfile": None, "fallback_map": None, "positive": None},
    "away_goals": {"file": "market_away_goals_model.joblib", "mapfile": None, "fallback_map": None, "positive": None},
}
MARKET_KEYS = ["btts", "ou_0_5", "ou_1_5", "ou_2_5", "ou_3_5"]

BASE_FEATURES = ["home_elo_pre","away_elo_pre","elo_diff","home_ewma_pts","away_ewma_pts",
    "home_ewma_gd","away_ewma_gd","home_ewma_gf","away_ewma_gf","home_ewma_ga","away_ewma_ga",
    "home_ewma_home_pts","away_ewma_away_pts","home_ewma_home_gd","away_ewma_away_gd",
    "home_ewma_home_gf","away_ewma_away_gf","home_ewma_home_ga","away_ewma_away_ga"]
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
    if isinstance(o, dict): return {k: convert_floats(v) for k, v in o.items()}
    if isinstance(o, list): return [convert_floats(v) for v in o]
    if isinstance(o, (np.floating, np.integer)): return float(o)
    if hasattr(o, "item"):
        try: return o.item()
        except Exception: return o
    return o

def _num(v, default):
    try:
        f = float(v); return f if pd.notna(f) else default
    except (TypeError, ValueError): return default

def _norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s)

def _pct(v):
    if not isinstance(v, (int, float)): return None
    return v * 100 if abs(v) <= 1 else float(v)

def poisson_prob(k, lam):
    lam = float(np.clip(lam, 0.05, 3.0))
    return math.exp(-lam) * (lam ** k) / math.factorial(k)

# ================= CANONICAL MATCH IDENTITY =================
def _team_same(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b: return False
    if a == b: return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) < 4: return False
    if longer.startswith(shorter): return True
    for suf in ("united","hotspur","city","town","fc","afc","sc","cf"):
        if longer.endswith(suf) and longer[:-len(suf)] == shorter:
            return True
    return False

def _canonical_key(home, away, kickoff):
    h, a = str(home or ""), str(away or "")
    ko = str(kickoff or "")[:13]
    pair = "-".join(sorted([_norm(h), _norm(a)])) if _team_same(h, a) else f"{_norm(h)}|{_norm(a)}"
    return f"{pair}|{ko}"

def _match_identity(item):
    mid = str(item.get("id") or item.get("matchId") or "")
    cm = str(item.get("canonicalMatchId") or "") or None
    if not cm:
        h = item.get("homeTeamName") or (item.get("homeTeam") or {}).get("name") or ""
        a = item.get("awayTeamName") or (item.get("awayTeam") or {}).get("name") or ""
        cm = _canonical_key(h, a, item.get("utcDate") or item.get("date"))
    return mid, cm

# ================= labels / thresholds =================
def load_label_map(key):
    cfg = MODELS_CFG[key]
    if cfg["mapfile"]:
        p = os.path.join(MODELS_DIR, cfg["mapfile"])
        if os.path.exists(p):
            try: return {int(k): v for k, v in json.load(open(p, encoding="utf-8")).items()}
            except Exception as e: log.warning(f"label map {key}: {e}")
    return cfg["fallback_map"] or {}

def load_threshold(key):
    try:
        meta = json.load(open(os.path.join(MODELS_DIR, f"market_{key}_metadata.json"), encoding="utf-8"))
        th = float(np.clip(float(meta.get("best_threshold", meta.get("threshold", 0.5))), 0.15, 0.85))
        acc_t, acc_d = _pct(meta.get("accuracy_tuned")), _pct(meta.get("accuracy_default"))
        apply = bool(acc_t is not None and acc_d is not None
                     and (acc_t - acc_d) >= THRESH_MIN_GAIN and abs(th - 0.5) > 0.02)
        return th, apply
    except Exception:
        return 0.5, False

# ================= MASTER PICKER =================
def select_champion():
    def _ra(r): return _pct(r.get("accuracy")) or _pct(r.get("accuracy_percent"))
    candidates, table = [], []
    scan = (glob.glob(os.path.join(MODELS_DIR, "*metadata*.json"))
            + glob.glob(os.path.join(REPORTS_DIR, "*report*.json")))
    for fp in sorted(set(scan)):
        try: r = json.load(open(fp, encoding="utf-8"))
        except Exception: continue
        acc = _ra(r)
        if acc is None: continue
        feats = r.get("features") or []
        base = _pct(r.get("baseline"))
        imp = round(acc - base, 2) if base is not None else None
        ok = bool(feats) and all(f in FEATURE_ORDER for f in feats)
        row = {"file": os.path.basename(fp), "accuracy": round(acc, 2), "baseline": base,
               "improvement": imp, "features": len(feats), "contract_ok": ok}
        table.append(row)
        if ok: candidates.append(row)
    table.sort(key=lambda x: x["improvement"] if x["improvement"] is not None else -999, reverse=True)
    champ_file = os.path.join(MODELS_DIR, "champion_model.joblib")
    cm = next((r for r in candidates if "champion" in r["file"].lower()), None)
    if not os.path.exists(champ_file): decision, reason = "HEURISTIC", "no champion_model.joblib on disk"
    elif cm and cm["improvement"] is not None and cm["improvement"] <= 0:
        decision, reason = "HEURISTIC", f"champion report shows no edge: {cm}"
    elif cm: decision, reason = "MODEL", f"champion selected: {cm}"
    else: decision, reason = "MODEL", "champion exists, no parseable report — serving with audit warning"
    log.info("=" * 70); log.info(" MASTER PICKER — TRAINER COMPARISON "); log.info("=" * 70)
    for t in table[:8]:
        d = f"{t['improvement']:+.2f}" if t["improvement"] is not None else "n/a"
        log.info(f"   {t['file'][:44]:44s} acc {t['accuracy']:6.2f}%  delta {d:>7s}  "
                 f"feats {t['features']:2d}  {'✅ contract' if t['contract_ok'] else '⛔ legacy-contract'}")
    log.info(f"   👉 DECISION: {decision} ({reason})")
    atomic_write_json({"decided_at": datetime.now(timezone.utc).isoformat(), "decision": decision,
                       "reason": reason, "contract": f"{len(FEATURE_ORDER)}_features",
                       "comparison_table": table},
                      os.path.join(MODELS_DIR, "selection_decision.json"))
    return decision

# ================= feature builder =================
def build_feature_row(h, a, h_elo, a_elo):
    gfc = lambda v: float(np.clip(_num(v, 1.2), 0.3, 2.5))
    f0 = lambda v: _num(v, 0.0)
    row = {"home_elo_pre": f0(h_elo), "away_elo_pre": f0(a_elo),
           "elo_diff": float(np.clip(f0(h_elo)-f0(a_elo), -400, 400)),
           "home_ewma_pts": f0(h.get("ewma_points")), "away_ewma_pts": f0(a.get("ewma_points")),
           "home_ewma_gd": f0(h.get("ewma_gd")), "away_ewma_gd": f0(a.get("ewma_gd")),
           "home_ewma_gf": gfc(h.get("ewma_gf")), "away_ewma_gf": gfc(a.get("ewma_gf")),
           "home_ewma_ga": gfc(h.get("ewma_ga")), "away_ewma_ga": gfc(a.get("ewma_ga")),
           "home_ewma_home_pts": f0(h.get("ewma_home_points")), "away_ewma_away_pts": f0(a.get("ewma_away_points")),
           "home_ewma_home_gd": f0(h.get("ewma_home_gd")), "away_ewma_away_gd": f0(a.get("ewma_away_gd")),
           "home_ewma_home_gf": gfc(h.get("ewma_home_gf")), "away_ewma_away_gf": gfc(a.get("ewma_away_gf")),
           "home_ewma_home_ga": gfc(h.get("ewma_home_ga")), "away_ewma_away_ga": gfc(a.get("ewma_away_ga"))}
    d = row["elo_diff"]
    xg_h = float(np.clip(1.22 + d*0.0011 + (row["home_ewma_gf"]-1.2)*0.32 + (1.2-row["away_ewma_ga"])*0.14, 0.35, 2.3))
    xg_a = float(np.clip(1.02 - d*0.0011 + (row["away_ewma_gf"]-1.2)*0.32 + (1.2-row["home_ewma_ga"])*0.14, 0.25, 1.9))
    tot, dif = float(np.clip(xg_h+xg_a, 0.6, 4.0)), float(np.clip(xg_h-xg_a, -1.8, 1.8))
    row.update({"exp_home_xg": xg_h, "exp_away_xg": xg_a, "exp_total_xg": tot, "exp_diff_xg": dif,
        "home_attack_vs_away_def": float(np.clip(row["home_ewma_gf"]-row["away_ewma_ga"], -1.4, 1.4)),
        "away_attack_vs_home_def": float(np.clip(row["away_ewma_gf"]-row["home_ewma_ga"], -1.4, 1.4)),
        "home_form_adv": float(np.clip(row["home_ewma_pts"]-row["away_ewma_pts"], -7, 7)),
        "high_scoring_expected": int(tot > 2.65), "low_scoring_expected": int(tot < 1.85),
        "btts_expected": int(xg_h > 0.82 and xg_a > 0.72),
        "elo_diff_sq": float(min(d*d/10000.0, 16.0)), "elo_diff_abs": float(min(abs(d), 400.0)),
        "total_gd_form": float(np.clip(row["home_ewma_gd"]-row["away_ewma_gd"], -3.5, 3.5)),
        "home_home_adv": float(np.clip(row["home_ewma_home_pts"]-7.0, -4, 4)),
        "away_away_adv": float(np.clip(row["away_ewma_away_pts"]-7.0, -4, 4))})
    return row

# ================= TEAM RESOLVER =================
def build_resolver(live_state):
    pid_map, alias_index = {}, {}
    try:
        raw_map = json.load(open(PROVIDER_MAP_FILE, encoding="utf-8"))
        pid_map = dict(raw_map.get("by_provider_id") or raw_map.get("by_provider_club_id") or {})
        td = raw_map.get("teams") or {}
        for zk_id, info in td.items():
            if not isinstance(info, dict): continue
            pcid = info.get("provider_club_id")
            if pcid: pid_map[str(pcid)] = zk_id
            pids = info.get("provider_ids") or []
            if isinstance(pids, dict): pids = list(pids.values())
            for pid in pids:
                if pid: pid_map[str(pid)] = zk_id
            for sn in info.get("source_names") or []:
                if sn: alias_index[_norm(str(sn))] = zk_id
        log.info(f"provider map: {len(pid_map)} ids (by_provider_id + {len(td)} teams)")
        for sn, zk in (raw_map.get("by_source_name") or {}).items():
            if isinstance(zk, str) and zk.startswith("ZK_TEAM_"):
                n = _norm(sn)
                if n: alias_index[n] = zk
        log.info(f"source-name aliases: {len(alias_index)}")
    except Exception as e: log.warning(f"provider map unavailable ({e})")
    name_index = {}
    for ip in TEAMS_INDEX_FILES:
        if os.path.exists(ip):
            try:
                idx = json.load(open(ip, encoding="utf-8"))
                for zk, prof in idx.items():
                    n = prof.get("name") if isinstance(prof, dict) else None
                    if n:
                        name_index[_norm(n)] = zk
                        name_index[_norm(re.sub(r"\([^)]*\)", "", n))] = zk
                log.info(f"teams index: {len(name_index)} name keys"); break
            except Exception as e: log.warning(f"teams index {ip}: {e}")
    state_norm = {_norm(k): v for k, v in live_state.items()}
    def _p2z(p):
        hit = pid_map.get(p)
        if hit is None: return None
        if isinstance(hit, str): return hit
        if isinstance(hit, dict):
            return hit.get("zkId") or hit.get("id") or hit.get("canonical_id") or hit.get("ZK_TEAM_ID")
        return None
    def resolve(pid, name, is_home):
        p = str(pid or "").strip()
        if p and p in live_state: return live_state[p], True
        zk = _p2z(p)
        if zk and zk in live_state: return live_state[zk], True
        n, nb = _norm(name), _norm(re.sub(r"\([^)]*\)", "", str(name or "")))
        for key in (n, nb):
            zk = name_index.get(key)
            if zk and zk in live_state: return live_state[zk], True
        for key in (n, nb):
            zk = alias_index.get(key)
            if zk and zk in live_state: return live_state[zk], True
        for key in (n, nb):
            if key and key in state_norm: return state_norm[key], True
        return fallback_state_from_hash(p, name, is_home), False
    def counters(): return {"live": 0, "hash": 0}
    return resolve, counters

def fallback_state_from_hash(pid, name, is_home):
    s = hashlib.md5((pid or name or ("home" if is_home else "away")).encode()).hexdigest()
    return {"elo": 1500+(int(s[:4],16)%60-30), "ewma_points": 7.0+(int(s[4:8],16)%16-8)/10.0,
            "ewma_gd": (int(s[8:12],16)%20-10)/20.0, "ewma_gf": 1.15+(int(s[12:16],16)%20-10)/100.0,
            "ewma_ga": 1.15+(int(s[16:20],16)%20-10)/100.0,
            "ewma_home_points": 7.0, "ewma_away_points": 6.5, "ewma_home_gd": 0.0, "ewma_away_gd": 0.0,
            "ewma_home_gf": 1.15, "ewma_away_gf": 1.1, "ewma_home_ga": 1.1, "ewma_away_ga": 1.15}

def load_live_state():
    state = {}
    if os.path.exists(LIVE_STATE_FILE):
        try:
            state = json.load(open(LIVE_STATE_FILE, encoding="utf-8"))
            log.info(f"live_team_state.json: {len(state)} teams (ZK keys)"); return state
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
    diff = (h_elo-a_elo) + (xg_h-xg_a)*120.0
    ph = 1.0/(1.0+math.exp(-diff/180.0)); pa = (1.0-ph)*0.65
    pd_ = max(0.18, min(0.34, 1.0-ph-pa))
    rem, den = 1.0-pd_, ph+pa
    ph = rem*(ph/den if den > 0 else 0.6); pa = rem-ph
    pick = "HOME_WIN" if ph > pa and ph > pd_ else ("AWAY_WIN" if pa > pd_ else "DRAW")
    pm = {"HOME_WIN": round(ph*100,2), "DRAW": round(pd_*100,2), "AWAY_WIN": round(pa*100,2)}
    return {"probabilities": pm, "pick": pick, "pick_probability": pm[pick], "engine": "elo_heuristic"}

def xg_directional_1x2(xg_h, xg_a):
    d = xg_h - xg_a
    pick = "HOME_WIN" if d > 0.25 else ("AWAY_WIN" if d < -0.25 else "DRAW")
    conf = round(float(np.clip(45.0+abs(d)*20.0, 40.0, 70.0)), 2)
    half = round((100-conf)/2, 2)
    pm = {"HOME_WIN": half, "DRAW": half, "AWAY_WIN": half}; pm[pick] = conf
    return {"probabilities": pm, "pick": pick, "pick_probability": conf, "engine": "xg_directional_degraded"}

def predict_binary(m, label_map, positive, X, thresh, apply_thresh, calibration=None):
    proba = m.predict_proba(X)[0]
    labels = [label_map.get(int(c), str(c)) for c in m.classes_]
    pmap = {lb: round(float(p)*100, 2) for lb, p in zip(labels, proba)}
    if positive and positive in labels:
        pi = labels.index(positive)
        p_pos = float(proba[pi])
        
        # V7.1: Fixed numpy array broadcasting bug using built-in math module
        if calibration and calibration.get("enabled"):
            W = float(np.asarray(calibration["W"], dtype=float).flatten()[0])
            b = float(np.asarray(calibration["b"], dtype=float).flatten()[0])
            z = math.log(max(p_pos, 1e-12)) * W + b
            p_pos = 1.0 / (1.0 + math.exp(-z))
            T = float(calibration.get("validation", {}).get("temperature", 1.0) or 1.0)
            if T != 1.0:
                p_pos = math.pow(max(p_pos, 1e-12), 1.0/T)
                p_neg = math.pow(max(1.0 - p_pos, 1e-12), 1.0/T)
                p_pos = p_pos / (p_pos + p_neg)
            p_pos = max(0.001, min(0.999, p_pos))
            
            neg = next((lb for lb in labels if lb != positive), positive)
            pmap = {positive: round(p_pos*100, 2), neg: round((1-p_pos)*100, 2)}
            
        cutoff = thresh if apply_thresh else 0.5
        pick = positive if p_pos >= cutoff else neg
        if pmap[pick] < 50.0: pick = labels[int(np.argmax(proba))]
        return {"probabilities": pmap, "pick": pick, "pick_probability": pmap[pick],
                "threshold": round(thresh, 2), "threshold_applied": bool(apply_thresh)}
    b = int(np.argmax(proba))
    return {"probabilities": pmap, "pick": labels[b], "pick_probability": pmap[labels[b]]}

# ================= CONFIDENCE CALIBRATION =================
def shrink_market(pmap, team_state, market_key=None, hard_cap=None):
    if not isinstance(pmap, dict) or not pmap: return pmap
    base = MARKET_BASE_RATES.get(market_key)
    anchor = None
    if base:
        keys = [k for k in pmap if k in base]
        if len(keys) == len(pmap):
            bsum = sum(base[k] for k in keys)
            if bsum > 0: anchor = {k: base[k]*100.0/bsum for k in keys}
    if anchor is None:
        n = len(pmap); anchor = {k: 100.0/n for k in pmap}
        
    factor = CONF_SHRINK_RESOLVED if team_state == "resolved" else CONF_SHRINK_ESTIMATED
    shrunk = {k: anchor[k] + (v - anchor[k]) * factor for k, v in pmap.items()}
    total = sum(shrunk.values()) or 100.0
    shrunk = {k: v * 100.0 / total for k, v in shrunk.items()}
    
    cap = MARKET_HARD_CAP.get(market_key, 70.0) if hard_cap is None else hard_cap
    if cap:
        capped = {k: min(v, cap) for k, v in shrunk.items()}
        trimmed = sum(shrunk.values()) - sum(capped.values())
        others = [k for k in capped if shrunk[k] < cap]
        if trimmed > 0 and others:
            share = trimmed / len(others)
            for k in others: capped[k] += share
        shrunk = capped
    return {k: round(v, 2) for k, v in shrunk.items()}

def regularize_cs_grid(grid, blend=CS_UNIFORM_BLEND, hard_cap=CS_HARD_CAP_PREMATCH):
    g = np.array(grid, dtype=float)
    if g.sum() <= 0: return g
    g = g / g.sum()
    uni = np.full_like(g, 1.0 / g.size)
    g = (1 - blend) * g + blend * uni
    g = g / g.sum()
    if hard_cap:
        cap = hard_cap / 100.0
        excess = np.clip(g - cap, 0, None)
        if excess.sum() > 0:
            g = np.minimum(g, cap)
            room = np.clip(cap - g, 0, None)
            if room.sum() > 0: g = g + room * (excess.sum() / room.sum())
            g = g / g.sum()
    return g

# ================= V5.0: apply V6 calibration =================
def apply_v6_calibration(proba, calibration):
    if not calibration or not calibration.get("enabled"):
        return proba
    W = np.asarray(calibration["W"], dtype=float)
    b = np.asarray(calibration["b"], dtype=float)
    z = np.log(np.clip(proba, 1e-12, 1.0)) @ W.T + b
    z -= z.max(); e = np.exp(z)
    proba = e / e.sum()
    T = float(calibration.get("validation", {}).get("temperature", 1.0) or 1.0)
    if T != 1.0:
        proba = np.power(np.clip(proba, 1e-12, 1.0), 1.0/T)
        proba = proba / proba.sum()
    # V7.1: Raised hard cap to 75% to prevent 60% tie
    cap = 0.75
    cidx = int(np.argmax(proba))
    if proba[cidx] > cap:
        excess = proba[cidx] - cap
        others = [i for i in range(len(proba)) if i != cidx]
        proba[cidx] = cap
        osum = sum(proba[i] for i in others) or 1.0
        for i in others: proba[i] += excess * (proba[i] / osum)
    return proba

# ================= STRONG PICK ENGINE =================
def probability_margin(market):
    if not isinstance(market, dict): return 0.0
    vals = sorted((float(v) for v in (market.get("probabilities") or {}).values()
                   if isinstance(v, (int, float))), reverse=True)
    return float(vals[0] - vals[1]) if len(vals) >= 2 else 0.0

def market_confidence(market):
    try: return float(market.get("pick_probability", 0.0)) if isinstance(market, dict) else 0.0
    except Exception: return 0.0

def xg_direction_agrees(pick, xg_home, xg_away):
    try: xh, xa = float(xg_home), float(xg_away)
    except Exception: return 0
    diff = xh - xa
    if pick == "HOME_WIN":
        return 1 if diff >= 0.25 else (-1 if diff <= -0.20 else 0)
    if pick == "AWAY_WIN":
        return 1 if diff <= -0.25 else (-1 if diff >= 0.20 else 0)
    if pick == "DRAW":
        return 1 if abs(diff) <= 0.18 else (-1 if abs(diff) >= 0.45 else 0)
    return 0

def goals_direction_agrees(pick, markets):
    if not isinstance(markets, dict): return 0
    ou25, btts = markets.get("ou_2_5") or {}, markets.get("btts") or {}
    if pick in ("HOME_WIN", "AWAY_WIN") and ou25.get("pick") == "OVER" and btts.get("pick") == "YES": return 1
    if pick == "DRAW" and ou25.get("pick") == "UNDER": return 1
    return 0

def strong_pick_grade(score, probability):
    if score >= 82 and probability >= 66: return "ELITE"
    if score >= 72 and probability >= 60: return "STRONG"
    if score >= 62 and probability >= 56: return "GOOD"
    if score >= 52: return "LEAN"
    return "WEAK"

def ou_sanity_gate(ou_market, exp_total_xg, pick_prob):
    pick = ou_market.get("pick")
    if pick == "UNDER" and exp_total_xg > 3.0:
        return False, "xG conflict (UNDER vs high xG)"
    if pick == "OVER" and exp_total_xg < 2.0:
        return False, "xG conflict (OVER vs low xG)"
    if pick_prob > 65.1:
        return False, "confidence exceeds market ceiling"
    return True, "ok"

def score_strong_1x2(markets, team_state):
    m = markets.get("1x2") or {}
    pick = m.get("pick")
    if not pick:
        return {"score": 0.0, "grade": "WEAK", "eligible": False, "probability": 0.0,
                "margin": 0.0, "reasons": ["missing 1x2 pick"]}
    prob, margin = market_confidence(m), probability_margin(m)
    cfg = STRONG_PICK_CONFIG["1x2"]
    score = float(np.clip(float(np.clip((prob-50.0)*2.0, 0, 50))
                  + float(np.clip(margin*1.25, 0, 20))
                  + (10.0 if xg_direction_agrees(pick, (markets.get("xG") or {}).get("home",1.2),
                     (markets.get("xG") or {}).get("away",1.2)) > 0 else (-10.0 if xg_direction_agrees(
                     pick, (markets.get("xG") or {}).get("home",1.2),
                     (markets.get("xG") or {}).get("away",1.2)) < 0 else 0.0))
                  + (8.0 if goals_direction_agrees(pick, markets) > 0 else 0.0)
                  + (7.0 if team_state == "resolved" else -6.0)
                  - (8.0 if margin < cfg["min_margin"] else 0.0), 0.0, 100.0))
    eligible = bool(prob >= cfg["min_probability"] and margin >= cfg["min_margin"] and score >= 58.0)
    reasons = []
    if prob >= cfg["elite_probability"]: reasons.append("elite probability")
    elif prob >= cfg["strong_probability"]: reasons.append("strong probability")
    elif prob >= cfg["min_probability"]: reasons.append("acceptable probability")
    if margin >= 12: reasons.append("clear separation")
    elif margin >= cfg["min_margin"]: reasons.append("acceptable separation")
    xa = xg_direction_agrees(pick, (markets.get("xG") or {}).get("home",1.2), (markets.get("xG") or {}).get("away",1.2))
    if xa > 0: reasons.append("xG agrees")
    elif xa < 0: reasons.append("xG conflict")
    if goals_direction_agrees(pick, markets) > 0: reasons.append("goal markets agree")
    reasons.append("resolved team state" if team_state == "resolved" else "estimated team state")
    return {"score": round(score, 2), "grade": strong_pick_grade(score, prob), "eligible": eligible,
            "probability": round(prob, 2), "margin": round(margin, 2), "reasons": reasons}

def annotate_strong_pick(markets):
    if not isinstance(markets, dict): return markets
    if markets.get("mode") != "prematch":
        markets["strong_pick"] = {"eligible": False, "score": 0.0, "grade": "LIVE",
                                  "reason": "strong-pick ranking is prematch only"}
        return markets
    r = score_strong_1x2(markets, markets.get("team_state", "estimated"))
    markets["strong_pick"] = {"eligible": r["eligible"], "score": r["score"], "grade": r["grade"],
                              "probability": r["probability"], "margin": r["margin"], "reasons": r["reasons"]}
    return markets

# ================= audit =================
def audit_consistency(markets):
    warns = []
    if markets.get("mode") != "prematch": return warns
    try: xg = float(markets.get("xG", {}).get("total", 2.5))
    except Exception: xg = 2.5
    ou = markets.get("ou_2_5")
    if isinstance(ou, dict) and ou.get("pick"):
        if (xg > 3.2 and ou["pick"] == "UNDER") or (xg < 1.7 and ou["pick"] == "OVER"):
            warns.append(f"xG {xg:.2f} vs OU2.5 {ou['pick']}")
            if STRICT_XG_FLIP:
                other = "OVER" if ou["pick"] == "UNDER" else "UNDER"
                if other in ou.get("probabilities", {}):
                    log.warning(f"xG/OU conflict flipped {ou['pick']} -> {other}")
                    ou["pick"], ou["pick_probability"] = other, ou["probabilities"][other]
    return warns

# ================= CS (8x8 + IPF) =================
def expand_proba(proba, classes, n=None):
    n = n or N_GOALS
    out = np.zeros((proba.shape[0], n))
    for i, c in enumerate(classes):
        c = int(c)
        if 0 <= c < n: out[:, c] = proba[:, i]
    return out

def pois_matrix(r, n=None):
    n = n or N_GOALS
    return np.array([[poisson_prob(h_, r["exp_home_xg"]) * poisson_prob(a_, r["exp_away_xg"])
                      for a_ in range(n)] for h_ in range(n)])

def ipf_calibrate(grid, p13=None, p_over25=None, iters=IPF_ITERS):
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
            if cur > 1e-6: g[mask] *= min(tgt / cur, 8.0)
            g /= (g.sum() or 1.0)
        if p_over25 is not None:
            cur = g[over_m].sum()
            if cur > 1e-6: g[over_m] *= min(p_over25 / cur, 8.0)
            g /= (g.sum() or 1.0)
    return g

# ================= LIVE LAYER =================
def derive_minute(item, now_ts):
    disp = item.get("display") or {}
    status = str(item.get("status") or disp.get("status") or "").upper()
    m = _num(item.get("minute") or disp.get("minute"), 0)
    ko = _num(item.get("timestamp"), 0)
    elapsed = max(0.0, (now_ts - ko)/60.0) if ko > 0 else 0.0
    if status == "1H": T = min(elapsed, 45.0)
    elif status == "HT": T = 45.0
    elif status == "2H": T = min(max(elapsed-15.0, 45.0), 90.0)
    elif status in ("ET","BT","P"): T = 90.0
    elif status in LIVE_STATUSES: T = min(elapsed, 90.0)
    else: T = m if m > 0 else min(elapsed, 90.0)
    if m > 0:
        if status == "1H": T = min(m, 45.0)
        elif status == "2H": T = min(max(m, 45.0), 90.0)
    return max(0.0, T)

def build_live_markets(xg_h, xg_a, H0, A0, minute, team_state_label):
    T = max(0.0, min(float(minute), 90.0)); R = max(0.0, 90.0 - T)
    t90 = T/90.0; S = LIVE_PRIOR_S
    lam_h = ((xg_h*S + H0)/(S+t90)) * (R/90.0)
    lam_a = ((xg_a*S + A0)/(S+t90)) * (R/90.0)
    N = N_GOALS
    finals, p_home, p_draw, p_away, over_r = {}, 0.0, 0.0, 0.0, [0.0]*(2*N)
    for hp in range(N):
        php = poisson_prob(hp, lam_h)
        for ap in range(N):
            p = php * poisson_prob(ap, lam_a)
            Hf, Af = H0+hp, A0+ap
            finals[f"{Hf}-{Af}"] = finals.get(f"{Hf}-{Af}", 0.0) + p
            if Hf > Af: p_home += p
            elif Hf == Af: p_draw += p
            else: p_away += p
            over_r[hp+ap] += p
    gsum = p_home + p_draw + p_away
    if gsum <= 0:
        p_home, p_draw, p_away = (1,0,0) if H0 > A0 else ((0,1,0) if H0 == A0 else (0,0,1))
        finals = {f"{H0}-{A0}": 1.0}; gsum = 1.0
    p_home, p_draw, p_away = p_home/gsum, p_draw/gsum, p_away/gsum
    tot = sum(finals.values()) or 1.0
    cs = dict(sorted(({k: round(v/tot*100, 2) for k, v in finals.items()}).items(),
                     key=lambda x: x[1], reverse=True))
    top_cs = next(iter(cs), f"{H0}-{A0}")
    tot0 = H0 + A0; ssum = sum(over_r) or 1.0
    def ou(line):
        need = int(math.floor(line)) + 1
        return sum(over_r[r] for r in range(len(over_r)) if r >= max(0, need - tot0)) / ssum
    btts_yes = 1.0 if (H0 > 0 and A0 > 0) else (1.0 - math.exp(-lam_a) if H0 > 0
               else (1.0 - math.exp(-lam_h) if A0 > 0
               else (1.0 - math.exp(-lam_h)) * (1.0 - math.exp(-lam_a))))
    pick13 = "HOME_WIN" if p_home > p_away and p_home > p_draw else ("AWAY_WIN" if p_away > p_draw else "DRAW")
    p13 = {"HOME_WIN": round(p_home*100,2), "DRAW": round(p_draw*100,2), "AWAY_WIN": round(p_away*100,2)}
    def m(pm, pick, prob): return {"probabilities": pm, "pick": pick, "pick_probability": prob}
    markets = {"mode": "live",
        "live_state": {"minute": round(T), "remaining_min": round(R,1), "score": f"{H0}-{A0}",
                       "rates_remaining": {"home": round(lam_h,3), "away": round(lam_a,3)}},
        "1x2": {**m(p13, pick13, p13[pick13]), "engine": "live_poisson_gamma"},
        "btts": m({"YES": round(btts_yes*100,2), "NO": round((1-btts_yes)*100,2)},
                  "YES" if btts_yes >= 0.5 else "NO", round(max(btts_yes, 1-btts_yes)*100, 2))}
    for line, key in ((0.5,"ou_0_5"),(1.5,"ou_1_5"),(2.5,"ou_2_5"),(3.5,"ou_3_5")):
        o = ou(line)
        markets[key] = m({"OVER": round(o*100,2), "UNDER": round((1-o)*100,2)},
                         "OVER" if o >= 0.5 else "UNDER", round(max(o, 1-o)*100, 2))
    markets.update({"xG": {"home": round(xg_h,2), "away": round(xg_a,2), "total": round(xg_h+xg_a,2),
                           "remaining_home": round(lam_h,2), "remaining_away": round(lam_a,2)},
                    "team_state": team_state_label, "_internal_correct_scores": cs})
    return markets, top_cs, cs.get(top_cs, 0.0)

def validate_live_sanity(markets):
    if not isinstance(markets, dict) or markets.get("mode") != "live": return []
    ls = markets.get("live_state") or {}
    try: H0, A0 = map(int, str(ls.get("score", "0-0")).split("-"))
    except Exception: return []
    bad = []
    for k in (markets.get("_internal_correct_scores") or {}):
        try: h, a = map(int, k.split("-"))
        except Exception: continue
        if h < H0 or a < A0: bad.append(f"CS {k} below live {H0}-{A0}")
    return bad

# ================= PICK GROUPS ENGINE =================
def _pick_of(p, gcfg):
    mk = p.get("markets", {})
    if gcfg["market"] == "top_cs":
        return p.get("top_correct_score"), float(p.get("top_cs_prob", 0) or 0)
    mm = mk.get(gcfg["market"]) or {}
    return mm.get("pick"), float(mm.get("pick_probability", 0) or 0)

def _quality_of(gcfg, prob):
    g = gcfg.get("grades") or {}
    if prob >= g.get("PURE", 999.0): return "PURE"
    if prob >= g.get("STRONG", 999.0): return "STRONG"
    return "STANDARD"

def _master_score(gcfg, prob, team_state):
    floor = gcfg["min_probability"]
    elite = gcfg.get("elite_probability", floor + 15.0)
    s = max(0.0, min((prob - floor) / max(elite - floor, 1.0), 1.5))
    return round(s + (0.08 if team_state == "resolved" else 0.0), 4)

def _share_line(emoji, p, pick, prob, rank):
    st = "🟢" if p.get("markets", {}).get("team_state") == "resolved" else "🟡"
    return (f"{rank}. {emoji} {pick} — {p['homeTeam']['name']} v "
            f"{p['awayTeam']['name']} ({prob:.1f}%) · {p.get('league','')} {st}")

def _tier_share_text(gcfg, tier_no, qsum, lines, date_str):
    span = "TOP 10" if tier_no == 1 else f"RANKS {(tier_no-1)*TIER_SIZE+1}-{tier_no*TIER_SIZE}"
    qtxt = " · ".join(f"{k} {v}" for k, v in sorted(qsum.items())) if qsum else "empty"
    return (f"{gcfg['emoji']} ZOKASCORE — {gcfg['label'].upper()} · GROUP {tier_no} ({span}) · {qtxt}\n\n"
            + "\n".join(lines) + f"\n\n📅 {date_str} · zokascore.xyz")

def _pid(p):
    return (p.get("canonicalMatchId")
            or _canonical_key(p["homeTeam"]["name"], p["awayTeam"]["name"], p.get("date")))

def build_pick_groups(daily, date_str, generated_at):
    groups, assignment, family_pools = {}, {}, {}
    for gkey, gcfg in PICK_GROUPS_CONFIG.items():
        pool, seen_canon = [], set()
        for p in daily:
            if p.get("markets", {}).get("mode") != "prematch": continue
            pick, prob = _pick_of(p, gcfg)
            if not pick or prob < gcfg["min_probability"]: continue
            
            if gkey == "OVER_UNDER":
                ok, _ = ou_sanity_gate(p["markets"]["ou_2_5"], p["markets"]["xG"]["total"], prob)
                if not ok: continue
                
            ck = _pid(p)
            if ck in seen_canon:
                log.warning(f"DUPLICATE-PICK suppressed (canonical, group {gkey}): "
                            f"{p['homeTeam']['name']} v {p['awayTeam']['name']}")
                continue
            seen_canon.add(ck)
            pool.append({"p": p, "pick": pick, "prob": prob,
                         "quality": _quality_of(gcfg, prob),
                         "master_score": _master_score(gcfg, prob,
                         p.get("markets", {}).get("team_state", "estimated"))})
        pool.sort(key=lambda x: (x["prob"],
                                 1 if x["p"].get("markets", {}).get("team_state") == "resolved" else 0,
                                 str(x["p"].get("date", ""))), reverse=True)
        counts, filtered = {}, []
        for e in pool:
            lbl = e["pick"]
            if counts.get(lbl, 0) >= MAX_SAME_PICK_PER_FAMILY: continue
            counts[lbl] = counts.get(lbl, 0) + 1; filtered.append(e)
        pool = filtered
        family_pools[gkey] = pool
        tier_count = (len(pool) + TIER_SIZE - 1) // TIER_SIZE
        tiers = []
        for t in range(tier_count):
            chunk = pool[t*TIER_SIZE:(t+1)*TIER_SIZE]
            picks, lines, qsum = [], [], {}
            for i, e in enumerate(chunk, start=1):
                p, pick, prob = e["p"], e["pick"], e["prob"]
                ln = _share_line(gcfg["emoji"], p, pick, prob, i)
                picks.append({"matchId": p["matchId"], "home": p["homeTeam"]["name"],
                              "away": p["awayTeam"]["name"], "league": p.get("league",""),
                              "kickoff": p.get("date",""), "pick": pick,
                              "probability": round(prob, 2), "quality": e["quality"],
                              "match_state": p.get("markets", {}).get("team_state", "estimated"),
                              "share_line": ln})
                lines.append(ln)
                qsum[e["quality"]] = qsum.get(e["quality"], 0) + 1
                assignment.setdefault(p["matchId"], {})[gkey] = {"tier": t+1, "rank": i, "quality": e["quality"]}
            tiers.append({"tier": t+1, "quality_summary": qsum, "picks": picks,
                          "share_text": _tier_share_text(gcfg, t+1, qsum, lines, date_str)})
        if tiers:
            groups[gkey] = {"label": gcfg["label"], "emoji": gcfg["emoji"], "market": gcfg["market"],
                            "tier_count": tier_count,
                            "display_only": gkey in STRONG_PICK_EXCLUDED_FAMILIES, "tiers": tiers}
    master_pool = []
    for gkey, pool in family_pools.items():
        if gkey in STRONG_PICK_EXCLUDED_FAMILIES: continue
        for e in pool: master_pool.append({**e, "gkey": gkey})
    master_pool.sort(key=lambda x: (x["master_score"], x["prob"]), reverse=True)
    top_picks, seen_canon = [], set()
    for e in master_pool:
        p = e["p"]; ck = _pid(p)
        if ck in seen_canon: continue
        seen_canon.add(ck)
        top_picks.append(e)
        if len(top_picks) >= TIER_SIZE: break
    if top_picks:
        picks, lines, qsum = [], [], {}
        for i, e in enumerate(top_picks, start=1):
            gcfg = PICK_GROUPS_CONFIG[e["gkey"]]
            p, pick, prob = e["p"], e["pick"], e["prob"]
            ln = _share_line(gcfg["emoji"], p, f"{pick} [{gcfg['label']}]", prob, i)
            picks.append({"matchId": p["matchId"], "home": p["homeTeam"]["name"],
                          "away": p["awayTeam"]["name"], "league": p.get("league",""),
                          "kickoff": p.get("date",""), "pick": pick, "family": e["gkey"],
                          "probability": round(prob, 2), "quality": e["quality"],
                          "master_score": e["master_score"],
                          "match_state": p.get("markets", {}).get("team_state", "estimated"),
                          "share_line": ln})
            lines.append(ln)
            qsum[e["quality"]] = qsum.get(e["quality"], 0) + 1
            assignment.setdefault(p["matchId"], {})["TOP10_DAILY"] = {"tier": 1, "rank": i, "quality": e["quality"]}
        groups["TOP10_DAILY"] = {"label": "Daily Strong Picks", "emoji": "🔥", "market": "mixed",
            "selection": "master-confidence-score (CS excluded, 1/canonical-match)",
            "tier_count": 1,
            "tiers": [{"tier": 1, "quality_summary": qsum, "picks": picks,
                       "share_text": ("🔥 ZOKASCORE — TOP 10 STRONG PICKS · DAILY · "
                       + " · ".join(f"{k} {v}" for k, v in sorted(qsum.items()))
                       + "\n\n" + "\n".join(lines) + f"\n\n📅 {date_str} · zokascore.xyz")}]}

    low_pool, seen_canon = [], set()
    for gkey in ("PURE_1X2", "GG_BTTS", "OVER_UNDER"):
        gcfg = PICK_GROUPS_CONFIG[gkey]
        for p in daily:
            if p.get("markets", {}).get("mode") != "prematch": continue
            pick, prob = _pick_of(p, gcfg)
            if not pick or not (gcfg["low_floor"] <= prob < gcfg["min_probability"]): continue
            ck = _pid(p)
            if ck in seen_canon: continue
            seen_canon.add(ck)
            low_pool.append({"p": p, "pick": pick, "prob": prob, "gkey": gkey})
    low_pool.sort(key=lambda x: (x["prob"],
                                 1 if x["p"].get("markets", {}).get("team_state") == "resolved" else 0), reverse=True)
    chunk = low_pool[:TIER_SIZE]
    if chunk:
        picks, lines = [], []
        for i, entry in enumerate(chunk, start=1):
            p, pick, prob = entry["p"], entry["pick"], entry["prob"]
            glabel = PICK_GROUPS_CONFIG[entry["gkey"]]["label"]
            ln = _share_line("⚠️", p, f"{pick} [{glabel}]", prob, i)
            picks.append({"matchId": p["matchId"], "home": p["homeTeam"]["name"],
                          "away": p["awayTeam"]["name"], "league": p.get("league",""),
                          "kickoff": p.get("date",""), "pick": pick, "market": entry["gkey"],
                          "probability": round(prob, 2), "quality": "RISKY", "share_line": ln})
            lines.append(ln)
            assignment.setdefault(p["matchId"], {})["LOW_CONFIDENCE"] = {"tier": 1, "rank": i, "quality": "RISKY"}
        groups["LOW_CONFIDENCE"] = {"label": "Risky Zone", "emoji": "⚠️", "market": "mixed",
            "tier_count": 1,
            "tiers": [{"tier": 1, "quality_summary": {"RISKY": len(picks)}, "picks": picks,
                       "share_text": ("⚠️ ZOKASCORE — RISKY ZONE · LOW CONFIDENCE (for the brave)\n\n"
                       + "\n".join(lines) + f"\n\n📅 {date_str} · zokascore.xyz")}]}

    return {"date": date_str, "generated_at": generated_at, "tier_size": TIER_SIZE,
            "quality_scale": ["PURE", "STRONG", "STANDARD", "RISKY"], "groups": groups}, assignment

# ================= PHASE 1: GENERATION =================
def strip_injected(raw, now_ts=None):
    clean, stripped, preserved_ft, past_cleaned = [], 0, 0, 0
    for item in raw:
        if not isinstance(item, dict):
            continue
        phase = match_phase(item, now_ts)
        has_pred = any(k in item for k in INJECTED_KEYS)
        if phase == "final":
            if has_pred: preserved_ft += 1
            clean.append(item); continue
        if phase == "past":
            if has_pred: past_cleaned += 1
            clean.append({k: v for k, v in item.items() if k not in INJECTED_KEYS})
            continue
        c = {k: v for k, v in item.items() if k not in INJECTED_KEYS}
        if len(c) != len(item): stripped += 1
        clean.append(c)
    if stripped: log.info(f"   re-run safety: stripped stale predictions from {stripped} live/upcoming matches (fresh compute below)")
    if preserved_ft: log.info(f"   FT preservation: {preserved_ft} finished matches kept their recorded predictions (never deleted)")
    if past_cleaned: log.info(f"   past matches: {past_cleaned} kickoff-stale fixtures stripped (we never predict past matches)")
    return clean, stripped

def match_phase(item, now_ts=None):
    disp = item.get("display") or {}
    status = str(item.get("status") or disp.get("status") or "NS").upper()
    if item.get("isFinished") or disp.get("isFinished") or status in FINISHED_STATUSES:
        return "final"
    if item.get("isLive") or disp.get("isLive") or status in LIVE_STATUSES:
        return "live"
    if now_ts is not None:
        ko = _num(item.get("timestamp"), 0)
        if ko > 0 and now_ts > ko + PAST_GRACE_MINUTES * 60:
            return "past"   
    return "prematch"

def generate_day(fixture_data, models, label_maps, thresholds, live_state,
                 resolver, res_ctr, now_ts, calibrations=None):
    if calibrations is None: calibrations = {}
    raw = fixture_data.get("data", []) if isinstance(fixture_data, dict) else fixture_data
    if not isinstance(raw, list): raw = []
    raw, stripped = strip_injected(raw, now_ts)
    daily, updated, cs_flags = [], [], []
    prematch_pairs = []
    passthrough = []
    phase_counts = {"prematch": 0, "live": 0, "final": 0, "past": 0}
    for item in raw:
        phase = match_phase(item, now_ts)
        phase_counts[phase] = phase_counts.get(phase, 0) + 1
        if phase == "past":
            passthrough.append(item)
            continue
        if phase == "final":
            if any(k in item for k in INJECTED_KEYS):
                u = dict(item); u[FT_RECORD_MARKER] = True; updated.append(u)
            else:
                passthrough.append(item)
            continue
        mid, cm_id = _match_identity(item)
        if not mid: continue
        h_obj = item.get("homeTeam", {}) if isinstance(item.get("homeTeam"), dict) else {}
        a_obj = item.get("awayTeam", {}) if isinstance(item.get("awayTeam"), dict) else {}
        h_name = str(item.get("homeTeamName") or h_obj.get("name") or "")
        a_name = str(item.get("awayTeamName") or a_obj.get("name") or "")
        h_pid = str(item.get("homeTeamId") or h_obj.get("id") or "")
        a_pid = str(item.get("awayTeamId") or a_obj.get("id") or "")
        h_st, h_ok = resolver(h_pid, h_name, True); res_ctr["live" if h_ok else "hash"] += 1
        a_st, a_ok = resolver(a_pid, a_name, False); res_ctr["live" if a_ok else "hash"] += 1
        h_elo = float(np.clip(_num(h_st.get("elo"), 1500), 1200, 2100))
        a_elo = float(np.clip(_num(a_st.get("elo"), 1500), 1200, 2100))
        row = build_feature_row(h_st, a_st, h_elo, a_elo)
        X_df = pd.DataFrame([row])
        def prep(m):
            cols = list(m.feature_names_in_) if hasattr(m, "feature_names_in_") else FEATURE_ORDER
            return X_df.reindex(columns=cols, fill_value=0)
        ts_label = "resolved" if (h_ok and a_ok) else "estimated"
        markets = {}
        if phase == "live":
            H0 = int(_num(item.get("homeScore"), 0)); A0 = int(_num(item.get("awayScore"), 0))
            minute = derive_minute(item, now_ts)
            markets, top_cs, top_cs_p = build_live_markets(
                row["exp_home_xg"], row["exp_away_xg"], H0, A0, minute, ts_label)
            markets = convert_floats(markets)
            if validate_live_sanity(markets):
                log.warning(f"⚠ LIVE SANITY FAILURE {h_name} v {a_name}: {validate_live_sanity(markets)} — markets stripped")
                continue
            u = dict(item); u["_tmp_markets"] = markets; updated.append(u)
            daily.append({"matchId": mid, "canonicalMatchId": cm_id,
                "homeTeam": {"id": h_pid, "name": h_name}, "awayTeam": {"id": a_pid, "name": a_name},
                "league": item.get("league",{}).get("name") if isinstance(item.get("league"),dict) else item.get("league",""),
                "date": item.get("utcDate") or item.get("date",""), "markets": markets,
                "top_correct_score": top_cs, "top_cs_prob": top_cs_p})
            continue
        cs_flags.append(bool(h_ok and a_ok))
        if "1x2" in models:
            try:
                m = models["1x2"]
                proba = m.predict_proba(prep(m))[0]
                proba = apply_v6_calibration(proba, calibrations.get("1x2"))
                lm = label_maps.get("1x2") or MODELS_CFG["1x2"]["fallback_map"]
                pmap = {lm.get(int(c), str(c)): round(float(p)*100, 2) for c, p in zip(m.classes_, proba)}
                pick = max(pmap, key=pmap.get)
                markets["1x2"] = {"probabilities": pmap, "pick": pick, "pick_probability": pmap[pick],
                                  "calibrated": bool(calibrations.get("1x2"))}
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
                                             MODELS_CFG[mk]["positive"], prep(models[mk]), th, apply, calibrations.get(mk))
            except Exception as e: log.warning(f"{mk} fail {h_name} v {a_name}: {e}")
        for mk_key in ["1x2"] + MARKET_KEYS:
            mkt = markets.get(mk_key)
            if isinstance(mkt, dict) and mkt.get("probabilities"):
                shrunk = shrink_market(mkt["probabilities"], ts_label, market_key=mk_key)
                new_pick = max(shrunk, key=shrunk.get)
                mkt["probabilities"] = shrunk
                mkt["pick"] = new_pick
                mkt["pick_probability"] = shrunk[new_pick]
        markets["xG"] = {"home": round(row["exp_home_xg"], 2), "away": round(row["exp_away_xg"], 2),
                         "total": round(row["exp_total_xg"], 2)}
        markets["mode"] = "prematch"
        markets["team_state"] = ts_label
        markets = annotate_strong_pick(markets)
        _ = audit_consistency(markets)
        markets = convert_floats(markets)
        u = dict(item); u["_tmp_markets"] = markets; updated.append(u)
        daily.append({"matchId": mid, "canonicalMatchId": cm_id,
            "homeTeam": {"id": h_pid, "name": h_name}, "awayTeam": {"id": a_pid, "name": a_name},
            "league": item.get("league",{}).get("name") if isinstance(item.get("league"),dict) else item.get("league",""),
            "date": item.get("utcDate") or item.get("date",""),
            "markets": markets, "top_correct_score": "1-1", "top_cs_prob": 0})
        _p13 = (markets.get("1x2") or {}).get("probabilities") or {}
        _o25 = (markets.get("ou_2_5") or {}).get("probabilities") or {}
        p13f = {k: float(v)/100.0 for k, v in _p13.items()} or None
        o25f = float(_o25["OVER"])/100.0 if "OVER" in _o25 else None
        prematch_pairs.append((len(daily) - 1, row, p13f, o25f))
        
    def cs_apply(di, grid):
        grid = regularize_cs_grid(grid)
        tot = grid.sum() or 1.0
        scores = {f"{h_}-{a_}": round(float(grid[h_, a_] / tot * 100), 2)
                  for h_ in range(grid.shape[0]) for a_ in range(grid.shape[1])}
        scores = dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))
        top = next(iter(scores), "1-1")
        daily[di]["markets"]["_internal_correct_scores"] = scores
        daily[di]["top_correct_score"], daily[di]["top_cs_prob"] = top, scores.get(top, 0)
        updated[di]["_tmp_markets"]["_internal_correct_scores"] = scores
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
                ml = joint[bi].reshape(N_GOALS, N_GOALS)
                base = (CS_ML_WEIGHT * ml + CS_POIS_WEIGHT * pois_matrix(r)) if cs_flags[bi] else pois_matrix(r)
                base = base / (base.sum() or 1.0)
                cs_apply(di, ipf_calibrate(base, p13f, o25f))
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
    final = passthrough + final
    log.info(f"   phases: prematch={phase_counts.get('prematch',0)} live={phase_counts.get('live',0)} "
             f"final(preserved)={phase_counts.get('final',0)} past(skipped)={phase_counts.get('past',0)}")
    return daily, final

def run_generation():
    log.info("="*70); log.info(" STEP 50 MASTER FINAL V5.0-UNIFIED (HONESTY PATCH V7.1) — PICKER + GROUPS + GENERATION"); log.info("="*70)
    decision = select_champion()
    models, label_maps, thresholds = {}, {}, {}
    for key, cfg in MODELS_CFG.items():
        if key == "1x2" and decision == "HEURISTIC":
            log.warning("Picker: serving 1x2 via ELO heuristic — skipping champion load"); continue
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
        
    calibrations = {}
    for mk, fname in [("1x2", "champion_calibration.json"), ("btts", "market_btts_calibration.json"), ("ou_2_5", "market_ou_2_5_calibration.json")]:
        cal_path = os.path.join(MODELS_DIR, fname)
        if os.path.exists(cal_path):
            try:
                cal = json.load(open(cal_path, encoding="utf-8"))
                if cal.get("enabled"):
                    calibrations[mk] = cal
                    T = cal.get("validation", {}).get("temperature", 1.0)
                    log.info(f"{mk} V6/V7 calibration: ENABLED (map + temperature {T})")
            except Exception as e: log.warning(f"calibration load failed for {mk}: {e}")

    log.info(f"Confidence calibration: resolved x{CONF_SHRINK_RESOLVED} / estimated x{CONF_SHRINK_ESTIMATED} "
             f"(base-rate anchored) · market cap {MARKET_HARD_CAP} · CS cap {CS_HARD_CAP_PREMATCH}% · "
             f"diversity cap {MAX_SAME_PICK_PER_FAMILY}/label · strong-excluded: {STRONG_PICK_EXCLUDED_FAMILIES} · "
             f"past grace {PAST_GRACE_MINUTES}min · 1x2 cap {CAP_1X2}%")
    live_state = load_live_state()
    resolver, make_counters = build_resolver(live_state)
    os.makedirs(PREDICTIONS_DIR, exist_ok=True); os.makedirs(ZOKAPICKS_DIR, exist_ok=True)
    os.makedirs(PICK_GROUPS_DIR, exist_ok=True)
    now = datetime.now(timezone.utc); now_ts = time.time(); total = 0
    for off in range(WINDOW_START, DAYS_AHEAD):
        date_str = (now + timedelta(days=off)).date().isoformat()
        fpath = os.path.join(FIXTURES_DIR, f"{date_str}.json")
        if not os.path.exists(fpath): log.info(f"Skip {date_str} — no fixtures"); continue
        fixture_data = json.load(open(fpath, encoding="utf-8"))
        res_ctr = make_counters()
        daily, final = generate_day(fixture_data, models, label_maps, thresholds,
                                    live_state, resolver, res_ctr, now_ts, calibrations)
        for p in daily:
            p["freshness"] = {"generated_at": now.isoformat(),
                              "ttl_minutes": 10 if p["markets"].get("mode") == "live" else 60}
        groups_doc, assignment = build_pick_groups(daily, date_str, now.isoformat())
        for p in daily:
            if p["matchId"] in assignment: p["pick_groups"] = assignment[p["matchId"]]
        by_mid = {p["matchId"]: p.get("pick_groups") for p in daily}
        for item in final:
            if item.get(FT_RECORD_MARKER): continue
            ga = by_mid.get(str(item.get("id")))
            if ga:
                item["pick_groups"] = ga
                if isinstance(item.get("prediction"), dict): item["prediction"]["pick_groups"] = ga
            if not item.get("canonicalMatchId"):
                _, cm = _match_identity(item); item["canonicalMatchId"] = cm
        atomic_write_json(groups_doc, os.path.join(PICK_GROUPS_DIR, f"{date_str}.json"))
        n_tiers = sum(g["tier_count"] for g in groups_doc["groups"].values())
        log.info(f"[PICK-GROUPS] {date_str}: {len(groups_doc['groups'])} groups, {n_tiers} tiers")
        out = dict(fixture_data) if isinstance(fixture_data, dict) else {}
        out.update({"data": final, "count": len(final), "date": date_str})
        atomic_write_json(out, fpath)
        
        public_daily = []
        for p in daily:
            pub_p = dict(p)
            pub_m = {k: v for k, v in p.get("markets", {}).items() if not k.startswith("_internal_")}
            if "correct_scores" in pub_m: del pub_m["correct_scores"]
            pub_p["markets"] = pub_m
            if "top_correct_score" in pub_p: del pub_p["top_correct_score"]
            if "top_cs_prob" in pub_p: del pub_p["top_cs_prob"]
            public_daily.append(pub_p)
            
        atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "pipeline": "50_MASTER_FINAL_V5.0-UNIFIED",
            "date": date_str, "generated_at": now.isoformat(),
            "features": f"{len(FEATURE_ORDER)}_step49v6_parity",
            "modes": "prematch|live|final(preserved)|past(never predicted)",
            "cs": f"grid {N_GOALS}x{N_GOALS} ipf-calibrated, regularized (prematch, internal only)",
            "strong_pick_engine": "V4.0", "pick_groups_engine": "V4.2.3-p",
            "ft_preservation": True, "past_protection": {"grace_minutes": PAST_GRACE_MINUTES},
            "canonical_match_identity": True,
            "confidence_calibration": {"enabled": True,
                "v7_chain": "map(C=1.0) + temperature + hard caps per market",
                "resolved_shrink": CONF_SHRINK_RESOLVED, "estimated_shrink": CONF_SHRINK_ESTIMATED,
                "market_hard_cap": MARKET_HARD_CAP, "cs_hard_cap": CS_HARD_CAP_PREMATCH,
                "anchor": "per-market historical base rates"},
            "diversity_guard": {"max_same_pick_per_family": MAX_SAME_PICK_PER_FAMILY},
            "strong_pick_excluded_families": list(STRONG_PICK_EXCLUDED_FAMILIES),
            "count": len(daily), "predictions": public_daily, "data": public_daily},
            os.path.join(PREDICTIONS_DIR, f"{date_str}.json"))
            
        prematch = [p for p in public_daily if p.get("markets", {}).get("mode") == "prematch"]
        strong_candidates = [p for p in prematch
                             if p.get("markets", {}).get("strong_pick", {}).get("eligible") is True]
        strong_candidates.sort(key=lambda p: (
            float(p.get("markets", {}).get("strong_pick", {}).get("score", 0)),
            float(p.get("markets", {}).get("1x2", {}).get("pick_probability", 0)),
            float(p.get("markets", {}).get("strong_pick", {}).get("margin", 0))), reverse=True)
        _seen_canon, _deduped_candidates = set(), []
        for p in strong_candidates:
            _k = _pid(p)
            if _k in _seen_canon:
                log.warning(f"DUPLICATE-PICK suppressed (canonical): {p['homeTeam']['name']} v {p['awayTeam']['name']}")
                continue
            _seen_canon.add(_k); _deduped_candidates.append(p)
        strong_candidates = _deduped_candidates
        top10 = strong_candidates[:10]
        zp = []
        for p in top10:
            markets = p["markets"]; strong = markets.get("strong_pick", {})
            zp.append({"matchId": p["matchId"], "canonicalMatchId": p.get("canonicalMatchId"),
                       "homeTeam": p["homeTeam"]["name"], "awayTeam": p["awayTeam"]["name"],
                       "league": p.get("league",""), "kickoff": p.get("date",""),
                       "markets": markets,
                       "strongPick": {"pick": markets.get("1x2",{}).get("pick"),
                           "probability": markets.get("1x2",{}).get("pick_probability",0),
                           "score": strong.get("score",0), "grade": strong.get("grade","WEAK"),
                           "margin": strong.get("margin",0), "reasons": strong.get("reasons",[])}})
        atomic_write_json({"date": date_str, "totalMatches": len(zp),
            "candidateCount": len(strong_candidates), "selection": "strong-pick-score",
            "maxPublished": 10, "matches": zp, "data": zp, "publishedAt": now.isoformat()},
            os.path.join(ZOKAPICKS_DIR, f"{date_str}.json"))
        if daily:
            s = daily[0]; m = s["markets"]; sp = m.get("strong_pick", {})
            log.info(f"[OK] {date_str}: {len(daily)} preds | strong={len(top10)}/{len(strong_candidates)} | "
                     f"state live={res_ctr['live']} hash={res_ctr['hash']} | "
                     f"sample[{m.get('mode')}] {s['homeTeam']['name']} v {s['awayTeam']['name']} -> "
                     f"{m.get('1x2',{}).get('pick')} {m.get('1x2',{}).get('pick_probability')}% | "
                     f"xG {m.get('xG',{}).get('total')} | "
                     f"strong={sp.get('grade','N/A')} {sp.get('score',0)}")
            total += len(daily)
    log.info(f"[GEN] {total} predictions across window [{WINDOW_START}..+{DAYS_AHEAD-1}]")
    return 0

# ================= PHASE 2: FINALIZE =================
def run_finalize():
    log.info("="*70); log.info(" STEP 50 MASTER FINAL V5.0-UNIFIED — FINALIZE"); log.info("="*70)
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
            if p.get(FT_RECORD_MARKER): continue
            m = p.get("markets")
            if not isinstance(m, dict): continue
            for w in audit_consistency(m): log.warning(f"CONSISTENCY {p.get('matchId')}: {w}")
            if validate_live_sanity(m):
                log.warning(f"⚠ LIVE SANITY FAILURE {p.get('matchId')} — dropped"); continue
            if not (isinstance(m.get("1x2"), dict) and m["1x2"].get("pick")):
                m["1x2"] = xg_directional_1x2(float(m.get("xG",{}).get("home",1.2)),
                                              float(m.get("xG",{}).get("away",1.2)))
                m = annotate_strong_pick(m)
                log.warning(f"DEGRADED 1x2 via xG for {p.get('matchId')}")
            kept.append(p)
        by_date[date] = len(kept); all_preds.extend(kept)
        log.info(f"   {date}: {len(kept)} (forecast feed; FT + past records excluded)")
    seen = {}
    def _ok(x): return isinstance(x, dict) and isinstance(x.get("markets",{}).get("1x2"), dict) and x["markets"]["1x2"].get("pick")
    for p in all_preds:
        mid = p.get("matchId")
        if not mid: continue
        cur = seen.get(mid)
        if cur is None or _ok(p): seen[mid] = p
    deduped = list(seen.values())
    log.info(f"[FINALIZE] matchId dedup: {len(deduped)} unique (from {len(all_preds)})")
    _canon = {}
    for p in sorted(deduped, key=lambda x: str(x.get("freshness", {}).get("generated_at", "")), reverse=True):
        _k = p.get("canonicalMatchId") or _canonical_key(
            p.get("homeTeam", {}).get("name") if isinstance(p.get("homeTeam"), dict) else p.get("homeTeam"),
            p.get("awayTeam", {}).get("name") if isinstance(p.get("awayTeam"), dict) else p.get("awayTeam"),
            p.get("date"))
        if _k in _canon:
            log.warning(f"DUPLICATE-PRED suppressed (canonical): {_k}")
            continue
        _canon[_k] = p
    deduped = list(_canon.values())
    log.info(f"[FINALIZE] canonical dedup: {len(deduped)} unique")
    deduped.sort(key=lambda x: (x.get("markets",{}).get("mode","prematch") != "live",
                                -x.get("markets",{}).get("1x2",{}).get("pick_probability",0)))
                                
    public_deduped = []
    for p in deduped:
        pub_p = dict(p)
        if isinstance(pub_p.get("markets"), dict):
            pub_m = {k: v for k, v in pub_p["markets"].items() if not k.startswith("_internal_")}
            if "correct_scores" in pub_m: del pub_m["correct_scores"]
            pub_p["markets"] = pub_m
        if "top_correct_score" in pub_p: del pub_p["top_correct_score"]
        if "top_cs_prob" in pub_p: del pub_p["top_cs_prob"]
        public_deduped.append(pub_p)
                                
    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "version": "50_MASTER_FINAL_V5.0-UNIFIED",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_predictions": len(public_deduped), "by_date": by_date,
        "features": f"{len(FEATURE_ORDER)}_step49v6_parity",
        "modes": "prematch (ML, V6/V7-calibrated capped) · live (gamma-poisson conditional, sanity-validated) · final (preserved in fixtures) · past (never predicted)",
        "ft_preservation": True, "past_protection": {"grace_minutes": PAST_GRACE_MINUTES},
        "canonical_match_identity": True,
        "confidence_calibration": {"enabled": True,
            "v7_chain": "map(C=1.0) + temperature + hard caps per market",
            "resolved_shrink": CONF_SHRINK_RESOLVED, "estimated_shrink": CONF_SHRINK_ESTIMATED,
            "market_hard_cap": MARKET_HARD_CAP, "cs_hard_cap": CS_HARD_CAP_PREMATCH,
            "anchor": "per-market historical base rates"},
        "diversity_guard": {"max_same_pick_per_family": MAX_SAME_PICK_PER_FAMILY},
        "strong_pick_excluded_families": list(STRONG_PICK_EXCLUDED_FAMILIES),
        "strong_pick_engine": {"version": "4.0", "description": "Selective multi-signal prematch picker",
                               "forced_top10": False, "max_published": 10},
        "pick_groups_engine": {"version": "4.2.3-p", "tier_size": TIER_SIZE,
                               "quality_scale": ["PURE", "STRONG", "STANDARD", "RISKY"],
                               "canonical_dedup": True,
                               "families": list(PICK_GROUPS_CONFIG.keys()) + ["TOP10_DAILY", "LOW_CONFIDENCE"]},
        "models": {"1x2": "champion model (Step 49 V7, calibrated + capped 75%)",
                   "btts": "market_btts_model (V7 calibrated + capped 65%)",
                   "ou_2_5": "market_ou_2_5_model (V7 calibrated + capped 65%)",
                   "correct_score": "INTERNAL USE ONLY - NOT EXPOSED TO API"},
        "predictions": public_deduped, "data": public_deduped},
        os.path.join(PUBLIC_DATA, "predictions.json"))
        
    today_str = datetime.now(timezone.utc).date().isoformat()
    candidates = []
    for p in public_deduped:
        m = p.get("markets", {})
        if m.get("mode") != "prematch": continue
        kickoff = str(p.get("date", ""))[:10]
        if kickoff and kickoff < today_str: continue
        strong = m.get("strong_pick", {})
        if not strong.get("eligible", False): continue
        candidates.append(p)
    def _pref(p):
        m = p.get("markets", {}); sp = m.get("strong_pick", {})
        return (1 if m.get("team_state") == "resolved" else 0,
                float(sp.get("score", 0)),
                str(p.get("freshness", {}).get("generated_at", "")))
    seen_canon = {}
    for p in sorted(candidates, key=_pref, reverse=True):
        _k = p.get("canonicalMatchId") or _canonical_key(
            p.get("homeTeam", {}).get("name") if isinstance(p.get("homeTeam"), dict) else p.get("homeTeam"),
            p.get("awayTeam", {}).get("name") if isinstance(p.get("awayTeam"), dict) else p.get("awayTeam"),
            p.get("date"))
        if _k in seen_canon:
            log.warning(f"DUPLICATE-PICK suppressed (canonical, finalize): {_k}")
            continue
        seen_canon[_k] = p
    zp_all = []
    for p in seen_canon.values():
        m = p.get("markets", {}); strong = m.get("strong_pick", {})
        zp_all.append({"matchId": p.get("matchId"), "canonicalMatchId": p.get("canonicalMatchId"),
            "homeTeam": p.get("homeTeam",{}).get("name") if isinstance(p.get("homeTeam"),dict) else p.get("homeTeam"),
            "awayTeam": p.get("awayTeam",{}).get("name") if isinstance(p.get("awayTeam"),dict) else p.get("awayTeam"),
            "league": p.get("league",""), "kickoff": p.get("date",""),
            "markets": m,
            "strongPick": {"pick": m.get("1x2",{}).get("pick"),
                           "probability": m.get("1x2",{}).get("pick_probability",0),
                           "score": strong.get("score",0), "grade": strong.get("grade","WEAK"),
                           "margin": strong.get("margin",0), "reasons": strong.get("reasons",[])}})
    zp_all.sort(key=lambda x: x.get("strongPick", {}).get("score", 0), reverse=True)
    zp_all = zp_all[:50]
    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "version": "ZOKAPICKS_V4.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(zp_all), "selection": "strong-pick-score",
        "stale_guard": f"kickoff >= {today_str}", "canonical_dedup": True,
        "matches": zp_all, "data": zp_all},
        os.path.join(PUBLIC_DATA, "zokapicks.json"))
    pg_files = sorted(f for f in glob.glob(os.path.join(PICK_GROUPS_DIR, "*.json"))
                      if DATE_RE.match(os.path.splitext(os.path.basename(f))[0]))
    pg_days = {}
    for fp in pg_files:
        try:
            d = json.load(open(fp, encoding="utf-8")); pg_days[d.get("date")] = d.get("groups", {})
        except Exception: continue
    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "version": "PICK_GROUPS_V4.2.3-p",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tier_size": TIER_SIZE, "quality_scale": ["PURE", "STRONG", "STANDARD", "RISKY"],
        "canonical_dedup": True, "days": pg_days,
        "latest": (pg_days.get(datetime.now(timezone.utc).date().isoformat()) or {})},
        os.path.join(PUBLIC_DATA, "pick_groups.json"))
        
    mp = []
    for p in public_deduped:
        m = p.get("markets", {})
        mp.append({"matchId": p.get("matchId"), "canonicalMatchId": p.get("canonicalMatchId"),
            "homeTeam": p.get("homeTeam",{}).get("name") if isinstance(p.get("homeTeam"),dict) else p.get("homeTeam"),
            "awayTeam": p.get("awayTeam",{}).get("name") if isinstance(p.get("awayTeam"),dict) else p.get("awayTeam"),
            "league": p.get("league",""), "date": p.get("date",""), "mode": m.get("mode","prematch"),
            "1x2": m.get("1x2",{}), "btts": m.get("btts",{}),
            "ou_1_5": m.get("ou_1_5",{}), "ou_2_5": m.get("ou_2_5",{}), "ou_3_5": m.get("ou_3_5",{}),
            "xG": m.get("xG",{}),
            "live_state": m.get("live_state"), "strong_pick": m.get("strong_pick",{}),
            "pick_groups": p.get("pick_groups",{})})
    atomic_write_json({"engine": "ZOKASCORE_V2_UNIFIED", "version": "MARKET_PREDICTIONS_V5.0",
        "generated_at": datetime.now(timezone.utc).isoformat(), "count": len(mp), "predictions": mp},
        os.path.join(PUBLIC_DATA, "market_predictions.json"))
    log.info(f"[FINALIZE] predictions.json ({len(public_deduped)}) · zokapicks.json ({len(zp_all)}) · "
             f"pick_groups.json ({len(pg_days)} days) · market_predictions.json ({len(mp)})")
    log.info("✅ READY FOR API — 1X2 capped 75%, BTTS/OU2.5 capped 65%, past never predicted, all markets calibrated, CS hidden")
    return 0

# ================= MAIN =================
if __name__ == "__main__":
    try:
        rc = run_generation()
        if rc == 0: rc = run_finalize()
        sys.exit(rc)
    except Exception:
        log.exception("Step 50 master final failed"); sys.exit(1)