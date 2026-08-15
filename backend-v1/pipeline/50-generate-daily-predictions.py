#!/usr/bin/env python3
"""
ZOKASCORE V2
Pipeline 50 — Hardened Daily Multi-Market Prediction Generator
"""

import os
import json
import math
import tempfile
from datetime import datetime, timedelta, timezone

import pandas as pd
import xgboost as xgb

# ============================================================
# CONFIGURATION
# ============================================================

MODEL_DIR = os.path.join("data", "ml")
FIXTURES_DIR = os.path.join("public_data", "fixtures")
OUTPUT_DIR = os.path.join("public_data", "predictions")

PIPELINE_VERSION = "50"
ENGINE_VERSION = "ZOKASCORE_V2"

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

MODEL_REGISTRY = {
    "1x2": {"model_file": "zokascore_v2_model.json", "map_file": "label_mapping.json", "expected_labels": {"HOME_WIN", "DRAW", "AWAY_WIN"}},
    "ou_0_5": {"model_file": "market_ou_0_5_model.json", "map_file": "market_ou_0_5_label_mapping.json", "expected_labels": {"OVER", "UNDER"}},
    "ou_1_5": {"model_file": "market_ou_1_5_model.json", "map_file": "market_ou_1_5_label_mapping.json", "expected_labels": {"OVER", "UNDER"}},
    "ou_2_5": {"model_file": "market_ou_2_5_model.json", "map_file": "market_ou_2_5_label_mapping.json", "expected_labels": {"OVER", "UNDER"}},
    "ou_3_5": {"model_file": "market_ou_3_5_model.json", "map_file": "market_ou_3_5_label_mapping.json", "expected_labels": {"OVER", "UNDER"}},
    "btts": {"model_file": "market_btts_model.json", "map_file": "market_btts_label_mapping.json", "expected_labels": {"YES", "NO"}}
}

REQUIRED_STATE_FIELDS = [
    "elo", "overall_points", "overall_gd", "overall_gf", "overall_ga",
    "home_points", "home_gd", "home_gf", "home_ga",
    "away_points", "away_gd", "away_gf", "away_ga",
    "matches_played", "home_matches_played", "away_matches_played"
]

PROBABILITY_TOLERANCE = 0.01

# ============================================================
# HELPERS
# ============================================================

def utc_now():
    return datetime.now(timezone.utc)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def is_finite(value):
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False

def atomic_json_write(path, payload):
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".prediction_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False, allow_nan=False)
            f.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path): os.remove(tmp_path)
        raise

def safe_match_id(match):
    raw_id = match.get("id") or match.get("matchId")
    if raw_id is None: return None
    value = str(raw_id).strip()
    if not value or value.lower() in {"none", "null"}: return None
    return value

def extract_team(match, side):
    team_object = match.get(f"{side}Team")
    if not isinstance(team_object, dict): team_object = {}
    team_id = team_object.get("id") or match.get(f"{side}TeamId") or match.get(f"{side}Id")
    team_name = team_object.get("name") or match.get(f"{side}Name") or (str(team_id) if team_id is not None else None)
    if team_id is not None: team_id = str(team_id).strip()
    if team_name is not None: team_name = str(team_name).strip()
    return team_id, team_name

# ============================================================
# ARTIFACT VALIDATION & FEATURE BUILDER
# ============================================================

def load_models():
    print("\n🔍 VALIDATING ML ARTIFACTS")
    print("-" * 60)
    models = {}
    mappings = {}
    for market, config in MODEL_REGISTRY.items():
        model_path = os.path.join(MODEL_DIR, config["model_file"])
        mapping_path = os.path.join(MODEL_DIR, config["map_file"])
        if not os.path.isfile(model_path): raise FileNotFoundError(f"Missing model for {market}: {model_path}")
        if not os.path.isfile(mapping_path): raise FileNotFoundError(f"Missing label mapping for {market}: {mapping_path}")
        
        m = xgb.XGBClassifier()
        m.load_model(model_path)
        mapping = load_json(mapping_path)
        
        if not isinstance(mapping, dict): raise ValueError(f"Invalid label mapping for {market}")
        labels = set(mapping.values())
        if labels != config["expected_labels"]: raise ValueError(f"Invalid labels for {market}. Expected {config['expected_labels']}, got {labels}")
        
        models[market] = m
        mappings[market] = mapping
        print(f"   ✅ {market.upper()}")
    print(f"\n   🧠 Total models loaded: {len(models)}")
    return models, mappings

def build_features(home_state, away_state):
    for field in REQUIRED_STATE_FIELDS:
        if field not in home_state or field not in away_state: return None, f"Missing state field: {field}"
        if not is_finite(home_state[field]) or not is_finite(away_state[field]): return None, f"Non-finite state value: {field}"

    h_elo = float(home_state["elo"])
    a_elo = float(away_state["elo"])
    features = {
        "home_elo_pre": h_elo, "away_elo_pre": a_elo, "elo_diff": h_elo - a_elo,
        "home_ewma_points": float(home_state["overall_points"]), "away_ewma_points": float(away_state["overall_points"]),
        "home_ewma_gd": float(home_state["overall_gd"]), "away_ewma_gd": float(away_state["overall_gd"]),
        "home_ewma_gf": float(home_state["overall_gf"]), "away_ewma_gf": float(away_state["overall_gf"]),
        "home_ewma_ga": float(home_state["overall_ga"]), "away_ewma_ga": float(away_state["overall_ga"]),
        "home_ewma_home_points": float(home_state["home_points"]), "away_ewma_away_points": float(away_state["away_points"]),
        "home_ewma_home_gd": float(home_state["home_gd"]), "away_ewma_away_gd": float(away_state["away_gd"]),
        "home_ewma_home_gf": float(home_state["home_gf"]), "away_ewma_away_gf": float(away_state["away_gf"]),
        "home_ewma_home_ga": float(home_state["home_ga"]), "away_ewma_away_ga": float(away_state["away_ga"]),
        "home_matches_before": float(home_state["matches_played"]), "away_matches_before": float(away_state["matches_played"]),
        "home_home_matches_before": float(home_state["home_matches_played"]), "away_away_matches_before": float(away_state["away_matches_played"])
    }
    for name in FEATURE_COLUMNS:
        if name not in features: return None, f"Missing feature: {name}"
        if not is_finite(features[name]): return None, f"Non-finite feature: {name}"
    return features, None

def predict_match(home_id, away_id, ewma_state, models, mappings):
    home_state = ewma_state.get(str(home_id))
    away_state = ewma_state.get(str(away_id))
    if not home_state: return None, f"Home team {home_id} not in EWMA state"
    if not away_state: return None, f"Away team {away_id} not in EWMA state"
    
    features, error = build_features(home_state, away_state)
    if error: return None, error
    
    X_live = pd.DataFrame([features], columns=FEATURE_COLUMNS)
    markets = {}
    for market_name, model in models.items():
        probabilities = model.predict_proba(X_live)[0]
        mapping = mappings[market_name]
        prob_map = {}
        for idx, prob in enumerate(probabilities):
            key = str(idx)
            if key not in mapping: return None, f"Missing mapping index {key} for {market_name}"
            if not is_finite(prob): return None, f"Non-finite probability for {market_name}"
            prob_map[mapping[key]] = float(prob)
        
        total = sum(prob_map.values())
        if not is_finite(total) or abs(total - 1.0) > PROBABILITY_TOLERANCE: return None, f"Probability sum invalid for {market_name}: {total}"
        
        prob_map = {k: v / total for k, v in prob_map.items()}
        pick = max(prob_map, key=prob_map.get)
        markets[market_name] = {"probabilities": prob_map, "pick": pick, "pick_probability": prob_map[pick]}
    return markets, None

# ============================================================
# MAIN
# ============================================================

def main():
    print(f"🧠 ZOKASCORE V2 - Pipeline 50: Hardened Daily Multi-Market Generator")
    print("=" * 60)
    generated_at = utc_now().isoformat()
    
    models, mappings = load_models()
    
    ewma_state_path = os.path.join(MODEL_DIR, "ewma_state.json")
    if not os.path.isfile(ewma_state_path): raise FileNotFoundError(f"Missing EWMA state: {ewma_state_path}")
    ewma_state = load_json(ewma_state_path)
    print(f"\n📦 Live team state: {len(ewma_state):,} teams")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    metadata = {
        "engine": ENGINE_VERSION, "pipeline": PIPELINE_VERSION, "generated_at": generated_at,
        "markets": list(MODEL_REGISTRY.keys()), "days_processed": []
    }
    
    now = utc_now()
    for offset in (0, 1):
        target_date = (now + timedelta(days=offset)).date()
        date_str = target_date.isoformat()
        
        print("\n" + "=" * 60)
        print(f"📅 PROCESSING {date_str}")
        print("=" * 60)
        
        fixture_file = os.path.join(FIXTURES_DIR, f"{date_str}.json")
        output_file = os.path.join(OUTPUT_DIR, f"{date_str}.json")
        
        day_meta = {"date": date_str, "total_fixtures": 0, "predicted": 0, "skipped": 0, "output_written": False}
        
        if not os.path.isfile(fixture_file):
            print(f"⚠️ No fixture file found: {fixture_file}")
            day_meta["status"] = "no_fixture_file"
            metadata["days_processed"].append(day_meta)
            continue
            
        try:
            fixture_data = load_json(fixture_file)
        except Exception as exc:
            print(f"❌ Failed to read fixture file: {exc}")
            day_meta["status"] = "fixture_read_error"
            metadata["days_processed"].append(day_meta)
            continue
            
        # ★ THE FIX: Look for 'matches' OR 'data' array
        matches = fixture_data.get("matches", fixture_data.get("data", []))
        if not isinstance(matches, list):
            print("❌ Invalid fixture structure: 'matches'/'data' must be a list")
            day_meta["status"] = "invalid_fixture_structure"
            metadata["days_processed"].append(day_meta)
            continue
            
        day_meta["total_fixtures"] = len(matches)
        print(f"📊 Fixtures found: {len(matches):,}")
        
        if len(matches) == 0:
            print("⚠️ Fixture file contains zero matches. Existing prediction file will NOT be overwritten.")
            day_meta["status"] = "empty_fixture_file"
            metadata["days_processed"].append(day_meta)
            continue
            
        predictions = []
        seen_match_ids = set()
        
        for match in matches:
            if not isinstance(match, dict):
                day_meta["skipped"] += 1
                continue
                
            match_id = safe_match_id(match)
            if match_id is None or match_id in seen_match_ids:
                day_meta["skipped"] += 1
                continue
            seen_match_ids.add(match_id)
            
            home_id, home_name = extract_team(match, "home")
            away_id, away_name = extract_team(match, "away")
            
            if not home_id or not away_id:
                day_meta["skipped"] += 1
                continue
                
            markets, error = predict_match(home_id, away_id, ewma_state, models, mappings)
            if error:
                day_meta["skipped"] += 1
                continue
                
            predictions.append({
                "matchId": match_id,
                "homeTeam": {"id": home_id, "name": home_name},
                "awayTeam": {"id": away_id, "name": away_name},
                "markets": markets
            })
            day_meta["predicted"] += 1
            
        if day_meta["predicted"] == 0:
            print("❌ ZERO VALID PREDICTIONS GENERATED. Existing prediction file will NOT be overwritten.")
            day_meta["status"] = "generation_failed_zero_predictions"
            metadata["days_processed"].append(day_meta)
            continue
            
        output_payload = {
            "engine": ENGINE_VERSION, "pipeline": PIPELINE_VERSION, "status": "generated",
            "date": date_str, "generated_at": generated_at,
            "fixture_count": day_meta["total_fixtures"], "prediction_count": day_meta["predicted"],
            "markets": list(MODEL_REGISTRY.keys()), "predictions": predictions
        }
        
        try:
            atomic_json_write(output_file, output_payload)
            day_meta["output_written"] = True
            day_meta["status"] = "success"
            print(f"\n💾 Written: {output_file}")
        except Exception as exc:
            print(f"\n❌ Output write failed: {exc}")
            day_meta["status"] = "output_write_failed"
            
        coverage = (day_meta["predicted"] / day_meta["total_fixtures"] * 100) if day_meta["total_fixtures"] > 0 else 0
        print(f"\n📊 {date_str} SUMMARY")
        print(f"   Fixtures:   {day_meta['total_fixtures']:,}")
        print(f"   Predicted:  {day_meta['predicted']:,}")
        print(f"   Skipped:    {day_meta['skipped']:,}")
        print(f"   Coverage:   {coverage:.2f}%")
        metadata["days_processed"].append(day_meta)
        
    metadata_file = os.path.join(OUTPUT_DIR, "_metadata.json")
    try:
        atomic_json_write(metadata_file, metadata)
        print(f"\n📋 Metadata written: {metadata_file}")
    except Exception as exc:
        print(f"\n⚠️ Metadata write failed: {exc}")
        
    print("\n" + "=" * 60)
    print("✅ PIPELINE 50 COMPLETE")
    print("=" * 60)
    print("🚀 READY FOR NODE.JS DELIVERY")
    print("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⚠️ Pipeline interrupted by user.")
        raise SystemExit(130)
    except Exception as exc:
        print("\n❌ PIPELINE 50 FAILED")
        print(f"   {type(exc).__name__}: {exc}")
        raise SystemExit(1)