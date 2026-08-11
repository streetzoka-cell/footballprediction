import pandas as pd
import json
import xgboost as xgb
import numpy as np
from scipy.stats import poisson

# 1. Load Models
print("[Audit] Loading AI Engine Models...")
xgb_model = xgb.XGBClassifier()
xgb_model.load_model('public_data/xgboost_baseline.json')
home_goal_model = xgb.XGBRegressor()
home_goal_model.load_model('public_data/poisson_home_goals.json')
away_goal_model = xgb.XGBRegressor()
away_goal_model.load_model('public_data/poisson_away_goals.json')

# 2. Load and Merge Datasets
print("[Audit] Loading datasets...")
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

# ★ FIX 1: STRICT DATE FILTER. We only care about 2024 onwards for a clean out-of-sample test.
df = df[df['year'] >= 2024].copy()
print(f"[Audit] Strictly analyzing {len(df)} matches (2024 onwards)...")

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 3. Get Zoka Probabilities & Vig-Free Market Probs
print("[Audit] Generating predictions and removing vig...")
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

# 4. Run Clean Audit Strategy (>10% Edge)
total_bets = 0
won_bets = 0
total_profit = 0.0
stake = 1.0

# We will also break it down by year to ensure no single year is skewing it
yearly_stats = {}

for idx, row in df.iterrows():
    actual_res = row['target']['result']
    year = row['year']
    
    if year not in yearly_stats:
        yearly_stats[year] = {'bets': 0, 'wins': 0, 'profit': 0.0}
        
    for bet_type, edge_col, odds_col in [('H', 'edge_home', 'odds.home'), ('D', 'edge_draw', 'odds.draw'), ('A', 'edge_away', 'odds.away')]:
        if row[edge_col] > 0.10: # Strict 10% edge
            book_odds = row[odds_col]
            if pd.isna(book_odds) or book_odds <= 1.0: continue
            
            total_bets += 1
            yearly_stats[year]['bets'] += 1
            yearly_stats[year]['profit'] -= stake
            
            if actual_res == bet_type:
                total_profit += (book_odds - 1.0) * stake
                won_bets += 1
                yearly_stats[year]['wins'] += 1
                yearly_stats[year]['profit'] += (book_odds) * stake

# 5. Generate Audit Report
roi = (total_profit / (total_bets * stake)) * 100 if total_bets > 0 else 0
hit_rate = (won_bets / total_bets) * 100 if total_bets > 0 else 0

print("\n============================================================")
print("⚖️  ZOKASCORE CLEAN AUDIT REPORT (Strict >10% Edge)")
print("============================================================")
print(f"Period Analyzed   : 2024-01-01 to Present")
print(f"Total Bets Placed : {total_bets}")
print(f"Bets Won          : {won_bets}")
print(f"Hit Rate          : {hit_rate:.2f}%")
print("------------------------------------------------------------")
print(f"Total Profit/Loss : {total_profit:.2f} units")
print(f"Return on Invest  : {roi:.2f}% ROI")
print("============================================================")
print("WALK-FORWARD BREAKDOWN:")
for year in sorted(yearly_stats.keys()):
    s = yearly_stats[year]
    yr_roi = (s['profit'] / s['bets']) * 100 if s['bets'] > 0 else 0
    yr_hr = (s['wins'] / s['bets']) * 100 if s['bets'] > 0 else 0
    print(f"  {year}: Bets: {s['bets']:4} | Wins: {s['wins']:4} ({yr_hr:.1f}%) | ROI: {yr_roi:6.2f}%")
print("============================================================")