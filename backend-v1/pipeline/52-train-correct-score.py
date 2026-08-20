import os
import json
import joblib
import tempfile
import shutil
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES_FILE = os.path.join(BASE_DIR, "data", "ml", "features_v4_unified.csv")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")

FEATURE_COLUMNS = [
    "home_elo_pre", "away_elo_pre", "elo_diff",
    "home_ewma_gf", "away_ewma_gf", "home_ewma_ga", "away_ewma_ga",
    "home_ewma_home_gf", "away_ewma_away_gf", "home_ewma_home_ga", "away_ewma_away_ga",
    "h2h_hw_rate", "h2h_d_rate", "h2h_aw_rate", "h2h_avg_goals"
]

MAX_GOALS = 5 # Predict scores from 0-0 up to 5-5

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 52: TRAIN CORRECT SCORE MODEL")
    print("=" * 60)

    if not os.path.exists(FEATURES_FILE):
        raise FileNotFoundError(f"Features file not found: {FEATURES_FILE}")

    print("[1/5] Loading unified dataset...")
    df = pd.read_csv(FEATURES_FILE, low_memory=False)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.sort_values(by=["date", "match_id"]).reset_index(drop=True)

    print("[2/5] Engineering Chronological H2H Features...")
    # Initialize H2H columns
    df["h2h_hw_rate"] = 0.0
    df["h2h_d_rate"] = 0.0
    df["h2h_aw_rate"] = 0.0
    df["h2h_avg_goals"] = 0.0

    h2h_data = {} # Format: {team_pair_id: {'hw': int, 'd': int, 'aw': int, 'goals': int, 'count': int}}

    # Calculate H2H chronologically to prevent data leakage
    for idx, row in df.iterrows():
        h_id = str(row["home_team_id"])
        a_id = str(row["away_team_id"])
        pair_key = "|".join(sorted([h_id, a_id]))
        
        stats = h2h_data.get(pair_key, {"hw": 0, "d": 0, "aw": 0, "goals": 0, "count": 0})
        
        if stats["count"] > 0:
            df.at[idx, "h2h_hw_rate"] = stats["hw"] / stats["count"] if h_id < a_id else stats["aw"] / stats["count"]
            df.at[idx, "h2h_d_rate"] = stats["d"] / stats["count"]
            df.at[idx, "h2h_aw_rate"] = stats["aw"] / stats["count"] if h_id < a_id else stats["hw"] / stats["count"]
            df.at[idx, "h2h_avg_goals"] = stats["goals"] / stats["count"]
            
        # Update stats for future matches
        h_g = int(row["home_goals"])
        a_g = int(row["away_goals"])
        stats["goals"] += h_g + a_g
        stats["count"] += 1
        if h_g > a_g:
            if h_id < a_id: stats["hw"] += 1
            else: stats["aw"] += 1
        elif a_g > h_g:
            if a_id < h_id: stats["hw"] += 1
            else: stats["aw"] += 1
        else:
            stats["d"] += 1
        h2h_data[pair_key] = stats

    print("[3/5] Preparing Correct Score Target...")
    # Cap goals at MAX_GOALS to avoid extreme sparse classes (e.g., 10-0)
    df["home_goals_capped"] = df["home_goals"].clip(0, MAX_GOALS)
    df["away_goals_capped"] = df["away_goals"].clip(0, MAX_GOALS)
    df["correct_score"] = df["home_goals_capped"].astype(str) + "-" + df["away_goals_capped"].astype(str)

    # Filter out rare classes that don't appear enough times to train properly
    class_counts = df["correct_score"].value_counts()
    valid_classes = class_counts[class_counts > 500].index.tolist()
    df = df[df["correct_score"].isin(valid_classes)].copy()

    print(f"   ↳ Valid Score Classes: {len(valid_classes)}")

    # Chronological Split (80% train, 20% test)
    split_idx = int(len(df) * 0.80)
    X_train = df.iloc[:split_idx][FEATURE_COLUMNS]
    y_train_raw = df.iloc[:split_idx]["correct_score"]
    X_test = df.iloc[split_idx:][FEATURE_COLUMNS]
    y_test_raw = df.iloc[split_idx:]["correct_score"]

    # Label Encode the scores
    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_test = le.transform(y_test_raw)

    # Save the label mapping so Step 50 knows the order
    label_mapping = {str(i): label for i, label in enumerate(le.classes_)}
    mapping_file = os.path.join(MODELS_DIR, "market_correct_score_label_mapping.json")
    with open(mapping_file, "w") as f:
        json.dump(label_mapping, f, indent=2)

    print("[4/5] Training XGBoost Correct Score Model...")
    # Use multi:softprob because we want the probability matrix for all scores
    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=len(le.classes_),
        n_estimators=400,
        learning_rate=0.05,
        max_depth=8,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        eval_metric="mlogloss",
        tree_method="hist"
    )

    # Balance classes because 1-1 is common, 5-0 is rare
    weights = compute_sample_weight(class_weight="balanced", y=y_train)
    model.fit(X_train, y_train, sample_weight=weights)

    print("[5/5] Evaluating and Saving Model...")
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"🎯 Correct Score Top-1 Accuracy: {acc * 100:.2f}%")

    model_file = os.path.join(MODELS_DIR, "market_correct_score_model.joblib")
    joblib.dump(model, model_file)
    print(f"✅ Model saved: {model_file}")

if __name__ == "__main__":
    run()