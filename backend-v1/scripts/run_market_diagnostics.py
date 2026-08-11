import pandas as pd
import json
import xgboost as xgb
import numpy as np
from scipy.stats import poisson
from sklearn.metrics import log_loss, brier_score_loss
from collections import defaultdict

# 1. Load the V1 Zoka Engine Models
print("[Diag] Loading AI Engine Models...")
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

# 2. Load the Datasets
print("[Diag] Loading datasets...")
data = []
with open('public_data/backtest_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data.append(json.loads(line))

df = pd.DataFrame(data)
features_df = pd.json_normalize(df['features'])
df = pd.concat([df.drop(columns=['features']), features_df], axis=1)

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

print(f"[Diag] Analyzing {len(df)} matches in 2024+...")

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0)

# 3. Get Zoka Probabilities
probs_1x2 = xgb_model.predict_proba(X)
# Classes: 0=Away, 1=Draw, 2=Home
df['zoka_prob_away'] = probs_1x2[:, 0]
df['zoka_prob_draw'] = probs_1x2[:, 1]
df['zoka_prob_home'] = probs_1x2[:, 2]

# ★ FIX: Assign expected goals to DataFrame columns
df['exp_home_goals'] = home_goal_model.predict(X)
df['exp_away_goals'] = away_goal_model.predict(X)

# 4. Calculate Goal Markets using Poisson Matrix
def calc_goal_markets(h_exp, a_exp):
    max_goals = 10
    h_dist = [poisson.pmf(i, h_exp) for i in range(max_goals)]
    a_dist = [poisson.pmf(i, a_exp) for i in range(max_goals)]
    over = 0.0
    under = 0.0
    for h in range(max_goals):
        for a in range(max_goals):
            p = h_dist[h] * a_dist[a]
            if h + a > 2: over += p
            else: under += p
    return over, under

df['zoka_prob_over_2_5'], df['zoka_prob_under_2_5'] = zip(*df.apply(lambda r: calc_goal_markets(r['exp_home_goals'], r['exp_away_goals']), axis=1))

# 5. Calculate Model Metrics (Log Loss & Brier)
y_true_home = (df['target'].apply(lambda x: x['result']) == 'H').astype(int)
y_true_multi = df['target'].apply(lambda x: x['result']).map({'A': 0, 'D': 1, 'H': 2})
ll = log_loss(y_true_multi, probs_1x2)
brier_h = brier_score_loss(y_true_home, df['zoka_prob_home'])

# Helper function for ROI calculation
def calc_roi(bets_df):
    if len(bets_df) == 0: return 0.0, 0
    profit = 0.0
    for _, row in bets_df.iterrows():
        if row['actual_result'] == row['bet_type']:
            profit += (row['book_odds'] - 1.0)
        else:
            profit -= 1.0
    return (profit / len(bets_df)) * 100, len(bets_df)

# 6. Generate Report Data
report_lines = []
report_lines.append("\n" + "="*60)
report_lines.append("          ZOKASCORE MODEL DIAGNOSTICS V2")
report_lines.append("="*60)
report_lines.append(f"OVERALL")
report_lines.append(f"Matches:              {len(df)}")
report_lines.append(f"Log Loss (1X2):       {ll:.4f}")
report_lines.append(f"Brier Score (Home):   {brier_h:.4f}")
report_lines.append("-"*60)

# CALIBRATION (Predicted vs Actual)
report_lines.append("CALIBRATION (1X2 Home Win)")
calib_bins = [(0.5, 0.55), (0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 0.75), (0.75, 0.8), (0.8, 1.0)]
for low, high in calib_bins:
    bin_df = df[(df['zoka_prob_home'] >= low) & (df['zoka_prob_home'] < high)]
    if len(bin_df) > 0:
        actual = y_true_home[bin_df.index].mean()
        report_lines.append(f"{low*100:.0f}-{high*100:.0f}%   Predicted ~{(low+high)/2*100:.0f}%   Actual: {actual*100:.1f}%   (Matches: {len(bin_df)})")

report_lines.append("-"*60)

# EDGE ANALYSIS & MARKET ROI
report_lines.append("MARKET ROI & EDGE ANALYSIS (5% Edge Required)")
markets = [
    ('HOME', 'zoka_prob_home', 'home', 'H'),
    ('DRAW', 'zoka_prob_draw', 'draw', 'D'),
    ('AWAY', 'zoka_prob_away', 'away', 'A'),
    ('OVER 2.5', 'zoka_prob_over_2_5', 'over_25', 'O'),
    ('UNDER 2.5', 'zoka_prob_under_2_5', 'under_25', 'U')
]

market_summary = []
for mkt_name, prob_col, odds_col, res_code in markets:
    mkt_roi_data = []
    for idx, row in df.iterrows():
        book_odds = row['odds'].get(odds_col)
        if pd.isna(book_odds) or book_odds <= 1.0: continue
        implied = 1.0 / book_odds
        edge = row[prob_col] - implied
        if edge > 0.05:
            mkt_roi_data.append({'actual_result': row['target']['result'], 'bet_type': res_code, 'book_odds': book_odds, 'total_goals': row['actual_total_goals']})
            
    mkt_df = pd.DataFrame(mkt_roi_data)
    if not mkt_df.empty:
        # Fix actual result for Over/Under
        if res_code == 'O':
            mkt_df['actual_result'] = mkt_df.apply(lambda x: 'O' if x['total_goals'] > 2 else 'X', axis=1)
        elif res_code == 'U':
            mkt_df['actual_result'] = mkt_df.apply(lambda x: 'U' if x['total_goals'] < 3 else 'X', axis=1)
            
    roi, count = calc_roi(mkt_df)
    market_summary.append(f"{mkt_name:10}  Bets: {count:4}  ROI: {roi:6.2f}%")
    
for line in market_summary:
    report_lines.append(line)

report_lines.append("-"*60)

# COMPETITION ROI (Top 5 and Bottom 5)
report_lines.append("COMPETITION ANALYSIS (Top 5 by ROI, >5% Edge)")
comp_rois = []
for comp, comp_df in df.groupby('competition'):
    if len(comp_df) < 50: continue # Skip tiny leagues
    
    comp_bets = []
    for idx, row in comp_df.iterrows():
        for prob_col, odds_col, res_code in [('zoka_prob_home', 'home', 'H'), ('zoka_prob_away', 'away', 'A'), ('zoka_prob_over_2_5', 'over_25', 'O')]:
            book_odds = row['odds'].get(odds_col)
            if pd.isna(book_odds) or book_odds <= 1.0: continue
            if row[prob_col] - (1.0/book_odds) > 0.05:
                comp_bets.append({'actual_result': row['target']['result'], 'bet_type': res_code, 'book_odds': book_odds, 'total_goals': row['actual_total_goals']})
                
    bet_df = pd.DataFrame(comp_bets)
    if bet_df.empty: continue
    
    # Fix actual result for Over
    bet_df['actual_result'] = bet_df.apply(lambda x: 'O' if x['total_goals'] > 2 and x['bet_type']=='O' else x['actual_result'], axis=1)
    
    roi, count = calc_roi(bet_df)
    comp_rois.append((comp, count, roi))

comp_rois.sort(key=lambda x: x[2], reverse=True)
for comp, count, roi in comp_rois[:5]:
    report_lines.append(f"{comp:30} Bets: {count:4}  ROI: {roi:6.2f}%")

report_lines.append("="*60)

# Print the whole report
for line in report_lines:
    print(line)