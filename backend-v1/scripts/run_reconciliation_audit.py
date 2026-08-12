import pandas as pd
import json
import xgboost as xgb
import numpy as np
from scipy.stats import poisson

# 1. Load the Frozen V1 Models
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

# ★ FIX: STRICT DATE FILTER BEFORE ANY MERGES
df['date'] = pd.to_datetime(df['date'])
df = df[df['date'] >= '2024-01-01'].copy()
print(f"[Audit] Strictly analyzing {len(df)} matches (Out-of-Sample: 2024 onwards)...")

goals_df = pd.DataFrame([{
    'date': r['date'], 'home_team': r['home_team'], 'away_team': r['away_team'],
    'actual_total_goals': r['target']['total_goals']
} for r in pred_data])

# ★ FIX: Convert goals_df date to datetime to match the main dataframe
goals_df['date'] = pd.to_datetime(goals_df['date'])

df = pd.merge(df, goals_df, on=['date', 'home_team', 'away_team'])
df['date'] = pd.to_datetime(df['date'])
df['year'] = df['date'].dt.year

# STRICT OUT-OF-SAMPLE FILTER: 2024 onwards ONLY
df = df[df['year'] >= 2024].copy()
print(f"[Audit] Strictly auditing {len(df)} matches (Out-of-Sample: 2024 onwards)...")

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

# 4. Build the Immutable Bet Ledger
bets = []
markets = [
    ('HOME', 'edge_home', 'odds.home', 'zoka_prob_home', 'mkt_prob_home', 'H'),
    ('DRAW', 'edge_draw', 'odds.draw', 'zoka_prob_draw', 'mkt_prob_draw', 'D'),
    ('AWAY', 'edge_away', 'odds.away', 'zoka_prob_away', 'mkt_prob_away', 'A')
]

stake = 1.0

for idx, row in df.iterrows():
    actual_res = row['target']['result']
    match_id = f"{row['date'].strftime('%Y-%m-%d')}_{row['home_team']}_{row['away_team']}"
    
    for mkt_name, edge_col, odds_col, zoka_prob_col, mkt_prob_col, res_code in markets:
        edge_pp = row[edge_col]
        
        # STRICT 10% EDGE THRESHOLD (Percentage Points)
        if edge_pp >= 0.10:
            book_odds = row[odds_col]
            if pd.isna(book_odds) or book_odds <= 1.0: continue
            
            # Determine Result and Profit
            is_win = (actual_res == res_code)
            profit = (stake * (book_odds - 1.0)) if is_win else -stake
            
            bets.append({
                'match_id': match_id,
                'date': row['date'].strftime('%Y-%m-%d'),
                'year': row['year'],
                'competition': row['competition'],
                'market': mkt_name,
                'selection': res_code,
                'zoka_probability': row[zoka_prob_col],
                'market_probability': row[mkt_prob_col],
                'edge_pp': edge_pp,
                'fair_odds': 1.0 / row[zoka_prob_col],
                'decimal_odds': book_odds,
                'result': 'WIN' if is_win else 'LOSS',
                'stake': stake,
                'profit': profit
            })

ledger = pd.DataFrame(bets)

# 5. Reconciliation Logic
print("\n============================================================")
print("⚖️  ZOKASCORE RECONCILIATION AUDIT (Strict >10% Edge)")
print("============================================================")

if ledger.empty:
    print("No bets placed.")
    exit()

total_bets = len(ledger)
total_stake = ledger['stake'].sum()
total_profit = ledger['profit'].sum()
total_roi = (total_profit / total_stake) * 100 if total_stake > 0 else 0

print(f"Total Bets Placed : {total_bets}")
print(f"Total Stake       : {total_stake:.2f} units")
print(f"Total Profit/Loss : {total_profit:.2f} units")
print(f"Return on Invest  : {total_roi:.2f}% ROI")
print("------------------------------------------------------------")

# Yearly Reconciliation
print("\n[YEARLY RECONCILIATION]")
yearly = ledger.groupby('year').agg(
    bets=('profit', 'count'),
    stake=('stake', 'sum'),
    profit=('profit', 'sum')
).reset_index()
yearly['roi'] = (yearly['profit'] / yearly['stake']) * 100

for _, row in yearly.iterrows():
    print(f"  {row['year']}: Bets: {row['bets']:4} | Stake: {row['stake']:.1f} | Profit: {row['profit']:7.2f} | ROI: {row['roi']:6.2f}%")

yearly_profit_sum = yearly['profit'].sum()
reconciles_year = np.isclose(total_profit, yearly_profit_sum)
print(f"\n  [CHECK] Sum(Yearly Profits) == Total Profit: {'✅ PASS' if reconciles_year else '❌ FAIL'}")

# Market Reconciliation
print("\n[MARKET RECONCILIATION]")
market = ledger.groupby('market').agg(
    bets=('profit', 'count'),
    stake=('stake', 'sum'),
    profit=('profit', 'sum')
).reset_index()
market['roi'] = (market['profit'] / market['stake']) * 100

for _, row in market.iterrows():
    print(f"  {row['market']:<6}: Bets: {row['bets']:4} | Stake: {row['stake']:.1f} | Profit: {row['profit']:7.2f} | ROI: {row['roi']:6.2f}%")

market_profit_sum = market['profit'].sum()
reconciles_market = np.isclose(total_profit, market_profit_sum)
print(f"\n  [CHECK] Sum(Market Profits) == Total Profit: {'✅ PASS' if reconciles_market else '❌ FAIL'}")

# Competition Reconciliation
print("\n[COMPETITION RECONCILIATION (Top 5 by Bets)]")
comp = ledger.groupby('competition').agg(
    bets=('profit', 'count'),
    stake=('stake', 'sum'),
    profit=('profit', 'sum')
).reset_index()
comp['roi'] = (comp['profit'] / comp['stake']) * 100

for _, row in comp.sort_values(by='bets', ascending=False).head(5).iterrows():
    print(f"  {row['competition']:<30}: Bets: {row['bets']:4} | Profit: {row['profit']:7.2f} | ROI: {row['roi']:6.2f}%")

comp_profit_sum = comp['profit'].sum()
reconciles_comp = np.isclose(total_profit, comp_profit_sum)
print(f"\n  [CHECK] Sum(Competition Profits) == Total Profit: {'✅ PASS' if reconciles_comp else '❌ FAIL'}")

# Edge Bucket Reconciliation (On out-of-sample data)
print("\n[EDGE BUCKET RECONCILIATION (Out-of-Sample 2024+)]")
edge_bins = [(0.10, 0.15), (0.15, 0.20), (0.20, 1.0)]
print(f"  {'Edge Range':<12} | {'Bets':<5} | {'Wins':<5} | {'Win%':<6} | {'Profit':<8} | {'ROI':<7}")
print("  " + "-"*60)

for low, high in edge_bins:
    bucket = ledger[(ledger['edge_pp'] >= low) & (ledger['edge_pp'] < high)]
    if not bucket.empty:
        b = len(bucket)
        w = len(bucket[bucket['result'] == 'WIN'])
        p = bucket['profit'].sum()
        r = (p / b) * 100
        print(f"  {low*100:.0f}-{high*100:.0f}%       | {b:<5} | {w:<5} | {(w/b)*100:<5.1f}% | {p:<8.2f} | {r:<6.2f}%")

print("============================================================")

# Save the immutable ledger
ledger.to_csv('public_data/audit_ledger.csv', index=False)
print("\n[Audit] Immutable bet ledger saved to public_data/audit_ledger.csv")