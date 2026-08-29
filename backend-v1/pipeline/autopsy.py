"""Match autopsy: full inference trace for one fixture.
Usage: python pipeline/autopsy.py 2026-08-29 Tottenham"""
import json, os, sys, re
import importlib.util
import pandas as pd, numpy as np, joblib

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "s50", os.path.join(BASE, "pipeline", "50-generate-daily-predictions.py"))
s50 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s50)

date, needle = sys.argv[1], sys.argv[2]
fx = json.load(open(os.path.join(BASE, "public_data", "fixtures", f"{date}.json"), encoding="utf-8"))
items = fx.get("data", [])
item = next((m for m in items if needle.lower() in
             (str(m.get("homeTeamName", "")) + str(m.get("awayTeamName", ""))).lower()), None)
if not item:
    sys.exit(f"match '{needle}' not found in {date}")

h_name = item.get("homeTeamName") or (item.get("homeTeam") or {}).get("name")
a_name = item.get("awayTeamName") or (item.get("awayTeam") or {}).get("name")
h_pid = str(item.get("homeTeamId") or (item.get("homeTeam") or {}).get("id") or "")
a_pid = str(item.get("awayTeamId") or (item.get("awayTeam") or {}).get("id") or "")

state = s50.load_live_state()
resolver, _ = s50.build_resolver(state)
h_st, h_ok = resolver(h_pid, h_name, True)
a_st, a_ok = resolver(a_pid, a_name, False)

print("=" * 64)
print(f"AUTOPSY: {h_name} v {a_name} ({date}) status={item.get('status')}")
print("=" * 64)
print(f"HOME '{h_name}' [{h_pid}] resolved={h_ok}")
print(f"   elo={h_st.get('elo')} pts={h_st.get('ewma_points')} gf={h_st.get('ewma_gf')} ga={h_st.get('ewma_ga')}")
print(f"AWAY '{a_name}' [{a_pid}] resolved={a_ok}")
print(f"   elo={a_st.get('elo')} pts={a_st.get('ewma_points')} gf={a_st.get('ewma_gf')} ga={a_st.get('ewma_ga')}")
print(f"   elo_diff = {h_st.get('elo',0) - a_st.get('elo',0):.0f}")

h_elo = float(np.clip(s50._num(h_st.get("elo"), 1500), 1200, 2100))
a_elo = float(np.clip(s50._num(a_st.get("elo"), 1500), 1200, 2100))
row = s50.build_feature_row(h_st, a_st, h_elo, a_elo)
print("\nKEY FEATURES:")
for k in ("elo_diff","exp_home_xg","exp_away_xg","home_form_adv","home_home_adv"):
    print(f"   {k:22s} = {row[k]}")

m = joblib.load(os.path.join(s50.MODELS_DIR, "champion_model.joblib"))
X = pd.DataFrame([row])
cols = list(m.feature_names_in_) if hasattr(m, "feature_names_in_") else s50.FEATURE_ORDER
raw = m.predict_proba(X.reindex(columns=cols, fill_value=0))[0]
lm = s50.load_label_map("1x2")
print(f"\nRAW champion:  " + ", ".join(f"{lm.get(int(c),c)}={p*100:.1f}%" for c, p in zip(m.classes_, raw)))

cal_path = os.path.join(s50.MODELS_DIR, "champion_calibration.json")
if os.path.exists(cal_path):
    cal = json.load(open(cal_path, encoding="utf-8"))
    if cal.get("enabled"):
        W = np.asarray(cal["W"]); b = np.asarray(cal["b"])
        z = np.log(np.clip(raw, 1e-12, 1.0)) @ W.T + b
        z -= z.max(); e = np.exp(z); calp = e / e.sum()
        T = float(cal.get("validation", {}).get("temperature", 1.0) or 1.0)
        if T != 1.0:
            calp = np.power(np.clip(calp, 1e-12, 1.0), 1.0/T); calp /= calp.sum()
        # apply cap
        cap = cal.get("cap_1x2", 100.0)
        top = int(np.argmax(calp))
        if calp[top] > cap / 100.0:
            ex = calp[top] - cap/100.0
            others = [i for i in range(len(calp)) if i != top]
            calp[top] = cap/100.0
            for i in others: calp[i] += ex * (calp[i]/ (calp[others].sum() or 1.0))
        print(f"CALIBRATED (T={T}, cap={cap}): " + ", ".join(f"{lm.get(int(c),c)}={p*100:.1f}%" for c, p in zip(m.classes_, calp)))
        print(f"   amplification: " + ", ".join(f"{lm.get(int(c),c)} x{calp[i]/max(raw[i],1e-9):.2f}" for i, c in enumerate(m.classes_)))

pred = next((m2.get("prediction") for m2 in items if str(m2.get("id")) == str(item.get("id"))), None)
if pred:
    p13 = pred.get("1x2", {})
    print(f"\nSERVED 1x2: {p13.get('probabilities')}  pick={p13.get('pick')} {p13.get('pick_probability')}%")
    print(f"SERVED mode={pred.get('mode')} team_state={pred.get('team_state')} calibrated={p13.get('calibrated')}")