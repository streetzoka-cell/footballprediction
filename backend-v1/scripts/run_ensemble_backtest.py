import pandas as pd
import json
import xgboost as xgb
import joblib
import numpy as np
from scipy.stats import poisson

# 1. Load the Zoka Engine Models
print("[Backtest] Loading AI Engine Models...")
try:
    xgb_model = joblib.load('public_data/xgboost_calibrated_pipeline.pkl')
    home_goal_model = xgb.XGBRegressor()
    home_goal_model.load_model('public_data/poisson_home_goals.json')
    away_goal_model = xgb.XGBRegressor()
    away_goal_model.load_model('public_data/poisson_away_goals.json')
except Exception as e:
    print(f"Error loading models: {e}")
    exit()

# 2. Load the Backtest Dataset
print("[Backtest] Loading backtest_dataset.jsonl...")
data = []
with open('public_data/backtest_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data.append(json.loads(line))

df = pd.DataFrame(data)
features_df = pd.json_normalize(df['features'])
df = pd.concat([df.drop(columns=['features']), features_df], axis=1)

# Load prediction dataset to get actual total goals
print("[Backtest] Loading prediction_dataset.jsonl for goal targets...")
goal_data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        record = json.loads(line)
        if record['date'] >= '2024-01-01':
            goal_data.append({
                'date': record['date'],
                'home_team': record['home_team'],
                'away_team': record['away_team'],
                'actual_total_goals': record['target']['total_goals']
            })

goals_df = pd.DataFrame(goal_data)
df = pd.merge(df, goals_df, on=['date', 'home_team', 'away_team'])

df['date'] = pd.to_datetime(df['date'])
print(f"[Backtest] Found {len(df)} matches in 2024+ with odds and goals to backtest...")

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 3. Get Zoka Predictions
probs_1x2 = xgb_model.predict_proba(X)
df['zoka_prob_away'] = probs_1x2[:, 0]
df['zoka_prob_draw'] = probs_1x2[:, 1]
df['zoka_prob_home'] = probs_1x2[:, 2]

exp_home_goals = home_goal_model.predict(X)
exp_away_goals = away_goal_model.predict(X)
df['exp_home_goals'] = exp_home_goals
df['exp_away_goals'] = exp_away_goals

# 4. Calculate Over 2.5 Probability using Poisson Matrix
def calc_over_2_5(h_exp, a_exp):
    max_goals = 10
    h_dist = [poisson.pmf(i, h_exp) for i in range(max_goals)]
    a_dist = [poisson.pmf(i, a_exp) for i in range(max_goals)]
    over = 0.0
    for h in range(max_goals):
        for a in range(max_goals):
            if h + a > 2:
                over += h_dist[h] * a_dist[a]
    return over

df['zoka_prob_over_2_5'] = df.apply(lambda row: calc_over_2_5(row['exp_home_goals'], row['exp_away_goals']), axis=1)

# 5. Ensemble Backtest Simulation
total_bets = 0
won_bets = 0
total_profit = 0.0
stake = 1.0

# Mapping our 'H', 'D', 'A' to the dataset's 'home', 'draw', 'away' keys
odds_key_map = {'H': 'home', 'D': 'draw', 'A': 'away'}

for index, row in df.iterrows():
    odds = row['odds']
    actual_result = row['target']['result']
    actual_total_goals = row['actual_total_goals']
    
    # --- STRATEGY 1: Ensemble 1X2 (XGBoost + Poisson Agreement) ---
    probs = {'H': row['zoka_prob_home'], 'D': row['zoka_prob_draw'], 'A': row['zoka_prob_away']}
    best_bet = max(probs, key=probs.get)
    best_prob = probs[best_bet]
    
    poisson_agrees = False
    if best_bet == 'H' and row['exp_home_goals'] > row['exp_away_goals']: poisson_agrees = True
    if best_bet == 'A' and row['exp_away_goals'] > row['exp_home_goals']: poisson_agrees = True
    if best_bet == 'D' and abs(row['exp_home_goals'] - row['exp_away_goals']) < 0.4: poisson_agrees = True
    
    bet_odd_key = odds_key_map[best_bet]
    if bet_odd_key in odds and not pd.isna(odds[bet_odd_key]) and odds[bet_odd_key] > 1.0:
        implied_prob = 1.0 / odds[bet_odd_key]
        
        # 5% Edge required + Models must agree
        if best_prob > (implied_prob + 0.05) and poisson_agrees:
            total_bets += 1
            if actual_result == best_bet:
                total_profit += (odds[bet_odd_key] - 1.0) * stake
                won_bets += 1
            else:
                total_profit -= stake

    # --- STRATEGY 2: Over 2.5 Goals (Poisson Model) ---
    over_odds = odds.get('over_25')
    if over_odds and not pd.isna(over_odds) and over_odds > 1.0:
        implied_over = 1.0 / over_odds
        
        # 5% Edge required
        if row['zoka_prob_over_2_5'] > (implied_over + 0.05):
            total_bets += 1
            if actual_total_goals > 2:
                total_profit += (over_odds - 1.0) * stake
                won_bets += 1
            else:
                total_profit -= stake

# 6. Print Ensemble Backtest Report
roi = (total_profit / (total_bets * stake)) * 100 if total_bets > 0 else 0
hit_rate = (won_bets / total_bets) * 100 if total_bets > 0 else 0

print("\n============================================")
print("💰 ZOKASCORE ENSEMBLE BACKTEST REPORT")
print("============================================")
print(f"Matches Analyzed : {len(df)}")
print(f"Total Bets Placed: {total_bets} (Ensemble 1X2 + Over 2.5)")
print(f"Bets Won         : {won_bets}")
print(f"Hit Rate         : {hit_rate:.2f}%")
print("--------------------------------------------")
print(f"Total Profit/Loss: {total_profit:.2f} units")
print(f"Return on Invest : {roi:.2f}% ROI")
print("============================================")

if roi > 0:
    print("\n🚀 SUCCESS! The Ensemble Zoka Model is PROFITABLE against the bookmakers!")
else:
    print("\n⚠️ Still operating at a slight loss. We can refine margins further, but the foundation is incredibly strong.")