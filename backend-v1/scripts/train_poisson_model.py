import pandas as pd
import json
import xgboost as xgb
from sklearn.metrics import mean_absolute_error
import numpy as np
import joblib

# 1. Load the dataset
print("[Poisson] Loading prediction_dataset.jsonl...")
data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data.append(json.loads(line))

df = pd.DataFrame(data)
features_df = pd.json_normalize(df['features'])
df = pd.concat([df.drop(columns=['features']), features_df], axis=1)

# Extract actual goals
df['home_goals'] = df['target'].apply(lambda x: x.get('home_goals'))
df['away_goals'] = df['target'].apply(lambda x: x.get('away_goals'))

# ★ FIX: Drop any rows with missing goals or infinite values
df = df.replace([np.inf, -np.inf], np.nan)
df = df.dropna(subset=['home_goals', 'away_goals'])

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].fillna(0)
y_home = df['home_goals'].astype(int)
y_away = df['away_goals'].astype(int)

# Out-of-Time Split
df['date'] = pd.to_datetime(df['date'])
train_idx = df['date'] < '2024-01-01'
test_idx = df['date'] >= '2024-01-01'

X_train, X_test = X[train_idx], X[test_idx]
y_home_train, y_home_test = y_home[train_idx], y_home[test_idx]
y_away_train, y_away_test = y_away[train_idx], y_away[test_idx]

# 2. Train Poisson Models for Home and Away Goals
print("[Poisson] Training Poisson Regressor for Home Goals...")
home_model = xgb.XGBRegressor(
    objective='count:poisson', 
    n_estimators=300, 
    max_depth=3, 
    learning_rate=0.1,
    eval_metric='poisson-nloglik'
)
home_model.fit(X_train, y_home_train)

print("[Poisson] Training Poisson Regressor for Away Goals...")
away_model = xgb.XGBRegressor(
    objective='count:poisson', 
    n_estimators=300, 
    max_depth=3, 
    learning_rate=0.1,
    eval_metric='poisson-nloglik'
)
away_model.fit(X_train, y_away_train)

# 3. Evaluate
home_preds = home_model.predict(X_test)
away_preds = away_model.predict(X_test)

home_mae = mean_absolute_error(y_home_test, home_preds)
away_mae = mean_absolute_error(y_away_test, away_preds)

print("\n========================================")
print("📊 ZOKASCORE POISSON GOAL MODEL METRICS")
print("========================================")
print(f"Home Goals MAE : {home_mae:.3f} (Average error in goals per match)")
print(f"Away Goals MAE : {away_mae:.3f} (Average error in goals per match)")

# Example: Average predicted goals for a random match
print(f"\nAverage Actual Home Goals : {y_home_test.mean():.2f}")
print(f"Average Predicted Home Goals : {home_preds.mean():.2f}")
print(f"Average Actual Away Goals : {y_away_test.mean():.2f}")
print(f"Average Predicted Away Goals : {away_preds.mean():.2f}")

# Save the models
home_model.save_model('public_data/poisson_home_goals.json')
away_model.save_model('public_data/poisson_away_goals.json')
print("\n[Poisson] Models saved to public_data/poisson_home_goals.json & poisson_away_goals.json")