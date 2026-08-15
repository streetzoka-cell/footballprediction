#!/usr/bin/env python3

import os
import json
import math
from collections import Counter

FIXTURES_DIR = os.path.join("public_data", "fixtures")
MODEL_DIR = os.path.join("data", "ml")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def extract_team(match, side):
    obj = match.get(f"{side}Team")

    if not isinstance(obj, dict):
        obj = {}

    team_id = (
        obj.get("id")
        or match.get(f"{side}TeamId")
        or match.get(f"{side}Id")
    )

    name = (
        obj.get("name")
        or match.get(f"{side}Name")
        or str(team_id)
    )

    if team_id is not None:
        team_id = str(team_id).strip()

    return team_id, name


def valid_state(state):
    required = [
        "elo",
        "overall_points",
        "overall_gd",
        "overall_gf",
        "overall_ga",
        "home_points",
        "home_gd",
        "home_gf",
        "home_ga",
        "away_points",
        "away_gd",
        "away_gf",
        "away_ga",
        "matches_played",
        "home_matches_played",
        "away_matches_played",
    ]

    if not isinstance(state, dict):
        return False, "state_not_object"

    for field in required:
        if field not in state:
            return False, f"missing_{field}"

        try:
            if not math.isfinite(float(state[field])):
                return False, f"nonfinite_{field}"
        except:
            return False, f"invalid_{field}"

    return True, None


def main():

    date = "2026-08-15"

    fixture_path = os.path.join(
        FIXTURES_DIR,
        f"{date}.json"
    )

    ewma_path = os.path.join(
        MODEL_DIR,
        "ewma_state.json"
    )

    fixtures = load_json(fixture_path)
    ewma = load_json(ewma_path)

    matches = fixtures.get(
        "matches",
        fixtures.get("data", [])
    )

    print("=" * 70)
    print("ZOKASCORE V2 — PIPELINE 50 COVERAGE FORENSICS")
    print("=" * 70)

    print(f"\nFixtures: {len(matches):,}")
    print(f"EWMA teams: {len(ewma):,}")

    seen = set()

    duplicate = 0
    missing_match_id = 0
    missing_team_id = 0
    missing_home_state = 0
    missing_away_state = 0
    invalid_home_state = 0
    invalid_away_state = 0
    eligible = 0

    missing_teams = Counter()
    missing_team_names = {}

    for match in matches:

        if not isinstance(match, dict):
            continue

        match_id = match.get("id") or match.get("matchId")

        if match_id is None:
            missing_match_id += 1
            continue

        match_id = str(match_id).strip()

        if match_id in seen:
            duplicate += 1
            continue

        seen.add(match_id)

        home_id, home_name = extract_team(match, "home")
        away_id, away_name = extract_team(match, "away")

        if not home_id or not away_id:
            missing_team_id += 1
            continue

        home_state = ewma.get(str(home_id))
        away_state = ewma.get(str(away_id))

        if home_state is None:
            missing_home_state += 1
            missing_teams[home_id] += 1
            missing_team_names[home_id] = home_name

        if away_state is None:
            missing_away_state += 1
            missing_teams[away_id] += 1
            missing_team_names[away_id] = away_name

        if home_state is None or away_state is None:
            continue

        home_ok, home_error = valid_state(home_state)
        away_ok, away_error = valid_state(away_state)

        if not home_ok:
            invalid_home_state += 1
            continue

        if not away_ok:
            invalid_away_state += 1
            continue

        eligible += 1

    print("\n" + "-" * 70)
    print("RESULT")
    print("-" * 70)

    print(f"Unique fixtures:             {len(seen):,}")
    print(f"Duplicate fixtures:          {duplicate:,}")
    print(f"Missing match ID:            {missing_match_id:,}")
    print(f"Missing team ID:             {missing_team_id:,}")
    print(f"Missing HOME EWMA state:     {missing_home_state:,}")
    print(f"Missing AWAY EWMA state:     {missing_away_state:,}")
    print(f"Invalid HOME state:          {invalid_home_state:,}")
    print(f"Invalid AWAY state:          {invalid_away_state:,}")
    print(f"ML eligible fixtures:        {eligible:,}")

    total = len(matches)

    if total:
        print(
            f"\nTheoretical coverage from current EWMA: "
            f"{eligible / total * 100:.2f}%"
        )

    print("\n" + "-" * 70)
    print("MOST FREQUENT MISSING TEAMS")
    print("-" * 70)

    for team_id, count in missing_teams.most_common(50):
        print(
            f"{team_id:>8} | "
            f"{count:>3} fixtures | "
            f"{missing_team_names.get(team_id)}"
        )

    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()