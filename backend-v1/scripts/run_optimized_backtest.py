import pandas as pd
import json
import xgboost as xgb
import joblib
import numpy as np

# 1. Load the Zoka Model
print("[Backtest] Loading Zoka Calibrated Model...")
try:
    xgb_model = joblib.load('public_data/xgboost_calibrated_pipeline.pkl')
except Exception as e:
    print(f"Error loading model: {e}")
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

df['date'] = pd.to_datetime(df['date'])
df = df[df['date'] >= '2024-01-01'].copy()

print(f"[Backtest] Found {len(df)} matches in 2024+ with odds to backtest...")

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 3. Get Zoka Probabilities
probs = xgb_model.predict_proba(X)
df['zoka_prob_away'] = probs[:, 0]
df['zoka_prob_draw'] = probs[:, 1]
df['zoka_prob_home'] = probs[:, 2]

# 4. Optimized Backtest Simulation (10% Edge Required)
total_bets = 0
won_bets = 0
lost_bets = 0
total_profit = 0.0
stake = 1.0

for index, row in df.iterrows():
    odds = row['odds']
    actual_result = row['target']['result']
    
    for bet_type, zoka_prob, book_odds in [
        ('H', row['zoka_prob_home'], odds['home']),
        ('D', row['zoka_prob_draw'], odds['draw']),
        ('A', row['zoka_prob_away'], odds['away'])
    ]:
        if pd.isna(book_odds) or book_odds <= 1.0:
            continue
            
        implied_prob = 1.0 / book_odds
        
        # OPTIMIZATION: Require a massive 10% edge instead of 5%
        if zoka_prob > (implied_prob + 0.10):
            # OPTIMIZATION: Only bet if model confidence is > 45%
            if zoka_prob < 0.45:
                continue
                
            total_bets += 1
            if actual_result == bet_type:
                profit = (book_odds - 1.0) * stake
                total_profit += profit
                won_bets += 1
            else:
                total_profit -= stake
                lost_bets += 1

# 5. Print Optimized Backtest Report
roi = (total_profit / (total_bets * stake)) * 100 if total_bets > 0 else 0
hit_rate = (won_bets / total_bets) * 100 if total_bets > 0 else 0

print("\n============================================")
print("💰 ZOKASCORE OPTIMIZED BACKTEST REPORT (10% Edge)")
print("============================================")
print(f"Matches Analyzed : {len(df)}")
print(f"Total Bets Placed: {total_bets} (High-Confidence Value Bets)")
print(f"Bets Won         : {won_bets}")
print(f"Bets Lost        : {lost_bets}")
print(f"Hit Rate         : {hit_rate:.2f}%")
print("--------------------------------------------")
print(f"Total Profit/Loss: {total_profit:.2f} units")
print(f"Return on Invest : {roi:.2f}% ROI")
print("============================================")

if roi > 0:
    print("\n🚀 SUCCESS! The Optimized Zoka Model is PROFITABLE!")
else:
    print("\n⚠️ Still operating at a slight loss. Next step is to add the Goal/Poisson model as a filter!")