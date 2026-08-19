#!/usr/bin/env python3
import os
import json
from collections import Counter

# ============================================================
# CONFIG
# ============================================================

DATE = "2026-08-15"

FIXTURE_FILE = os.path.join(
    "public_data",
    "fixtures",
    f"{DATE}.json"
)

FOOTBALL_ROOT = os.path.join(
    "public_data",
    "knowledge",
    "football"
)

INDEX_DIR = os.path.join(
    FOOTBALL_ROOT,
    "indexes"
)

MODEL_DIR = os.path.join(
    "data",
    "ml"
)

OUTPUT_DIR = os.path.join(
    "data_audit",
    "v2_integrity"
)

REPORT_FILE = os.path.join(
    OUTPUT_DIR,
    f"pipeline_52_team_coverage_{DATE}.json"
)

# ============================================================
# HELPERS
# ============================================================

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_optional(path):
    if not os.path.isfile(path):
        return None

    try:
        return load_json(path)
    except Exception as exc:
        print(f"⚠️ Could not load {path}: {exc}")
        return None


def extract_team(match, side):

    obj = match.get(f"{side}Team")

    if not isinstance(obj, dict):
        obj = {}

    team_id = (
        obj.get("id")
        or match.get(f"{side}TeamId")
        or match.get(f"{side}Id")
    )

    team_name = (
        obj.get("name")
        or match.get(f"{side}Name")
        or str(team_id) if team_id is not None else None
    )

    if team_id is not None:
        team_id = str(team_id).strip()

    if team_name is not None:
        team_name = str(team_name).strip()

    return team_id, team_name


def normalize_container(value):
    """
    Convert common index structures into something searchable.
    """

    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, dict):

        # Common wrapper patterns
        for key in (
            "teams",
            "clubs",
            "entities",
            "data",
            "index",
            "records",
            "items",
            "matches",
        ):
            nested = value.get(key)

            if isinstance(nested, (list, dict)):
                return nested

        return value

    return []


def recursive_find(value, target_id, target_name):
    """
    Conservative recursive search.

    We search for the fixture team's ID or exact name
    anywhere inside an index.

    READ ONLY.
    """

    target_id = str(target_id) if target_id is not None else None
    target_name_lower = (
        str(target_name).strip().lower()
        if target_name
        else None
    )

    def walk(node):

        if isinstance(node, dict):

            # Check keys that may directly contain IDs.
            for key, val in node.items():

                key_lower = str(key).lower()

                if target_id is not None:
                    if key_lower in {
                        "id",
                        "team_id",
                        "teamid",
                        "club_id",
                        "clubid",
                        "entity_id",
                        "entityid",
                    }:
                        if str(val).strip() == target_id:
                            return True

                if target_name_lower:
                    if key_lower in {
                        "name",
                        "team_name",
                        "teamname",
                        "club_name",
                        "clubname",
                    }:
                        if str(val).strip().lower() == target_name_lower:
                            return True

            for val in node.values():
                result = walk(val)
                if result:
                    return True

        elif isinstance(node, list):

            for item in node:
                result = walk(item)
                if result:
                    return True

        elif isinstance(node, str):

            if target_id is not None and node.strip() == target_id:
                return True

            if (
                target_name_lower
                and node.strip().lower() == target_name_lower
            ):
                return True

        return False

    return walk(value)


def direct_key_lookup(index, team_id, team_name):

    if not isinstance(index, dict):
        return False

    if team_id is not None:
        if str(team_id) in index:
            return True

    if team_name:

        name = team_name.strip()

        if name in index:
            return True

        lower = name.lower()

        for key in index.keys():
            if str(key).strip().lower() == lower:
                return True

    return False


def search_index(index, team_id, team_name):

    if index is None:
        return False

    if direct_key_lookup(index, team_id, team_name):
        return True

    return recursive_find(index, team_id, team_name)


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 78)
    print("ZOKASCORE V2 — PIPELINE 52")
    print("HISTORICAL TEAM COVERAGE RESOLVER AUDIT")
    print("=" * 78)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # --------------------------------------------------------
    # Load fixtures
    # --------------------------------------------------------

    fixtures = load_json(FIXTURE_FILE)

    matches = fixtures.get(
        "matches",
        fixtures.get("data", [])
    )

    print(f"\n📅 Date: {DATE}")
    print(f"📊 Fixtures: {len(matches):,}")

    # --------------------------------------------------------
    # Load indexes
    # --------------------------------------------------------

    index_files = {
        "club_identity": "club_identity_index.json",
        "entity_identity": "entity_identity_index.json",
        "team_alias": "team_alias_index.json",
        "team_match": "team_match_index.json",
        "team_stats": "team_stats.json",
        "elo_history": "elo_history_index.json",
    }

    indexes = {}

    print("\n📚 Loading knowledge indexes")
    print("-" * 78)

    for name, filename in index_files.items():

        path = os.path.join(
            INDEX_DIR,
            filename
        )

        data = load_optional(path)

        indexes[name] = data

        if data is None:
            print(f"   ❌ {name:<20} NOT AVAILABLE")
        else:
            if isinstance(data, dict):
                size = len(data)
            elif isinstance(data, list):
                size = len(data)
            else:
                size = "?"

            print(
                f"   ✅ {name:<20} loaded ({size:,} top-level)"
                if isinstance(size, int)
                else
                f"   ✅ {name:<20} loaded"
            )

    # --------------------------------------------------------
    # EWMA
    # --------------------------------------------------------

    ewma_path = os.path.join(
        MODEL_DIR,
        "ewma_state.json"
    )

    ewma = load_optional(ewma_path)

    print("\n🧠 ML STATE")
    print("-" * 78)

    if ewma is None:
        print("   ❌ EWMA state unavailable")
    else:
        print(f"   ✅ EWMA teams: {len(ewma):,}")

    # --------------------------------------------------------
    # Extract unique teams
    # --------------------------------------------------------

    teams = {}

    for match in matches:

        if not isinstance(match, dict):
            continue

        for side in ("home", "away"):

            team_id, team_name = extract_team(
                match,
                side
            )

            if not team_id:
                continue

            if team_id not in teams:

                teams[team_id] = {
                    "id": team_id,
                    "name": team_name,
                    "fixtures": 0,
                }

            teams[team_id]["fixtures"] += 1

    print(
        f"\n👥 Unique fixture teams: {len(teams):,}"
    )

    # --------------------------------------------------------
    # Resolve teams
    # --------------------------------------------------------

    results = []

    categories = Counter()

    for i, team in enumerate(
        teams.values(),
        start=1
    ):

        team_id = team["id"]
        team_name = team["name"]

        ewma_found = (
            isinstance(ewma, dict)
            and str(team_id) in ewma
        )

        checks = {
            "ewma": ewma_found,
            "club_identity": search_index(
                indexes["club_identity"],
                team_id,
                team_name
            ),
            "entity_identity": search_index(
                indexes["entity_identity"],
                team_id,
                team_name
            ),
            "team_alias": search_index(
                indexes["team_alias"],
                team_id,
                team_name
            ),
            "team_match": search_index(
                indexes["team_match"],
                team_id,
                team_name
            ),
            "team_stats": search_index(
                indexes["team_stats"],
                team_id,
                team_name
            ),
            "elo_history": search_index(
                indexes["elo_history"],
                team_id,
                team_name
            ),
        }

        historical_signal = any(
            checks[x]
            for x in (
                "club_identity",
                "entity_identity",
                "team_alias",
                "team_match",
                "team_stats",
                "elo_history",
            )
        )

        if checks["ewma"]:
            category = "EWMA_READY"

        elif historical_signal:
            category = "HISTORICAL_EXISTS_NO_EWMA"

        elif (
            checks["club_identity"]
            or checks["entity_identity"]
            or checks["team_alias"]
        ):
            category = "IDENTITY_ONLY"

        else:
            category = "UNKNOWN"

        categories[category] += 1

        results.append({
            "team_id": team_id,
            "team_name": team_name,
            "fixture_count": team["fixtures"],
            "category": category,
            "checks": checks,
        })

        print(
            f"[{i:>3}/{len(teams):<3}] "
            f"{team_id:<8} "
            f"{team_name[:32]:<32} "
            f"=> {category}"
        )

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    print("\n" + "=" * 78)
    print("COVERAGE SUMMARY")
    print("=" * 78)

    for category in (
        "EWMA_READY",
        "HISTORICAL_EXISTS_NO_EWMA",
        "IDENTITY_ONLY",
        "UNKNOWN",
    ):

        print(
            f"{category:<32} "
            f"{categories[category]:>5}"
        )

    # --------------------------------------------------------
    # Detailed subsets
    # --------------------------------------------------------

    print("\n" + "-" * 78)
    print("HISTORICAL DATA EXISTS BUT NO EWMA")
    print("-" * 78)

    for item in results:

        if item["category"] != "HISTORICAL_EXISTS_NO_EWMA":
            continue

        checks = item["checks"]

        sources = [
            key
            for key, value in checks.items()
            if value
        ]

        print(
            f"{item['team_id']:>8} | "
            f"{item['team_name']:<35} | "
            f"{', '.join(sources)}"
        )

    print("\n" + "-" * 78)
    print("COMPLETELY UNKNOWN TEAMS")
    print("-" * 78)

    for item in results:

        if item["category"] != "UNKNOWN":
            continue

        print(
            f"{item['team_id']:>8} | "
            f"{item['team_name']}"
        )

    # --------------------------------------------------------
    # Save report
    # --------------------------------------------------------

    report = {
        "engine": "ZOKASCORE_V2",
        "pipeline": "52",
        "type": "historical_team_coverage_audit",
        "read_only": True,
        "date": DATE,
        "fixture_count": len(matches),
        "unique_teams": len(teams),
        "summary": dict(categories),
        "teams": results,
    }

    with open(
        REPORT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            report,
            f,
            indent=2,
            ensure_ascii=False
        )

    print("\n" + "=" * 78)
    print("✅ PIPELINE 52 COMPLETE")
    print("=" * 78)

    print(
        f"\n📄 Report written:\n"
        f"   {REPORT_FILE}"
    )

    print(
        "\n⚠️ READ-ONLY: "
        "No existing data was modified."
    )


if __name__ == "__main__":
    main()