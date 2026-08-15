'use strict';

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


# ============================================================
# CONFIGURATION
# ============================================================

FEATURES_FILE = os.path.join(
    "data",
    "ml",
    "features_v2.csv"
)

RANDOM_STATE = 42

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
    "h2h_matches"
]


# ============================================================
# HEADER
# ============================================================

print("🧠 ZOKASCORE V2 - Pipeline 37: XGBoost Training")
print("=" * 60)
print()


# ============================================================
# 1. LOAD DATA
# ============================================================

print(f"📊 Loading features from {FEATURES_FILE}...")

if not os.path.exists(FEATURES_FILE):
    raise FileNotFoundError(
        f"Features file not found:\n{FEATURES_FILE}\n\n"
        "Run Pipeline 35 first."
    )

df = pd.read_csv(
    FEATURES_FILE,
    low_memory=False
)

print(f"   ✅ Loaded {len(df):,} matches.")


# ============================================================
# 2. VALIDATE REQUIRED COLUMNS
# ============================================================

required_columns = FEATURE_COLUMNS + [
    "match_id",
    "date",
    "target"
]

missing = [
    column
    for column in required_columns
    if column not in df.columns
]

if missing:
    raise ValueError(
        "Missing required columns:\n"
        + "\n".join(f"   - {x}" for x in missing)
    )


# ============================================================
# 3. CLEAN / SORT CHRONOLOGICALLY
# ============================================================

df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)

before = len(df)

df = df.dropna(
    subset=["date", "target"] + FEATURE_COLUMNS
).copy()

removed = before - len(df)

if removed:
    print(f"   ⚠️ Removed {removed:,} invalid rows.")

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
# 4. TARGET VALIDATION
# ============================================================

VALID_TARGETS = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
}

invalid_targets = sorted(
    set(df["target"].dropna().unique()) - VALID_TARGETS
)

if invalid_targets:
    raise ValueError(
        f"Invalid target values found: {invalid_targets}"
    )

print("\n🎯 Target distribution")

target_counts = df["target"].value_counts()

for label in ["HOME_WIN", "DRAW", "AWAY_WIN"]:
    print(
        f"   {label:<12} "
        f"{target_counts.get(label, 0):>8,}"
    )


# ============================================================
# 5. FEATURES / TARGET
# ============================================================

X = df[FEATURE_COLUMNS].astype(float)
y = df["target"].astype(str)


# ============================================================
# 6. ENCODE TARGET
# ============================================================

le = LabelEncoder()

y_encoded = le.fit_transform(y)

print("\n🏷️ Target encoding")

for encoded_value, label in enumerate(le.classes_):
    print(
        f"   {encoded_value} → {label}"
    )


# ============================================================
# 7. CHRONOLOGICAL 80/20 SPLIT
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
# 8. BALANCED SAMPLE WEIGHTS
# ============================================================
#
# Important:
#
# We do NOT balance the test set.
# The test set must remain representative of real football.
#
# We only weight the TRAINING observations so DRAW is not
# ignored simply because it is less frequent.
# ============================================================

sample_weights = compute_sample_weight(
    class_weight="balanced",
    y=y_train
)

print("\n⚖️ Training class weighting")

train_counts = pd.Series(y_train).value_counts()

for encoded_value, label in enumerate(le.classes_):
    count = train_counts.get(encoded_value, 0)

    if count > 0:
        weight = len(y_train) / (
            len(le.classes_) * count
        )
    else:
        weight = 0

    print(
        f"   {label:<12} "
        f"count={count:>8,} "
        f"weight={weight:.3f}"
    )


# ============================================================
# 9. TRAIN XGBOOST
# ============================================================

print("\n⚡ Training XGBoost Classifier...")
print("   • Objective: multi:softprob")
print("   • Trees: 300")
print("   • Learning rate: 0.05")
print("   • Max depth: 6")
print("   • Subsample: 0.85")
print("   • Column sampling: 0.85")
print("   • Class-balanced training weights")
print("   • CPU workers: all")
print()

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
# 10. PREDICTIONS
# ============================================================

print("📈 Evaluating on unseen chronological test data...")

y_pred = model.predict(X_test)

y_prob = model.predict_proba(X_test)


# ============================================================
# 11. DECODE TARGETS
# ============================================================

y_test_str = le.inverse_transform(
    y_test
)

y_pred_str = le.inverse_transform(
    y_pred
)


# ============================================================
# 12. CORE METRICS
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
# 13. RESULTS
# ============================================================

print("\n" + "=" * 60)
print("✅ PIPELINE 37 COMPLETE")
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

print()
print("📊 Reference Models")
print("-" * 60)
print("   Original baseline:     47.97%")
print("   ELO-only:              52.71%")
print("   Balanced ELO:          48.58%")
print("   Random Forest:         50.45%")


difference_rf = (
    accuracy * 100
) - 50.45

difference_baseline = (
    accuracy * 100
) - 47.97

print()
print(
    f"🚀 vs Random Forest:      "
    f"{difference_rf:+.2f} pp"
)

print(
    f"🚀 vs Original baseline:  "
    f"{difference_baseline:+.2f} pp"
)


# ============================================================
# 14. CLASSIFICATION REPORT
# ============================================================

print("\n📋 Classification Report")
print("-" * 60)

print(
    classification_report(
        y_test_str,
        y_pred_str,
        labels=["HOME_WIN", "DRAW", "AWAY_WIN"],
        zero_division=0
    )
)


# ============================================================
# 15. CONFUSION MATRIX
# ============================================================

print("🧩 Confusion Matrix")
print("-" * 60)

labels = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]

cm = confusion_matrix(
    y_test_str,
    y_pred_str,
    labels=labels
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
# 16. PER-CLASS RECALL
# ============================================================

print("\n🎯 Per-Class Recall")
print("-" * 60)

report = classification_report(
    y_test_str,
    y_pred_str,
    labels=labels,
    output_dict=True,
    zero_division=0
)

for label in labels:
    recall = report[label]["recall"]

    print(
        f"   {label:<12} "
        f"{recall * 100:>6.2f}%"
    )


# ============================================================
# 17. FEATURE IMPORTANCE
# ============================================================

print("\n🧠 Feature Importances")
print("-" * 60)

importances = model.feature_importances_

ranked_features = sorted(
    zip(FEATURE_COLUMNS, importances),
    key=lambda x: x[1],
    reverse=True
)

for rank, (feature, importance) in enumerate(
    ranked_features,
    start=1
):
    print(
        f"   {rank:>2}. "
        f"{feature:<20} "
        f"{importance * 100:>6.2f}%"
    )


# ============================================================
# 18. H2H CONTRIBUTION
# ============================================================

h2h_features = {
    "h2h_hw_rate",
    "h2h_d_rate",
    "h2h_aw_rate",
    "h2h_matches"
}

h2h_importance = sum(
    importance
    for feature, importance in ranked_features
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
# 19. FINAL DIAGNOSIS
# ============================================================

print("\n" + "=" * 60)

if accuracy > 0.5045 and macro_f1 > 0.45:
    print(
        "🚀 RESULT: XGBoost improves over the Random Forest "
        "while maintaining meaningful three-way prediction."
    )

elif accuracy > 0.4797 and macro_f1 > 0.40:
    print(
        "✅ RESULT: XGBoost beats the original baseline "
        "and is learning all three outcomes."
    )

else:
    print(
        "⚠️ RESULT: XGBoost requires further tuning."
    )

print("=" * 60)