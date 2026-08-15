import os
import json
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight

# ============================================================
# CONFIGURATION
# ============================================================

FEATURES_FILE = os.path.join("data", "ml", "features_v3.csv")
ELO_INDEX_FILE = os.path.join("data", "elo", "elo_processed_matches.json")
MODEL_DIR = os.path.join("data", "ml")
MODEL_FILE = os.path.join(MODEL_DIR, "zokascore_v2_model.json")
EWMA_STATE_FILE = os.path.join(MODEL_DIR, "ewma_state.json")

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_points", "away_ewma_points",
    "home_ewma_gd", "away_ewma_gd",
    "home_ewma_gf", "away_ewma_gf",
    "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_points", "away_ewma_away_points",
    "home_ewma_home_gd", "away_ewma_away_gd",
    "home_ewma_home_gf", "away_ewma_away_gf",
    "home_ewma_home_ga", "away_ewma_away_ga",
    "home_matches_before", "away_matches_before",
    "home_home_matches_before", "away_away_matches_before"
]

# Ensure directory exists before writing anything
os.makedirs(MODEL_DIR, exist_ok=True)

print("🚀 ZOKASCORE V2 - Pipeline 44: Deploy Champion Model")
print("=" * 60)
print()

# ============================================================
# 1. TRAIN MODEL ON 100% OF DATA
# ============================================================

print(f"📊 Loading features from {FEATURES_FILE}...")
df = pd.read_csv(FEATURES_FILE, low_memory=False)
print(f"   ✅ Loaded {len(df):,} matches.")

X = df[FEATURE_COLUMNS].astype(float)
y = df["target"].astype(str)

le = LabelEncoder()
y_encoded = le.fit_transform(y)

# Save label mapping
label_mapping = {i: cls for i, cls in enumerate(le.classes_)}
with open(os.path.join(MODEL_DIR, "label_mapping.json"), 'w') as f:
    json.dump(label_mapping, f)

print(f"\n🏋️ Training on 100% of data ({len(X):,} matches)...")
sample_weights = compute_sample_weight(class_weight="balanced", y=y_encoded)

model = xgb.XGBClassifier(
    objective="multi:softprob", num_class=3, n_estimators=300,
    learning_rate=0.05, max_depth=6, min_child_weight=3,
    subsample=0.85, colsample_bytree=0.85, random_state=42,
    n_jobs=-1, eval_metric="mlogloss", tree_method="hist"
)
model.fit(X, y_encoded, sample_weight=sample_weights)

model.save_model(MODEL_FILE)
print(f"\n💾 Model saved to: {MODEL_FILE}")

# ============================================================
# 2. REPLAY HISTORY TO EXTRACT FINAL LIVE STATE
# ============================================================

print("\n🔄 Replaying history to extract final live state...")

with open(ELO_INDEX_FILE, 'r') as f:
    elo_index = json.load(f)

matches = list(elo_index.values())
matches.sort(key=lambda m: m.get('date', '0'))

ALPHA = 0.20

def ewma(prev, curr):
    return (ALPHA * curr) + ((1 - ALPHA) * prev)

team_states = {}

def get_state(team_id):
    if team_id not in team_states:
        team_states[team_id] = {
            "elo": 1500.0,
            "overall_points": 1.0, "overall_gd": 0.0, "overall_gf": 1.0, "overall_ga": 1.0,
            "home_points": 1.0, "home_gd": 0.0, "home_gf": 1.0, "home_ga": 1.0,
            "away_points": 1.0, "away_gd": 0.0, "away_gf": 1.0, "away_ga": 1.0,
            "matches_played": 0, "home_matches_played": 0, "away_matches_played": 0
        }
    return team_states[team_id]

for m in matches:
    home_id = str(m['home_team_id'])
    away_id = str(m['away_team_id'])
    
    home_state = get_state(home_id)
    away_state = get_state(away_id)
    
    # Update ELO to the final post-match rating
    home_state["elo"] = float(m['home_elo_after'])
    away_state["elo"] = float(m['away_elo_after'])
    
    # Determine points
    result = m['result']
    if result == 'HOME_WIN':
        h_pts, a_pts = 3, 0
    elif result == 'AWAY_WIN':
        h_pts, a_pts = 0, 3
    else:
        h_pts, a_pts = 1, 1
        
    h_gf = float(m['home_goals'])
    h_ga = float(m['away_goals'])
    a_gf = float(m['away_goals'])
    a_ga = float(m['home_goals'])
    
    # Update Overall EWMA
    home_state["overall_points"] = ewma(home_state["overall_points"], h_pts)
    home_state["overall_gd"] = ewma(home_state["overall_gd"], h_gf - h_ga)
    home_state["overall_gf"] = ewma(home_state["overall_gf"], h_gf)
    home_state["overall_ga"] = ewma(home_state["overall_ga"], h_ga)
    home_state["matches_played"] += 1
    
    away_state["overall_points"] = ewma(away_state["overall_points"], a_pts)
    away_state["overall_gd"] = ewma(away_state["overall_gd"], a_gf - a_ga)
    away_state["overall_gf"] = ewma(away_state["overall_gf"], a_gf)
    away_state["overall_ga"] = ewma(away_state["overall_ga"], a_ga)
    away_state["matches_played"] += 1
    
    # Update Venue-Specific EWMA
    home_state["home_points"] = ewma(home_state["home_points"], h_pts)
    home_state["home_gd"] = ewma(home_state["home_gd"], h_gf - h_ga)
    home_state["home_gf"] = ewma(home_state["home_gf"], h_gf)
    home_state["home_ga"] = ewma(home_state["home_ga"], h_ga)
    home_state["home_matches_played"] += 1
    
    away_state["away_points"] = ewma(away_state["away_points"], a_pts)
    away_state["away_gd"] = ewma(away_state["away_gd"], a_gf - a_ga)
    away_state["away_gf"] = ewma(away_state["away_gf"], a_gf)
    away_state["away_ga"] = ewma(away_state["away_ga"], a_ga)
    away_state["away_matches_played"] += 1

# Save the fully reconstructed live state
with open(EWMA_STATE_FILE, 'w') as f:
    json.dump(team_states, f)

print(f"💾 Live EWMA & ELO state for {len(team_states):,} teams saved to: {EWMA_STATE_FILE}")

print("\n" + "=" * 60)
print("✅ DEPLOYMENT COMPLETE")
print("=" * 60)
print("ZOKASCORE V2 is now ready for live predictions.")
print("=" * 60)