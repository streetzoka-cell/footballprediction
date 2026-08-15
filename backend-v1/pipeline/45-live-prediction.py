import os
import json
import pandas as pd
import xgboost as xgb

# ============================================================
# ZOKASCORE V2 — PIPELINE 45
# LIVE PREDICTION ENGINE
# ============================================================

MODEL_DIR = os.path.join("data", "ml")

MODEL_FILE = os.path.join(
    MODEL_DIR,
    "zokascore_v2_model.json"
)

EWMA_STATE_FILE = os.path.join(
    MODEL_DIR,
    "ewma_state.json"
)

LABEL_MAPPING_FILE = os.path.join(
    MODEL_DIR,
    "label_mapping.json"
)

# ============================================================
# EXACT 23 FEATURES FROM PIPELINE 41 CHAMPION
# ============================================================

FEATURE_COLUMNS = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

    "home_ewma_points",
    "away_ewma_points",

    "home_ewma_gd",
    "away_ewma_gd",

    "home_ewma_gf",
    "away_ewma_gf",

    "home_ewma_ga",
    "away_ewma_ga",

    "home_ewma_home_points",
    "away_ewma_away_points",

    "home_ewma_home_gd",
    "away_ewma_away_gd",

    "home_ewma_home_gf",
    "away_ewma_away_gf",

    "home_ewma_home_ga",
    "away_ewma_away_ga",

    "home_matches_before",
    "away_matches_before",

    "home_home_matches_before",
    "away_away_matches_before"
]

print("🧠 ZOKASCORE V2 - Pipeline 45: Live Prediction Engine")
print("=" * 60)
print()

# ============================================================
# 1. VERIFY DEPLOYMENT FILES
# ============================================================

print("🔍 Checking deployment files...")

required_files = {
    "Model": MODEL_FILE,
    "EWMA state": EWMA_STATE_FILE,
    "Label mapping": LABEL_MAPPING_FILE
}

for name, file_path in required_files.items():
    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"{name} not found: {file_path}\n"
            "Run Pipeline 44 first."
        )

    print(f"   ✅ {name}: {file_path}")

print()

# ============================================================
# 2. LOAD MODEL
# ============================================================

print("⚙️ Loading champion model...")

model = xgb.XGBClassifier()
model.load_model(MODEL_FILE)

print("   ✅ XGBoost model loaded.")

# ============================================================
# 3. LOAD LIVE TEAM STATE
# ============================================================

print("⚙️ Loading live EWMA/ELO state...")

with open(EWMA_STATE_FILE, "r", encoding="utf-8") as f:
    ewma_state = json.load(f)

print(
    f"   ✅ Loaded state for "
    f"{len(ewma_state):,} teams."
)

# ============================================================
# 4. LOAD LABEL MAPPING
# ============================================================

with open(LABEL_MAPPING_FILE, "r", encoding="utf-8") as f:
    label_mapping = json.load(f)

print("   ✅ Label mapping loaded.")
print()

# ============================================================
# 5. DEFINE MATCH
# ============================================================
#
# TEST MATCH:
# Arsenal (11) vs Manchester City (418)
#
# Replace these IDs later with the actual fixture IDs
# coming from the ZOKASCORE fixture/live pipeline.
# ============================================================

HOME_TEAM_ID = "11"
AWAY_TEAM_ID = "418"

print("⚽ MATCH")
print("-" * 60)
print(f"   Home: Team {HOME_TEAM_ID}")
print(f"   Away: Team {AWAY_TEAM_ID}")
print()

# ============================================================
# 6. RETRIEVE TEAM STATES
# ============================================================

home_state = ewma_state.get(HOME_TEAM_ID)
away_state = ewma_state.get(AWAY_TEAM_ID)

if home_state is None:
    raise ValueError(
        f"Home team {HOME_TEAM_ID} "
        "was not found in ewma_state.json."
    )

if away_state is None:
    raise ValueError(
        f"Away team {AWAY_TEAM_ID} "
        "was not found in ewma_state.json."
    )

print("📦 TEAM STATES")
print("-" * 60)

print(
    f"   Home ELO: {home_state['elo']:.2f} | "
    f"Matches: {home_state['matches_played']:,}"
)

print(
    f"   Away ELO: {away_state['elo']:.2f} | "
    f"Matches: {away_state['matches_played']:,}"
)

print()

# ============================================================
# 7. CONSTRUCT EXACT PIPELINE 41 FEATURES
# ============================================================

home_elo = float(home_state["elo"])
away_elo = float(away_state["elo"])

features = {
    # --------------------------------------------------------
    # ELO
    # --------------------------------------------------------

    "home_elo_pre": home_elo,
    "away_elo_pre": away_elo,
    "elo_diff": home_elo - away_elo,

    # --------------------------------------------------------
    # OVERALL EWMA
    # --------------------------------------------------------

    "home_ewma_points": float(
        home_state["overall_points"]
    ),

    "away_ewma_points": float(
        away_state["overall_points"]
    ),

    "home_ewma_gd": float(
        home_state["overall_gd"]
    ),

    "away_ewma_gd": float(
        away_state["overall_gd"]
    ),

    "home_ewma_gf": float(
        home_state["overall_gf"]
    ),

    "away_ewma_gf": float(
        away_state["overall_gf"]
    ),

    "home_ewma_ga": float(
        home_state["overall_ga"]
    ),

    "away_ewma_ga": float(
        away_state["overall_ga"]
    ),

    # --------------------------------------------------------
    # VENUE-SPECIFIC EWMA
    # --------------------------------------------------------

    "home_ewma_home_points": float(
        home_state["home_points"]
    ),

    "away_ewma_away_points": float(
        away_state["away_points"]
    ),

    "home_ewma_home_gd": float(
        home_state["home_gd"]
    ),

    "away_ewma_away_gd": float(
        away_state["away_gd"]
    ),

    "home_ewma_home_gf": float(
        home_state["home_gf"]
    ),

    "away_ewma_away_gf": float(
        away_state["away_gf"]
    ),

    "home_ewma_home_ga": float(
        home_state["home_ga"]
    ),

    "away_ewma_away_ga": float(
        away_state["away_ga"]
    ),

    # --------------------------------------------------------
    # MATCH COUNTS
    # --------------------------------------------------------

    "home_matches_before": int(
        home_state["matches_played"]
    ),

    "away_matches_before": int(
        away_state["matches_played"]
    ),

    "home_home_matches_before": int(
        home_state["home_matches_played"]
    ),

    "away_away_matches_before": int(
        away_state["away_matches_played"]
    )
}

# ============================================================
# 8. VALIDATE FEATURE SCHEMA
# ============================================================

missing_features = [
    feature
    for feature in FEATURE_COLUMNS
    if feature not in features
]

if missing_features:
    raise ValueError(
        "Missing model features: "
        + ", ".join(missing_features)
    )

if len(features) != len(FEATURE_COLUMNS):
    raise ValueError(
        f"Feature count mismatch: "
        f"{len(features)} generated, "
        f"{len(FEATURE_COLUMNS)} expected."
    )

# ============================================================
# 9. BUILD MODEL INPUT
# ============================================================

X_live = pd.DataFrame(
    [features],
    columns=FEATURE_COLUMNS
).astype(float)

print("🧩 FEATURES")
print("-" * 60)
print(f"   ✅ Generated {len(FEATURE_COLUMNS)} / 23 features")
print("   ✅ Feature order matches Pipeline 41")
print()

# ============================================================
# 10. PREDICT
# ============================================================

print("⚡ Running champion model inference...")

probabilities = model.predict_proba(X_live)[0]

# ============================================================
# 11. MAP PROBABILITIES TO OUTCOMES
# ============================================================

results = {}

for index, probability in enumerate(probabilities):
    label = label_mapping.get(str(index))

    if label is None:
        raise ValueError(
            f"No label mapping found for model class {index}."
        )

    results[label] = float(probability)

# ============================================================
# 12. VALIDATE PROBABILITIES
# ============================================================

probability_sum = sum(results.values())

if not 0.999 <= probability_sum <= 1.001:
    raise ValueError(
        f"Invalid probability sum: {probability_sum}"
    )

# ============================================================
# 13. DISPLAY PREDICTION
# ============================================================

print()
print("=" * 60)
print("📊 ZOKASCORE V2 PREDICTION")
print("=" * 60)

print(
    f"   🏠 HOME WIN:  "
    f"{results.get('HOME_WIN', 0.0) * 100:5.1f}%"
)

print(
    f"   🤝 DRAW:      "
    f"{results.get('DRAW', 0.0) * 100:5.1f}%"
)

print(
    f"   ✈️ AWAY WIN:  "
    f"{results.get('AWAY_WIN', 0.0) * 100:5.1f}%"
)

print("-" * 60)

# ============================================================
# 14. MODEL PICK
# ============================================================

pick = max(
    results,
    key=results.get
)

pick_probability = results[pick]

print(
    f"🎯 MODEL PICK: {pick}"
)

print(
    f"📈 PICK PROBABILITY: "
    f"{pick_probability * 100:.1f}%"
)

print("=" * 60)

print()
print("✅ LIVE INFERENCE COMPLETE")