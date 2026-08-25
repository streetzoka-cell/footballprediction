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
# PURPOSE
# -------
# Consume real upcoming fixtures from:
#
#     public_data/fixtures/*.json
#
# Resolve:
#
#     provider team ID
#          ↓
#     authoritative internal_team_map.json
#          ↓
#     canonical ZK_TEAM_* ID
#          ↓
#     Step 44 live_team_state.json
#          ↓
#     exact 15-feature champion model
#          ↓
#     1X2 probabilities
#
#
# SAFETY RULES
# ------------
# 1. Never invent canonical team IDs.
# 2. Never invent provider IDs.
# 3. Never invent team state.
# 4. Never modify Step 44 artifacts.
# 5. Never modify fixture files.
# 6. Only predict NS/TBD fixtures.
# 7. Deduplicate provider match IDs.
# 8. Never fuzzy-match team names.
# 9. internal_team_map.json is authoritative.
# 10. Provider ID present + missing from internal map
#     = unresolved.
# 11. teams-index.json may NOT override a missing
#     authoritative provider mapping.
# 12. Name matching is allowed only when NO provider ID exists.
# 13. Canonical team must exist in live_team_state.json.
# 14. Home and away canonical IDs must differ.
# 15. Exact champion feature order is enforced.
# 16. Model classes must exactly match label_mapping.json.
# 17. All probabilities must be finite and sum to 1.
# 18. No prediction is emitted when a safety gate fails.
#
#
# H2H
# ---
# Step 44 live_team_state.json does not currently contain H2H.
#
# Therefore the champion's four H2H inputs are explicitly:
#
#     h2h_hw_rate = 0
#     h2h_d_rate  = 0
#     h2h_aw_rate = 0
#     h2h_matches = 0
#
# This is an explicit fallback, NOT fabricated H2H data.
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

def as_string(value):
    if value is None:
        return None

    value = str(value).strip()

    return value if value else None


def clean_name(value):
    """
    Deterministic normalization only.

    This is NOT fuzzy matching.
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


def load_json(path):
    with open(
        path,
        "r",
        encoding="utf-8"
    ) as file:
        return json.load(file)


def atomic_write_json(path, data):
    os.makedirs(
        os.path.dirname(path),
        exist_ok=True
    )

    temp_path = path + ".tmp"

    with open(
        temp_path,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            data,
            file,
            indent=2,
            ensure_ascii=False
        )

    os.replace(
        temp_path,
        path
    )


def atomic_write_csv(df, path):
    os.makedirs(
        os.path.dirname(path),
        exist_ok=True
    )

    temp_path = path + ".tmp"

    df.to_csv(
        temp_path,
        index=False
    )

    os.replace(
        temp_path,
        path
    )


def get_nested_values(obj, keys):
    found = []

    if isinstance(obj, dict):

        for key, value in obj.items():

            if str(key).lower() in keys:
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

    return first_value(
        profile,
        {
            "name",
            "team_name",
            "teamname",
            "display_name",
            "displayname",
            "short_name",
            "shortname",
        }
    )


def extract_provider_ids(profile):

    values = get_nested_values(
        profile,
        {
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
# TEAMS INDEX
# ============================================================

def register_team_mapping(
    provider_map,
    name_map,
    canonical_id,
    profile
):

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
                # Remove it rather than guessing.
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
            # Remove it rather than guessing.
            provider_map.pop(
                provider_id,
                None
            )


def build_team_resolver(teams_index):

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

    return (
        provider_map,
        name_map
    )


# ============================================================
# AUTHORITATIVE INTERNAL PROVIDER MAP
# ============================================================

def build_internal_provider_map(
    internal_team_map,
    team_states
):

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
            "'by_provider_club_id'."
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

        if not provider_id or not canonical_id:
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
# STRICT TEAM RESOLUTION
# ============================================================

def resolve_team(
    provider_id,
    team_name,
    internal_provider_map,
    name_map,
    team_states
):
    """
    AUTHORITATIVE RESOLUTION POLICY
    --------------------------------

    Provider ID exists:
        MUST resolve through internal_team_map.json.

    Provider ID exists but is absent:
        UNRESOLVED.

    No provider-ID fallback to teams-index.

    No provider-ID fallback to name.

    No provider ID:
        deterministic normalized-name lookup is permitted.

    Fuzzy matching is never performed.
    """

    provider_id = as_string(
        provider_id
    )

    # --------------------------------------------------------
    # PROVIDER-ID PATH
    # --------------------------------------------------------

    if provider_id:

        canonical_id = internal_provider_map.get(
            provider_id
        )

        if not canonical_id:
            return None

        if canonical_id not in team_states:
            return None

        return {
            "canonical_id":
                canonical_id,

            "method":
                "provider_id",

            "resolver_source":
                "internal_team_map",
        }

    # --------------------------------------------------------
    # NO PROVIDER ID
    # --------------------------------------------------------

    normalized_name = clean_name(
        team_name
    )

    if not normalized_name:
        return None

    canonical_id = name_map.get(
        normalized_name
    )

    if not canonical_id:
        return None

    if canonical_id not in team_states:
        return None

    return {
        "canonical_id":
            canonical_id,

        "method":
            "team_name",

        "resolver_source":
            "teams-index",
    }


# ============================================================
# FIXTURE LOADING
# ============================================================

def load_fixture_file(path):

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

    return matches if isinstance(
        matches,
        list
    ) else []


def extract_fixture(
    match,
    source_file
):

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

    if not isinstance(
        home_team,
        dict
    ):
        home_team = {}

    if not isinstance(
        away_team,
        dict
    ):
        away_team = {}

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

        league = match[
            "league"
        ].get("name")

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


def parse_fixture_date(value):

    if not value:
        return None

    try:

        parsed = pd.to_datetime(
            value,
            errors="coerce",
            utc=True
        )

        if pd.isna(parsed):
            return None

        return parsed.date()

    except Exception:

        return None


def collect_upcoming_fixtures():

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

            fixture_date = parse_fixture_date(
                fixture["date"]
            )

            if (
                fixture_date is not None
                and fixture_date < today
            ):
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
# STEP 44 → MODEL FEATURES
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

    features = {

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

        # Explicit Step 44 H2H fallback.
        "h2h_hw_rate":
            0.0,

        "h2h_d_rate":
            0.0,

        "h2h_aw_rate":
            0.0,

        "h2h_matches":
            0.0,
    }

    return features


def validate_features(features):

    if list(features.keys()) != FEATURE_COLUMNS:

        raise RuntimeError(
            "Feature order mismatch.\n"
            f"Expected: {FEATURE_COLUMNS}\n"
            f"Actual:   {list(features.keys())}"
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

    if not isinstance(
        label_mapping,
        dict
    ):

        raise RuntimeError(
            "label_mapping.json must contain "
            "an object."
        )

    if not label_mapping:

        raise RuntimeError(
            "label_mapping.json is empty."
        )

    keys_are_numeric = all(
        isinstance(
            key,
            (int, float)
        )
        or (
            isinstance(key, str)
            and re.fullmatch(
                r"-?\d+",
                key.strip()
            )
        )
        for key in label_mapping.keys()
    )

    values_are_numeric = all(
        isinstance(
            value,
            (int, float)
        )
        or (
            isinstance(value, str)
            and re.fullmatch(
                r"-?\d+",
                value.strip()
            )
        )
        for value in label_mapping.values()
    )

    if keys_are_numeric and not values_are_numeric:

        orientation = "class_id -> label"

    elif not keys_are_numeric and values_are_numeric:

        orientation = "label -> class_id"

    else:

        raise RuntimeError(
            "Could not safely determine label_mapping.json "
            "orientation."
        )

    inverse_mapping = {}
    forward_mapping = {}

    if orientation == "class_id -> label":

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
                    f"Invalid class ID: {raw_class_id!r}"
                )

            label = str(
                raw_label
            ).strip()

            if label not in EXPECTED_LABELS:

                raise RuntimeError(
                    f"Unknown label: {label!r}"
                )

            if class_id in inverse_mapping:

                raise RuntimeError(
                    f"Duplicate class ID: {class_id}"
                )

            if label in forward_mapping:

                raise RuntimeError(
                    f"Duplicate label: {label}"
                )

            inverse_mapping[
                class_id
            ] = label

            forward_mapping[
                label
            ] = class_id

    else:

        for raw_label, raw_class_id in label_mapping.items():

            label = str(
                raw_label
            ).strip()

            if label not in EXPECTED_LABELS:

                raise RuntimeError(
                    f"Unknown label: {label!r}"
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
                    f"Invalid class ID for {label}: "
                    f"{raw_class_id!r}"
                )

            if label in forward_mapping:

                raise RuntimeError(
                    f"Duplicate label: {label}"
                )

            if class_id in inverse_mapping:

                raise RuntimeError(
                    f"Duplicate class ID: {class_id}"
                )

            forward_mapping[
                label
            ] = class_id

            inverse_mapping[
                class_id
            ] = label

    if set(
        inverse_mapping.values()
    ) != EXPECTED_LABELS:

        raise RuntimeError(
            "label_mapping.json does not contain exactly "
            "HOME_WIN, DRAW and AWAY_WIN."
        )

    model_classes = getattr(
        model,
        "classes_",
        None
    )

    if model_classes is None:

        raise RuntimeError(
            "Champion model has no classes_ attribute."
        )

    try:

        model_classes = [
            int(value)
            for value in model_classes
        ]

    except Exception:

        raise RuntimeError(
            "Champion model classes_ contains "
            "non-integer class IDs."
        )

    if len(model_classes) != len(
        set(model_classes)
    ):

        raise RuntimeError(
            "Champion model contains duplicate class IDs."
        )

    if sorted(
        inverse_mapping.keys()
    ) != sorted(model_classes):

        raise RuntimeError(
            "Model class IDs do not match label_mapping.json.\n"
            f"Mapping: {sorted(inverse_mapping.keys())}\n"
            f"Model:   {sorted(model_classes)}"
        )

    if len(model_classes) != 3:

        raise RuntimeError(
            "Expected exactly 3 model classes."
        )

    print(
        f"   ↳ Label mapping orientation: "
        f"{orientation}"
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
# MODEL PREDICTION VALIDATION
# ============================================================

def predict_1x2(
    model,
    X,
    model_classes,
    inverse_mapping
):

    probabilities = model.predict_proba(
        X
    )[0]

    if len(probabilities) != len(
        model_classes
    ):

        raise RuntimeError(
            "Model returned unexpected probability count: "
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

        probability = float(
            probability
        )

        if not np.isfinite(
            probability
        ):

            raise RuntimeError(
                f"Non-finite probability for class "
                f"{class_id}: {probability}"
            )

        if probability < 0.0 or probability > 1.0:

            raise RuntimeError(
                f"Invalid probability for class "
                f"{class_id}: {probability}"
            )

        if class_id not in inverse_mapping:

            raise RuntimeError(
                f"Unknown model class ID: {class_id}"
            )

        label = inverse_mapping[
            class_id
        ]

        probability_by_label[
            label
        ] = probability

    if set(
        probability_by_label
    ) != EXPECTED_LABELS:

        raise RuntimeError(
            "Prediction did not produce all three "
            "1X2 outcome labels."
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

    if not np.isclose(
        probability_sum,
        1.0,
        atol=1e-5
    ):

        raise RuntimeError(
            "Model probabilities do not sum to 1.0: "
            f"{probability_sum}"
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

    return (
        home_prob,
        draw_prob,
        away_prob,
        predicted_outcome
    )


# ============================================================
# UNRESOLVED RECORD HELPER
# ============================================================

def make_unresolved_record(
    fixture,
    **extra
):

    record = {

        "match_id":
            fixture["match_id"],

        "date":
            fixture["date"],

        "league":
            fixture["league"],

        "home_team":
            fixture["home_name"],

        "away_team":
            fixture["away_name"],

        "home_provider_id":
            fixture["home_provider_id"],

        "away_provider_id":
            fixture["away_provider_id"],

        "source_file":
            fixture["source_file"],
    }

    record.update(
        extra
    )

    return record


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 70)

    print(
        "ZOKASCORE V2 — STEP 45: "
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

        if not os.path.isfile(path):

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

    if not isinstance(
        team_states,
        dict
    ):

        raise RuntimeError(
            "live_team_state.json must contain "
            "an object keyed by canonical team ID."
        )

    print(
        f"   ↳ Live team states: "
        f"{len(team_states):,}"
    )

    model_classes = getattr(
        model,
        "classes_",
        None
    )

    if model_classes is None:

        raise RuntimeError(
            "Champion model has no classes_ attribute."
        )

    try:

        model_classes = [
            int(value)
            for value in model_classes
        ]

    except Exception:

        raise RuntimeError(
            "Champion model classes_ contains "
            "non-integer class IDs."
        )

    print(
        "   ↳ Model classes: "
        + ", ".join(
            str(value)
            for value in model_classes
        )
    )

    # --------------------------------------------------------
    # FEATURE SCHEMA
    # --------------------------------------------------------

    if not isinstance(
        schema,
        dict
    ):

        raise RuntimeError(
            "champion_feature_schema.json must contain "
            "a JSON object."
        )

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

    # --------------------------------------------------------
    # MODEL FEATURE COUNT
    # --------------------------------------------------------

    model_feature_count = getattr(
        model,
        "n_features_in_",
        None
    )

    if model_feature_count is not None:

        try:

            model_feature_count = int(
                model_feature_count
            )

        except Exception:

            raise RuntimeError(
                "Champion model n_features_in_ is invalid."
            )

        if model_feature_count != len(
            FEATURE_COLUMNS
        ):

            raise RuntimeError(
                "Champion model feature count mismatch.\n"
                f"Expected: {len(FEATURE_COLUMNS)}\n"
                f"Model: {model_feature_count}"
            )

    print(
        "   ✅ Champion model feature count validated."
    )

    # --------------------------------------------------------
    # LABEL MAPPING
    # --------------------------------------------------------

    _, inverse_mapping = build_label_mapping(
        label_mapping,
        model
    )

    print(
        "   ✅ Label mapping validated."
    )

    # --------------------------------------------------------
    # BASIC MANIFEST VALIDATION
    # --------------------------------------------------------

    if not isinstance(
        manifest,
        dict
    ):

        raise RuntimeError(
            "champion_manifest.json must contain "
            "a JSON object."
        )

    print(
        "   ✅ Champion manifest loaded."
    )

    # ========================================================
    # 3. BUILD TEAM RESOLVERS
    # ========================================================

    print(
        "\n[3/7] Building canonical team resolvers..."
    )

    # The provider map from teams-index is intentionally
    # NOT used for authoritative provider resolution.
    #
    # It is retained only because teams-index supplies the
    # deterministic name map used when a fixture has no
    # provider ID.

    _index_provider_map, name_map = build_team_resolver(
        teams_index
    )

    print(
        f"   ↳ teams-index name mappings: "
        f"{len(name_map):,}"
    )

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

    if internal_conflicts:

        raise RuntimeError(
            "Authoritative internal provider map contains "
            "conflicting provider IDs."
        )

    print()

    print(
        "   AUTHORITATIVE PROVIDER RESOLUTION:"
    )

    print(
        "      provider ID → internal_team_map.json"
    )

    print(
        "      provider ID missing → UNRESOLVED"
    )

    print(
        "      no provider ID → deterministic name fallback"
    )

    print(
        "      fuzzy matching → FORBIDDEN"
    )

    # ========================================================
    # 4. LOAD REAL FIXTURES
    # ========================================================

    print(
        "\n[4/7] Loading real upcoming fixtures from:"
    )

    print(
        f"   {FIXTURES_DIR}"
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

        # Never leave stale public predictions.
        atomic_write_json(
            PUBLIC_PREDICTIONS_FILE,
            []
        )

        print(
            "   ✅ Public predictions cleared."
        )

        print()

        print("=" * 70)

        print(
            "STEP 45 COMPLETE: NO FIXTURES"
        )

        print("=" * 70)

        return

    # ========================================================
    # 5. RESOLVE + PREDICT
    # ========================================================

    print(
        "\n[5/7] Resolving teams and generating predictions..."
    )

    predictions = []
    unresolved = []

    resolved_by_provider_id = 0
    resolved_by_name = 0

    resolved_from_internal_map = 0
    resolved_from_teams_index = 0

    provider_ids_seen = set()
    provider_ids_found_internal = set()
    provider_ids_missing_internal = set()

    seen_prediction_ids = set()

    for fixture in fixtures:

        match_id = fixture[
            "match_id"
        ]

        # ----------------------------------------------------
        # DEFENSIVE MATCH-ID DEDUPLICATION
        # ----------------------------------------------------

        if match_id in seen_prediction_ids:

            unresolved.append(
                make_unresolved_record(
                    fixture,
                    reason="duplicate prediction match ID"
                )
            )

            continue

        # ----------------------------------------------------
        # TRACK PROVIDER IDS
        # ----------------------------------------------------

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

            provider_ids_seen.add(
                provider_id
            )

            if provider_id in internal_provider_map:

                provider_ids_found_internal.add(
                    provider_id
                )

            else:

                provider_ids_missing_internal.add(
                    provider_id
                )

        # ----------------------------------------------------
        # HOME RESOLUTION
        # ----------------------------------------------------

        home_resolution = resolve_team(

            fixture[
                "home_provider_id"
            ],

            fixture[
                "home_name"
            ],

            internal_provider_map,

            name_map,

            team_states
        )

        # ----------------------------------------------------
        # AWAY RESOLUTION
        # ----------------------------------------------------

        away_resolution = resolve_team(

            fixture[
                "away_provider_id"
            ],

            fixture[
                "away_name"
            ],

            internal_provider_map,

            name_map,

            team_states
        )

        # ----------------------------------------------------
        # RESOLUTION FAILURE
        # ----------------------------------------------------

        if (
            not home_resolution
            or not away_resolution
        ):

            item = make_unresolved_record(
                fixture
            )

            item[
                "home_resolved"
            ] = bool(
                home_resolution
            )

            item[
                "away_resolved"
            ] = bool(
                away_resolution
            )

            if not home_resolution:

                if fixture[
                    "home_provider_id"
                ]:

                    item[
                        "home_resolution_failure"
                    ] = (
                        "provider ID is not present in "
                        "authoritative internal_team_map.json; "
                        "no fallback identity matching permitted"
                    )

                else:

                    item[
                        "home_resolution_failure"
                    ] = (
                        "no provider ID and deterministic "
                        "team-name resolution failed"
                    )

            if not away_resolution:

                if fixture[
                    "away_provider_id"
                ]:

                    item[
                        "away_resolution_failure"
                    ] = (
                        "provider ID is not present in "
                        "authoritative internal_team_map.json; "
                        "no fallback identity matching permitted"
                    )

                else:

                    item[
                        "away_resolution_failure"
                    ] = (
                        "no provider ID and deterministic "
                        "team-name resolution failed"
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

        # ----------------------------------------------------
        # SAME TEAM SAFETY GATE
        # ----------------------------------------------------

        if home_id == away_id:

            unresolved.append(
                make_unresolved_record(
                    fixture,

                    home_canonical_id=home_id,

                    away_canonical_id=away_id,

                    reason=(
                        "home and away resolved to the same "
                        "canonical team ID"
                    )
                )
            )

            continue

        # ----------------------------------------------------
        # RESOLUTION COUNTS
        # ----------------------------------------------------

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

            else:

                resolved_by_name += 1

                if resolution[
                    "resolver_source"
                ] == "teams-index":

                    resolved_from_teams_index += 1

        # ----------------------------------------------------
        # LIVE STATES
        # ----------------------------------------------------

        home_state = team_states.get(
            home_id
        )

        away_state = team_states.get(
            away_id
        )

        if (
            not isinstance(
                home_state,
                dict
            )
            or not isinstance(
                away_state,
                dict
            )
        ):

            unresolved.append(
                make_unresolved_record(
                    fixture,

                    home_canonical_id=home_id,

                    away_canonical_id=away_id,

                    reason=(
                        "canonical team missing from "
                        "Step 44 live_team_state.json"
                    )
                )
            )

            continue

        # ----------------------------------------------------
        # BUILD FEATURES
        # ----------------------------------------------------

        try:

            features = build_model_features(
                home_state,
                away_state
            )

            validate_features(
                features
            )

        except Exception as exc:

            unresolved.append(
                make_unresolved_record(
                    fixture,

                    home_canonical_id=home_id,

                    away_canonical_id=away_id,

                    reason=(
                        "feature construction failed: "
                        + str(exc)
                    )
                )
            )

            continue

        # ----------------------------------------------------
        # EXACT MODEL INPUT
        # ----------------------------------------------------

        X = pd.DataFrame(
            [[
                features[column]
                for column in FEATURE_COLUMNS
            ]],
            columns=FEATURE_COLUMNS
        ).astype(float)

        if list(
            X.columns
        ) != FEATURE_COLUMNS:

            raise RuntimeError(
                "Fatal feature-order mismatch."
            )

        if X.shape != (
            1,
            len(FEATURE_COLUMNS)
        ):

            raise RuntimeError(
                "Fatal model input shape mismatch: "
                f"{X.shape}"
            )

        if not np.isfinite(
            X.to_numpy()
        ).all():

            raise RuntimeError(
                "Fatal non-finite model input."
            )

        # ----------------------------------------------------
        # PREDICT
        # ----------------------------------------------------

        (
            home_prob,
            draw_prob,
            away_prob,
            predicted_outcome
        ) = predict_1x2(

            model,
            X,
            model_classes,
            inverse_mapping
        )

        # ----------------------------------------------------
        # OUTPUT
        # ----------------------------------------------------

        prediction = {

            "match_id":
                match_id,

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
        }

        predictions.append(
            prediction
        )

        seen_prediction_ids.add(
            match_id
        )

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

    # --------------------------------------------------------
    # PREDICTIONS CSV
    # --------------------------------------------------------

    if predictions:

        prediction_df = pd.DataFrame(
            predictions
        )

        atomic_write_csv(
            prediction_df,
            predictions_csv
        )

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

        atomic_write_json(
            PUBLIC_PREDICTIONS_FILE,
            public_data
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

        # Explicitly clear stale public predictions.
        atomic_write_json(
            PUBLIC_PREDICTIONS_FILE,
            []
        )

        # Keep CSV valid and empty.
        atomic_write_csv(
            pd.DataFrame(),
            predictions_csv
        )

        print(
            "   ⚠️ No predictions generated."
        )

    # --------------------------------------------------------
    # UNRESOLVED
    # --------------------------------------------------------

    atomic_write_json(
        unresolved_json,
        unresolved
    )

    # --------------------------------------------------------
    # OUTCOME COUNTS
    # --------------------------------------------------------

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

        if outcome not in outcome_counts:

            raise RuntimeError(
                f"Unexpected predicted outcome: {outcome}"
            )

        outcome_counts[
            outcome
        ] += 1

    # --------------------------------------------------------
    # PROVIDER COVERAGE
    # --------------------------------------------------------

    unique_provider_ids_seen = len(
        provider_ids_seen
    )

    unique_provider_ids_found_internal = len(
        provider_ids_found_internal
    )

    unique_provider_ids_missing_internal = len(
        provider_ids_missing_internal
    )

    # --------------------------------------------------------
    # REPORT
    # --------------------------------------------------------

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

            "duplicate_match_ids_removed":
                True,
        },

        "identity_policy": {

            "authoritative_source":
                INTERNAL_TEAM_MAP_FILE,

            "provider_id_is_authoritative":
                True,

            "provider_id_missing_from_internal_map":
                "UNRESOLVED",

            "provider_id_fallback_to_teams_index":
                False,

            "provider_id_fallback_to_name":
                False,

            "name_fallback_allowed_without_provider_id":
                True,

            "fuzzy_matching":
                False,

            "canonical_team_must_exist_in_live_state":
                True,

            "same_home_away_canonical_id_rejected":
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
                0,

            "name_resolutions_from_teams_index":
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

            "h2h_is_fabricated":
                False,
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

    atomic_write_json(
        report_json,
        report
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
        f"      └─ internal_team_map: "
        f"{resolved_from_internal_map:,}"
    )

    print(
        f"   Name resolutions:        "
        f"{resolved_by_name:,}"
    )

    print(
        f"      └─ teams-index:       "
        f"{resolved_from_teams_index:,}"
    )

    print()

    print(
        "🔎 PROVIDER-ID COVERAGE"
    )

    print(
        "-" * 70
    )

    print(
        f"   Unique provider IDs seen:      "
        f"{unique_provider_ids_seen:,}"
    )

    print(
        f"   Found in internal map:         "
        f"{unique_provider_ids_found_internal:,}"
    )

    print(
        f"   Missing from internal map:     "
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
        "⚠️ H2H features explicitly set to zero."
    )

    if unresolved:

        print()

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
            "STEP 45 COMPLETE: PASS"
        )

    else:

        print(
            "STEP 45 COMPLETE: NO PREDICTIONS"
        )

    print(
        "=" * 70
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    try:

        run()

    except Exception as exc:

        print()
        print("=" * 70)
        print("STEP 45 FAILED")
        print("=" * 70)
        print()
        print(
            f"ERROR: {exc}"
        )
        print()

        raise