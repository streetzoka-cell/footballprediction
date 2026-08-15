import os
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    balanced_accuracy_score, f1_score, log_loss
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight

FEATURES_FILE = os.path.join("data", "ml", "features_v3.csv")
RANDOM_STATE = 42

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_points", "away_ewma_points",
    "home_ewma_gd", "away_ewma_gd",
    "home_ewma_gf", "away_ewma_gf",
    "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_points", "away_ewma_away_points",
    "home_ewma_home_gd", "away_ewma_away_gd",
    "home_ewma_home_gf", "away_ewma_away_gf",
    "home_ewma_home_ga", "away_ewma_away_ga",
    "home_matches_before", "away_matches_before",
    "home_home_matches_before", "away_away_matches_before"
]

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

print("🧠 ZOKASCORE V2 - Pipeline 41 TUNE: XGBoost Hyperparameter Optimization")
print("=" * 60)
print()

# 1. LOAD & PREP DATA
df = pd.read_csv(FEATURES_FILE, low_memory=False)
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.dropna(subset=["date", "target"] + FEATURE_COLUMNS).copy()
df = df.sort_values("date", kind="stable").reset_index(drop=True)

X = df[FEATURE_COLUMNS].astype(float)
y = df["target"].astype(str)
le = LabelEncoder()
y_encoded = le.fit_transform(y)

# 2. CHRONOLOGICAL SPLIT
split_idx = int(len(df) * 0.8)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
y_train, y_test = y_encoded[:split_idx], y_encoded[split_idx:]

print(f"🏋️ Training: {len(X_train):,} | 🧪 Testing: {len(X_test):,}")

# 3. BALANCED WEIGHTS
sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)

# 4. HYPERPARAMETER GRID
# This defines the search space for the algorithm
param_grid = {
    'n_estimators': [200, 300, 400, 500],
    'learning_rate': [0.01, 0.05, 0.1, 0.2],
    'max_depth': [4, 5, 6, 7, 8],
    'min_child_weight': [1, 3, 5, 7],
    'subsample': [0.7, 0.8, 0.9, 1.0],
    'colsample_bytree': [0.7, 0.8, 0.9, 1.0],
    'gamma': [0.0, 0.1, 0.2],
    'reg_alpha': [0.0, 0.1, 1.0],
    'reg_lambda': [0.1, 1.0, 5.0]
}

# 5. TIME-SERIES CROSS VALIDATION
# We MUST use TimeSeriesSplit so it never trains on future data to predict the past
tscv = TimeSeriesSplit(n_splits=3)

# We optimize for Macro F1 because it forces the model to care about Draws
base_model = xgb.XGBClassifier(
    objective="multi:softprob", num_class=3, 
    random_state=RANDOM_STATE, n_jobs=-1, 
    eval_metric="mlogloss", tree_method="hist"
)

print("\n⚙️ Starting Randomized Search (50 iterations)...")
print("   (This may take 5-10 minutes depending on your CPU)")

search = RandomizedSearchCV(
    estimator=base_model,
    param_distributions=param_grid,
    n_iter=50, # Test 50 random combinations
    scoring='f1_macro', # Optimize for balanced 1X2 prediction
    cv=tscv, # Chronological cross-validation
    verbose=1,
    random_state=RANDOM_STATE,
    n_jobs=-1
)

# Fit the search (passing sample weights to the underlying model)
search.fit(X_train, y_train, sample_weight=sample_weights)

print(f"\n🏆 BEST PARAMETERS FOUND:")
print(search.best_params_)

# 6. EVALUATE BEST MODEL ON UNSEEN TEST SET
best_model = search.best_estimator_
y_pred = best_model.predict(X_test)
y_prob = best_model.predict_proba(X_test)

y_test_str = le.inverse_transform(y_test)
y_pred_str = le.inverse_transform(y_pred)

# 7. METRICS
accuracy = accuracy_score(y_test_str, y_pred_str)
balanced_accuracy = balanced_accuracy_score(y_test_str, y_pred_str)
macro_f1 = f1_score(y_test_str, y_pred_str, average="macro")
weighted_f1 = f1_score(y_test_str, y_pred_str, average="weighted")
logloss = log_loss(y_test, y_prob, labels=np.arange(len(le.classes_)))

# 8. RESULTS
print("\n" + "=" * 60)
print("✅ HYPERPARAMETER TUNING COMPLETE")
print("=" * 60)

print(f"🎯 Accuracy:              {accuracy * 100:.2f}%")
print(f"⚖️ Balanced Accuracy:     {balanced_accuracy * 100:.2f}%")
print(f"🧠 Macro F1:              {macro_f1 * 100:.2f}%")
print(f"📊 Weighted F1:           {weighted_f1 * 100:.2f}%")
print(f"📉 Log Loss:              {logloss:.4f}")

print("\n📊 Reference Models")
print("-" * 60)
print("   Pipeline 41 (Default):  49.16% (Macro F1: 46.92%)")

diff = (accuracy * 100) - 49.16
print(f"\n🚀 vs Pipeline 41:        {diff:+.2f} pp")

print("\n📋 Classification Report")
print("-" * 60)
print(classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))

print("🧩 Confusion Matrix")
print("-" * 60)
cm = confusion_matrix(y_test_str, y_pred_str, labels=LABELS)
print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
for i, label in enumerate(LABELS):
    print(f"{label:>12}{cm[i, 0]:>12,}{cm[i, 1]:>12,}{cm[i, 2]:>12,}")

print("\n" + "=" * 60)