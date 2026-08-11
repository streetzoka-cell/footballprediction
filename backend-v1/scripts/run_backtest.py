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

# Filter for 2024 matches (Out-of-Time test)
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
df['zoka_prob_away'] = probs[:, 0] # Class 0 = Away
df['zoka_prob_draw'] = probs[:, 1]  # Class 1 = Draw
df['zoka_prob_home'] = probs[:, 2]  # Class 2 = Home

# 4. Backtest Simulation (Value Betting Strategy)
# We bet 1 unit flat stake. We only bet if Zoka probability > Bookmaker implied probability + 5% margin.
total_bets = 0
won_bets = 0
lost_bets = 0
total_profit = 0.0
stake = 1.0

for index, row in df.iterrows():
    odds = row['odds']
    actual_result = row['target']['result']
    
    # Check Home, Draw, Away for value
    for bet_type, zoka_prob, book_odds in [
        ('H', row['zoka_prob_home'], odds['home']),
        ('D', row['zoka_prob_draw'], odds['draw']),
        ('A', row['zoka_prob_away'], odds['away'])
    ]:
        if pd.isna(book_odds) or book_odds <= 1.0:
            continue
            
        implied_prob = 1.0 / book_odds
        
        # Value condition: Zoka thinks it's at least 5% more likely than bookies imply
        if zoka_prob > (implied_prob + 0.05):
            total_bets += 1
            if actual_result == bet_type:
                # Won the bet: Profit is (Odds - 1) * Stake
                profit = (book_odds - 1.0) * stake
                total_profit += profit
                won_bets += 1
            else:
                # Lost the bet: Loss is the stake
                total_profit -= stake
                lost_bets += 1

# 5. Print Backtest Report
roi = (total_profit / (total_bets * stake)) * 100 if total_bets > 0 else 0
hit_rate = (won_bets / total_bets) * 100 if total_bets > 0 else 0

print("\n========================================")
print("💰 ZOKASCORE HISTORICAL BACKTEST REPORT")
print("========================================")
print(f"Matches Analyzed : {len(df)}")
print(f"Total Bets Placed: {total_bets} (Value Bets Found)")
print(f"Bets Won         : {won_bets}")
print(f"Bets Lost        : {lost_bets}")
print(f"Hit Rate         : {hit_rate:.2f}%")
print("----------------------------------------")
print(f"Total Profit/Loss: {total_profit:.2f} units (Staking 1 unit per bet)")
print(f"Return on Invest : {roi:.2f}% ROI")
print("========================================")

if roi > 0:
    print("\n🚀 SUCCESS! The Zoka Model is PROFITABLE against the bookmakers!")
else:
    print("\n⚠️ WARNING: The model is currently operating at a loss. Consider adjusting the value margin or adding more features.")