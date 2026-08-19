import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROPOSALS_FILE = os.path.join(BASE_DIR, "data", "predictions", "step48_1_safe_mapping_proposals.json")
INTERNAL_MAP_FILE = os.path.join(BASE_DIR, "data", "zokascore_football_data", "canonical_sources", "internal_team_map.json")

def run():
    print("=" * 60)
    print(" ZOKASCORE V2 — STEP 48.2: APPLY SAFE MAPPINGS")
    print("=" * 60)

    if not os.path.exists(PROPOSALS_FILE):
        print("❌ No safe mapping proposals found. Run Step 48.1 first.")
        return

    with open(PROPOSALS_FILE, "r", encoding="utf-8") as f:
        proposals = json.load(f)

    with open(INTERNAL_MAP_FILE, "r", encoding="utf-8") as f:
        internal_map = json.load(f)

    if "by_provider_club_id" not in internal_map:
        internal_map["by_provider_club_id"] = {}

    provider_map = internal_map["by_provider_club_id"]
    applied_count = 0

    for proposal in proposals.get("proposals", []):
        pid = proposal.get("provider_id")
        zk_id = proposal.get("recommended_zk_id")

        if pid and zk_id and pid not in provider_map:
            provider_map[pid] = zk_id
            applied_count += 1

    with open(INTERNAL_MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(internal_map, f, indent=2)

    print(f"✅ Applied {applied_count} new safe provider mappings!")
    print(f"📁 Updated internal_team_map.json")
    print("\n🚀 Rerun Step 48 to see increased coverage!")

if __name__ == "__main__":
    run()