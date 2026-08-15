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

# ============================================================
# CONFIGURATION
# ============================================================

FEATURES_FILE = os.path.join("data", "ml", "features_v3.csv")
RANDOM_STATE = 42

FEATURE_COLUMNS = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

    "home_ewma_points",
    "away_ewma_points",

    "home_ewma_gd",
    "away_ewma_gd",

    "home_ewma_gf",
    "away_ewma_gf",

    "home_ewma_ga",
    "away_ewma_ga",

    "home_ewma_home_points",
    "away_ewma_away_points",

    "home_ewma_home_gd",
    "away_ewma_away_gd",

    "home_ewma_home_gf",
    "away_ewma_away_gf",

    "home_ewma_home_ga",
    "away_ewma_away_ga",

    "home_matches_before",
    "away_matches_before",

    "home_home_matches_before",
    "away_away_matches_before"
]

LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]

print("🧠 ZOKASCORE V2 - Pipeline 41: EWMA XGBoost Training")
print("=" * 60)
print()

# ============================================================
# 1. LOAD DATA
# ============================================================

print(f"📊 Loading features from {FEATURES_FILE}...")

if not os.path.exists(FEATURES_FILE):
    raise FileNotFoundError(
        f"Features file not found:\n{FEATURES_FILE}"
    )

df = pd.read_csv(
    FEATURES_FILE,
    low_memory=False
)

print(f"   ✅ Loaded {len(df):,} rows.")
print(f"   📊 CSV columns: {len(df.columns)}")

# ============================================================
# 2. VERIFY REQUIRED COLUMNS
# ============================================================

required_columns = [
    "match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "target"
] + FEATURE_COLUMNS

missing_columns = [
    col for col in required_columns
    if col not in df.columns
]

if missing_columns:
    raise ValueError(
        "Missing required columns:\n"
        + "\n".join(f"   - {col}" for col in missing_columns)
    )

print(
    f"   ✅ Required columns verified "
    f"({len(FEATURE_COLUMNS)} ML features)."
)

# ============================================================
# 3. CLEAN / SORT
# ============================================================

df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)

before_clean = len(df)

df = df.dropna(
    subset=["date", "target"] + FEATURE_COLUMNS
).copy()

removed = before_clean - len(df)

if removed:
    print(
        f"   ⚠️ Removed {removed:,} invalid rows."
    )
else:
    print("   ✅ No invalid feature rows removed.")

# Stable chronological ordering
df = df.sort_values(
    "date",
    kind="stable"
).reset_index(drop=True)

print(
    f"   📅 Date range: "
    f"{df.iloc[0]['date'].date()} → "
    f"{df.iloc[-1]['date'].date()}"
)

# ============================================================
# 4. TARGET DISTRIBUTION
# ============================================================

print("\n🎯 Target distribution")

target_counts = df["target"].value_counts()

for label in LABELS:
    count = int(target_counts.get(label, 0))

    print(
        f"   {label:<12} {count:>8,}"
    )

missing_labels = [
    label
    for label in LABELS
    if label not in target_counts.index
]

if missing_labels:
    raise ValueError(
        "Missing target classes: "
        + ", ".join(missing_labels)
    )

# ============================================================
# 5. PREPARE FEATURES / TARGET
# ============================================================

X = df[FEATURE_COLUMNS].astype(float)
y = df["target"].astype(str)

le = LabelEncoder()

y_encoded = le.fit_transform(y)

print("\n🏷️ Target encoding")

for encoded, label in enumerate(le.classes_):
    print(
        f"   {encoded} → {label}"
    )

# Confirm expected class order
if list(le.classes_) != sorted(LABELS):
    raise ValueError(
        f"Unexpected class encoding: {list(le.classes_)}"
    )

# ============================================================
# 6. CHRONOLOGICAL 80/20 SPLIT
# ============================================================

split_idx = int(len(df) * 0.8)

X_train = X.iloc[:split_idx]
X_test = X.iloc[split_idx:]

y_train = y_encoded[:split_idx]
y_test = y_encoded[split_idx:]

train_end_date = df.iloc[split_idx - 1]["date"]
test_start_date = df.iloc[split_idx]["date"]

print("\n📚 Chronological split")

print(
    f"   🏋️ Training: {len(X_train):,} matches"
)
print(
    f"      Through: {train_end_date.date()}"
)

print(
    f"   🧪 Testing:  {len(X_test):,} matches"
)
print(
    f"      From:    {test_start_date.date()}"
)

# ============================================================
# 7. CLASS BALANCING
# ============================================================

print(
    "\n⚖️ Calculating balanced training weights..."
)

sample_weights = compute_sample_weight(
    class_weight="balanced",
    y=y_train
)

# Display effective class distribution
train_counts = pd.Series(y_train).value_counts()

for encoded, label in enumerate(le.classes_):
    count = int(train_counts.get(encoded, 0))

    if count > 0:
        weight = len(y_train) / (
            len(le.classes_) * count
        )
    else:
        weight = 0

    print(
        f"   {label:<12}"
        f" count={count:>8,}"
        f" weight={weight:.3f}"
    )

# ============================================================
# 8. TRAIN XGBOOST
# ============================================================

print(
    "\n⚡ Training XGBoost "
    "(Balanced + EWMA Features)..."
)

print("   • Objective: multi:softprob")
print("   • Trees: 300")
print("   • Learning rate: 0.05")
print("   • Max depth: 6")
print("   • Min child weight: 3")
print("   • Subsample: 0.85")
print("   • Column sampling: 0.85")
print("   • Class weighting: balanced")
print("   • Tree method: hist")
print("   • CPU workers: all")

model = xgb.XGBClassifier(
    objective="multi:softprob",
    num_class=3,

    n_estimators=300,
    learning_rate=0.05,

    max_depth=6,
    min_child_weight=3,

    subsample=0.85,
    colsample_bytree=0.85,

    gamma=0.0,
    reg_alpha=0.0,
    reg_lambda=1.0,

    random_state=RANDOM_STATE,

    n_jobs=-1,

    eval_metric="mlogloss",

    tree_method="hist"
)

model.fit(
    X_train,
    y_train,
    sample_weight=sample_weights
)

# ============================================================
# 9. PREDICTIONS
# ============================================================

print(
    "\n📈 Evaluating on unseen chronological test data..."
)

y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)

y_test_str = le.inverse_transform(y_test)
y_pred_str = le.inverse_transform(y_pred)

# ============================================================
# 10. METRICS
# ============================================================

accuracy = accuracy_score(
    y_test_str,
    y_pred_str
)

balanced_accuracy = balanced_accuracy_score(
    y_test_str,
    y_pred_str
)

macro_f1 = f1_score(
    y_test_str,
    y_pred_str,
    average="macro"
)

weighted_f1 = f1_score(
    y_test_str,
    y_pred_str,
    average="weighted"
)

logloss = log_loss(
    y_test,
    y_prob,
    labels=np.arange(len(le.classes_))
)

# ============================================================
# 11. RESULTS
# ============================================================

print("\n" + "=" * 60)
print("✅ PIPELINE 41 COMPLETE")
print("=" * 60)

print(
    f"🎯 Accuracy:              "
    f"{accuracy * 100:.2f}%"
)

print(
    f"⚖️ Balanced Accuracy:     "
    f"{balanced_accuracy * 100:.2f}%"
)

print(
    f"🧠 Macro F1:              "
    f"{macro_f1 * 100:.2f}%"
)

print(
    f"📊 Weighted F1:           "
    f"{weighted_f1 * 100:.2f}%"
)

print(
    f"📉 Log Loss:              "
    f"{logloss:.4f}"
)

# ============================================================
# 12. REFERENCE MODELS
# ============================================================

print("\n📊 Reference Models")
print("-" * 60)

print(
    "   Original baseline:       47.97%"
)

print(
    "   ELO-only:                52.71%"
)

print(
    "   Balanced ELO:            48.58%"
)

print(
    "   Random Forest v2:        50.45%"
)

print(
    "   XGBoost Balanced v2:     48.66%"
)

print(
    "   Pipeline 39 Threshold:   48.92%"
)

difference = (
    accuracy * 100
) - 48.66

print(
    f"\n🚀 vs Pipeline 37:          "
    f"{difference:+.2f} pp"
)

# ============================================================
# 13. CLASSIFICATION REPORT
# ============================================================

print("\n📋 Classification Report")
print("-" * 60)

print(
    classification_report(
        y_test_str,
        y_pred_str,
        labels=LABELS,
        zero_division=0
    )
)

# ============================================================
# 14. CONFUSION MATRIX
# ============================================================

print("🧩 Confusion Matrix")
print("-" * 60)

cm = confusion_matrix(
    y_test_str,
    y_pred_str,
    labels=LABELS
)

print(
    f"{'':>12}"
    f"{'HOME_WIN':>12}"
    f"{'DRAW':>12}"
    f"{'AWAY_WIN':>12}"
)

for i, label in enumerate(LABELS):
    print(
        f"{label:>12}"
        f"{cm[i, 0]:>12,}"
        f"{cm[i, 1]:>12,}"
        f"{cm[i, 2]:>12,}"
    )

# ============================================================
# 15. PER-CLASS RECALL
# ============================================================

print("\n🎯 Per-Class Recall")
print("-" * 60)

report = classification_report(
    y_test_str,
    y_pred_str,
    labels=LABELS,
    output_dict=True,
    zero_division=0
)

for label in LABELS:
    recall = report[label]["recall"]

    print(
        f"   {label:<12}"
        f"{recall * 100:>7.2f}%"
    )

# ============================================================
# 16. FEATURE IMPORTANCE
# ============================================================

print("\n🧠 Feature Importances")
print("-" * 60)

importances = model.feature_importances_

sorted_importances = sorted(
    zip(FEATURE_COLUMNS, importances),
    key=lambda item: item[1],
    reverse=True
)

for rank, (feature, importance) in enumerate(
    sorted_importances,
    start=1
):
    print(
        f"   {rank:>2}. "
        f"{feature:<30}"
        f"{importance * 100:>7.2f}%"
    )

# ============================================================
# 17. EWMA VS ELO CONTRIBUTION
# ============================================================

elo_features = {
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff"
}

ewma_importance = sum(
    importance
    for feature, importance in sorted_importances
    if feature not in elo_features
)

elo_importance = sum(
    importance
    for feature, importance in sorted_importances
    if feature in elo_features
)

print("\n🧠 Signal Contribution")
print("-" * 60)

print(
    f"   ELO features:       "
    f"{elo_importance * 100:>6.2f}%"
)

print(
    f"   EWMA features:      "
    f"{ewma_importance * 100:>6.2f}%"
)

print("\n" + "=" * 60)

# ============================================================
# FINAL INTERPRETATION
# ============================================================

if accuracy > 0.50 and macro_f1 >= 0.47:
    print(
        "🚀 RESULT: EWMA features produced a strong "
        "multi-class model improvement."
    )
elif accuracy > 0.4866:
    print(
        "📈 RESULT: EWMA features improved over "
        "Pipeline 37 accuracy."
    )
else:
    print(
        "📊 RESULT: EWMA features did not beat "
        "Pipeline 37 on the final test period."
    )

print("=" * 60)