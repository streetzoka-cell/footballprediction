
import os, json, glob, joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS_DIR = os.path.join(BASE_DIR, "data", "processed")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models")

CHAMPION_MODEL_FILE = os.path.join(MODELS_DIR, "champion_model.joblib")
LABEL_MAPPING_FILE = os.path.join(MODELS_DIR, "label_mapping.json")
MANIFEST_FILE = os.path.join(MODELS_DIR, "champion_manifest.json")
FEATURE_SCHEMA_FILE = os.path.join(MODELS_DIR, "champion_feature_schema.json")

MIN_ACC = 48.0
MIN_F1 = 38.0
MIN_DRAW = 10.0

def get_nested(d, *keys, default=None):
    cur = d
    for k in keys:
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return default
    return cur

def run():
    print("="*60)
    print(" ZOKASCORE V2 — STEP 44: CLEAN DEPLOY")
    print("="*60+"\n")
    
    print("[1/4] Auditing reports...")
    reports = glob.glob(os.path.join(REPORTS_DIR, "*_report.json")) + glob.glob(os.path.join(REPORTS_DIR, "*_model_report.json"))
    # Also check honest_champion_model_report.json
    reports = sorted(set(reports))
    print(f"   Found {len(reports)} reports")
    
    candidates=[]
    for rf in reports:
        try:
            with open(rf, "r", encoding="utf-8") as f:
                r=json.load(f)
            status = str(r.get("status","")).upper()
            if status != "PASS":
                continue
            
            # Flexible parsing
            acc = r.get("accuracy_percent") or get_nested(r, "evaluation", "accuracy_percent") or r.get("accuracy",0)*100 if r.get("accuracy",0)<=1 else r.get("accuracy",0)
            f1 = r.get("macro_f1_percent") or get_nested(r, "evaluation", "macro_f1_percent") or 0
            draw = r.get("draw_recall_percent") or get_nested(r, "evaluation", "draw_recall_percent") or 0
            
            # Try classification_report
            if draw==0:
                cr = r.get("classification_report") or get_nested(r, "evaluation", "classification_report")
                if cr and "DRAW" in cr:
                    draw = cr["DRAW"].get("recall",0)*100
                    if draw<=1:
                        draw*=100
            
            features = r.get("features") or r.get("feature_columns") or get_nested(r, "model", "features")
            source = r.get("source_file") or r.get("source") or r.get("features_file") or os.path.join(BASE_DIR, "data", "ml", "features_v3_unique.csv")
            
            if not features:
                continue
            
            # Resolve source
            if not os.path.isabs(source):
                cand = os.path.join(BASE_DIR, source)
                if os.path.exists(cand):
                    source = cand
                else:
                    # fallback
                    v3 = os.path.join(BASE_DIR, "data", "ml", "features_v3_unique.csv")
                    if os.path.exists(v3):
                        source = v3
            
            print(f"   - {os.path.basename(rf)}: Acc {acc:.2f}% | F1 {f1:.1f}% | DRAW {draw:.1f}% | Feats {len(features)}")
            
            if acc < MIN_ACC or f1 < MIN_F1 or draw < MIN_DRAW:
                print(f"     ❌ REJECT gate (need >= {MIN_ACC}/{MIN_F1}/{MIN_DRAW})")
                continue
            
            score = acc*0.5 + f1*0.3 + draw*0.2
            candidates.append({
                "file": rf,
                "accuracy": acc,
                "macro_f1": f1,
                "draw_recall": draw,
                "score": score,
                "features": features,
                "source_file": source,
                "report": r
            })
            print(f"     ✅ PASS gate, score {score:.2f}")
        except Exception as e:
            print(f"   ⚠ Skip {os.path.basename(rf)}: {e}")
    
    if not candidates:
        raise RuntimeError("NO CANDIDATE PASSED GATE - need Acc>=48, F1>=38, DRAW>=10")
    
    candidates.sort(key=lambda x: x["score"], reverse=True)
    champ = candidates[0]
    print(f"\n[2/4] Champion: {os.path.basename(champ['file'])}")
    print(f"   Acc {champ['accuracy']:.2f}% | F1 {champ['macro_f1']:.1f}% | DRAW {champ['draw_recall']:.1f}%")
    print(f"   Score {champ['score']:.2f} | Features {len(champ['features'])}")
    
    print(f"\n[3/4] Training on 100% data from {champ['source_file']}...")
    df = pd.read_csv(champ["source_file"], low_memory=False)
    print(f"   Rows: {len(df):,}")
    
    target_col = "target"
    feat_cols = champ["features"]
    
    # Ensure features exist
    missing = [c for c in feat_cols if c not in df.columns]
    if missing:
        print(f"   ⚠ Missing {len(missing)} features, dropping: {missing[:5]}")
        feat_cols = [c for c in feat_cols if c in df.columns]
    
    work = df[feat_cols + [target_col]].replace([np.inf, -np.inf], np.nan).dropna()
    print(f"   Training rows after dropna: {len(work):,} (dropped {len(df)-len(work):,})")
    
    X = work[feat_cols].astype(float)
    y_raw = work[target_col].astype(str).str.strip()
    
    le = LabelEncoder()
    le.fit(["AWAY_WIN", "DRAW", "HOME_WIN"])
    y = le.transform(y_raw)
    
    # Save label mapping
    os.makedirs(MODELS_DIR, exist_ok=True)
    label_map = {str(i): str(label) for i, label in enumerate(le.classes_)}
    with open(LABEL_MAPPING_FILE+".tmp", "w", encoding="utf-8") as f:
        json.dump(label_map, f, indent=2)
    os.replace(LABEL_MAPPING_FILE+".tmp", LABEL_MAPPING_FILE)
    
    # Balanced weights like 42.3 best config 1.35x DRAW
    from sklearn.utils.class_weight import compute_sample_weight
    # Use config that passed: DRAW 1.35x
    sample_weights = np.ones(len(y))
    idx_draw = list(le.classes_).index("DRAW")
    sample_weights[y==idx_draw] = 1.35
    
    model = xgb.XGBClassifier(
        n_estimators=600,
        learning_rate=0.03,
        max_depth=8,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.05,
        reg_lambda=0.8,
        objective="multi:softprob",
        num_class=3,
        random_state=42,
        n_jobs=-1,
        tree_method="hist",
        eval_metric="mlogloss"
    )
    model.fit(X, y, sample_weight=sample_weights)
    
    # Save model
    joblib.dump(model, CHAMPION_MODEL_FILE+".tmp")
    os.replace(CHAMPION_MODEL_FILE+".tmp", CHAMPION_MODEL_FILE)
    print(f"   ✅ Model saved: {CHAMPION_MODEL_FILE}")
    
    # Feature schema
    schema = {
        "pipeline_step": "44",
        "champion_source": champ["file"],
        "source_file": champ["source_file"],
        "feature_count": len(feat_cols),
        "features": feat_cols,
        "target_classes": list(le.classes_),
        "training_rows": len(X)
    }
    with open(FEATURE_SCHEMA_FILE+".tmp", "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)
    os.replace(FEATURE_SCHEMA_FILE+".tmp", FEATURE_SCHEMA_FILE)
    
    print(f"\n[4/4] Saving manifest...")
    manifest = {
        "pipeline_step": "44",
        "status": "DEPLOYED",
        "champion": {
            "report_file": champ["file"],
            "accuracy": champ["accuracy"],
            "macro_f1": champ["macro_f1"],
            "draw_recall": champ["draw_recall"],
            "score": champ["score"],
            "source_file": champ["source_file"],
            "features": feat_cols,
            "feature_count": len(feat_cols)
        },
        "deployment": {
            "model_file": CHAMPION_MODEL_FILE,
            "label_mapping_file": LABEL_MAPPING_FILE,
            "feature_schema_file": FEATURE_SCHEMA_FILE,
            "training_rows": len(X)
        },
        "governance": {
            "min_accuracy": MIN_ACC,
            "min_macro_f1": MIN_F1,
            "min_draw_recall": MIN_DRAW
        },
        "deployed_at": pd.Timestamp.now().isoformat()
    }
    with open(MANIFEST_FILE+".tmp", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    os.replace(MANIFEST_FILE+".tmp", MANIFEST_FILE)
    
    print("\n"+"="*60)
    print(" STEP 44 COMPLETE: DEPLOYED ✅")
    print("="*60)
    print(f"🏆 Champion: {os.path.basename(champ['file'])}")
    print(f"🎯 Acc {champ['accuracy']:.2f}% | DRAW {champ['draw_recall']:.1f}% | F1 {champ['macro_f1']:.1f}%")
    print(f"📁 Model: {CHAMPION_MODEL_FILE}")
    print(f"📁 Manifest: {MANIFEST_FILE}")
    print("="*60)
    print("✅ Ready for 45-live-prediction.py")

if __name__=="__main__":
    run()
