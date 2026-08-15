import os
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report

FEATURES_FILE = os.path.join("data", "ml", "features_elo.csv")

print("?? ZOKASCORE V2 - Pipeline 34: Baseline Model Training")
print("=" * 60)
print()

# ------------------------------------------------------------
# 1. LOAD DATA
# ------------------------------------------------------------

print(f"?? Loading features from {FEATURES_FILE}...")

df = pd.read_csv(FEATURES_FILE)

print(f"   ? Loaded {len(df):,} matches.")

# ------------------------------------------------------------
# 2. VALIDATE DATA
# ------------------------------------------------------------

required = [
    "match_id",
    "date",
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",
    "target"
]

missing = [c for c in required if c not in df.columns]

if missing:
    raise ValueError(f"Missing required columns: {missing}")

if df["elo_diff"].isna().any():
    raise ValueError("elo_diff contains missing values.")

if df["target"].isna().any():
    raise ValueError("target contains missing values.")

# Ensure chronological ordering
df["date"] = pd.to_datetime(df["date"], errors="coerce")

if df["date"].isna().any():
    raise ValueError("Invalid dates found in feature dataset.")

df = df.sort_values("date").reset_index(drop=True)

print(f"   ?? First match: {df.iloc[0]['date'].date()}")
print(f"   ?? Last match:  {df.iloc[-1]['date'].date()}")

# ------------------------------------------------------------
# 3. FEATURES / TARGET
# ------------------------------------------------------------

X = df[["elo_diff"]]
y = df["target"]

# ------------------------------------------------------------
# 4. CHRONOLOGICAL 80/20 SPLIT
# ------------------------------------------------------------

split_idx = int(len(df) * 0.8)

X_train = X.iloc[:split_idx]
X_test = X.iloc[split_idx:]

y_train = y.iloc[:split_idx]
y_test = y.iloc[split_idx:]

train_end_date = df.iloc[split_idx - 1]["date"]
test_start_date = df.iloc[split_idx]["date"]

print()
print("?? Chronological split")
print(f"   ??? Training: {len(X_train):,} matches")
print(f"      Through: {train_end_date.date()}")
print(f"   ?? Testing:  {len(X_test):,} matches")
print(f"      From:    {test_start_date.date()}")

# ------------------------------------------------------------
# 5. TRAIN MODEL
# ------------------------------------------------------------

print()
print("?? Training Logistic Regression...")

model = LogisticRegression(
    solver="lbfgs",
    max_iter=1000
)

model.fit(X_train, y_train)

# ------------------------------------------------------------
# 6. EVALUATE
# ------------------------------------------------------------

print("?? Evaluating on unseen chronological test data...")

y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)

# ------------------------------------------------------------
# 7. RESULTS
# ------------------------------------------------------------

print()
print("=" * 60)
print("? BASELINE MODEL TRAINING COMPLETE")
print("=" * 60)

print(f"?? Model Accuracy:  {accuracy * 100:.2f}%")
print("?? Target Baseline: 47.97%")

difference = (accuracy * 100) - 47.97

if difference > 0:
    print(f"?? Improvement:     +{difference:.2f} percentage points")
elif difference < 0:
    print(f"?? Difference:       {difference:.2f} percentage points")
else:
    print("? Difference:       0.00 percentage points")

print()
print("?? Classification Report")
print("-" * 60)
print(classification_report(y_test, y_pred))

print("=" * 60)
