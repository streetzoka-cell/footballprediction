import pandas as pd
import json
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss, brier_score_loss
from sklearn.preprocessing import LabelEncoder
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator # ★ New modern way to prefit
import numpy as np
import joblib

print("[Calibrate] Loading prediction_dataset.jsonl...")
data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data.append(json.loads(line))

df = pd.DataFrame(data)
features_df = pd.json_normalize(df['features'])
df = pd.concat([df.drop(columns=['features']), features_df], axis=1)

le = LabelEncoder()
df['target_code'] = le.fit_transform(df['target'].apply(lambda x: x['result']))

feature_cols = [
    'home_elo', 'away_elo', 'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away', 'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

X = df[feature_cols].fillna(0)
y = df['target_code']

# Out-of-Time Split
df['date'] = pd.to_datetime(df['date'])
# We need a calibration set (2022-2023) and a final test set (2024+)
train_idx = df['date'] < '2022-01-01'
calib_idx = (df['date'] >= '2022-01-01') & (df['date'] < '2024-01-01')
test_idx = df['date'] >= '2024-01-01'

X_train, y_train = X[train_idx], y[train_idx]
X_calib, y_calib = X[calib_idx], y[calib_idx]
X_test, y_test = X[test_idx], y[test_idx]

print(f"Train size: {len(X_train)}")
print(f"Calibration size: {len(X_calib)}")
print(f"Test size (The Future): {len(X_test)}")

# 1. Load the baseline model
print("[Calibrate] Loading baseline XGBoost model...")
model = xgb.XGBClassifier()
model.load_model('public_data/xgboost_baseline.json')

# 2. Calibrate using Isotonic Regression (Modern scikit-learn syntax)
print("[Calibrate] Calibrating probabilities (Isotonic)...")
frozen_model = FrozenEstimator(model)
calibrated_model = CalibratedClassifierCV(frozen_model, method='isotonic')
calibrated_model.fit(X_calib, y_calib)

# 3. Evaluate the Calibrated Model
print("\n========================================")
print("📊 ZOKASCORE CALIBRATED MODEL METRICS")
print("========================================")

probs = calibrated_model.predict_proba(X_test)
preds = np.argmax(probs, axis=1)

acc = accuracy_score(y_test, preds)
ll = log_loss(y_test, probs)

print(f"Calibrated Accuracy   : {acc * 100:.2f}%")
print(f"Calibrated Log Loss    : {ll:.4f}")

# Brier Score for Home Win (Lower is better, 0.25 is random)
brier_h = brier_score_loss((y_test == 2).astype(int), probs[:, 2])
print(f"Brier Score (Home Win) : {brier_h:.4f}")

# Save the calibrated pipeline (contains both the model and the calibrator)
joblib.dump(calibrated_model, 'public_data/xgboost_calibrated_pipeline.pkl')
print("\n[Calibrate] Calibrated pipeline saved to public_data/xgboost_calibrated_pipeline.pkl")