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


# ============================================================
# ZOKASCORE V2 — PIPELINE 38
# XGBOOST — NATURAL CLASS DISTRIBUTION
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

LABELS = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN"
]


# ============================================================
# HEADER
# ============================================================

print(
    "🧠 ZOKASCORE V2 - Pipeline 38: "
    "XGBoost (Natural Distribution)"
)

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

print(
    f"   ✅ Loaded {len(df):,} matches."
)


# ============================================================
# 2. VALIDATE COLUMNS
# ============================================================

required_columns = [
    "match_id",
    "date",
    "target"
] + FEATURE_COLUMNS

missing_columns = [
    column
    for column in required_columns
    if column not in df.columns
]

if missing_columns:
    raise ValueError(
        "Missing required columns:\n"
        + "\n".join(
            f"   - {column}"
            for column in missing_columns
        )
    )


# ============================================================
# 3. CLEAN / SORT
# ============================================================

df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)

before = len(df)

df = df.dropna(
    subset=[
        "date",
        "target"
    ] + FEATURE_COLUMNS
).copy()

removed = before - len(df)

if removed:
    print(
        f"   ⚠️ Removed {removed:,} invalid rows."
    )

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

invalid_targets = sorted(
    set(df["target"].unique()) - set(LABELS)
)

if invalid_targets:
    raise ValueError(
        f"Invalid target values found: "
        f"{invalid_targets}"
    )

print("\n🎯 Target distribution")

target_counts = df["target"].value_counts()

for label in LABELS:
    print(
        f"   {label:<12}"
        f"{target_counts.get(label, 0):>8,}"
    )


# ============================================================
# 5. PREPARE FEATURES
# ============================================================

X = df[
    FEATURE_COLUMNS
].astype(float)

y = df[
    "target"
].astype(str)


# ============================================================
# 6. ENCODE TARGET
# ============================================================

le = LabelEncoder()

y_encoded = le.fit_transform(y)

print("\n🏷️ Target encoding")

for encoded, label in enumerate(le.classes_):
    print(
        f"   {encoded} → {label}"
    )


# ============================================================
# 7. CHRONOLOGICAL 80/20 SPLIT
# ============================================================

split_idx = int(
    len(df) * 0.8
)

X_train = X.iloc[
    :split_idx
]

X_test = X.iloc[
    split_idx:
]

y_train = y_encoded[
    :split_idx
]

y_test = y_encoded[
    split_idx:
]

train_end_date = df.iloc[
    split_idx - 1
]["date"]

test_start_date = df.iloc[
    split_idx
]["date"]

print("\n📚 Chronological split")

print(
    f"   🏋️ Training: "
    f"{len(X_train):,} matches"
)

print(
    f"      Through: "
    f"{train_end_date.date()}"
)

print(
    f"   🧪 Testing:  "
    f"{len(X_test):,} matches"
)

print(
    f"      From:    "
    f"{test_start_date.date()}"
)


# ============================================================
# 8. TRAIN MODEL
# ============================================================

print(
    "\n⚡ Training XGBoost Classifier "
    "(Natural Distribution)..."
)

print(
    "   • No class weighting"
)

print(
    "   • Natural football outcome frequencies"
)

print(
    "   • Objective: multi:softprob"
)

print(
    "   • Trees: 300"
)

print(
    "   • Learning rate: 0.05"
)

print(
    "   • Max depth: 6"
)

print(
    "   • Subsample: 0.85"
)

print(
    "   • Column sampling: 0.85"
)

print(
    "   • CPU workers: all"
)

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
    y_train
)


# ============================================================
# 9. PREDICTIONS
# ============================================================

print(
    "📈 Evaluating on unseen chronological "
    "test data..."
)

y_pred = model.predict(
    X_test
)

y_prob = model.predict_proba(
    X_test
)


# ============================================================
# 10. DECODE TARGETS
# ============================================================

y_test_str = le.inverse_transform(
    y_test
)

y_pred_str = le.inverse_transform(
    y_pred
)


# ============================================================
# 11. METRICS
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
    labels=np.arange(
        len(le.classes_)
    )
)


# ============================================================
# 12. RESULTS
# ============================================================

print(
    "\n" + "=" * 60
)

print(
    "✅ PIPELINE 38 COMPLETE"
)

print(
    "=" * 60
)

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
# 13. REFERENCE MODELS
# ============================================================

print(
    "\n📊 Reference Models"
)

print(
    "-" * 60
)

print(
    "   Original baseline:     47.97%"
)

print(
    "   ELO-only:              52.71%"
)

print(
    "   Balanced ELO:          48.58%"
)

print(
    "   Random Forest:         50.45%"
)

print(
    "   XGBoost (Balanced):    "
    "48.66% "
    "(Macro F1: 46.96%, "
    "DRAW Recall: 37.93%)"
)

print(
    f"   XGBoost (Natural):     "
    f"{accuracy * 100:.2f}%"
)


# ============================================================
# 14. COMPARISON
# ============================================================

print(
    "\n📈 Pipeline 38 Comparison"
)

print(
    "-" * 60
)

print(
    f"   vs Random Forest:      "
    f"{(accuracy * 100) - 50.45:+.2f} pp"
)

print(
    f"   vs Balanced XGBoost:   "
    f"{(accuracy * 100) - 48.66:+.2f} pp"
)

print(
    f"   vs Original baseline:  "
    f"{(accuracy * 100) - 47.97:+.2f} pp"
)


# ============================================================
# 15. CLASSIFICATION REPORT
# ============================================================

print(
    "\n📋 Classification Report"
)

print(
    "-" * 60
)

print(
    classification_report(
        y_test_str,
        y_pred_str,
        labels=LABELS,
        zero_division=0
    )
)


# ============================================================
# 16. CONFUSION MATRIX
# ============================================================

print(
    "🧩 Confusion Matrix"
)

print(
    "-" * 60
)

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
# 17. PER-CLASS RECALL
# ============================================================

print(
    "\n🎯 Per-Class Recall"
)

print(
    "-" * 60
)

report = classification_report(
    y_test_str,
    y_pred_str,
    labels=LABELS,
    output_dict=True,
    zero_division=0
)

for label in LABELS:

    recall = report[
        label
    ]["recall"]

    print(
        f"   {label:<12}"
        f"{recall * 100:>6.2f}%"
    )


# ============================================================
# 18. FEATURE IMPORTANCE
# ============================================================

print(
    "\n🧠 Feature Importances"
)

print(
    "-" * 60
)

importances = model.feature_importances_

ranked = sorted(
    zip(
        FEATURE_COLUMNS,
        importances
    ),
    key=lambda x: x[1],
    reverse=True
)

for rank, (
    feature,
    importance
) in enumerate(
    ranked,
    start=1
):

    print(
        f"   {rank:>2}. "
        f"{feature:<20}"
        f"{importance * 100:>6.2f}%"
    )


# ============================================================
# 19. FINAL DIAGNOSIS
# ============================================================

print(
    "\n" + "=" * 60
)

if accuracy > 0.5045:

    print(
        "🚀 RESULT: Pipeline 38 beats "
        "the Random Forest on accuracy."
    )

elif accuracy > 0.4866:

    print(
        "✅ RESULT: Pipeline 38 beats "
        "balanced XGBoost."
    )

else:

    print(
        "⚠️ RESULT: Natural-distribution "
        "XGBoost did not improve accuracy."
    )

print(
    "=" * 60
)