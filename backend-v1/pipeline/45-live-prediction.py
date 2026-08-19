import os
import json
import glob
import joblib
import pandas as pd
import numpy as np
import unicodedata
import re
from datetime import datetime, timezone


# ============================================================
# ZOKASCORE V2 — STEP 45
# LIVE PREDICTION ENGINE
#
# PURPOSE:
#   Consume real upcoming fixtures from:
#
#       public_data/fixtures/YYYY-MM-DD.json
#
#   Resolve:
#
#       provider team ID
#           ↓
#       canonical ZK_TEAM_* ID
#
#   using the authoritative:
#
#       data/zokascore_football_data/
#           canonical_sources/
#           internal_team_map.json
#
#   Then:
#
#       canonical team
#           ↓
#       Step 44 live_team_state
#           ↓
#       exact 15-feature model input
#           ↓
#       champion model
#           ↓
#       1X2 probabilities
#
#
# SAFETY:
#
#   - Never invents canonical team IDs
#   - Never invents provider IDs
#   - Never creates fake team states
#   - Never modifies Step 44 model artifacts
#   - Never modifies fixture files
#   - Only predicts NS/TBD fixtures
#   - Deduplicates provider match IDs
#   - Validates feature schema
#   - Validates model classes
#   - Validates label mapping
#   - Validates probability sums
#   - Requires canonical team to exist in live state
#   - Uses provider-ID mapping before name fallback
#   - Uses internal_team_map.json as authoritative
#     provider-ID source
#
# IMPORTANT:
#
#   A provider ID missing from internal_team_map.json
#   remains unresolved.
#
#   We DO NOT guess those 630 missing provider IDs.
# ============================================================


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)


# ============================================================
# DIRECTORIES
# ============================================================

MODELS_DIR = os.path.join(
    BASE_DIR,
    "data",
    "models"
)

INDEX_DIR = os.path.join(
    BASE_DIR,
    "data",
    "indexes"
)

FIXTURES_DIR = os.path.join(
    BASE_DIR,
    "public_data",
    "fixtures"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "predictions"
)

CANONICAL_SOURCES_DIR = os.path.join(
    BASE_DIR,
    "data",
    "zokascore_football_data",
    "canonical_sources"
)


# ============================================================
# INPUT ARTIFACTS
# ============================================================

CHAMPION_MODEL_FILE = os.path.join(
    MODELS_DIR,
    "champion_model.joblib"
)

CHAMPION_SCHEMA_FILE = os.path.join(
    MODELS_DIR,
    "champion_feature_schema.json"
)

LIVE_STATE_FILE = os.path.join(
    MODELS_DIR,
    "live_team_state.json"
)

LABEL_MAPPING_FILE = os.path.join(
    MODELS_DIR,
    "label_mapping.json"
)

CHAMPION_MANIFEST_FILE = os.path.join(
    MODELS_DIR,
    "champion_manifest.json"
)

TEAMS_INDEX_FILE = os.path.join(
    INDEX_DIR,
    "teams-index.json"
)

INTERNAL_TEAM_MAP_FILE = os.path.join(
    CANONICAL_SOURCES_DIR,
    "internal_team_map.json"
)


# ============================================================
# OUTPUT ARTIFACTS
# ============================================================

PUBLIC_PREDICTIONS_FILE = os.path.join(
    BASE_DIR,
    "public_data",
    "predictions.json"
)


# ============================================================
# EXACT CHAMPION FEATURE ORDER
# ============================================================

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
    "h2h_matches",
]


EXPECTED_LABELS = {
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
}


# ============================================================
# FIXTURE POLICY
# ============================================================

PREDICTABLE_STATUSES = {
    "NS",
    "TBD",
}


# ============================================================
# UTILITIES
# ============================================================

def clean_name(value):
    """
    Normalize a team name for safe fallback matching.

    This is ONLY a fallback resolver.

    Provider-ID resolution has priority.
    """

    value = str(value or "").strip().lower()

    value = unicodedata.normalize(
        "NFKD",
        value
    )

    value = "".join(
        char
        for char in value
        if not unicodedata.combining(char)
    )

    value = value.replace(
        "&",
        " and "
    )

    value = re.sub(
        r"[.'’‘`\"]",
        "",
        value
    )

    value = re.sub(
        r"[^a-z0-9]+",
        " ",
        value
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    ).strip()

    return value


def as_string(value):

    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return value


def get_nested_values(obj, keys):
    """
    Recursively collect values for a set of possible field names.
    """

    found = []

    if isinstance(obj, dict):

        for key, value in obj.items():

            key_lower = str(key).lower()

            if key_lower in keys:
                found.append(value)

            found.extend(
                get_nested_values(
                    value,
                    keys
                )
            )

    elif isinstance(obj, list):

        for item in obj:

            found.extend(
                get_nested_values(
                    item,
                    keys
                )
            )

    return found


def first_value(obj, keys):

    values = get_nested_values(
        obj,
        keys
    )

    for value in values:

        if isinstance(
            value,
            (str, int, float)
        ):

            value = as_string(value)

            if value:
                return value

    return None


def extract_team_name(profile):

    keys = {
        "name",
        "team_name",
        "teamname",
        "display_name",
        "displayname",
        "short_name",
        "shortname",
    }

    return first_value(
        profile,
        keys
    )


def extract_provider_ids(profile):

    keys = {
        "id",
        "provider_id",
        "providerid",
        "api_id",
        "apiid",
        "isports_id",
        "isportsid",
        "football_id",
        "footballid",
        "external_id",
        "externalid",
        "source_id",
        "sourceid",
    }

    values = get_nested_values(
        profile,
        keys
    )

    result = set()

    for value in values:

        if isinstance(
            value,
            (str, int, float)
        ):

            value = as_string(value)

            if value:
                result.add(value)

    return result


# ============================================================
# GENERIC TEAM INDEX REGISTRATION
# ============================================================

def register_team_mapping(
    provider_map,
    name_map,
    canonical_id,
    profile
):
    """
    Register one canonical team profile.

    Used primarily for teams-index.json.
    """

    canonical_id = as_string(
        canonical_id
    )

    if not canonical_id:
        return

    name = extract_team_name(
        profile
    )

    if name:

        normalized = clean_name(
            name
        )

        if normalized:

            existing = name_map.get(
                normalized
            )

            if existing is None:

                name_map[
                    normalized
                ] = canonical_id

            elif existing != canonical_id:

                # Ambiguous name.
                # Never guess.
                name_map.pop(
                    normalized,
                    None
                )

    for provider_id in extract_provider_ids(
        profile
    ):

        existing = provider_map.get(
            provider_id
        )

        if existing is None:

            provider_map[
                provider_id
            ] = canonical_id

        elif existing != canonical_id:

            # Ambiguous provider ID.
            # Never guess.
            provider_map.pop(
                provider_id,
                None
            )


# ============================================================
# TEAMS INDEX RESOLVER
# ============================================================

def build_team_resolver(teams_index):
    """
    Build fallback resolver from teams-index.json.

    Produces:

        provider ID -> ZK_TEAM_ID
        normalized name -> ZK_TEAM_ID

    Supports dictionary-style and list-style indexes.
    """

    provider_map = {}
    name_map = {}

    if isinstance(
        teams_index,
        dict
    ):

        for canonical_id, profile in teams_index.items():

            if not isinstance(
                profile,
                dict
            ):
                continue

            register_team_mapping(
                provider_map,
                name_map,
                canonical_id,
                profile
            )

            nested_canonical = first_value(
                profile,
                {
                    "canonical_id",
                    "canonicalid",
                    "zokascore_team_id",
                    "zokascoreteamid",
                    "zk_team_id",
                }
            )

            if nested_canonical:

                register_team_mapping(
                    provider_map,
                    name_map,
                    nested_canonical,
                    profile
                )

    elif isinstance(
        teams_index,
        list
    ):

        for profile in teams_index:

            if not isinstance(
                profile,
                dict
            ):
                continue

            canonical_id = first_value(
                profile,
                {
                    "canonical_id",
                    "canonicalid",
                    "zokascore_team_id",
                    "zokascoreteamid",
                    "zk_team_id",
                }
            )

            if not canonical_id:
                continue

            register_team_mapping(
                provider_map,
                name_map,
                canonical_id,
                profile
            )

    return provider_map, name_map


# ============================================================
# AUTHORITATIVE INTERNAL TEAM MAP
# ============================================================

def build_internal_provider_map(
    internal_team_map,
    team_states
):
    """
    Build authoritative:

        provider club ID
            ->
        canonical ZK_TEAM_* ID

    from:

        internal_team_map.json

    Expected observed structure:

        {
            "by_provider_club_id": {
                "501": "ZK_TEAM_...",
                "1455": "ZK_TEAM_...",
                ...
            }
        }

    SAFETY:

    - Only uses explicit mappings.
    - Never derives IDs.
    - Never guesses.
    - Requires mapped canonical ID to exist
      in live_team_state.json.
    - Detects conflicting mappings.
    """

    if not isinstance(
        internal_team_map,
        dict
    ):

        raise RuntimeError(
            "internal_team_map.json must contain "
            "a JSON object."
        )

    raw_map = internal_team_map.get(
        "by_provider_club_id"
    )

    if not isinstance(
        raw_map,
        dict
    ):

        raise RuntimeError(
            "internal_team_map.json is missing "
            "the expected 'by_provider_club_id' object."
        )

    provider_map = {}

    skipped_missing_state = 0

    conflicts = 0

    for raw_provider_id, raw_canonical_id in raw_map.items():

        provider_id = as_string(
            raw_provider_id
        )

        canonical_id = as_string(
            raw_canonical_id
        )

        if not provider_id:
            continue

        if not canonical_id:
            continue

        if canonical_id not in team_states:

            skipped_missing_state += 1

            continue

        existing = provider_map.get(
            provider_id
        )

        if existing is None:

            provider_map[
                provider_id
            ] = canonical_id

        elif existing != canonical_id:

            # Conflict.
            # Never guess.
            provider_map.pop(
                provider_id,
                None
            )

            conflicts += 1

    return (
        provider_map,
        skipped_missing_state,
        conflicts
    )


# ============================================================
# COMBINED TEAM RESOLVER
# ============================================================

def resolve_team(
    provider_id,
    team_name,
    internal_provider_map,
    index_provider_map,
    name_map,
    team_states
):
    """
    Resolve fixture team.

    Priority:

        1. authoritative internal provider map
        2. teams-index provider map
        3. normalized team name

    A resolved team MUST exist in live_team_state.json.
    """

    provider_id = as_string(
        provider_id
    )

    # --------------------------------------------------------
    # 1. AUTHORITATIVE INTERNAL PROVIDER MAP
    # --------------------------------------------------------

    if provider_id:

        canonical_id = internal_provider_map.get(
            provider_id
        )

        if canonical_id:

            if canonical_id in team_states:

                return {
                    "canonical_id": canonical_id,
                    "method": "provider_id",
                    "resolver_source": "internal_team_map",
                }

    # --------------------------------------------------------
    # 2. TEAMS INDEX PROVIDER MAP
    # --------------------------------------------------------

    if provider_id:

        canonical_id = index_provider_map.get(
            provider_id
        )

        if canonical_id:

            if canonical_id in team_states:

                return {
                    "canonical_id": canonical_id,
                    "method": "provider_id",
                    "resolver_source": "teams-index",
                }

    # --------------------------------------------------------
    # 3. NAME FALLBACK
    # --------------------------------------------------------

    normalized_name = clean_name(
        team_name
    )

    if normalized_name:

        canonical_id = name_map.get(
            normalized_name
        )

        if canonical_id:

            if canonical_id in team_states:

                return {
                    "canonical_id": canonical_id,
                    "method": "team_name",
                    "resolver_source": "teams-index",
                }

    # --------------------------------------------------------
    # UNRESOLVED
    # --------------------------------------------------------

    return None


# ============================================================
# JSON
# ============================================================

def load_json(path):

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)


# ============================================================
# FIXTURE LOADING
# ============================================================

def load_fixture_file(path):
    """
    Supports:

        {"data": [...]}

    and:

        [...]
    """

    data = load_json(
        path
    )

    if isinstance(
        data,
        dict
    ):

        matches = data.get(
            "data",
            []
        )

    elif isinstance(
        data,
        list
    ):

        matches = data

    else:

        return []

    if not isinstance(
        matches,
        list
    ):

        return []

    return matches


def extract_fixture(
    match,
    source_file
):
    """
    Convert provider fixture into controlled structure.
    """

    if not isinstance(
        match,
        dict
    ):

        return None

    status = as_string(
        match.get("status")
    )

    if status not in PREDICTABLE_STATUSES:

        return None

    home_team = (
        match.get("homeTeam")
        or {}
    )

    away_team = (
        match.get("awayTeam")
        or {}
    )

    home_name = (
        match.get("homeTeamName")
        or match.get("homeName")
        or home_team.get("name")
        or home_team.get("shortName")
    )

    away_name = (
        match.get("awayTeamName")
        or match.get("awayName")
        or away_team.get("name")
        or away_team.get("shortName")
    )

    home_provider_id = (
        match.get("homeTeamId")
        or home_team.get("id")
    )

    away_provider_id = (
        match.get("awayTeamId")
        or away_team.get("id")
    )

    match_id = (
        match.get("id")
        or match.get("match_id")
    )

    if not match_id:
        return None

    if not home_name or not away_name:
        return None

    league = None

    if match.get("leagueName"):

        league = match.get(
            "leagueName"
        )

    elif isinstance(
        match.get("league"),
        dict
    ):

        league = match.get(
            "league"
        ).get("name")

    date_value = (
        match.get("date")
        or match.get("utcDate")
        or match.get("dateStr")
    )

    return {

        "match_id":
            str(match_id),

        "date":
            date_value,

        "league":
            league,

        "home_name":
            str(home_name),

        "away_name":
            str(away_name),

        "home_provider_id":
            as_string(
                home_provider_id
            ),

        "away_provider_id":
            as_string(
                away_provider_id
            ),

        "status":
            status,

        "source_file":
            os.path.basename(
                source_file
            ),
    }


def get_prediction_date():

    return datetime.now(
        timezone.utc
    ).date()


def collect_upcoming_fixtures():
    """
    Scan fixture JSON files.

    Only:

        NS
        TBD

    are accepted.

    Historical fixtures are skipped.

    Duplicate provider match IDs are removed.
    """

    fixture_files = sorted(
        glob.glob(
            os.path.join(
                FIXTURES_DIR,
                "*.json"
            )
        )
    )

    fixtures = []

    seen_ids = set()

    today = get_prediction_date()

    for file_path in fixture_files:

        try:

            matches = load_fixture_file(
                file_path
            )

        except Exception as exc:

            print(
                f"   ⚠️ Could not parse "
                f"{os.path.basename(file_path)}: "
                f"{exc}"
            )

            continue

        for match in matches:

            fixture = extract_fixture(
                match,
                file_path
            )

            if fixture is None:
                continue

            date_value = fixture[
                "date"
            ]

            fixture_date = None

            if date_value:

                try:

                    parsed = pd.to_datetime(
                        date_value,
                        errors="coerce",
                        utc=True
                    )

                    if not pd.isna(parsed):

                        fixture_date = (
                            parsed.date()
                        )

                except Exception:

                    fixture_date = None

            # ------------------------------------------------
            # HISTORICAL GUARD
            # ------------------------------------------------

            if fixture_date is not None:

                if fixture_date < today:
                    continue

            match_id = fixture[
                "match_id"
            ]

            if match_id in seen_ids:
                continue

            seen_ids.add(
                match_id
            )

            fixtures.append(
                fixture
            )

    fixtures.sort(
        key=lambda item: (
            str(
                item.get("date")
                or ""
            ),
            str(
                item["match_id"]
            )
        )
    )

    return fixtures


# ============================================================
# STEP 44 STATE -> MODEL FEATURES
# ============================================================

def get_numeric(
    state,
    key,
    default=None
):

    value = state.get(
        key
    )

    if value is None:
        return default

    try:

        value = float(
            value
        )

    except (
        TypeError,
        ValueError
    ):

        return default

    if not np.isfinite(
        value
    ):

        return default

    return value


def build_model_features(
    home_state,
    away_state
):
    """
    Convert Step 44 live state into the exact
    15 features required by the champion model.

    H2H is not present in Step 44 live_team_state.json.

    Therefore:

        h2h_hw_rate = 0
        h2h_d_rate  = 0
        h2h_aw_rate = 0
        h2h_matches = 0
    """

    home_elo = get_numeric(
        home_state,
        "elo"
    )

    away_elo = get_numeric(
        away_state,
        "elo"
    )

    home_points = get_numeric(
        home_state,
        "ewma_points"
    )

    away_points = get_numeric(
        away_state,
        "ewma_points"
    )

    home_home_points = get_numeric(
        home_state,
        "ewma_home_points"
    )

    away_away_points = get_numeric(
        away_state,
        "ewma_away_points"
    )

    home_gf = get_numeric(
        home_state,
        "ewma_gf"
    )

    away_gf = get_numeric(
        away_state,
        "ewma_gf"
    )

    home_ga = get_numeric(
        home_state,
        "ewma_ga"
    )

    away_ga = get_numeric(
        away_state,
        "ewma_ga"
    )

    required = {

        "home_elo_pre":
            home_elo,

        "away_elo_pre":
            away_elo,

        "home_form_pts":
            home_points,

        "away_form_pts":
            away_points,

        "home_home_pts":
            home_home_points,

        "away_away_pts":
            away_away_points,

        "home_gf_avg":
            home_gf,

        "away_gf_avg":
            away_gf,

        "home_ga_avg":
            home_ga,

        "away_ga_avg":
            away_ga,
    }

    missing = [
        key
        for key, value in required.items()
        if value is None
    ]

    if missing:

        raise RuntimeError(
            "Live state is missing required "
            "model inputs: "
            + ", ".join(missing)
        )

    return {

        "home_elo_pre":
            home_elo,

        "away_elo_pre":
            away_elo,

        "elo_diff":
            home_elo - away_elo,

        "home_form_pts":
            home_points,

        "away_form_pts":
            away_points,

        "home_home_pts":
            home_home_points,

        "away_away_pts":
            away_away_points,

        "home_gf_avg":
            home_gf,

        "away_gf_avg":
            away_gf,

        "home_ga_avg":
            home_ga,

        "away_ga_avg":
            away_ga,

        "h2h_hw_rate":
            0.0,

        "h2h_d_rate":
            0.0,

        "h2h_aw_rate":
            0.0,

        "h2h_matches":
            0,
    }


def validate_features(features):

    missing = [
        column
        for column in FEATURE_COLUMNS
        if column not in features
    ]

    if missing:

        raise RuntimeError(
            "Missing model features: "
            + ", ".join(missing)
        )

    for column in FEATURE_COLUMNS:

        value = features[
            column
        ]

        try:

            numeric = float(
                value
            )

        except (
            TypeError,
            ValueError
        ):

            raise RuntimeError(
                f"Invalid feature value: "
                f"{column}={value!r}"
            )

        if not np.isfinite(
            numeric
        ):

            raise RuntimeError(
                f"Non-finite feature value: "
                f"{column}={value!r}"
            )


# ============================================================
# LABEL MAPPING
# ============================================================

def build_label_mapping(
    label_mapping,
    model
):
    """
    Safely normalize label_mapping.json.

    Supports:

        {
            "0": "AWAY_WIN",
            "1": "DRAW",
            "2": "HOME_WIN"
        }

    and:

        {
            "AWAY_WIN": 0,
            "DRAW": 1,
            "HOME_WIN": 2
        }

    Internally:

        class ID -> label
    """

    if not isinstance(
        label_mapping,
        dict
    ):

        raise RuntimeError(
            "label_mapping.json must contain "
            "an object."
        )

    class_to_label = True

    for key, value in label_mapping.items():

        try:

            int(key)

            class_to_label = True

            break

        except (
            TypeError,
            ValueError
        ):

            pass

        try:

            int(value)

            class_to_label = False

            break

        except (
            TypeError,
            ValueError
        ):

            pass

    inverse_mapping = {}

    forward_mapping = {}

    # --------------------------------------------------------
    # FORMAT A
    # class ID -> label
    # --------------------------------------------------------

    if class_to_label:

        for raw_class_id, raw_label in label_mapping.items():

            try:

                class_id = int(
                    raw_class_id
                )

            except (
                TypeError,
                ValueError
            ):

                raise RuntimeError(
                    "Invalid class ID in "
                    "label_mapping.json: "
                    f"{raw_class_id!r}"
                )

            label = str(
                raw_label
            ).strip()

            if label not in EXPECTED_LABELS:

                raise RuntimeError(
                    "Unknown label in "
                    "label_mapping.json: "
                    f"{label!r}"
                )

            inverse_mapping[
                class_id
            ] = label

            forward_mapping[
                label
            ] = class_id

    # --------------------------------------------------------
    # FORMAT B
    # label -> class ID
    # --------------------------------------------------------

    else:

        for raw_label, raw_class_id in label_mapping.items():

            label = str(
                raw_label
            ).strip()

            if label not in EXPECTED_LABELS:

                raise RuntimeError(
                    "Unknown label in "
                    "label_mapping.json: "
                    f"{label!r}"
                )

            try:

                class_id = int(
                    raw_class_id
                )

            except (
                TypeError,
                ValueError
            ):

                raise RuntimeError(
                    "Invalid class ID for label "
                    f"{label!r}: "
                    f"{raw_class_id!r}"
                )

            forward_mapping[
                label
            ] = class_id

            inverse_mapping[
                class_id
            ] = label

    # --------------------------------------------------------
    # LABEL VALIDATION
    # --------------------------------------------------------

    actual_labels = set(
        inverse_mapping.values()
    )

    missing_labels = (
        EXPECTED_LABELS
        - actual_labels
    )

    if missing_labels:

        raise RuntimeError(
            "label_mapping.json is missing labels: "
            + ", ".join(
                sorted(missing_labels)
            )
        )

    if len(inverse_mapping) != len(
        forward_mapping
    ):

        raise RuntimeError(
            "label_mapping.json contains "
            "duplicate class IDs or labels."
        )

    # --------------------------------------------------------
    # MODEL CLASS VALIDATION
    # --------------------------------------------------------

    model_classes = getattr(
        model,
        "classes_",
        None
    )

    if model_classes is None:

        raise RuntimeError(
            "Champion model has no classes_ attribute."
        )

    model_classes = [
        int(value)
        for value in model_classes
    ]

    mapping_classes = sorted(
        inverse_mapping.keys()
    )

    expected_model_classes = sorted(
        model_classes
    )

    if mapping_classes != expected_model_classes:

        raise RuntimeError(
            "Model class IDs do not match "
            "label_mapping.json.\n"
            f"Mapping: {mapping_classes}\n"
            f"Model:   {expected_model_classes}"
        )

    if len(inverse_mapping) != 3:

        raise RuntimeError(
            "Expected exactly 3 outcome classes, "
            f"found {len(inverse_mapping)}."
        )

    print(
        "   ↳ Label mapping orientation: "
        + (
            "class_id -> label"
            if class_to_label
            else
            "label -> class_id"
        )
    )

    print(
        "   ↳ Class mapping: "
        + ", ".join(
            f"{class_id}={label}"
            for class_id, label
            in sorted(
                inverse_mapping.items()
            )
        )
    )

    return (
        forward_mapping,
        inverse_mapping
    )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 70)

    print(
        " ZOKASCORE V2 — STEP 45: "
        "LIVE PREDICTION ENGINE"
    )

    print("=" * 70)

    print()

    # ========================================================
    # 1. CHECK ARTIFACTS
    # ========================================================

    print(
        "[1/7] Checking deployment artifacts..."
    )

    required_files = [

        CHAMPION_MODEL_FILE,

        CHAMPION_SCHEMA_FILE,

        LIVE_STATE_FILE,

        LABEL_MAPPING_FILE,

        CHAMPION_MANIFEST_FILE,

        TEAMS_INDEX_FILE,

        INTERNAL_TEAM_MAP_FILE,
    ]

    for path in required_files:

        if not os.path.exists(path):

            raise FileNotFoundError(
                "Required artifact not found:\n"
                f"{path}"
            )

    print(
        "   ✅ Champion model exists."
    )

    print(
        "   ✅ Champion feature schema exists."
    )

    print(
        "   ✅ Live team state exists."
    )

    print(
        "   ✅ Label mapping exists."
    )

    print(
        "   ✅ Champion manifest exists."
    )

    print(
        "   ✅ Team identity index exists."
    )

    print(
        "   ✅ Internal provider team map exists."
    )

    # ========================================================
    # 2. LOAD ARTIFACTS
    # ========================================================

    print(
        "\n[2/7] Loading deployment artifacts..."
    )

    model = joblib.load(
        CHAMPION_MODEL_FILE
    )

    schema = load_json(
        CHAMPION_SCHEMA_FILE
    )

    team_states = load_json(
        LIVE_STATE_FILE
    )

    label_mapping = load_json(
        LABEL_MAPPING_FILE
    )

    manifest = load_json(
        CHAMPION_MANIFEST_FILE
    )

    teams_index = load_json(
        TEAMS_INDEX_FILE
    )

    internal_team_map = load_json(
        INTERNAL_TEAM_MAP_FILE
    )

    print(
        f"   ↳ Live team states: "
        f"{len(team_states):,}"
    )

    # ========================================================
    # MODEL CLASS INFORMATION
    # ========================================================

    model_classes = getattr(
        model,
        "classes_",
        None
    )

    if model_classes is None:

        raise RuntimeError(
            "Champion model has no classes_ attribute."
        )

    print(
        "   ↳ Model classes: "
        + ", ".join(
            str(int(value))
            for value in model_classes
        )
    )

    # ========================================================
    # FEATURE SCHEMA
    # ========================================================

    schema_features = schema.get(
        "features",
        []
    )

    if schema_features != FEATURE_COLUMNS:

        raise RuntimeError(
            "Champion feature schema mismatch.\n\n"
            f"Expected:\n{FEATURE_COLUMNS}\n\n"
            f"Artifact:\n{schema_features}"
        )

    schema_feature_count = schema.get(
        "feature_count"
    )

    if schema_feature_count != len(
        FEATURE_COLUMNS
    ):

        raise RuntimeError(
            "Champion feature count mismatch.\n"
            f"Expected: {len(FEATURE_COLUMNS)}\n"
            f"Artifact: {schema_feature_count}"
        )

    print(
        f"   ✅ Champion schema validated "
        f"({len(FEATURE_COLUMNS)} features)."
    )

    # ========================================================
    # LABEL MAPPING
    # ========================================================

    _, inverse_mapping = build_label_mapping(
        label_mapping,
        model
    )

    print(
        "   ✅ Label mapping validated."
    )

    # ========================================================
    # 3. BUILD TEAM RESOLVERS
    # ========================================================

    print(
        "\n[3/7] Building canonical team resolvers..."
    )

    # --------------------------------------------------------
    # TEAMS INDEX
    # --------------------------------------------------------

    index_provider_map, name_map = build_team_resolver(
        teams_index
    )

    print(
        f"   ↳ teams-index provider mappings: "
        f"{len(index_provider_map):,}"
    )

    print(
        f"   ↳ teams-index name mappings: "
        f"{len(name_map):,}"
    )

    # --------------------------------------------------------
    # INTERNAL AUTHORITATIVE MAP
    # --------------------------------------------------------

    (
        internal_provider_map,
        skipped_missing_state,
        internal_conflicts
    ) = build_internal_provider_map(
        internal_team_map,
        team_states
    )

    print(
        f"   ↳ internal provider mappings: "
        f"{len(internal_provider_map):,}"
    )

    print(
        f"   ↳ internal mappings skipped "
        f"(missing live state): "
        f"{skipped_missing_state:,}"
    )

    print(
        f"   ↳ internal mapping conflicts: "
        f"{internal_conflicts:,}"
    )

    print()

    print(
        "   Provider resolution priority:"
    )

    print(
        "      1. internal_team_map.json"
    )

    print(
        "      2. teams-index.json"
    )

    print(
        "      3. normalized team name"
    )

    # ========================================================
    # 4. LOAD REAL FIXTURES
    # ========================================================

    print(
        "\n[4/7] Loading real upcoming fixtures "
        f"from:\n   {FIXTURES_DIR}"
    )

    fixtures = collect_upcoming_fixtures()

    print(
        f"   ↳ Upcoming fixtures found: "
        f"{len(fixtures):,}"
    )

    if not fixtures:

        print()

        print(
            "   ⚠️ No NS/TBD fixtures found "
            "for today or future dates."
        )

        print()

        print("=" * 70)

        print(
            " STEP 45 COMPLETE: NO FIXTURES"
        )

        print("=" * 70)

        return

    # ========================================================
    # 5. RESOLVE + PREDICT
    # ========================================================

    print(
        "\n[5/7] Resolving teams "
        "and generating predictions..."
    )

    predictions = []

    unresolved = []

    resolved_by_provider_id = 0

    resolved_by_name = 0

    resolved_from_internal_map = 0

    resolved_from_teams_index = 0

    # --------------------------------------------------------
    # TRACK PROVIDER IDS
    # --------------------------------------------------------

    provider_ids_seen = set()

    provider_ids_found_internal = set()

    provider_ids_missing_internal = set()

    for fixture in fixtures:

        if fixture.get(
            "home_provider_id"
        ):

            provider_ids_seen.add(
                str(
                    fixture[
                        "home_provider_id"
                    ]
                )
            )

        if fixture.get(
            "away_provider_id"
        ):

            provider_ids_seen.add(
                str(
                    fixture[
                        "away_provider_id"
                    ]
                )

            )

        # ====================================================
        # HOME RESOLUTION
        # ====================================================

        home_resolution = resolve_team(

            fixture[
                "home_provider_id"
            ],

            fixture[
                "home_name"
            ],

            internal_provider_map,

            index_provider_map,

            name_map,

            team_states
        )

        # ====================================================
        # AWAY RESOLUTION
        # ====================================================

        away_resolution = resolve_team(

            fixture[
                "away_provider_id"
            ],

            fixture[
                "away_name"
            ],

            internal_provider_map,

            index_provider_map,

            name_map,

            team_states
        )

        # ====================================================
        # TRACK INTERNAL MAP COVERAGE
        # ====================================================

        for provider_id in [
            fixture[
                "home_provider_id"
            ],
            fixture[
                "away_provider_id"
            ],
        ]:

            provider_id = as_string(
                provider_id
            )

            if not provider_id:
                continue

            if provider_id in internal_provider_map:

                provider_ids_found_internal.add(
                    provider_id
                )

            else:

                provider_ids_missing_internal.add(
                    provider_id
                )

        # ====================================================
        # UNKNOWN TEAM SAFETY GATE
        # ====================================================

        if (
            not home_resolution
            or not away_resolution
        ):

            item = {

                "match_id":
                    fixture[
                        "match_id"
                    ],

                "date":
                    fixture[
                        "date"
                    ],

                "league":
                    fixture[
                        "league"
                    ],

                "home_team":
                    fixture[
                        "home_name"
                    ],

                "away_team":
                    fixture[
                        "away_name"
                    ],

                "home_provider_id":
                    fixture[
                        "home_provider_id"
                    ],

                "away_provider_id":
                    fixture[
                        "away_provider_id"
                    ],

                "home_resolved":
                    bool(
                        home_resolution
                    ),

                "away_resolved":
                    bool(
                        away_resolution
                    ),

                "source_file":
                    fixture[
                        "source_file"
                    ],
            }

            if not home_resolution:

                item[
                    "home_resolution_failure"
                ] = (
                    "provider ID not found in "
                    "authoritative internal map "
                    "or fallback resolver, and "
                    "name fallback did not resolve"
                )

            if not away_resolution:

                item[
                    "away_resolution_failure"
                ] = (
                    "provider ID not found in "
                    "authoritative internal map "
                    "or fallback resolver, and "
                    "name fallback did not resolve"
                )

            unresolved.append(
                item
            )

            continue

        home_id = home_resolution[
            "canonical_id"
        ]

        away_id = away_resolution[
            "canonical_id"
        ]

        # ====================================================
        # RESOLUTION COUNTS
        # ====================================================

        for resolution in [
            home_resolution,
            away_resolution
        ]:

            if resolution[
                "method"
            ] == "provider_id":

                resolved_by_provider_id += 1

                if resolution[
                    "resolver_source"
                ] == "internal_team_map":

                    resolved_from_internal_map += 1

                elif resolution[
                    "resolver_source"
                ] == "teams-index":

                    resolved_from_teams_index += 1

            else:

                resolved_by_name += 1

        # ====================================================
        # GET LIVE STATES
        # ====================================================

        home_state = team_states.get(
            home_id
        )

        away_state = team_states.get(
            away_id
        )

        if (
            not home_state
            or not away_state
        ):

            unresolved.append({

                "match_id":
                    fixture[
                        "match_id"
                    ],

                "date":
                    fixture[
                        "date"
                    ],

                "league":
                    fixture[
                        "league"
                    ],

                "home_team":
                    fixture[
                        "home_name"
                    ],

                "away_team":
                    fixture[
                        "away_name"
                    ],

                "home_provider_id":
                    fixture[
                        "home_provider_id"
                    ],

                "away_provider_id":
                    fixture[
                        "away_provider_id"
                    ],

                "home_canonical_id":
                    home_id,

                "away_canonical_id":
                    away_id,

                "reason":
                    "canonical team missing "
                    "from live state",

                "source_file":
                    fixture[
                        "source_file"
                    ],
            })

            continue

        # ====================================================
        # BUILD EXACT 15 FEATURES
        # ====================================================

        try:

            features = build_model_features(

                home_state,

                away_state
            )

            validate_features(
                features
            )

        except Exception as exc:

            unresolved.append({

                "match_id":
                    fixture[
                        "match_id"
                    ],

                "date":
                    fixture[
                        "date"
                    ],

                "league":
                    fixture[
                        "league"
                    ],

                "home_team":
                    fixture[
                        "home_name"
                    ],

                "away_team":
                    fixture[
                        "away_name"
                    ],

                "home_provider_id":
                    fixture[
                        "home_provider_id"
                    ],

                "away_provider_id":
                    fixture[
                        "away_provider_id"
                    ],

                "home_canonical_id":
                    home_id,

                "away_canonical_id":
                    away_id,

                "reason":
                    "feature construction failed: "
                    f"{exc}",

                "source_file":
                    fixture[
                        "source_file"
                    ],
            })

            continue

        # ====================================================
        # MODEL INPUT
        # ====================================================

        X = pd.DataFrame(
            [features],
            columns=FEATURE_COLUMNS
        ).astype(float)

        if list(
            X.columns
        ) != FEATURE_COLUMNS:

            raise RuntimeError(
                "Fatal feature-order mismatch."
            )

        # ====================================================
        # PREDICT
        # ====================================================

        probabilities = model.predict_proba(
            X
        )[0]

        if len(
            probabilities
        ) != len(
            model_classes
        ):

            raise RuntimeError(
                "Model returned unexpected "
                "probability count: "
                f"{len(probabilities)}"
            )

        probability_by_label = {}

        for class_id, probability in zip(
            model_classes,
            probabilities
        ):

            class_id = int(
                class_id
            )

            if class_id not in inverse_mapping:

                raise RuntimeError(
                    "Unknown model class ID: "
                    f"{class_id}"
                )

            label = inverse_mapping[
                class_id
            ]

            probability_by_label[
                label
            ] = float(
                probability
            )

        home_prob = probability_by_label[
            "HOME_WIN"
        ]

        draw_prob = probability_by_label[
            "DRAW"
        ]

        away_prob = probability_by_label[
            "AWAY_WIN"
        ]

        probability_sum = (
            home_prob
            + draw_prob
            + away_prob
        )

        if not np.isfinite(
            probability_sum
        ):

            raise RuntimeError(
                "Model produced "
                "non-finite probabilities."
            )

        if not np.isclose(
            probability_sum,
            1.0,
            atol=1e-5
        ):

            raise RuntimeError(
                "Model probabilities do not "
                f"sum to 1.0: {probability_sum}"
            )

        outcome_probabilities = {

            "HOME_WIN":
                home_prob,

            "DRAW":
                draw_prob,

            "AWAY_WIN":
                away_prob,
        }

        predicted_outcome = max(
            outcome_probabilities,
            key=outcome_probabilities.get
        )

        # ====================================================
        # OUTPUT
        # ====================================================

        predictions.append({

            "match_id":
                fixture[
                    "match_id"
                ],

            "date":
                fixture[
                    "date"
                ],

            "league":
                fixture[
                    "league"
                ],

            "status":
                fixture[
                    "status"
                ],

            "home_team":
                fixture[
                    "home_name"
                ],

            "away_team":
                fixture[
                    "away_name"
                ],

            "home_team_id":
                home_id,

            "away_team_id":
                away_id,

            "provider_home_team_id":
                fixture[
                    "home_provider_id"
                ],

            "provider_away_team_id":
                fixture[
                    "away_provider_id"
                ],

            "home_win_prob":
                round(
                    home_prob * 100,
                    2
                ),

            "draw_prob":
                round(
                    draw_prob * 100,
                    2
                ),

            "away_win_prob":
                round(
                    away_prob * 100,
                    2
                ),

            "predicted_outcome":
                predicted_outcome,

            "resolution": {

                "home":
                    home_resolution[
                        "method"
                    ],

                "away":
                    away_resolution[
                        "method"
                    ],

                "home_source":
                    home_resolution[
                        "resolver_source"
                    ],

                "away_source":
                    away_resolution[
                        "resolver_source"
                    ],
            },

            "feature_status": {

                "elo":
                    "available",

                "form":
                    "available_from_live_state",

                "h2h":
                    "unavailable",
            },

            "model": {

                "pipeline_step":
                    "44",

                "champion_pipeline_step":
                    schema.get(
                        "champion_pipeline_step"
                    ),

                "feature_count":
                    len(
                        FEATURE_COLUMNS
                    ),
            },

            "source_file":
                fixture[
                    "source_file"
                ],
        })

    # ========================================================
    # 6. SAVE RESULTS
    # ========================================================

    print(
        "\n[6/7] Saving prediction artifacts..."
    )

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    predictions_csv = os.path.join(
        OUTPUT_DIR,
        "live_predictions.csv"
    )

    unresolved_json = os.path.join(
        OUTPUT_DIR,
        "step45_unresolved_teams.json"
    )

    report_json = os.path.join(
        OUTPUT_DIR,
        "step45_prediction_report.json"
    )

    # ========================================================
    # PREDICTIONS CSV
    # ========================================================

    if predictions:

        prediction_df = pd.DataFrame(
            predictions
        )

        prediction_df.to_csv(
            predictions_csv,
            index=False
        )

        # ----------------------------------------------------
        # PUBLIC FRONTEND JSON
        # ----------------------------------------------------

        public_data = []

        for prediction in predictions:

            public_data.append({

                key: value

                for key, value
                in prediction.items()

                if key not in {
                    "resolution",
                    "feature_status",
                    "model",
                    "source_file",
                }
            })

        temp_public = (
            PUBLIC_PREDICTIONS_FILE
            + ".tmp"
        )

        with open(
            temp_public,
            "w",
            encoding="utf-8"
        ) as file:

            json.dump(
                public_data,
                file,
                indent=2,
                ensure_ascii=False
            )

        os.replace(
            temp_public,
            PUBLIC_PREDICTIONS_FILE
        )

        print(
            f"   ✅ Predictions CSV: "
            f"{predictions_csv}"
        )

        print(
            f"   ✅ Public predictions: "
            f"{PUBLIC_PREDICTIONS_FILE}"
        )

    else:

        print(
            "   ⚠️ No predictions generated."
        )

    # ========================================================
    # UNRESOLVED REPORT
    # ========================================================

    with open(
        unresolved_json,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            unresolved,
            file,
            indent=2,
            ensure_ascii=False
        )

    # ========================================================
    # OUTCOME COUNTS
    # ========================================================

    outcome_counts = {

        "HOME_WIN":
            0,

        "DRAW":
            0,

        "AWAY_WIN":
            0,
    }

    for prediction in predictions:

        outcome = prediction[
            "predicted_outcome"
        ]

        if outcome in outcome_counts:

            outcome_counts[
                outcome
            ] += 1

    # ========================================================
    # PROVIDER COVERAGE
    # ========================================================

    unique_provider_ids_seen = len(
        provider_ids_seen
    )

    unique_provider_ids_found_internal = len(
        provider_ids_found_internal
    )

    unique_provider_ids_missing_internal = len(
        provider_ids_missing_internal
    )

    # ========================================================
    # REPORT
    # ========================================================

    report = {

        "pipeline_step":
            "45",

        "status":
            "PASS"
            if predictions
            else
            "NO_PREDICTIONS",

        "timestamp_utc":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "source": {

            "fixtures_directory":
                FIXTURES_DIR,

            "fixture_policy":
                "NS/TBD only",

            "historical_files_skipped":
                True,
        },

        "artifacts": {

            "champion_model":
                CHAMPION_MODEL_FILE,

            "champion_schema":
                CHAMPION_SCHEMA_FILE,

            "live_team_state":
                LIVE_STATE_FILE,

            "label_mapping":
                LABEL_MAPPING_FILE,

            "champion_manifest":
                CHAMPION_MANIFEST_FILE,

            "team_index":
                TEAMS_INDEX_FILE,

            "internal_team_map":
                INTERNAL_TEAM_MAP_FILE,
        },

        "population": {

            "fixtures_scanned":
                len(fixtures),

            "predictions_generated":
                len(predictions),

            "unresolved":
                len(unresolved),
        },

        "resolution": {

            "provider_id_resolutions":
                resolved_by_provider_id,

            "name_resolutions":
                resolved_by_name,

            "provider_id_resolutions_from_internal_map":
                resolved_from_internal_map,

            "provider_id_resolutions_from_teams_index":
                resolved_from_teams_index,

            "unique_provider_ids_seen":
                unique_provider_ids_seen,

            "unique_provider_ids_found_in_internal_map":
                unique_provider_ids_found_internal,

            "unique_provider_ids_missing_from_internal_map":
                unique_provider_ids_missing_internal,

            "internal_map_entries_loaded":
                len(internal_provider_map),

            "internal_map_entries_skipped_missing_live_state":
                skipped_missing_state,

            "internal_map_conflicts":
                internal_conflicts,
        },

        "feature_status": {

            "feature_count":
                len(FEATURE_COLUMNS),

            "feature_columns":
                FEATURE_COLUMNS,

            "h2h_available":
                False,

            "h2h_fallback":
                "0 rates / 0 matches",
        },

        "outcomes":
            outcome_counts,

        "unresolved_report":
            unresolved_json,

        "prediction_output":
            predictions_csv,

        "public_output":
            PUBLIC_PREDICTIONS_FILE,
    }

    temp_report = (
        report_json
        + ".tmp"
    )

    with open(
        temp_report,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            report,
            file,
            indent=2,
            ensure_ascii=False
        )

    os.replace(
        temp_report,
        report_json
    )

    # ========================================================
    # 7. FINAL REPORT
    # ========================================================

    print(
        "\n[7/7] Final Step 45 Report"
    )

    print(
        "-" * 70
    )

    print(
        f"   Fixtures accepted:       "
        f"{len(fixtures):,}"
    )

    print(
        f"   Predictions generated:  "
        f"{len(predictions):,}"
    )

    print(
        f"   Unresolved/skipped:      "
        f"{len(unresolved):,}"
    )

    print()

    print(
        "🔗 TEAM RESOLUTION"
    )

    print(
        "-" * 70
    )

    print(
        f"   Provider-ID resolutions: "
        f"{resolved_by_provider_id:,}"
    )

    print(
        f"      ├─ internal_team_map: "
        f"{resolved_from_internal_map:,}"
    )

    print(
        f"      └─ teams-index:       "
        f"{resolved_from_teams_index:,}"
    )

    print(
        f"   Name resolutions:        "
        f"{resolved_by_name:,}"
    )

    print()

    print(
        "🔎 PROVIDER-ID COVERAGE"
    )

    print(
        "-" * 70
    )

    print(
        f"   Unique provider IDs seen:       "
        f"{unique_provider_ids_seen:,}"
    )

    print(
        f"   Found in internal map:           "
        f"{unique_provider_ids_found_internal:,}"
    )

    print(
        f"   Missing from internal map:      "
        f"{unique_provider_ids_missing_internal:,}"
    )

    print()

    print(
        "🎯 PREDICTED OUTCOMES"
    )

    print(
        "-" * 70
    )

    print(
        f"   HOME_WIN: "
        f"{outcome_counts['HOME_WIN']:,}"
    )

    print(
        f"   DRAW:     "
        f"{outcome_counts['DRAW']:,}"
    )

    print(
        f"   AWAY_WIN: "
        f"{outcome_counts['AWAY_WIN']:,}"
    )

    print()

    print(
        "⚠️ H2H status: unavailable in "
        "Step 44 live_team_state.json."
    )

    print(
        "⚠️ H2H features were therefore "
        "explicitly set to zero."
    )

    print()

    if unresolved:

        print(
            f"⚠️ Unresolved report: "
            f"{unresolved_json}"
        )

        for item in unresolved[:10]:

            print(
                f"   - "
                f"{item.get('home_team')} "
                f"vs "
                f"{item.get('away_team')}"
            )

    print()

    print(
        f"📁 CSV: "
        f"{predictions_csv}"
    )

    print(
        f"📁 Public JSON: "
        f"{PUBLIC_PREDICTIONS_FILE}"
    )

    print(
        f"📁 Report: "
        f"{report_json}"
    )

    print(
        f"📁 Unresolved: "
        f"{unresolved_json}"
    )

    print()

    print(
        "=" * 70
    )

    if predictions:

        print(
            " STEP 45 COMPLETE: PASS"
        )

    else:

        print(
            " STEP 45 COMPLETE: NO PREDICTIONS"
        )

    print(
        "=" * 70
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    run()