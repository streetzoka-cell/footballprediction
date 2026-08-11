import pandas as pd
import json
import xgboost as xgb
import joblib
import numpy as np
from scipy.stats import poisson
import random

# 1. Load the Zoka Engine Models
print("[Zoka] Loading AI Engine Models...")
try:
    xgb_model = joblib.load('public_data/xgboost_calibrated_pipeline.pkl')
    home_goal_model = xgb.XGBRegressor()
    home_goal_model.load_model('public_data/poisson_home_goals.json')
    away_goal_model = xgb.XGBRegressor()
    away_goal_model.load_model('public_data/poisson_away_goals.json')
    print("[Zoka] Models loaded successfully!\n")
except Exception as e:
    print(f"Error loading models: {e}")
    exit()

# 2. Load the dataset to find a random 2024 match to test
print("[Zoka] Finding a random match from 2024 to predict...")
data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        record = json.loads(line)
        if record['date'] >= '2024-01-01':
            data.append(record)

if not data:
    print("No 2024 matches found to test!")
    exit()

# Pick a random match
random_match = random.choice(data)

# 3. Extract Features
feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

features_df = pd.json_normalize(random_match['features'])

# ★ FIX: Force all columns to be numeric, coercing errors to NaN, then filling with 0
X_input = features_df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 4. Run the Zoka Ensemble
# A. Predict 1X2 Probabilities (Calibrated)
probs_1x2 = xgb_model.predict_proba(X_input)[0]
# Classes are 0(Away), 1(Draw), 2(Home) based on LabelEncoder alphabetical sort
prob_away = probs_1x2[0]
prob_draw = probs_1x2[1]
prob_home = probs_1x2[2]

# B. Predict Expected Goals (Poisson)
exp_home_goals = home_goal_model.predict(X_input)[0]
exp_away_goals = away_goal_model.predict(X_input)[0]

# C. Calculate Over 2.5 & BTTS using Poisson Distribution matrix
max_goals = 10
home_goals_dist = [poisson.pmf(i, exp_home_goals) for i in range(max_goals)]
away_goals_dist = [poisson.pmf(i, exp_away_goals) for i in range(max_goals)]

over_2_5 = 0.0
btts = 0.0
for h in range(max_goals):
    for a in range(max_goals):
        prob = home_goals_dist[h] * away_goals_dist[a]
        if h + a > 2:
            over_2_5 += prob
        if h > 0 and a > 0:
            btts += prob

# D. Calculate Fair Odds (1 / Probability)
def to_odds(p):
    return round(1 / p, 2) if p > 0 else 0

# 5. Print Zoka Control Room Report
print("====================================================================")
print("🏟️  ZOKASCORE CONTROL ROOM: MATCH PREDICTION REPORT")
print("====================================================================")
print(f"Match      : {random_match['home_team']} vs {random_match['away_team']}")
print(f"Date       : {random_match['date']}")
print("--------------------------------------------------------------------")
print(f"Home Elo   : {random_match['features']['home_elo']}  | Away Elo   : {random_match['features']['away_elo']}")
print(f"Home Form  : {random_match['features']['home_form_pts_5']}/15 pts    | Away Form  : {random_match['features']['away_form_pts_5']}/15 pts")
print("====================================================================")
print("🧠 ZOKA AI PROBABILITIES & FAIR ODDS")
print("====================================================================")
print(f"Home Win   : {prob_home*100:>5.1f}%  (Fair Odds: {to_odds(prob_home)})")
print(f"Draw       : {prob_draw*100:>5.1f}%  (Fair Odds: {to_odds(prob_draw)})")
print(f"Away Win   : {prob_away*100:>5.1f}%  (Fair Odds: {to_odds(prob_away)})")
print("--------------------------------------------------------------------")
print(f"Over 2.5   : {over_2_5*100:>5.1f}%  (Fair Odds: {to_odds(over_2_5)})")
print(f"BTTS       : {btts*100:>5.1f}%  (Fair Odds: {to_odds(btts)})")
print("--------------------------------------------------------------------")
print(f"Expected Goals: {random_match['home_team']} {exp_home_goals:.2f}  -  {exp_away_goals:.2f} {random_match['away_team']}")
print("====================================================================")
print("🎯 ACTUAL RESULT (REality CHECK)")
print("====================================================================")
actual = random_match['target']
print(f"Final Score: {random_match['home_team']} {actual['home_goals']}  -  {actual['away_goals']} {random_match['away_team']}")
print(f"Result     : {actual['result']}")
print(f"Over 2.5   : {'Yes' if actual['over_2_5'] else 'No'}")
print(f"BTTS       : {'Yes' if actual['btts'] else 'No'}")
print("====================================================================\n")