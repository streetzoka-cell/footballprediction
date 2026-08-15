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

FEATURES_FILE = os.path.join("data", "ml", "features_v2.csv")
RANDOM_STATE = 42

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_form_pts", "away_form_pts",
    "home_home_pts", "away_away_pts",
    "home_gf_avg", "away_gf_avg",
    "home_ga_avg", "away_ga_avg",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_matches"
]

LABELS = ["HOME_WIN", "DRAW", "AWAY_WIN"]

print("🧠 ZOKASCORE V2 - Pipeline 39: DRAW Threshold Tuning")
print("=" * 60)
print()

# 1. LOAD DATA
print(f"📊 Loading features from {FEATURES_FILE}...")
if not os.path.exists(FEATURES_FILE):
    raise FileNotFoundError(f"Features file not found:\n{FEATURES_FILE}")

df = pd.read_csv(FEATURES_FILE, low_memory=False)
print(f"   ✅ Loaded {len(df):,} matches.")

# 2. CLEAN + CHRONOLOGICAL SORT
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.dropna(subset=["date", "target"] + FEATURE_COLUMNS).copy()
df = df.sort_values("date", kind="stable").reset_index(drop=True)

# 3. FEATURES + TARGET
X = df[FEATURE_COLUMNS].astype(float)
y = df["target"].astype(str)

le = LabelEncoder()
y_encoded = le.fit_transform(y) # 0=AWAY, 1=DRAW, 2=HOME

# 4. CHRONOLOGICAL SPLIT (70/10/20)
total = len(df)
train_end = int(total * 0.70)
val_end = int(total * 0.80)

X_train, y_train = X.iloc[:train_end], y_encoded[:train_end]
X_val, y_val = X.iloc[train_end:val_end], y_encoded[train_end:val_end]
X_test, y_test = X.iloc[val_end:], y_encoded[val_end:]

print("\n📚 Chronological split")
print(f"   🏋️ Training:   {len(X_train):,} matches (Through {df.iloc[train_end-1]['date'].date()})")
print(f"   🎯 Validation: {len(X_val):,} matches (From {df.iloc[train_end]['date'].date()})")
print(f"   🧪 Final test: {len(X_test):,} matches (From {df.iloc[val_end]['date'].date()})")

# 5. TRAIN BALANCED MODEL ON FIRST 70%
print("\n⚖️ Training balanced XGBoost model on 70% train set...")
train_weights = compute_sample_weight(class_weight="balanced", y=y_train)

threshold_model = xgb.XGBClassifier(
    objective="multi:softprob", num_class=3, n_estimators=300,
    learning_rate=0.05, max_depth=6, min_child_weight=3,
    subsample=0.85, colsample_bytree=0.85, random_state=RANDOM_STATE,
    n_jobs=-1, eval_metric="mlogloss", tree_method="hist"
)
threshold_model.fit(X_train, y_train, sample_weight=train_weights)

# 6. VALIDATION PROBABILITIES
print("📈 Generating validation probabilities...")
val_probs = threshold_model.predict_proba(X_val)
y_val_str = le.inverse_transform(y_val)

# 7. HELPER: CUSTOM THRESHOLD PREDICTION
def threshold_predict(probs, threshold):
    preds = []
    for p in probs:
        p_away, p_draw, p_home = p
        if p_draw >= threshold:
            preds.append("DRAW")
        elif p_home >= p_away:
            preds.append("HOME_WIN")
        else:
            preds.append("AWAY_WIN")
    return preds

# 8. SEARCH DRAW THRESHOLD
print("\n🧪 Searching DRAW thresholds (0.200 to 0.450)...")
print("-" * 60)

best_threshold = 0
best_macro_f1 = -1
best_acc = 0
best_bal_acc = 0
best_draw_recall = 0

# We'll step by 0.005 for speed, you can change to 0.001 if needed
for t in np.arange(0.20, 0.451, 0.005):
    preds = threshold_predict(val_probs, t)
    acc = accuracy_score(y_val_str, preds)
    macro_f1 = f1_score(y_val_str, preds, average="macro")
    bal_acc = balanced_accuracy_score(y_val_str, preds)
    
    cm = confusion_matrix(y_val_str, preds, labels=LABELS)
    draw_recall = cm[1, 1] / cm[1].sum() if cm[1].sum() > 0 else 0
    
    if macro_f1 > best_macro_f1 or (abs(macro_f1 - best_macro_f1) < 1e-9 and acc > best_acc):
        best_macro_f1 = macro_f1
        best_acc = acc
        best_bal_acc = bal_acc
        best_draw_recall = draw_recall
        best_threshold = t

print(f"\n🏆 BEST VALIDATION THRESHOLD")
print("-" * 60)
print(f"   DRAW Threshold:     {best_threshold:.3f}")
print(f"   Accuracy:           {best_acc * 100:.2f}%")
print(f"   Balanced Accuracy:  {best_bal_acc * 100:.2f}%")
print(f"   Macro F1:           {best_macro_f1 * 100:.2f}%")
print(f"   DRAW Recall:        {best_draw_recall * 100:.2f}%")

# 9. RETRAIN ON FULL 80%
print("\n🔄 Retraining balanced XGBoost on full 80%...")
X_full_train, y_full_train = X.iloc[:val_end], y_encoded[:val_end]
full_weights = compute_sample_weight(class_weight="balanced", y=y_full_train)

final_model = xgb.XGBClassifier(
    objective="multi:softprob", num_class=3, n_estimators=300,
    learning_rate=0.05, max_depth=6, min_child_weight=3,
    subsample=0.85, colsample_bytree=0.85, random_state=RANDOM_STATE,
    n_jobs=-1, eval_metric="mlogloss", tree_method="hist"
)
final_model.fit(X_full_train, y_full_train, sample_weight=full_weights)

# 10. FINAL TEST
print("\n🧪 Evaluating LOCKED threshold on final 20% test set...")
test_probs = final_model.predict_proba(X_test)
y_test_str = le.inverse_transform(y_test)

# Argmax (Standard) vs Threshold
y_pred_argmax = le.inverse_transform(np.argmax(test_probs, axis=1))
y_pred_threshold = threshold_predict(test_probs, best_threshold)

# Metrics
argmax_acc = accuracy_score(y_test_str, y_pred_argmax)
thresh_acc = accuracy_score(y_test_str, y_pred_threshold)
thresh_bal_acc = balanced_accuracy_score(y_test_str, y_pred_threshold)
thresh_macro_f1 = f1_score(y_test_str, y_pred_threshold, average="macro")
thresh_log_loss = log_loss(y_test, test_probs, labels=np.arange(len(le.classes_)))

final_cm = confusion_matrix(y_test_str, y_pred_threshold, labels=LABELS)
final_report = classification_report(y_test_str, y_pred_threshold, labels=LABELS, output_dict=True, zero_division=0)
final_draw_recall = final_report["DRAW"]["recall"]

# 11. FINAL RESULTS
print("\n" + "=" * 60)
print("✅ PIPELINE 39 COMPLETE")
print("=" * 60)

print(f"🎯 Locked DRAW Threshold: {best_threshold:.3f}\n")
print(f"📌 Standard Argmax Accuracy: {argmax_acc * 100:.2f}%")
print(f"🚀 Threshold Accuracy:       {thresh_acc * 100:.2f}%")
print(f"⚖️ Balanced Accuracy:        {thresh_bal_acc * 100:.2f}%")
print(f"🧠 Macro F1:                 {thresh_macro_f1 * 100:.2f}%")
print(f"📉 Log Loss:                 {thresh_log_loss:.4f}")
print(f"🎯 DRAW Recall:              {final_draw_recall * 100:.2f}%")

print("\n📋 FINAL TEST CLASSIFICATION REPORT")
print("-" * 60)
print(classification_report(y_test_str, y_pred_threshold, labels=LABELS, zero_division=0))

print("🧩 FINAL TEST CONFUSION MATRIX")
print("-" * 60)
print(f"{'':>12}{'HOME_WIN':>12}{'DRAW':>12}{'AWAY_WIN':>12}")
for i, label in enumerate(LABELS):
    print(f"{label:>12}{final_cm[i, 0]:>12,}{final_cm[i, 1]:>12,}{final_cm[i, 2]:>12,}")

print("\n" + "=" * 60)
if thresh_acc > argmax_acc:
    print("🏆 RESULT: DRAW thresholding improved final-test accuracy.")
else:
    print("📊 RESULT: Thresholding did not improve raw accuracy, but check Macro F1 / Draw Recall.")
print("=" * 60)