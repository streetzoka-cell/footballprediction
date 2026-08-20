import os
import json
import glob
import joblib
import re
import unicodedata
from collections import deque, Counter

import pandas as pd


# ============================================================
# ZOKASCORE V2 — STEP 48
# UNIFIED LIVE MARKET PREDICTION ENGINE
#
# HARDENED TEAM RESOLUTION
#
# Resolution order:
#
#   1. Existing validated provider -> ZK mapping
#   2. Canonical exact-name lookup
#   3. Conservative structural variant lookup
#   4. Step 48.1 forensic SAFE proposal
#   5. unresolved
#
# IMPORTANT:
#
#   - NO automatic fuzzy identity mapping.
#   - NO modification of canonical team data.
#   - NO modification of internal_team_map.json.
#   - NO creation of team_alias_map.json.
#   - Step 48.1 is the authority for unresolved provider IDs.
#   - Unsafe/unreviewed identities are never predicted.
#
# MODEL CLASS HANDLING:
#
#   1X2 champion model may expose numeric classes:
#
#       [0, 1, 2]
#
#   Step 48 translates them to:
#
#       0 -> HOME
#       1 -> DRAW
#       2 -> AWAY
#
#   OU / BTTS models may expose either semantic string labels
#   or encoded numeric labels. Their expected semantic contracts
#   are handled through explicit class maps.
# ============================================================


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)


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

CANONICAL_SOURCES_DIR = os.path.join(
    BASE_DIR,
    "data",
    "zokascore_football_data",
    "canonical_sources"
)

FIXTURES_DIR = os.path.join(
    BASE_DIR,
    "public_data",
    "fixtures"
)

MASTER_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "master_with_elo.csv"
)

PUBLIC_PREDICTIONS_FILE = os.path.join(
    BASE_DIR,
    "public_data",
    "predictions.json"
)

UNRESOLVED_FILE = os.path.join(
    BASE_DIR,
    "data",
    "predictions",
    "step48_unresolved_fixtures.json"
)

RESOLUTION_REPORT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "predictions",
    "step48_team_resolution_report.json"
)

TEAMS_INDEX_FILE = os.path.join(
    INDEX_DIR,
    "teams-index.json"
)

INTERNAL_TEAM_MAP_FILE = os.path.join(
    CANONICAL_SOURCES_DIR,
    "internal_team_map.json"
)

TEAM_ALIAS_MAP_FILE = os.path.join(
    CANONICAL_SOURCES_DIR,
    "team_alias_map.json"
)

LIVE_STATE_FILE = os.path.join(
    MODELS_DIR,
    "live_team_state.json"
)


# ------------------------------------------------------------
# STEP 48.1 FORENSIC ARTIFACTS
# ------------------------------------------------------------

FORENSIC_REPORT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "predictions",
    "step48_1_provider_id_forensics.json"
)

SAFE_MAPPING_FILE = os.path.join(
    BASE_DIR,
    "data",
    "predictions",
    "step48_1_safe_mapping_proposals.json"
)


# ------------------------------------------------------------
# MODEL ARTIFACTS
# ------------------------------------------------------------

MODEL_1X2 = os.path.join(
    MODELS_DIR,
    "champion_model.joblib"
)

MODEL_OU = os.path.join(
    MODELS_DIR,
    "market_ou_2_5_model.joblib"
)

MODEL_BTTS = os.path.join(
    MODELS_DIR,
    "market_btts_model.joblib"
)


# ============================================================
# FEATURES
# ============================================================

FEATURES_1X2 = [
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
    "h2h_matches"
]


FEATURES_MARKET = [
    "home_elo_pre",
    "away_elo_pre",
    "elo_diff",

    "home_ewma_pts",
    "away_ewma_pts",

    "home_ewma_gd",
    "away_ewma_gd",

    "home_ewma_gf",
    "away_ewma_gf",

    "home_ewma_ga",
    "away_ewma_ga",

    "home_ewma_home_pts",
    "away_ewma_away_pts",

    "home_ewma_home_gd",
    "away_ewma_away_gd",

    "home_ewma_home_gf",
    "away_ewma_away_gf",

    "home_ewma_home_ga",
    "away_ewma_away_ga",

    "home_matches_before",
    "away_matches_before",

    "home_home_matches_before",
    "away_away_matches_before"
]


# ============================================================
# MODEL CLASS CONTRACTS
# ============================================================

# ------------------------------------------------------------
# 1X2
#
# Current champion_model.joblib exposes:
#
#     [0, 1, 2]
#
# Semantic interpretation used by the V2 prediction contract:
#
#     0 -> HOME
#     1 -> DRAW
#     2 -> AWAY
# ------------------------------------------------------------

CLASS_MAP_1X2 = {
    0: "HOME",
    1: "DRAW",
    2: "AWAY"
}


# ------------------------------------------------------------
# OVER / UNDER 2.5
#
# Supports the semantic labels directly.
#
# If the trained model uses encoded classes, this map allows:
#
#     0 -> UNDER
#     1 -> OVER
# ------------------------------------------------------------

CLASS_MAP_OU = {
    0: "OVER",
    1: "UNDER"
}


# ------------------------------------------------------------
# BTTS
#
# Supports the semantic labels directly.
#
# If the trained model uses encoded classes, this map allows:
#
#     0 -> NO
#     1 -> YES
# ------------------------------------------------------------

CLASS_MAP_BTTS = {
    0: "NO",
    1: "YES"
}


# ============================================================
# NORMALIZATION
# ============================================================

def clean_name(value):

    if value is None:
        return ""

    value = str(value).strip().lower()

    value = unicodedata.normalize(
        "NFKD",
        value
    )

    value = "".join(
        c
        for c in value
        if not unicodedata.combining(c)
    )

    value = value.replace(
        "&",
        " and "
    )

    value = value.replace(
        "’",
        "'"
    )

    value = value.replace(
        "`",
        "'"
    )

    value = re.sub(
        r"[.'\"']",
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


def name_variants(value):

    original = clean_name(
        value
    )

    if not original:
        return set()

    variants = {
        original,
        original.replace(
            " ",
            ""
        )
    }

    suffixes = [
        " fc",
        " cf",
        " sc",
        " afc",
        " ac",
        " bc",
        " fk",
        " sk",
        " sv",
        " bv",
        " cd",
        " cs",
        " ca",
        " as",
        " ss",
        " ud",
        " real"
    ]

    prefixes = [
        "fc ",
        "cf ",
        "sc ",
        "afc ",
        "ac ",
        "fk ",
        "sk ",
        "cd ",
        "ca ",
        "club "
    ]

    # --------------------------------------------------------
    # Repeated suffix removal
    # --------------------------------------------------------

    current = original

    changed = True

    while changed:

        changed = False

        for suffix in suffixes:

            if current.endswith(
                suffix
            ):

                candidate = current[
                    :-len(suffix)
                ].strip()

                if candidate:

                    variants.add(
                        candidate
                    )

                    variants.add(
                        candidate.replace(
                            " ",
                            ""
                        )
                    )

                    current = candidate

                    changed = True

                    break

    # --------------------------------------------------------
    # Prefix removal
    # --------------------------------------------------------

    for prefix in prefixes:

        if original.startswith(
            prefix
        ):

            candidate = original[
                len(prefix):
            ].strip()

            if candidate:

                variants.add(
                    candidate
                )

                variants.add(
                    candidate.replace(
                        " ",
                        ""
                    )
                )

    return {
        value
        for value in variants
        if value
    }


# ============================================================
# JSON
# ============================================================

def load_json(
    path,
    default
):

    if not os.path.exists(
        path
    ):
        return default

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


# ============================================================
# TEAM PROFILE NAME EXTRACTION
# ============================================================

def extract_profile_names(
    profile
):

    names = []

    if not isinstance(
        profile,
        dict
    ):
        return names

    direct_fields = [
        "name",
        "team_name",
        "canonical_name",
        "display_name",
        "short_name",
        "shortName",
        "common_name",
        "commonName",
        "official_name",
        "officialName",
        "slug",
        "team"
    ]

    for field in direct_fields:

        value = profile.get(
            field
        )

        if (
            isinstance(
                value,
                str
            )
            and value.strip()
        ):

            names.append(
                value
            )

    list_fields = [
        "aliases",
        "alias",
        "names",
        "name_aliases",
        "alternate_names",
        "alternative_names",
        "former_names",
        "historical_names"
    ]

    for field in list_fields:

        value = profile.get(
            field
        )

        if isinstance(
            value,
            list
        ):

            for item in value:

                if (
                    isinstance(
                        item,
                        str
                    )
                    and item.strip()
                ):

                    names.append(
                        item
                    )

        elif (
            isinstance(
                value,
                str
            )
            and value.strip()
        ):

            names.append(
                value
            )

    return names


# ============================================================
# STEP 48.1 SAFE PROPOSAL LOADER
# ============================================================

def load_safe_forensic_mappings():

    if not os.path.exists(
        SAFE_MAPPING_FILE
    ):

        print(
            "   ⚠️ Step 48.1 safe mapping "
            "file not found."
        )

        return {}

    data = load_json(
        SAFE_MAPPING_FILE,
        []
    )

    mappings = {}

    # --------------------------------------------------------
    # Dictionary format
    # --------------------------------------------------------

    if isinstance(
        data,
        dict
    ):

        for provider_id, value in data.items():

            if (
                isinstance(
                    value,
                    str
                )
                and value.startswith(
                    "ZK_"
                )
            ):

                mappings[
                    str(provider_id)
                ] = value

        # ----------------------------------------------------
        # Wrapped proposal formats
        # ----------------------------------------------------

        proposal_lists = [
            data.get(
                "proposals"
            ),
            data.get(
                "safe_mappings"
            ),
            data.get(
                "mappings"
            )
        ]

        for proposal_list in proposal_lists:

            if not isinstance(
                proposal_list,
                list
            ):
                continue

            for item in proposal_list:

                if not isinstance(
                    item,
                    dict
                ):
                    continue

                provider_id = (
                    item.get(
                        "provider_id"
                    )
                    or item.get(
                        "provider_club_id"
                    )
                )

                zk_id = (
                    item.get(
                        "zk_id"
                    )
                    or item.get(
                        "zokascore_team_id"
                    )
                    or item.get(
                        "canonical_team_id"
                    )
                )

                if (
                    provider_id is not None
                    and isinstance(
                        zk_id,
                        str
                    )
                    and zk_id.startswith(
                        "ZK_"
                    )
                ):

                    mappings[
                        str(provider_id)
                    ] = zk_id

    # --------------------------------------------------------
    # List format
    # --------------------------------------------------------

    elif isinstance(
        data,
        list
    ):

        for item in data:

            if not isinstance(
                item,
                dict
            ):
                continue

            provider_id = (
                item.get(
                    "provider_id"
                )
                or item.get(
                    "provider_club_id"
                )
            )

            zk_id = (
                item.get(
                    "zk_id"
                )
                or item.get(
                    "zokascore_team_id"
                )
                or item.get(
                    "canonical_team_id"
                )
            )

            if (
                provider_id is not None
                and isinstance(
                    zk_id,
                    str
                )
                and zk_id.startswith(
                    "ZK_"
                )
            ):

                mappings[
                    str(provider_id)
                ] = zk_id

    return mappings


# ============================================================
# TEAM RESOLVER
# ============================================================

class TeamResolver:

    def __init__(
        self,
        teams_index,
        internal_provider_map,
        forensic_safe_map=None
    ):

        self.teams_index = (
            teams_index or {}
        )

        self.internal_provider_map = (
            internal_provider_map or {}
        )

        self.forensic_safe_map = (
            forensic_safe_map or {}
        )

        self.exact = {}
        self.variant = {}
        self.provider = {}

        self._build_indexes()

    # --------------------------------------------------------
    # Registration
    # --------------------------------------------------------

    def _register_exact(
        self,
        name,
        zk_id
    ):

        normalized = clean_name(
            name
        )

        if not normalized:
            return

        existing = self.exact.get(
            normalized
        )

        if existing is None:

            self.exact[
                normalized
            ] = zk_id

        elif existing != zk_id:

            self.exact[
                normalized
            ] = "__AMBIGUOUS__"

    def _register_variant(
        self,
        name,
        zk_id
    ):

        for variant in name_variants(
            name
        ):

            existing = self.variant.get(
                variant
            )

            if existing is None:

                self.variant[
                    variant
                ] = zk_id

            elif existing != zk_id:

                self.variant[
                    variant
                ] = "__AMBIGUOUS__"

    # --------------------------------------------------------
    # Build
    # --------------------------------------------------------

    def _build_indexes(self):

        # ----------------------------------------------------
        # Canonical names
        # ----------------------------------------------------

        for zk_id, profile in (
            self.teams_index.items()
        ):

            names = extract_profile_names(
                profile
            )

            for name in names:

                self._register_exact(
                    name,
                    zk_id
                )

                self._register_variant(
                    name,
                    zk_id
                )

        # ----------------------------------------------------
        # Existing validated provider mappings
        # ----------------------------------------------------

        for provider_id, zk_id in (
            self.internal_provider_map.items()
        ):

            if not zk_id:
                continue

            self.provider[
                str(
                    provider_id
                ).strip()
            ] = zk_id

    # --------------------------------------------------------
    # Provider
    # --------------------------------------------------------

    def resolve_provider(
        self,
        provider_id
    ):

        if provider_id is None:
            return None

        provider_id = str(
            provider_id
        ).strip()

        if not provider_id:
            return None

        return self.provider.get(
            provider_id
        )

    # --------------------------------------------------------
    # Forensic safe provider mapping
    # --------------------------------------------------------

    def resolve_forensic_provider(
        self,
        provider_id
    ):

        if provider_id is None:
            return None

        provider_id = str(
            provider_id
        ).strip()

        if not provider_id:
            return None

        return self.forensic_safe_map.get(
            provider_id
        )

    # --------------------------------------------------------
    # Exact
    # --------------------------------------------------------

    def resolve_exact(
        self,
        name
    ):

        normalized = clean_name(
            name
        )

        if not normalized:
            return None

        result = self.exact.get(
            normalized
        )

        if (
            result
            and result != "__AMBIGUOUS__"
        ):

            return result

        return None

    # --------------------------------------------------------
    # Variant
    # --------------------------------------------------------

    def resolve_variant(
        self,
        name
    ):

        candidates = set()

        for variant in name_variants(
            name
        ):

            zk_id = self.variant.get(
                variant
            )

            if (
                zk_id
                and zk_id != "__AMBIGUOUS__"
            ):

                candidates.add(
                    zk_id
                )

        if len(candidates) == 1:

            return next(
                iter(candidates)
            )

        return None

    # --------------------------------------------------------
    # FULL RESOLUTION
    #
    # NO FUZZY MATCHING.
    # --------------------------------------------------------

    def resolve(
        self,
        provider_id,
        fixture_name
    ):

        # ----------------------------------------------------
        # 1. Existing validated provider mapping
        # ----------------------------------------------------

        zk_id = self.resolve_provider(
            provider_id
        )

        if zk_id:

            return {
                "zk_id": zk_id,
                "method": "internal_provider_map"
            }

        # ----------------------------------------------------
        # 2. Exact canonical name
        # ----------------------------------------------------

        zk_id = self.resolve_exact(
            fixture_name
        )

        if zk_id:

            return {
                "zk_id": zk_id,
                "method": "exact_normalized_name"
            }

        # ----------------------------------------------------
        # 3. Structural variant
        # ----------------------------------------------------

        zk_id = self.resolve_variant(
            fixture_name
        )

        if zk_id:

            return {
                "zk_id": zk_id,
                "method": "normalized_name_variant"
            }

        # ----------------------------------------------------
        # 4. Explicit Step 48.1 safe provider proposal
        # ----------------------------------------------------

        zk_id = self.resolve_forensic_provider(
            provider_id
        )

        if zk_id:

            return {
                "zk_id": zk_id,
                "method": "step48_1_safe_mapping"
            }

        # ----------------------------------------------------
        # 5. No safe identity
        # ----------------------------------------------------

        return {
            "zk_id": None,
            "method": "unresolved"
        }


# ============================================================
# FORM
# ============================================================

def calculate_form(
    history
):

    if not history:
        return 0.0, 0.0, 0.0

    relevant = list(
        history
    )[-5:]

    pts = sum(
        float(
            m["points"]
        )
        for m in relevant
    )

    gf = sum(
        float(
            m["gf"]
        )
        for m in relevant
    )

    ga = sum(
        float(
            m["ga"]
        )
        for m in relevant
    )

    count = len(
        relevant
    )

    return (
        pts,
        gf / count,
        ga / count
    )


# ============================================================
# MODEL CLASS HELPERS
# ============================================================

def normalize_model_class(
    value
):

    """
    Convert numpy/scikit-learn scalar classes into normal
    Python values.

    Examples:

        np.int64(0) -> 0
        np.int64(1) -> 1
        np.int64(2) -> 2
        "HOME"     -> "HOME"
    """

    try:

        if hasattr(
            value,
            "item"
        ):

            return value.item()

    except Exception:
        pass

    return value


def probability_for_class(
    model,
    probabilities,
    desired_class,
    class_map=None
):

    """
    Safely retrieve the probability belonging to a semantic
    market class.

    Supports models trained with either semantic string
    classes or encoded numeric classes.

    The lookup ALWAYS follows model.classes_, so probability
    array positions are never blindly assumed.
    """

    model_classes = [
        normalize_model_class(
            value
        )
        for value in model.classes_
    ]

    # --------------------------------------------------------
    # Direct semantic class
    # --------------------------------------------------------

    if desired_class in model_classes:

        index = model_classes.index(
            desired_class
        )

        return float(
            probabilities[index]
        )

    # --------------------------------------------------------
    # Encoded numeric class
    # --------------------------------------------------------

    if class_map is not None:

        matching_classes = [
            encoded_class
            for encoded_class, semantic_class
            in class_map.items()
            if semantic_class == desired_class
        ]

        if len(
            matching_classes
        ) != 1:

            raise RuntimeError(
                f"Invalid class mapping for "
                f"{desired_class!r}: "
                f"{class_map}"
            )

        encoded_class = (
            matching_classes[0]
        )

        if encoded_class not in model_classes:

            raise RuntimeError(
                f"Model "
                f"{type(model).__name__} "
                f"does not contain encoded "
                f"class {encoded_class!r}, "
                f"required for semantic class "
                f"{desired_class!r}. "
                f"Available classes: "
                f"{model_classes}"
            )

        index = model_classes.index(
            encoded_class
        )

        return float(
            probabilities[index]
        )

    # --------------------------------------------------------
    # Invalid model contract
    # --------------------------------------------------------

    raise RuntimeError(
        f"Model "
        f"{type(model).__name__} "
        f"does not contain expected "
        f"class {desired_class!r}. "
        f"Available classes: "
        f"{model_classes}"
    )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)

    print(
        " ZOKASCORE V2 — STEP 48: "
        "UNIFIED MARKET PREDICTION"
    )

    print("=" * 60)
    print()

    # ========================================================
    # 1. LOAD ARTIFACTS
    # ========================================================

    print(
        "[1/5] Loading deployment artifacts..."
    )

    required_files = [
        MODEL_1X2,
        MODEL_OU,
        MODEL_BTTS,
        LIVE_STATE_FILE,
        MASTER_FILE,
        TEAMS_INDEX_FILE,
        INTERNAL_TEAM_MAP_FILE
    ]

    for path in required_files:

        if not os.path.exists(
            path
        ):

            raise FileNotFoundError(
                f"Required artifact not found:\n"
                f"{path}"
            )

    model_1x2 = joblib.load(
        MODEL_1X2
    )

    model_ou = joblib.load(
        MODEL_OU
    )

    model_btts = joblib.load(
        MODEL_BTTS
    )

    live_team_state = load_json(
        LIVE_STATE_FILE,
        {}
    )

    teams_index = load_json(
        TEAMS_INDEX_FILE,
        {}
    )

    internal_team_data = load_json(
        INTERNAL_TEAM_MAP_FILE,
        {}
    )

    internal_team_map = (
        internal_team_data.get(
            "by_provider_club_id",
            {}
        )
        if isinstance(
            internal_team_data,
            dict
        )
        else {}
    )

    forensic_safe_map = (
        load_safe_forensic_mappings()
    )

    resolver = TeamResolver(
        teams_index=teams_index,
        internal_provider_map=internal_team_map,
        forensic_safe_map=forensic_safe_map
    )

    print(
        "   ✅ Models loaded."
    )

    # --------------------------------------------------------
    # Print actual model classes.
    #
    # This makes the deployment contract visible in Step 48.
    # --------------------------------------------------------

    print(
        "   ℹ️ 1X2 model classes: "
        f"{list(model_1x2.classes_)}"
    )

    print(
        "   ℹ️ OU model classes: "
        f"{list(model_ou.classes_)}"
    )

    print(
        "   ℹ️ BTTS model classes: "
        f"{list(model_btts.classes_)}"
    )

    print(
        f"   ✅ Live EWMA state loaded "
        f"({len(live_team_state):,} teams)."
    )

    print(
        f"   ✅ Canonical teams index loaded "
        f"({len(teams_index):,} teams)."
    )

    print(
        f"   ✅ Existing provider mappings loaded "
        f"({len(internal_team_map):,} IDs)."
    )

    print(
        f"   ✅ Canonical exact names loaded "
        f"({len(resolver.exact):,})."
    )

    print(
        f"   ✅ Step 48.1 safe mappings loaded "
        f"({len(forensic_safe_map):,})."
    )

    if not os.path.exists(
        TEAM_ALIAS_MAP_FILE
    ):

        print(
            "   ℹ️ team_alias_map.json not found."
        )

        print(
            "      No alias map will be created."
        )

    # ========================================================
    # 2. RECONSTRUCT HISTORICAL STATE
    # ========================================================

    print(
        "\n[2/5] Reconstructing Step 35 "
        "inference state..."
    )

    master_df = pd.read_csv(
        MASTER_FILE,
        low_memory=False
    )

    required_columns = [
        "date",
        "zokascore_match_id",
        "home_team_id",
        "away_team_id",
        "home_elo_pre",
        "away_elo_pre",
        "home_elo_delta",
        "away_elo_delta",
        "home_score",
        "away_score"
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in master_df.columns
    ]

    if missing_columns:

        raise RuntimeError(
            "MASTER FILE missing required "
            f"columns: {missing_columns}"
        )

    master_df["date"] = pd.to_datetime(
        master_df["date"],
        errors="coerce"
    )

    if master_df["date"].isna().any():

        raise RuntimeError(
            "MASTER FILE contains invalid dates."
        )

    master_df = master_df.sort_values(
        by=[
            "date",
            "zokascore_match_id"
        ],
        kind="mergesort"
    ).reset_index(
        drop=True
    )

    team_states_1x2 = {}
    h2h_states = {}

    def get_1x2_state(
        team_id
    ):

        if team_id not in team_states_1x2:

            team_states_1x2[
                team_id
            ] = {

                "elo": 1500.0,

                "recent_matches":
                    deque(
                        maxlen=5
                    ),

                "recent_home_matches":
                    deque(
                        maxlen=5
                    ),

                "recent_away_matches":
                    deque(
                        maxlen=5
                    )
            }

        return team_states_1x2[
            team_id
        ]

    processed_rows = 0

    for row in master_df.itertuples(
        index=False
    ):

        home_id = str(
            row.home_team_id
        )

        away_id = str(
            row.away_team_id
        )

        home_state = get_1x2_state(
            home_id
        )

        away_state = get_1x2_state(
            away_id
        )

        home_state["elo"] = (
            float(
                row.home_elo_pre
            )
            +
            float(
                row.home_elo_delta
            )
        )

        away_state["elo"] = (
            float(
                row.away_elo_pre
            )
            +
            float(
                row.away_elo_delta
            )
        )

        h = int(
            row.home_score
        )

        a = int(
            row.away_score
        )

        h_pts = (
            3
            if h > a
            else 0
            if h < a
            else 1
        )

        a_pts = (
            3
            if a > h
            else 0
            if a < h
            else 1
        )

        home_state[
            "recent_matches"
        ].append({

            "gf": h,

            "ga": a,

            "points": h_pts
        })

        away_state[
            "recent_matches"
        ].append({

            "gf": a,

            "ga": h,

            "points": a_pts
        })

        home_state[
            "recent_home_matches"
        ].append({

            "gf": h,

            "ga": a,

            "points": h_pts
        })

        away_state[
            "recent_away_matches"
        ].append({

            "gf": a,

            "ga": h,

            "points": a_pts
        })

        team_a = min(
            home_id,
            away_id
        )

        team_b = max(
            home_id,
            away_id
        )

        key = (
            f"{team_a}|{team_b}"
        )

        if key not in h2h_states:

            h2h_states[key] = {

                "team_a_wins": 0,

                "draws": 0,

                "team_b_wins": 0
            }

        if h == a:

            h2h_states[key][
                "draws"
            ] += 1

        elif (
            (
                h > a
                and home_id == team_a
            )
            or
            (
                a > h
                and away_id == team_a
            )
        ):

            h2h_states[key][
                "team_a_wins"
            ] += 1

        else:

            h2h_states[key][
                "team_b_wins"
            ] += 1

        processed_rows += 1

    print(
        f"   ✅ Historical rows processed "
        f"({processed_rows:,})."
    )

    print(
        f"   ✅ 1X2 state reconstructed "
        f"({len(team_states_1x2):,} teams)."
    )

    print(
        f"   ✅ H2H state reconstructed "
        f"({len(h2h_states):,} pairings)."
    )

    # ========================================================
    # 3. LOAD FIXTURES
    # ========================================================

    print(
        f"\n[3/5] Scanning fixture files in "
        f"{FIXTURES_DIR}..."
    )

    fixture_files = sorted(
        glob.glob(
            os.path.join(
                FIXTURES_DIR,
                "*.json"
            )
        )
    )

    if not fixture_files:

        print(
            "   ⚠️ No fixture files found."
        )

        return

    fixtures_to_predict = []

    for file_path in fixture_files:

        try:

            with open(
                file_path,
                "r",
                encoding="utf-8"
            ) as f:

                data = json.load(f)

            matches = (
                data.get(
                    "data",
                    data
                )
                if isinstance(
                    data,
                    dict
                )
                else data
            )

            if not isinstance(
                matches,
                list
            ):

                continue

            for match in matches:

                if not isinstance(
                    match,
                    dict
                ):

                    continue

                status = str(
                    match.get(
                        "status",
                        ""
                    )
                ).upper()

                if status not in {
                    "NS",
                    "TBD",
                    "PST"
                }:

                    continue

                home_obj = match.get(
                    "homeTeam",
                    {}
                )

                away_obj = match.get(
                    "awayTeam",
                    {}
                )

                if not isinstance(
                    home_obj,
                    dict
                ):

                    home_obj = {}

                if not isinstance(
                    away_obj,
                    dict
                ):

                    away_obj = {}

                home_name = (
                    match.get(
                        "homeTeamName"
                    )
                    or home_obj.get(
                        "name"
                    )
                )

                away_name = (
                    match.get(
                        "awayTeamName"
                    )
                    or away_obj.get(
                        "name"
                    )
                )

                home_provider_id = (
                    match.get(
                        "homeTeamId"
                    )
                    or home_obj.get(
                        "id"
                    )
                )

                away_provider_id = (
                    match.get(
                        "awayTeamId"
                    )
                    or away_obj.get(
                        "id"
                    )
                )

                if (
                    not home_name
                    or not away_name
                ):

                    continue

                fixtures_to_predict.append({

                    "match_id":
                        match.get(
                            "id"
                        ),

                    "date":
                        match.get(
                            "dateStr"
                        )
                        or match.get(
                            "date"
                        ),

                    "league":
                        (
                            match.get(
                                "leagueName"
                            )
                            or (
                                match.get(
                                    "league",
                                    {}
                                ).get(
                                    "name"
                                )
                                if isinstance(
                                    match.get(
                                        "league",
                                        {}
                                    ),
                                    dict
                                )
                                else None
                            )
                        ),

                    "home_name":
                        str(
                            home_name
                        ).strip(),

                    "away_name":
                        str(
                            away_name
                        ).strip(),

                    "home_provider_id":
                        (
                            str(
                                home_provider_id
                            ).strip()
                            if home_provider_id
                            is not None
                            else None
                        ),

                    "away_provider_id":
                        (
                            str(
                                away_provider_id
                            ).strip()
                            if away_provider_id
                            is not None
                            else None
                        ),

                    "source_file":
                        os.path.basename(
                            file_path
                        )
                })

        except Exception as exc:

            print(
                f"   ⚠️ Could not read "
                f"{os.path.basename(file_path)}: "
                f"{exc}"
            )

    # --------------------------------------------------------
    # Deduplicate
    # --------------------------------------------------------

    unique_fixtures = {}

    duplicate_count = 0

    for fixture in fixtures_to_predict:

        match_id = fixture.get(
            "match_id"
        )

        if match_id is not None:

            key = (
                "id",
                str(
                    match_id
                )
            )

        else:

            key = (
                "fallback",
                fixture.get(
                    "date"
                ),
                clean_name(
                    fixture.get(
                        "home_name"
                    )
                ),
                clean_name(
                    fixture.get(
                        "away_name"
                    )
                )
            )

        if key in unique_fixtures:

            duplicate_count += 1

            continue

        unique_fixtures[
            key
        ] = fixture

    fixtures_to_predict = list(
        unique_fixtures.values()
    )

    print(
        f"   ↳ Found "
        f"{len(fixtures_to_predict):,} "
        f"unique upcoming fixtures."
    )

    if duplicate_count:

        print(
            f"   ↳ Removed "
            f"{duplicate_count:,} duplicate "
            f"representations."
        )

    # ========================================================
    # 4. RESOLUTION + PREDICTION
    # ========================================================

    print(
        "\n[4/5] Resolving teams and "
        "generating predictions..."
    )

    predictions = []

    unresolved = []

    method_counter = Counter()

    fixture_resolution_counter = Counter()

    team_resolution_records = []

    for fixture in fixtures_to_predict:

        home_resolution = resolver.resolve(
            fixture.get(
                "home_provider_id"
            ),
            fixture[
                "home_name"
            ]
        )

        away_resolution = resolver.resolve(
            fixture.get(
                "away_provider_id"
            ),
            fixture[
                "away_name"
            ]
        )

        home_id = (
            home_resolution[
                "zk_id"
            ]
        )

        away_id = (
            away_resolution[
                "zk_id"
            ]
        )

        home_method = (
            home_resolution[
                "method"
            ]
        )

        away_method = (
            away_resolution[
                "method"
            ]
        )

        method_counter[
            home_method
        ] += 1

        method_counter[
            away_method
        ] += 1

        # ----------------------------------------------------
        # Identity gate
        # ----------------------------------------------------

        if (
            not home_id
            or not away_id
        ):

            fixture_resolution_counter[
                "unresolved"
            ] += 1

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
                    fixture.get(
                        "home_provider_id"
                    ),

                "away_provider_id":
                    fixture.get(
                        "away_provider_id"
                    ),

                "home_resolved":
                    bool(
                        home_id
                    ),

                "away_resolved":
                    bool(
                        away_id
                    ),

                "home_resolution_method":
                    home_method,

                "away_resolution_method":
                    away_method,

                "source_file":
                    fixture.get(
                        "source_file"
                    ),

                "prediction_skipped":
                    True,

                "reason":
                    "TEAM_IDENTITY_NOT_SAFELY_RESOLVED"
            })

            team_resolution_records.append({

                "match_id":
                    fixture[
                        "match_id"
                    ],

                "home": {

                    "provider_id":
                        fixture.get(
                            "home_provider_id"
                        ),

                    "fixture_name":
                        fixture[
                            "home_name"
                        ],

                    "zk_id":
                        home_id,

                    "method":
                        home_method
                },

                "away": {

                    "provider_id":
                        fixture.get(
                            "away_provider_id"
                        ),

                    "fixture_name":
                        fixture[
                            "away_name"
                        ],

                    "zk_id":
                        away_id,

                    "method":
                        away_method
                },

                "fixture_resolved":
                    False,

                "prediction_generated":
                    False
            })

            continue

        # ----------------------------------------------------
        # Require historical state
        # ----------------------------------------------------

        h_state_1x2 = (
            team_states_1x2.get(
                home_id
            )
        )

        a_state_1x2 = (
            team_states_1x2.get(
                away_id
            )
        )

        if (
            h_state_1x2 is None
            or a_state_1x2 is None
        ):

            fixture_resolution_counter[
                "resolved_but_no_history"
            ] += 1

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
                    fixture.get(
                        "home_provider_id"
                    ),

                "away_provider_id":
                    fixture.get(
                        "away_provider_id"
                    ),

                "home_zk_id":
                    home_id,

                "away_zk_id":
                    away_id,

                "home_resolution_method":
                    home_method,

                "away_resolution_method":
                    away_method,

                "prediction_skipped":
                    True,

                "reason":
                    "NO_HISTORICAL_STATE"
            })

            continue

        # ====================================================
        # 1X2 FEATURES
        # ====================================================

        h_pts, h_gf, h_ga = (
            calculate_form(
                h_state_1x2[
                    "recent_matches"
                ]
            )
        )

        a_pts, a_gf, a_ga = (
            calculate_form(
                a_state_1x2[
                    "recent_matches"
                ]
            )
        )

        h_home_pts, _, _ = (
            calculate_form(
                h_state_1x2[
                    "recent_home_matches"
                ]
            )
        )

        a_away_pts, _, _ = (
            calculate_form(
                a_state_1x2[
                    "recent_away_matches"
                ]
            )
        )

        team_a = min(
            home_id,
            away_id
        )

        team_b = max(
            home_id,
            away_id
        )

        h2h_key = (
            f"{team_a}|{team_b}"
        )

        h2h = h2h_states.get(
            h2h_key,
            {
                "team_a_wins": 0,
                "draws": 0,
                "team_b_wins": 0
            }
        )

        total_h2h = (
            h2h[
                "team_a_wins"
            ]
            +
            h2h[
                "draws"
            ]
            +
            h2h[
                "team_b_wins"
            ]
        )

        if total_h2h > 0:

            if home_id == team_a:

                hw = h2h[
                    "team_a_wins"
                ]

                aw = h2h[
                    "team_b_wins"
                ]

            else:

                hw = h2h[
                    "team_b_wins"
                ]

                aw = h2h[
                    "team_a_wins"
                ]

            hw_rate = (
                hw / total_h2h
            )

            d_rate = (
                h2h[
                    "draws"
                ]
                / total_h2h
            )

            aw_rate = (
                aw / total_h2h
            )

        else:

            hw_rate = 0.0

            d_rate = 0.0

            aw_rate = 0.0

        features_1x2 = {

            "home_elo_pre":
                h_state_1x2[
                    "elo"
                ],

            "away_elo_pre":
                a_state_1x2[
                    "elo"
                ],

            "elo_diff":
                (
                    h_state_1x2[
                        "elo"
                    ]
                    -
                    a_state_1x2[
                        "elo"
                    ]
                ),

            "home_form_pts":
                h_pts,

            "away_form_pts":
                a_pts,

            "home_home_pts":
                h_home_pts,

            "away_away_pts":
                a_away_pts,

            "home_gf_avg":
                h_gf,

            "away_gf_avg":
                a_gf,

            "home_ga_avg":
                h_ga,

            "away_ga_avg":
                a_ga,

            "h2h_hw_rate":
                hw_rate,

            "h2h_d_rate":
                d_rate,

            "h2h_aw_rate":
                aw_rate,

            "h2h_matches":
                total_h2h
        }

        X_1x2 = pd.DataFrame(
            [
                features_1x2
            ]
        )[FEATURES_1X2]

        # ====================================================
        # MARKET FEATURES
        # ====================================================

        h_state_mkt = (
            live_team_state.get(
                home_id,
                {}
            )
        )

        a_state_mkt = (
            live_team_state.get(
                away_id,
                {}
            )
        )

        home_elo = float(
            h_state_mkt.get(
                "elo",
                h_state_1x2[
                    "elo"
                ]
            )
        )

        away_elo = float(
            a_state_mkt.get(
                "elo",
                a_state_1x2[
                    "elo"
                ]
            )
        )

        features_mkt = {

            "home_elo_pre":
                home_elo,

            "away_elo_pre":
                away_elo,

            "elo_diff":
                home_elo - away_elo,

            "home_ewma_pts":
                h_state_mkt.get(
                    "ewma_points",
                    1.0
                ),

            "away_ewma_pts":
                a_state_mkt.get(
                    "ewma_points",
                    1.0
                ),

            "home_ewma_gd":
                h_state_mkt.get(
                    "ewma_gd",
                    0.0
                ),

            "away_ewma_gd":
                a_state_mkt.get(
                    "ewma_gd",
                    0.0
                ),

            "home_ewma_gf":
                h_state_mkt.get(
                    "ewma_gf",
                    1.0
                ),

            "away_ewma_gf":
                a_state_mkt.get(
                    "ewma_gf",
                    1.0
                ),

            "home_ewma_ga":
                h_state_mkt.get(
                    "ewma_ga",
                    1.0
                ),

            "away_ewma_ga":
                a_state_mkt.get(
                    "ewma_ga",
                    1.0
                ),

            "home_ewma_home_pts":
                h_state_mkt.get(
                    "ewma_home_points",
                    1.0
                ),

            "away_ewma_away_pts":
                a_state_mkt.get(
                    "ewma_away_points",
                    1.0
                ),

            "home_ewma_home_gd":
                h_state_mkt.get(
                    "ewma_home_gd",
                    0.0
                ),

            "away_ewma_away_gd":
                a_state_mkt.get(
                    "ewma_away_gd",
                    0.0
                ),

            "home_ewma_home_gf":
                h_state_mkt.get(
                    "ewma_home_gf",
                    1.0
                ),

            "away_ewma_away_gf":
                a_state_mkt.get(
                    "ewma_away_gf",
                    1.0
                ),

            "home_ewma_home_ga":
                h_state_mkt.get(
                    "ewma_home_ga",
                    1.0
                ),

            "away_ewma_away_ga":
                a_state_mkt.get(
                    "ewma_away_ga",
                    1.0
                ),

            "home_matches_before":
                h_state_mkt.get(
                    "matches_played",
                    0
                ),

            "away_matches_before":
                a_state_mkt.get(
                    "matches_played",
                    0
                ),

            "home_home_matches_before":
                h_state_mkt.get(
                    "home_matches_played",
                    0
                ),

            "away_away_matches_before":
                a_state_mkt.get(
                    "away_matches_played",
                    0
                )
        }

        X_mkt = pd.DataFrame(
            [
                features_mkt
            ]
        )[FEATURES_MARKET]

        # ====================================================
        # MODEL INFERENCE
        # ====================================================

        prob_1x2 = (
            model_1x2.predict_proba(
                X_1x2
            )[0]
        )

        prob_ou = (
            model_ou.predict_proba(
                X_mkt
            )[0]
        )

        prob_btts = (
            model_btts.predict_proba(
                X_mkt
            )[0]
        )

        # ====================================================
        # SEMANTIC PROBABILITY EXTRACTION
        # ====================================================
        #
        # IMPORTANT:
        #
        # We do NOT assume:
        #
        #     probability[0] = HOME
        #
        # Instead, probability_for_class() checks the actual
        # model.classes_ array and translates encoded classes
        # where necessary.
        # ====================================================

        p_home = probability_for_class(
            model_1x2,
            prob_1x2,
            "HOME",
            class_map=CLASS_MAP_1X2
        )

        p_draw = probability_for_class(
            model_1x2,
            prob_1x2,
            "DRAW",
            class_map=CLASS_MAP_1X2
        )

        p_away = probability_for_class(
            model_1x2,
            prob_1x2,
            "AWAY",
            class_map=CLASS_MAP_1X2
        )

        p_over = probability_for_class(
            model_ou,
            prob_ou,
            "OVER",
            class_map=CLASS_MAP_OU
        )

        p_under = probability_for_class(
            model_ou,
            prob_ou,
            "UNDER",
            class_map=CLASS_MAP_OU
        )

        p_no = probability_for_class(
            model_btts,
            prob_btts,
            "NO",
            class_map=CLASS_MAP_BTTS
        )

        p_yes = probability_for_class(
            model_btts,
            prob_btts,
            "YES",
            class_map=CLASS_MAP_BTTS
        )

        # ====================================================
        # PREDICTED OUTCOMES
        # ====================================================

        pred_1x2 = max(
            [
                "HOME_WIN",
                "DRAW",
                "AWAY_WIN"
            ],
            key=lambda value: {

                "HOME_WIN":
                    p_home,

                "DRAW":
                    p_draw,

                "AWAY_WIN":
                    p_away

            }[value]
        )

        pred_ou = (
            "OVER"
            if p_over > p_under
            else "UNDER"
        )

        pred_btts = (
            "YES"
            if p_yes > p_no
            else "NO"
        )

        # ====================================================
        # STORE PREDICTION
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

            "markets": {

                "1x2": {

                    "home_win_prob":
                        round(
                            p_home * 100,
                            2
                        ),

                    "draw_prob":
                        round(
                            p_draw * 100,
                            2
                        ),

                    "away_win_prob":
                        round(
                            p_away * 100,
                            2
                        ),

                    "predicted_outcome":
                        pred_1x2
                },

                "over_under_2_5": {

                    "over_prob":
                        round(
                            p_over * 100,
                            2
                        ),

                    "under_prob":
                        round(
                            p_under * 100,
                            2
                        ),

                    "predicted_outcome":
                        pred_ou
                },

                "btts": {

                    "yes_prob":
                        round(
                            p_yes * 100,
                            2
                        ),

                    "no_prob":
                        round(
                            p_no * 100,
                            2
                        ),

                    "predicted_outcome":
                        pred_btts
                }
            },

            "team_resolution": {

                "home_provider_id":
                    fixture.get(
                        "home_provider_id"
                    ),

                "away_provider_id":
                    fixture.get(
                        "away_provider_id"
                    ),

                "home_method":
                    home_method,

                "away_method":
                    away_method
            }
        })

        fixture_resolution_counter[
            (
                home_method
                if home_method == away_method
                else
                f"{home_method}+{away_method}"
            )
        ] += 1

        team_resolution_records.append({

            "match_id":
                fixture[
                    "match_id"
                ],

            "home": {

                "provider_id":
                    fixture.get(
                        "home_provider_id"
                    ),

                "fixture_name":
                    fixture[
                        "home_name"
                    ],

                "zk_id":
                    home_id,

                "method":
                    home_method
            },

            "away": {

                "provider_id":
                    fixture.get(
                        "away_provider_id"
                    ),

                "fixture_name":
                    fixture[
                        "away_name"
                    ],

                "zk_id":
                    away_id,

                "method":
                    away_method
            },

            "fixture_resolved":
                True,

            "prediction_generated":
                True
        })

    # ========================================================
    # 5. SAVE
    # ========================================================

    print(
        "\n[5/5] Saving unified predictions..."
    )

    os.makedirs(
        os.path.dirname(
            PUBLIC_PREDICTIONS_FILE
        ),
        exist_ok=True
    )

    os.makedirs(
        os.path.dirname(
            UNRESOLVED_FILE
        ),
        exist_ok=True
    )

    os.makedirs(
        os.path.dirname(
            RESOLUTION_REPORT_FILE
        ),
        exist_ok=True
    )

    # --------------------------------------------------------
    # Atomic prediction write
    # --------------------------------------------------------

    temp_predictions = (
        PUBLIC_PREDICTIONS_FILE
        + ".tmp"
    )

    with open(
        temp_predictions,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            predictions,
            f,
            indent=2,
            ensure_ascii=False
        )

    os.replace(
        temp_predictions,
        PUBLIC_PREDICTIONS_FILE
    )

    # --------------------------------------------------------
    # Unresolved
    # --------------------------------------------------------

    with open(
        UNRESOLVED_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            unresolved,
            f,
            indent=2,
            ensure_ascii=False
        )

    # --------------------------------------------------------
    # Resolution report
    # --------------------------------------------------------

    resolution_report = {

        "pipeline_step":
            "48",

        "status":
            (
                "PASS"
                if not unresolved
                else
                "PASS_WITH_UNRESOLVED"
            ),

        "resolution_policy":
            "STRICT_NO_AUTOMATIC_FUZZY_MAPPING",

        "step48_1_safe_mappings":
            len(
                forensic_safe_map
            ),

        "canonical_teams":
            len(
                teams_index
            ),

        "existing_provider_mappings":
            len(
                internal_team_map
            ),

        "canonical_exact_names":
            len(
                resolver.exact
            ),

        "model_contract": {

            "1x2_model_classes":
                [
                    normalize_model_class(
                        value
                    )
                    for value in model_1x2.classes_
                ],

            "1x2_semantic_mapping":
                {
                    str(
                        key
                    ):
                        value
                    for key, value
                    in CLASS_MAP_1X2.items()
                },

            "ou_model_classes":
                [
                    normalize_model_class(
                        value
                    )
                    for value in model_ou.classes_
                ],

            "ou_semantic_mapping":
                {
                    str(
                        key
                    ):
                        value
                    for key, value
                    in CLASS_MAP_OU.items()
                },

            "btts_model_classes":
                [
                    normalize_model_class(
                        value
                    )
                    for value in model_btts.classes_
                ],

            "btts_semantic_mapping":
                {
                    str(
                        key
                    ):
                        value
                    for key, value
                    in CLASS_MAP_BTTS.items()
                }
        },

        "fixtures_scanned":
            len(
                fixtures_to_predict
            ),

        "fixtures_resolved_and_predicted":
            len(
                predictions
            ),

        "fixtures_unresolved_or_skipped":
            len(
                unresolved
            ),

        "resolution_rate":
            (
                round(
                    len(predictions)
                    /
                    len(
                        fixtures_to_predict
                    ),
                    6
                )
                if fixtures_to_predict
                else 0.0
            ),

        "team_resolution_attempts": {

            "total":
                len(
                    fixtures_to_predict
                ) * 2,

            "by_method":
                dict(
                    sorted(
                        method_counter.items()
                    )
                )
        },

        "fixture_resolution": {

            "predicted":
                len(
                    predictions
                ),

            "unresolved_or_skipped":
                len(
                    unresolved
                ),

            "by_method":
                dict(
                    sorted(
                        fixture_resolution_counter.items()
                    )
                )
        },

        "resolved_predictions":
            team_resolution_records,

        "unresolved_fixtures":
            unresolved
    }

    with open(
        RESOLUTION_REPORT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            resolution_report,
            f,
            indent=2,
            ensure_ascii=False
        )

    # ========================================================
    # FINAL REPORT
    # ========================================================

    print()

    print(
        "-" * 60
    )

    print(
        "TEAM RESOLUTION SUMMARY"
    )

    print(
        "-" * 60
    )

    print(
        f"   Provider mappings used: "
        f"{method_counter.get('internal_provider_map', 0):,}"
    )

    print(
        f"   Exact canonical names: "
        f"{method_counter.get('exact_normalized_name', 0):,}"
    )

    print(
        f"   Normalized variants: "
        f"{method_counter.get('normalized_name_variant', 0):,}"
    )

    print(
        f"   Step 48.1 safe mappings: "
        f"{method_counter.get('step48_1_safe_mapping', 0):,}"
    )

    print(
        f"   Unresolved teams: "
        f"{method_counter.get('unresolved', 0):,}"
    )

    print()

    print(
        "-" * 60
    )

    print(
        "FIXTURE RESOLUTION"
    )

    print(
        "-" * 60
    )

    print(
        f"   Canonical teams: "
        f"{len(teams_index):,}"
    )

    print(
        f"   Existing provider mappings: "
        f"{len(internal_team_map):,}"
    )

    print(
        f"   Step 48.1 safe mappings: "
        f"{len(forensic_safe_map):,}"
    )

    print(
        f"   Fixtures scanned: "
        f"{len(fixtures_to_predict):,}"
    )

    print(
        f"   Predictions generated: "
        f"{len(predictions):,}"
    )

    print(
        f"   Unresolved/skipped: "
        f"{len(unresolved):,}"
    )

    if fixtures_to_predict:

        rate = (
            len(predictions)
            /
            len(
                fixtures_to_predict
            )
            * 100
        )

        print(
            f"   Prediction resolution rate: "
            f"{rate:.2f}%"
        )

    print()

    print(
        "   📁 Predictions:"
    )

    print(
        f"      {PUBLIC_PREDICTIONS_FILE}"
    )

    print(
        "   📁 Unresolved:"
    )

    print(
        f"      {UNRESOLVED_FILE}"
    )

    print(
        "   📁 Resolution report:"
    )

    print(
        f"      {RESOLUTION_REPORT_FILE}"
    )

    print()

    print(
        "=" * 60
    )

    if unresolved:

        print(
            " STEP 48 COMPLETE: "
            "PASS WITH UNRESOLVED FIXTURES"
        )

    else:

        print(
            " STEP 48 COMPLETE: PASS"
        )

    print(
        "=" * 60
    )

    print(
        f"📊 Total fixtures scanned: "
        f"{len(fixtures_to_predict):,}"
    )

    print(
        f"✅ Predictions generated: "
        f"{len(predictions):,}"
    )

    print(
        f"⚠️ Unresolved/skipped: "
        f"{len(unresolved):,}"
    )

    print(
        "=" * 60
    )


if __name__ == "__main__":
    run()