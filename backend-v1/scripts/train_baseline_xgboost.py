import pandas as pd
import json
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss, classification_report
from sklearn.preprocessing import LabelEncoder
import numpy as np

# 1. Load the JSONL dataset
print("[ML] Loading prediction_dataset.jsonl...")
data = []
with open('public_data/prediction_dataset.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data.append(json.loads(line))

df = pd.DataFrame(data)

# 2. Extract Features and Target
# Expand the 'features' dictionary into actual columns
features_df = pd.json_normalize(df['features'])
df = pd.concat([df.drop(columns=['features']), features_df], axis=1)

# Map target "H", "D", "A" to 0, 1, 2
le = LabelEncoder()
df['target_code'] = le.fit_transform(df['target'].apply(lambda x: x['result']))

# Select the features the model is allowed to see
feature_cols = [
    'home_elo', 'away_elo', 
    'home_form_pts_5', 'away_form_pts_5', 
    'home_form_gf_5', 'away_form_gf_5', 
    'home_form_ga_5', 'away_form_ga_5',
    'home_win_pct_home', 'away_win_pct_away',
    'home_avg_goals_home', 'away_avg_goals_away',
    'h2h_meetings', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws'
]

# Fill any missing values with 0
X = df[feature_cols].fillna(0)
y = df['target_code']

# 3. Out-of-Time Split (Train up to 2023, Test 2024+)
print("[ML] Splitting data Out-of-Time (Train < 2024, Test >= 2024)...")
df['date'] = pd.to_datetime(df['date'])
train_idx = df['date'] < '2024-01-01'
test_idx = df['date'] >= '2024-01-01'

X_train, y_train = X[train_idx], y[train_idx]
X_test, y_test = X[test_idx], y[test_idx]

print(f"Train size: {len(X_train)} matches")
print(f"Test size: {len(X_test)} matches (The Future)")

# 4. Train XGBoost Model
print("[ML] Training XGBoost Baseline Model...")
model = xgb.XGBClassifier(
    n_estimators=300,
    max_depth=4,
    learning_rate=0.1,
    objective='multi:softprob',
    eval_metric='mlogloss',
    random_state=42
)
model.fit(X_train, y_train)

# 5. Evaluate
print("\n========================================")
print("📊 ZOKASCORE BASELINE MODEL METRICS")
print("========================================")

# Predict probabilities
probs = model.predict_proba(X_test)
preds = np.argmax(probs, axis=1)

# Accuracy
acc = accuracy_score(y_test, preds)
print(f"Out-of-Time Accuracy : {acc * 100:.2f}%")

# Log Loss (Crucial for probability calibration)
ll = log_loss(y_test, probs)
print(f"Log Loss             : {ll:.4f} (Lower is better)")

print("\nClassification Report:")
print(classification_report(y_test, preds, target_names=le.classes_))

# Save the model
model.save_model('public_data/xgboost_baseline.json')
print("\n[ML] Model saved to public_data/xgboost_baseline.json")
print("[ML] Done! Step 2 & 3 complete.")