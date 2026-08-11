import pandas as pd
import json
import xgboost as xgb
import numpy as np
from scipy.stats import poisson
from sklearn.metrics import log_loss

# 1. Load the V1 Zoka Engine Models
print("[Diag V3] Loading AI Engine Models...")
try:
    xgb_model = xgb.XGBClassifier()
    xgb_model.load_model('public_data/xgboost_baseline.json')
    home_goal_model = xgb.XGBRegressor()
    home_goal_model.load_model('public_data/poisson_home_goals.json')
    away_goal_model = xgb.XGBRegressor()
    away_goal_model.load_model('public_data/poisson_away_goals.json')
except Exception as e:
    print(f"Error loading models: {e}")
    exit()

# 2. Load and Merge Datasets
print("[Diag V3] Loading datasets...")
bt_data = []
with open('public_data/backtest_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        bt_data.append(json.loads(line))

pred_data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        pred_data.append(json.loads(line))

df = pd.DataFrame(bt_data)

# ★ FIX: Flatten BOTH 'features' and 'odds' dictionaries
features_df = pd.json_normalize(df['features'])
odds_df = pd.json_normalize(df['odds'])

# Rename odds columns to have 'odds.' prefix so we know they are bookmaker odds
odds_df.columns = [f'odds.{col}' for col in odds_df.columns]

# Drop the original dictionary columns and concat the flattened ones
df = pd.concat([df.drop(columns=['features', 'odds']), features_df, odds_df], axis=1)

goals_df = pd.DataFrame([{
    'date': r['date'], 'home_team': r['home_team'], 'away_team': r['away_team'],
    'actual_total_goals': r['target']['total_goals']
} for r in pred_data])

df = pd.merge(df, goals_df, on=['date', 'home_team', 'away_team'])
df['date'] = pd.to_datetime(df['date'])
df['year'] = df['date'].dt.year

print(f"[Diag V3] Analyzing {len(df)} matches (2023 onwards)...")

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 3. Get Zoka Probabilities
probs_1x2 = xgb_model.predict_proba(X)
df['zoka_prob_away'] = probs_1x2[:, 0]
df['zoka_prob_draw'] = probs_1x2[:, 1]
df['zoka_prob_home'] = probs_1x2[:, 2]

df['exp_home_goals'] = home_goal_model.predict(X)
df['exp_away_goals'] = away_goal_model.predict(X)

def calc_over_under(h_exp, a_exp):
    max_goals = 10
    h_dist = [poisson.pmf(i, h_exp) for i in range(max_goals)]
    a_dist = [poisson.pmf(i, a_exp) for i in range(max_goals)]
    o, u = 0.0, 0.0
    for h in range(max_goals):
        for a in range(max_goals):
            p = h_dist[h] * a_dist[a]
            if h + a > 2: o += p
            else: u += p
    return o, u

df['zoka_prob_over'], df['zoka_prob_under'] = zip(*df.apply(lambda r: calc_over_under(r['exp_home_goals'], r['exp_away_goals']), axis=1))

# 4. Calculate Normalized Market Probabilities (Vig Removal)
df['raw_h'] = 1 / df['odds.home'].replace(0, np.nan)
df['raw_d'] = 1 / df['odds.draw'].replace(0, np.nan)
df['raw_a'] = 1 / df['odds.away'].replace(0, np.nan)
df['total_1x2'] = df['raw_h'] + df['raw_d'] + df['raw_a']

df['mkt_prob_home'] = df['raw_h'] / df['total_1x2']
df['mkt_prob_draw'] = df['raw_d'] / df['total_1x2']
df['mkt_prob_away'] = df['raw_a'] / df['total_1x2']

# Handle Over/Under odds safely (they might be missing in some older matches)
df['raw_o'] = 1 / df['odds.over_25'].replace(0, np.nan)
df['raw_u'] = 1 / df['odds.under_25'].replace(0, np.nan)
df['total_ou'] = df['raw_o'] + df['raw_u']

df['mkt_prob_over'] = df['raw_o'] / df['total_ou']
df['mkt_prob_under'] = df['raw_u'] / df['total_ou']

# Calculate True Edges
df['edge_home'] = df['zoka_prob_home'] - df['mkt_prob_home']
df['edge_draw'] = df['zoka_prob_draw'] - df['mkt_prob_draw']
df['edge_away'] = df['zoka_prob_away'] - df['mkt_prob_away']
df['edge_over'] = df['zoka_prob_over'] - df['mkt_prob_over']
df['edge_under'] = df['zoka_prob_under'] - df['mkt_prob_under']

# 5. Build Bet Records for Evaluation
bets = []
markets = [
    ('HOME', 'edge_home', 'odds.home', 'zoka_prob_home', 'mkt_prob_home', 'H'),
    ('DRAW', 'edge_draw', 'odds.draw', 'zoka_prob_draw', 'mkt_prob_draw', 'D'),
    ('AWAY', 'edge_away', 'odds.away', 'zoka_prob_away', 'mkt_prob_away', 'A'),
    ('OVER 2.5', 'edge_over', 'odds.over_25', 'zoka_prob_over', 'mkt_prob_over', 'O'),
    ('UNDER 2.5', 'edge_under', 'odds.under_25', 'zoka_prob_under', 'mkt_prob_under', 'U')
]

for idx, row in df.iterrows():
    actual_res = row['target']['result']
    actual_ou = 'O' if row['actual_total_goals'] > 2 else 'U'
    
    for mkt_name, edge_col, odds_col, prob_col, mkt_prob_col, res_code in markets:
        book_odds = row.get(odds_col)
        if pd.isna(book_odds) or book_odds <= 1.0: continue
        
        edge = row[edge_col]
        won = 1 if (res_code == actual_res) or (res_code == 'O' and actual_ou == 'O') or (res_code == 'U' and actual_ou == 'U') else 0
        profit = (book_odds - 1.0) if won else -1.0
        
        bets.append({
            'year': row['year'],
            'competition': row['competition'],
            'market': mkt_name,
            'edge': edge,
            'odds': book_odds,
            'zoka_prob': row[prob_col],
            'mkt_prob': row[mkt_prob_col],
            'won': won,
            'profit': profit
        })

bets_df = pd.DataFrame(bets)

# 6. Generate V3 Report
print("\n" + "="*70)
print("               ZOKASCORE MARKET EDGE DIAGNOSTIC V3")
print("="*70)

# A. Walk-Forward Analysis
print("\n[WALK-FORWARD ROI BY YEAR (Edge > 5%)]")
for year in sorted(bets_df['year'].unique()):
    yr_df = bets_df[(bets_df['year'] == year) & (bets_df['edge'] > 0.05)]
    if len(yr_df) > 0:
        roi = (yr_df['profit'].sum() / len(yr_df)) * 100
        wins = yr_df['won'].sum()
        print(f"  {year}: Bets: {len(yr_df):4}  | Wins: {wins:4} ({(wins/len(yr_df))*100:.1f}%) | ROI: {roi:6.2f}%")

# B. Edge Bucket Analysis
print("\n[EDGE BUCKET ANALYSIS (Vig-Removed)]")
edge_bins = [(0.0, 0.02), (0.02, 0.04), (0.04, 0.06), (0.06, 0.08), (0.08, 0.10), (0.10, 0.15), (0.15, 1.0)]
print(f"  {'Edge Range':<12} | {'Bets':<6} | {'Wins':<6} | {'Win%':<7} | {'Avg Odds':<9} | {'Zoka Prob':<10} | {'Mkt Prob':<9} | {'ROI':<7}")
print("  " + "-"*85)

for low, high in edge_bins:
    bucket_df = bets_df[(bets_df['edge'] >= low) & (bets_df['edge'] < high)]
    if len(bucket_df) > 0:
        wins = bucket_df['won'].sum()
        win_pct = (wins / len(bucket_df)) * 100
        roi = (bucket_df['profit'].sum() / len(bucket_df)) * 100
        avg_odds = bucket_df['odds'].mean()
        avg_zoka = bucket_df['zoka_prob'].mean() * 100
        avg_mkt = bucket_df['mkt_prob'].mean() * 100
        print(f"  {low*100:.0f}-{high*100:.0f}%       | {len(bucket_df):<6} | {wins:<6} | {win_pct:<6.1f}% | {avg_odds:<9.2f} | {avg_zoka:<9.1f}% | {avg_mkt:<8.1f}% | {roi:<6.2f}%")

# C. Signal Discovery (Positive ROI by Market & Competition)
print("\n[SIGNAL DISCOVERY: Profitable Markets by Competition (Edge > 4%)]")
signal_df = bets_df[bets_df['edge'] > 0.04]
comp_markets = signal_df.groupby(['competition', 'market']).agg(
    bets=('profit', 'count'),
    wins=('won', 'sum'),
    roi=('profit', lambda x: (x.sum() / len(x)) * 100)
).reset_index()

profitable = comp_markets[comp_markets['roi'] > 0].sort_values(by='roi', ascending=False)

if not profitable.empty:
    print(f"  {'Competition':<30} | {'Market':<10} | {'Bets':<5} | {'Wins':<5} | {'ROI':<7}")
    print("  " + "-"*65)
    for _, row in profitable.head(15).iterrows():
        print(f"  {row['competition']:<30} | {row['market']:<10} | {row['bets']:<5} | {row['wins']:<5} | {row['roi']:>6.2f}%")
else:
    print("  No profitable signals found at >4% edge.")

print("="*70)