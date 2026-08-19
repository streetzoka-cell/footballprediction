import os
import json
import shutil

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_STATE_FILE = os.path.join(BASE_DIR, "data", "models", "live_team_state.json")
PUBLIC_ELO_FILE = os.path.join(BASE_DIR, "public_data", "knowledge", "football", "indexes", "elo_current.json")

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 16: PUBLISH CURRENT ELO STATE")
    print("=" * 60)

    if not os.path.exists(LIVE_STATE_FILE):
        print("❌ live_team_state.json not found. Run Python Step 44 first.")
        return

    with open(LIVE_STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    elos = {team_id: data.get("elo", 1500) for team_id, data in state.items()}

    payload = {
        "generated_at": os.popen('node -e "console.log(new Date().toISOString())"').read().strip(),
        "total_teams": len(elos),
        "elos": elos
    }

    os.makedirs(os.path.dirname(PUBLIC_ELO_FILE), exist_ok=True)
    with open(PUBLIC_ELO_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"✅ Published current ELO for {len(elos)} teams to public_data.")

if __name__ == "__main__":
    run()