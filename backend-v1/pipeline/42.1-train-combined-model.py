import os
import numpy as np
import pandas as pd
import xgboost as xgb

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    balanced_accuracy_score,
    f1_score,
    log_loss
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight

FEATURES_FILE = os.path.join("data", "ml", "features_v3.csv")
RANDOM_STATE = 42
LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

print("🧠 ZOKASCORE V2 - Pipeline 42.1: Combined Raw + Relative Features")
print("=" * 60)
print()

# 1. LOAD DATA
print(f"📊 Loading features from {FEATURES_FILE}...")
df = pd.read_csv(FEATURES_FILE, low_memory=False)
print(f"   ✅ Loaded {len(df):,} matches.")

# 2. CLEAN / SORT
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.dropna(subset=["date", "target"]).copy()
df = df.sort_values("date", kind="stable").reset_index(drop=True)

# 3. ENGINEER RELATIVE FEATURES
print("\n⚙️ Engineering relative interaction features...")
df["elo_diff_abs"] = df["home_elo_pre"] - df["away_elo_pre"]
df["form_diff"] = df["home_ewma_points"] - df["away_ewma_points"]
df["gd_diff"] = df["home_ewma_gd"] - df["away_ewma_gd"]
df["home_att_vs_away_def"] = df["home_ewma_gf"] - df["away_ewma_ga"]
df["away_att_vs_home_def"] = df["away_ewma_gf"] - df["home_ewma_ga"]
df["venue_form_diff"] = df["home_ewma_home_points"] - df["away_ewma_away_points"]
df["venue_gd_diff"] = df["home_ewma_home_gd"] - df["away_ewma_away_gd"]
df["venue_home_att_vs_away_def"] = df["home_ewma_home_gf"] - df["away_ewma_away_ga"]
df["venue_away_att_vs_home_def"] = df["away_ewma_away_gf"] - df["home_ewma_home_ga"]
df["elo_form_conflict"] = df["elo_diff_abs"] * df["form_diff"]
df["venue_elo_form_conflict"] = df["elo_diff_abs"] * df["venue_form_diff"]

# 4. DEFINE FINAL FEATURE SET (Raw + Relative)
RAW_FEATURES = [
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

RELATIVE_FEATURES = [
    "elo_diff_abs", "form_diff", "gd_diff",
    "home_att_vs_away_def", "away_att_vs_home_def",
    "venue_form_diff", "venue_gd_diff",
    "venue_home_att_vs_away_def", "venue_away_att_vs_home_def",
    "elo_form_conflict", "venue_elo_form_conflict"
]

FEATURE_COLUMNS = RAW_FEATURES + RELATIVE_FEATURES
print(f"   ✅ Total features: {len(FEATURE_COLUMNS)} (Raw + Relative)")

X = df[FEATURE_COLUMNS].astype(float)
y = df["target"].astype(str)

# 5. ENCODE TARGET & SPLIT
le = LabelEncoder()
y_encoded = le.fit_transform(y)

split_idx = int(len(df) * 0.8)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
y_train, y_test = y_encoded[:split_idx], y_encoded[split_idx:]

print(f"\n📚 Chronological split")
print(f"   🏋️ Training: {len(X_train):,} matches")
print(f"   🧪 Testing:  {len(X_test):,} matches")

# 6. TRAIN MODEL
print("\n⚡ Training XGBoost (Balanced + Combined Features)...")
sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)

model = xgb.XGBClassifier(
    objective="multi:softprob", num_class=3, n_estimators=300,
    learning_rate=0.05, max_depth=6, min_child_weight=3,
    subsample=0.85, colsample_bytree=0.85, random_state=RANDOM_STATE,
    n_jobs=-1, eval_metric="mlogloss", tree_method="hist"
)
model.fit(X_train, y_train, sample_weight=sample_weights)

# 7. PREDICTIONS
print("📈 Evaluating on unseen chronological test data...")
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)

y_test_str = le.inverse_transform(y_test)
y_pred_str = le.inverse_transform(y_pred)

# 8. METRICS
accuracy = accuracy_score(y_test_str, y_pred_str)
balanced_accuracy = balanced_accuracy_score(y_test_str, y_pred_str)
macro_f1 = f1_score(y_test_str, y_pred_str, average="macro")
weighted_f1 = f1_score(y_test_str, y_pred_str, average="weighted")
logloss = log_loss(y_test, y_prob, labels=np.arange(len(le.classes_)))

# 9. RESULTS
print("\n" + "=" * 60)
print("✅ PIPELINE 42.1 COMPLETE")
print("=" * 60)

print(f"🎯 Accuracy:              {accuracy * 100:.2f}%")
print(f"⚖️ Balanced Accuracy:     {balanced_accuracy * 100:.2f}%")
print(f"🧠 Macro F1:              {macro_f1 * 100:.2f}%")
print(f"📊 Weighted F1:           {weighted_f1 * 100:.2f}%")
print(f"📉 Log Loss:              {logloss:.4f}")

print("\n📊 Reference Models")
print("-" * 60)
print("   XGBoost Balanced (v2):   48.66%")
print("   XGBoost EWMA (v3):       49.16% (Macro F1: 46.92%)")

diff = (accuracy * 100) - 49.16
print(f"\n🚀 vs Pipeline 41 (EWMA):  {diff:+.2f} pp")

print("\n📋 Classification Report")
print("-" * 60)
print(classification_report(y_test_str, y_pred_str, labels=LABELS, zero_division=0))

print("🧩 Confusion Matrix")
print("-" * 60)
cm = confusion_matrix(y_test_str, y_pred_str, labels=LABELS)
print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
for i, label in enumerate(LABELS):
    print(f"{label:>12}{cm[i, 0]:>12,}{cm[i, 1]:>12,}{cm[i, 2]:>12,}")

print("\n🧠 Top 15 Feature Importances")
print("-" * 60)
importances = model.feature_importances_
for feat, imp in sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)[:15]:
    print(f"   {feat:<30} {imp * 100:>6.2f}%")

print("\n" + "=" * 60)