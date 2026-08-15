import os
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

FEATURES_FILE = os.path.join("data", "ml", "features_v2.csv")

print("🧠 ZOKASCORE V2 - Pipeline 36: Advanced Model Training")
print("=" * 60)
print()

# ============================================================
# 1. LOAD DATA
# ============================================================

print(f"📊 Loading features from {FEATURES_FILE}...")

if not os.path.exists(FEATURES_FILE):
    raise FileNotFoundError(
        f"Features file not found: {FEATURES_FILE}\n"
        "Run Pipeline 35 first."
    )

df = pd.read_csv(FEATURES_FILE)

print(f"   ✅ Loaded {len(df):,} matches.")

# ============================================================
# 2. VALIDATE REQUIRED COLUMNS
# ============================================================

FEATURE_COLUMNS = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",
    "home_form_pts",
    "away_form_pts",
    "home_home_pts",
    "away_away_pts",
    "home_gf_avg",
    "away_gf_avg",
    "home_ga_avg",
    "away_ga_avg",
    "h2h_hw_rate",
    "h2h_d_rate",
    "h2h_aw_rate",
    "h2h_matches",
]

TARGET_COLUMN = "target"
DATE_COLUMN = "date"

required_columns = FEATURE_COLUMNS + [TARGET_COLUMN, DATE_COLUMN]

missing = [
    col for col in required_columns
    if col not in df.columns
]

if missing:
    raise ValueError(
        "Missing required columns:\n"
        + "\n".join(f"  - {x}" for x in missing)
    )

# ============================================================
# 3. CLEAN + CHRONOLOGICAL ORDER
# ============================================================

df[DATE_COLUMN] = pd.to_datetime(
    df[DATE_COLUMN],
    errors="coerce"
)

if df[DATE_COLUMN].isna().any():
    bad_dates = int(df[DATE_COLUMN].isna().sum())
    raise ValueError(
        f"Found {bad_dates:,} rows with invalid dates."
    )

# Convert all model features to numeric.
for column in FEATURE_COLUMNS:
    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )

invalid_features = df[FEATURE_COLUMNS].isna().any(axis=1)

if invalid_features.any():
    count = int(invalid_features.sum())
    raise ValueError(
        f"Found {count:,} rows containing invalid feature values."
    )

df = df.sort_values(
    DATE_COLUMN,
    kind="stable"
).reset_index(drop=True)

print(
    f"   📅 Date range: "
    f"{df.iloc[0][DATE_COLUMN].date()} → "
    f"{df.iloc[-1][DATE_COLUMN].date()}"
)

# ============================================================
# 4. TARGET VALIDATION
# ============================================================

VALID_TARGETS = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
}

invalid_targets = ~df[TARGET_COLUMN].isin(VALID_TARGETS)

if invalid_targets.any():
    count = int(invalid_targets.sum())
    raise ValueError(
        f"Found {count:,} rows with invalid targets."
    )

print("\n🎯 Target distribution")

target_counts = df[TARGET_COLUMN].value_counts()

for target in ["HOME_WIN", "DRAW", "AWAY_WIN"]:
    print(
        f"   {target:<10} "
        f"{int(target_counts.get(target, 0)):>8,}"
    )

# ============================================================
# 5. PREPARE X / Y
# ============================================================

X = df[FEATURE_COLUMNS]
y = df[TARGET_COLUMN]

# ============================================================
# 6. CHRONOLOGICAL 80/20 SPLIT
# ============================================================

split_idx = int(len(df) * 0.80)

if split_idx <= 0 or split_idx >= len(df):
    raise ValueError("Invalid chronological split.")

X_train = X.iloc[:split_idx]
X_test = X.iloc[split_idx:]

y_train = y.iloc[:split_idx]
y_test = y.iloc[split_idx:]

train_end_date = df.iloc[split_idx - 1][DATE_COLUMN]
test_start_date = df.iloc[split_idx][DATE_COLUMN]

print("\n📚 Chronological split")
print(
    f"   🏋️ Training: {len(X_train):,} matches"
    f" (Through {train_end_date.date()})"
)

print(
    f"   🧪 Testing:  {len(X_test):,} matches"
    f" (From {test_start_date.date()})"
)

# ============================================================
# 7. TRAIN RANDOM FOREST
# ============================================================

print(
    "\n🌲 Training Random Forest Classifier..."
)

print(
    "   • Trees: 100"
    "\n   • Class weighting: balanced"
    "\n   • Random state: 42"
    "\n   • CPU workers: all"
)

model = RandomForestClassifier(
    n_estimators=100,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)

model.fit(X_train, y_train)

# ============================================================
# 8. PREDICTION
# ============================================================

print(
    "\n📈 Evaluating on unseen chronological test data..."
)

y_pred = model.predict(X_test)

accuracy = accuracy_score(
    y_test,
    y_pred
)

# ============================================================
# 9. RESULTS
# ============================================================

print("\n" + "=" * 60)
print("✅ PIPELINE 36 COMPLETE")
print("=" * 60)

print(
    f"🎯 Model Accuracy:       {accuracy * 100:.2f}%"
)

print(
    "📊 Target Baseline:       47.97%"
)

print(
    "📊 ELO-only:              52.71%"
)

print(
    "📊 Balanced ELO:          48.58%"
)

baseline_difference = (
    accuracy * 100
) - 47.97

elo_difference = (
    accuracy * 100
) - 52.71

print(
    f"🚀 vs Baseline:           "
    f"{baseline_difference:+.2f} percentage points"
)

print(
    f"⚽ vs ELO-only:           "
    f"{elo_difference:+.2f} percentage points"
)

# ============================================================
# 10. CLASSIFICATION REPORT
# ============================================================

print("\n📋 Classification Report")
print("-" * 60)

print(
    classification_report(
        y_test,
        y_pred,
        labels=["HOME_WIN", "DRAW", "AWAY_WIN"],
        zero_division=0,
    )
)

# ============================================================
# 11. CONFUSION MATRIX
# ============================================================

print("🧩 Confusion Matrix")
print("-" * 60)

labels = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
]

cm = confusion_matrix(
    y_test,
    y_pred,
    labels=labels,
)

print(
    f"{'':>12}"
    f"{'HOME_WIN':>12}"
    f"{'DRAW':>12}"
    f"{'AWAY_WIN':>12}"
)

for i, label in enumerate(labels):
    print(
        f"{label:>12}"
        f"{cm[i, 0]:>12,}"
        f"{cm[i, 1]:>12,}"
        f"{cm[i, 2]:>12,}"
    )

# ============================================================
# 12. FEATURE IMPORTANCE
# ============================================================

print("\n🧠 Feature Importances")
print("-" * 60)

importances = model.feature_importances_

importance_rows = sorted(
    zip(FEATURE_COLUMNS, importances),
    key=lambda x: x[1],
    reverse=True,
)

for feature, importance in importance_rows:
    print(
        f"   {feature:<20}"
        f"{importance * 100:>7.2f}%"
    )

# ============================================================
# 13. H2H-SPECIFIC CHECK
# ============================================================

h2h_features = [
    "h2h_hw_rate",
    "h2h_d_rate",
    "h2h_aw_rate",
    "h2h_matches",
]

h2h_importance = sum(
    importance
    for feature, importance in zip(
        FEATURE_COLUMNS,
        importances,
    )
    if feature in h2h_features
)

print("\n🥊 H2H Feature Contribution")
print("-" * 60)

print(
    f"   Combined H2H importance: "
    f"{h2h_importance * 100:.2f}%"
)

print(
    f"   Matches with prior H2H: "
    f"{int((df['h2h_matches'] > 0).sum()):,}"
)

# ============================================================
# 14. FINAL STATUS
# ============================================================

print("\n" + "=" * 60)

if accuracy > 0.5271:
    print(
        "🔥 RESULT: Form + H2H BEATS the ELO-only model."
    )
elif accuracy > 0.4797:
    print(
        "✅ RESULT: Model beats the original baseline,"
        " but does not yet beat ELO-only."
    )
else:
    print(
        "⚠️ RESULT: Form + H2H does not beat the"
        " original baseline."
    )

print("=" * 60)