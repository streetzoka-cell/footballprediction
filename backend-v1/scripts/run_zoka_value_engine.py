import pandas as pd
import json
import xgboost as xgb
import numpy as np
from scipy.stats import poisson

# 1. Load Models
print("[Zoka V2] Loading AI Engine Models...")
xgb_model = xgb.XGBClassifier()
xgb_model.load_model('public_data/xgboost_baseline.json')
home_goal_model = xgb.XGBRegressor()
home_goal_model.load_model('public_data/poisson_home_goals.json')
away_goal_model = xgb.XGBRegressor()
away_goal_model.load_model('public_data/poisson_away_goals.json')

# 2. Load Datasets
print("[Zoka V2] Loading datasets...")
bt_data = []
with open('public_data/backtest_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        bt_data.append(json.loads(line))

pred_data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        pred_data.append(json.loads(line))

df = pd.DataFrame(bt_data)
features_df = pd.json_normalize(df['features'])
odds_df = pd.json_normalize(df['odds'])
odds_df.columns = [f'odds.{col}' for col in odds_df.columns]
df = pd.concat([df.drop(columns=['features', 'odds']), features_df, odds_df], axis=1)

goals_df = pd.DataFrame([{
    'date': r['date'], 'home_team': r['home_team'], 'away_team': r['away_team'],
    'actual_total_goals': r['target']['total_goals']
} for r in pred_data])

df = pd.merge(df, goals_df, on=['date', 'home_team', 'away_team'])
df['date'] = pd.to_datetime(df['date'])
df['year'] = df['date'].dt.year

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 3. Get Zoka Probabilities & Vig-Free Market Probs
probs_1x2 = xgb_model.predict_proba(X)
df['zoka_prob_away'] = probs_1x2[:, 0]
df['zoka_prob_draw'] = probs_1x2[:, 1]
df['zoka_prob_home'] = probs_1x2[:, 2]

df['raw_h'] = 1 / df['odds.home'].replace(0, np.nan)
df['raw_d'] = 1 / df['odds.draw'].replace(0, np.nan)
df['raw_a'] = 1 / df['odds.away'].replace(0, np.nan)
df['total_1x2'] = df['raw_h'] + df['raw_d'] + df['raw_a']

df['mkt_prob_home'] = df['raw_h'] / df['total_1x2']
df['mkt_prob_draw'] = df['raw_d'] / df['total_1x2']
df['mkt_prob_away'] = df['raw_a'] / df['total_1x2']

df['edge_home'] = df['zoka_prob_home'] - df['mkt_prob_home']
df['edge_draw'] = df['zoka_prob_draw'] - df['mkt_prob_draw']
df['edge_away'] = df['zoka_prob_away'] - df['mkt_prob_away']

# 4. Run Strict Value Strategy (>10% Edge)
total_bets = 0
won_bets = 0
total_profit = 0.0
stake = 1.0

for idx, row in df.iterrows():
    actual_res = row['target']['result']
    
    # Only bet on 1X2 markets where Edge > 10%
    for bet_type, edge_col, odds_col in [('H', 'edge_home', 'odds.home'), ('D', 'edge_draw', 'odds.draw'), ('A', 'edge_away', 'odds.away')]:
        if row[edge_col] > 0.10:
            book_odds = row[odds_col]
            if pd.isna(book_odds) or book_odds <= 1.0: continue
            
            total_bets += 1
            if actual_res == bet_type:
                total_profit += (book_odds - 1.0) * stake
                won_bets += 1
            else:
                total_profit -= stake

roi = (total_profit / (total_bets * stake)) * 100 if total_bets > 0 else 0
hit_rate = (won_bets / total_bets) * 100 if total_bets > 0 else 0

print("\n============================================")
print("💰 ZOKASCORE STRICT VALUE ENGINE (>10% EDGE)")
print("============================================")
print(f"Total Bets Placed: {total_bets}")
print(f"Bets Won         : {won_bets}")
print(f"Hit Rate         : {hit_rate:.2f}%")
print("--------------------------------------------")
print(f"Total Profit/Loss: {total_profit:.2f} units")
print(f"Return on Invest : {roi:.2f}% ROI")
print("============================================")