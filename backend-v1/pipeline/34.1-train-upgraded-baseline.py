import os
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report

FEATURES_FILE = os.path.join("data", "ml", "features_elo.csv")

print("🧠 ZOKASCORE V2 - Pipeline 34.1: Upgraded Baseline Model")
print("=" * 60)
print()

# 1. LOAD DATA
print(f"📊 Loading features from {FEATURES_FILE}...")
df = pd.read_csv(FEATURES_FILE)
print(f"   ✅ Loaded {len(df):,} matches.")

# 2. PREPARE DATA
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.sort_values("date").reset_index(drop=True)

# Use both absolute ratings and the difference
X = df[["home_elo_pre", "away_elo_pre", "elo_diff"]]
y = df["target"]

# 3. CHRONOLOGICAL 80/20 SPLIT
split_idx = int(len(df) * 0.8)

X_train = X.iloc[:split_idx]
X_test = X.iloc[split_idx:]
y_train = y.iloc[:split_idx]
y_test = y.iloc[split_idx:]

print("📚 Chronological split")
print(f"   🏋️ Training: {len(X_train):,} matches (Through {df.iloc[split_idx-1]['date'].date()})")
print(f"   🧪 Testing:  {len(X_test):,} matches (From {df.iloc[split_idx]['date'].date()})")

# 4. TRAIN MODEL
print("\n⚙️ Training Logistic Regression (with class_weight='balanced')...")

model = LogisticRegression(
    solver="lbfgs",
    max_iter=1000,
    class_weight="balanced" # Force the model to care about DRAWs
)

model.fit(X_train, y_train)

# 5. EVALUATE
print("📈 Evaluating on unseen chronological test data...")
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)

# 6. RESULTS
print("\n" + "=" * 60)
print("✅ UPGRADED MODEL TRAINING COMPLETE")
print("=" * 60)
print(f"🎯 Model Accuracy:  {accuracy * 100:.2f}%")
print("📊 Target Baseline: 47.97%")

difference = (accuracy * 100) - 47.97
if difference > 0:
    print(f"🚀 Improvement:     +{difference:.2f} percentage points")

print("\n📋 Classification Report")
print("-" * 60)
# Use zero_division=0 to suppress the warning cleanly
print(classification_report(y_test, y_pred, zero_division=0))
print("=" * 60)