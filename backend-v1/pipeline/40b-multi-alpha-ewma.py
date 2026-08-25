import os
import pandas as pd
import numpy as np


# ============================================================
# ZOKASCORE V2 — STEP 40B
# MULTI-ALPHA EWMA FEATURE EXTRACTION
# ============================================================
#
# Source of truth:
#   data/processed/master_with_elo.csv
#
# Output:
#   data/ml/features_v4.csv
#
# CONTRACT:
#   Step 40B is a pure chronological feature-extraction stage.
#
# It:
#   - reads ONLY Step 32 master_with_elo.csv
#   - preserves the complete Step 32 population
#   - calculates strictly pre-match EWMA features
#   - supports fast / medium / slow EWMA tracks
#   - does NOT recalculate ELO
#   - does NOT resolve identities
#   - does NOT use future information
#   - does NOT use a hard-coded population expectation
#
# Population:
#   Dynamically inherited from Step 32.
#
# IMPORTANT:
#   Current match result is NEVER included in the features for
#   that same match. State is updated only AFTER the feature
#   record has been created.
# ============================================================


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

SOURCE_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "master_with_elo.csv"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "ml"
)

OUTPUT_FILE = os.path.join(
    OUTPUT_DIR,
    "features_v4.csv"
)

TEMP_OUTPUT_FILE = OUTPUT_FILE + ".tmp"


# ============================================================
# EWMA CONFIGURATION
# ============================================================

ALPHAS = {
    "fast": 0.35,
    "medium": 0.20,
    "slow": 0.08,
}


STAT_KEYS = [
    "pts",
    "gd",
    "gf",
    "ga",
]


# ============================================================
# SOURCE CONTRACT
# ============================================================

REQUIRED_COLUMNS = [
    "zokascore_match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "home_score",
    "away_score",
    "home_elo_pre",
    "away_elo_pre",
]


IDENTITY_COLUMNS = [
    "match_id",
    "date",
    "home_team_id",
    "away_team_id",
    "target",
]


# ============================================================
# HELPERS
# ============================================================

def fail(message):
    raise RuntimeError(message)


def get_target(home_score, away_score):

    if home_score > away_score:
        return "HOME_WIN"

    if home_score < away_score:
        return "AWAY_WIN"

    return "DRAW"


def col_name(
    prefix,
    alpha_label,
    stat,
    venue_suffix=None
):
    """
    Naming contract:

    medium / original:
        home_ewma_pts
        away_ewma_pts
        home_ewma_home_pts
        away_ewma_away_pts

    fast:
        home_ewma_fast_pts
        away_ewma_fast_pts
        home_ewma_fast_home_pts
        away_ewma_fast_away_pts

    slow:
        home_ewma_slow_pts
        away_ewma_slow_pts
        home_ewma_slow_home_pts
        away_ewma_slow_away_pts
    """

    parts = [
        prefix,
        "ewma"
    ]

    if alpha_label != "medium":
        parts.append(alpha_label)

    if venue_suffix:
        parts.append(venue_suffix)

    parts.append(stat)

    return "_".join(parts)


def create_team_state():

    state = {}

    for alpha_label in ALPHAS:

        for stat in STAT_KEYS:

            # Match the original Step 40 initialization.
            initial_value = (
                1.0
                if stat in ("pts", "gf", "ga")
                else 0.0
            )

            state[
                (alpha_label, "overall", stat)
            ] = initial_value

            state[
                (alpha_label, "home", stat)
            ] = initial_value

            state[
                (alpha_label, "away", stat)
            ] = initial_value

    state["matches"] = 0
    state["home_matches"] = 0
    state["away_matches"] = 0

    return state


def ewma_update(
    previous,
    current,
    alpha
):
    return (
        alpha * current
        + (1.0 - alpha) * previous
    )


# ============================================================
# SOURCE VALIDATION
# ============================================================

def validate_source(df):

    print("\n[3/7] Validating source dataset...")

    # --------------------------------------------------------
    # Required columns
    # --------------------------------------------------------

    missing = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing:
        fail(
            "Step 32 source is missing required columns: "
            + ", ".join(missing)
        )

    # --------------------------------------------------------
    # Match identity
    # --------------------------------------------------------

    match_ids = (
        df["zokascore_match_id"]
        .astype("string")
        .str.strip()
    )

    if match_ids.isna().any():
        fail(
            "Step 32 contains missing Match IDs."
        )

    if (match_ids == "").any():
        fail(
            "Step 32 contains empty Match IDs."
        )

    duplicate_count = int(
        match_ids.duplicated().sum()
    )

    if duplicate_count:
        fail(
            f"Step 32 contains "
            f"{duplicate_count:,} duplicate Match IDs."
        )

    # --------------------------------------------------------
    # Team identities
    # --------------------------------------------------------

    home_team_ids = (
        df["home_team_id"]
        .astype("string")
        .str.strip()
    )

    away_team_ids = (
        df["away_team_id"]
        .astype("string")
        .str.strip()
    )

    if home_team_ids.isna().any():
        fail(
            "Step 32 contains missing home_team_id values."
        )

    if away_team_ids.isna().any():
        fail(
            "Step 32 contains missing away_team_id values."
        )

    if (home_team_ids == "").any():
        fail(
            "Step 32 contains empty home_team_id values."
        )

    if (away_team_ids == "").any():
        fail(
            "Step 32 contains empty away_team_id values."
        )

    self_matches = (
        home_team_ids == away_team_ids
    )

    if self_matches.any():
        fail(
            "Step 32 contains "
            f"{int(self_matches.sum()):,} self-match rows."
        )

    # --------------------------------------------------------
    # Dates
    # --------------------------------------------------------

    parsed_dates = pd.to_datetime(
        df["date"],
        errors="coerce"
    )

    invalid_dates = int(
        parsed_dates.isna().sum()
    )

    if invalid_dates:
        fail(
            f"Step 32 contains "
            f"{invalid_dates:,} invalid dates."
        )

    # --------------------------------------------------------
    # Scores
    # --------------------------------------------------------

    home_scores = pd.to_numeric(
        df["home_score"],
        errors="coerce"
    )

    away_scores = pd.to_numeric(
        df["away_score"],
        errors="coerce"
    )

    invalid_scores = (
        home_scores.isna()
        | away_scores.isna()
        | ~np.isfinite(home_scores)
        | ~np.isfinite(away_scores)
        | (home_scores < 0)
        | (away_scores < 0)
        | (home_scores % 1 != 0)
        | (away_scores % 1 != 0)
    )

    invalid_score_count = int(
        invalid_scores.sum()
    )

    if invalid_score_count:
        fail(
            f"Step 32 contains "
            f"{invalid_score_count:,} invalid score rows."
        )

    # --------------------------------------------------------
    # ELO
    # --------------------------------------------------------

    home_elo = pd.to_numeric(
        df["home_elo_pre"],
        errors="coerce"
    )

    away_elo = pd.to_numeric(
        df["away_elo_pre"],
        errors="coerce"
    )

    invalid_elo = (
        home_elo.isna()
        | away_elo.isna()
        | ~np.isfinite(home_elo)
        | ~np.isfinite(away_elo)
    )

    invalid_elo_count = int(
        invalid_elo.sum()
    )

    if invalid_elo_count:
        fail(
            f"Step 32 contains "
            f"{invalid_elo_count:,} invalid pre-match ELO rows."
        )

    # --------------------------------------------------------
    # Normalize working columns
    # --------------------------------------------------------

    df = df.copy()

    df["zokascore_match_id"] = match_ids
    df["home_team_id"] = home_team_ids
    df["away_team_id"] = away_team_ids
    df["date"] = parsed_dates
    df["home_score"] = home_scores.astype(np.int64)
    df["away_score"] = away_scores.astype(np.int64)
    df["home_elo_pre"] = home_elo.astype(float)
    df["away_elo_pre"] = away_elo.astype(float)

    print(
        "   ✅ Required columns present."
    )

    print(
        "   ✅ Match IDs present and unique."
    )

    print(
        "   ✅ Canonical team IDs valid."
    )

    print(
        "   ✅ Dates valid."
    )

    print(
        "   ✅ Scores valid."
    )

    print(
        "   ✅ Pre-match ELO values valid."
    )

    return df


# ============================================================
# FEATURE EXTRACTION
# ============================================================

def build_features(df):

    print(
        "\n[5/7] Calculating chronological "
        "multi-alpha EWMA features..."
    )

    # --------------------------------------------------------
    # Deterministic chronology
    # --------------------------------------------------------

    df = df.sort_values(
        by=[
            "date",
            "zokascore_match_id"
        ],
        kind="mergesort"
    ).reset_index(drop=True)

    team_states = {}

    def get_state(team_id):

        if team_id not in team_states:
            team_states[team_id] = (
                create_team_state()
            )

        return team_states[team_id]

    rows_out = []

    # --------------------------------------------------------
    # Chronological processing
    # --------------------------------------------------------

    for row in df.itertuples(
        index=False
    ):

        home_id = str(
            row.home_team_id
        )

        away_id = str(
            row.away_team_id
        )

        home_score = int(
            row.home_score
        )

        away_score = int(
            row.away_score
        )

        home_state = get_state(
            home_id
        )

        away_state = get_state(
            away_id
        )

        home_elo = float(
            row.home_elo_pre
        )

        away_elo = float(
            row.away_elo_pre
        )

        # ----------------------------------------------------
        # IMPORTANT:
        # Everything below is BEFORE the current match result.
        # ----------------------------------------------------

        record = {

            "match_id":
                str(row.zokascore_match_id),

            "date":
                row.date.strftime("%Y-%m-%d"),

            "home_team_id":
                home_id,

            "away_team_id":
                away_id,

            "home_elo_pre":
                round(home_elo, 2),

            "away_elo_pre":
                round(away_elo, 2),

            "elo_diff":
                round(
                    home_elo - away_elo,
                    2
                ),

            "home_matches_before":
                home_state["matches"],

            "away_matches_before":
                away_state["matches"],

            "home_home_matches_before":
                home_state["home_matches"],

            "away_away_matches_before":
                away_state["away_matches"],
        }

        # ----------------------------------------------------
        # EWMA snapshots
        # ----------------------------------------------------

        for alpha_label in ALPHAS:

            for stat in STAT_KEYS:

                # Overall form
                record[
                    col_name(
                        "home",
                        alpha_label,
                        stat
                    )
                ] = round(
                    home_state[
                        (
                            alpha_label,
                            "overall",
                            stat
                        )
                    ],
                    4
                )

                record[
                    col_name(
                        "away",
                        alpha_label,
                        stat
                    )
                ] = round(
                    away_state[
                        (
                            alpha_label,
                            "overall",
                            stat
                        )
                    ],
                    4
                )

                # Home venue form
                record[
                    col_name(
                        "home",
                        alpha_label,
                        stat,
                        "home"
                    )
                ] = round(
                    home_state[
                        (
                            alpha_label,
                            "home",
                            stat
                        )
                    ],
                    4
                )

                # Away venue form
                record[
                    col_name(
                        "away",
                        alpha_label,
                        stat,
                        "away"
                    )
                ] = round(
                    away_state[
                        (
                            alpha_label,
                            "away",
                            stat
                        )
                    ],
                    4
                )

        # ----------------------------------------------------
        # Target
        # ----------------------------------------------------

        record["target"] = get_target(
            home_score,
            away_score
        )

        rows_out.append(record)

        # ====================================================
        # UPDATE STATE AFTER FEATURE EXTRACTION
        # ====================================================

        if home_score > away_score:

            home_pts = 3
            away_pts = 0

        elif home_score < away_score:

            home_pts = 0
            away_pts = 3

        else:

            home_pts = 1
            away_pts = 1

        home_gd = (
            home_score - away_score
        )

        away_gd = (
            away_score - home_score
        )

        current_values = {

            "pts": (
                home_pts,
                away_pts
            ),

            "gd": (
                home_gd,
                away_gd
            ),

            "gf": (
                home_score,
                away_score
            ),

            "ga": (
                away_score,
                home_score
            ),
        }

        # ----------------------------------------------------
        # Update every alpha track
        # ----------------------------------------------------

        for alpha_label, alpha in ALPHAS.items():

            for stat in STAT_KEYS:

                home_current, away_current = (
                    current_values[stat]
                )

                # Overall history
                home_state[
                    (
                        alpha_label,
                        "overall",
                        stat
                    )
                ] = ewma_update(
                    home_state[
                        (
                            alpha_label,
                            "overall",
                            stat
                        )
                    ],
                    home_current,
                    alpha
                )

                away_state[
                    (
                        alpha_label,
                        "overall",
                        stat
                    )
                ] = ewma_update(
                    away_state[
                        (
                            alpha_label,
                            "overall",
                            stat
                        )
                    ],
                    away_current,
                    alpha
                )

                # Home-only history
                home_state[
                    (
                        alpha_label,
                        "home",
                        stat
                    )
                ] = ewma_update(
                    home_state[
                        (
                            alpha_label,
                            "home",
                            stat
                        )
                    ],
                    home_current,
                    alpha
                )

                # Away-only history
                away_state[
                    (
                        alpha_label,
                        "away",
                        stat
                    )
                ] = ewma_update(
                    away_state[
                        (
                            alpha_label,
                        "away",
                        stat
                        )
                    ],
                    away_current,
                    alpha
                )

        # ----------------------------------------------------
        # Match counters
        # ----------------------------------------------------

        home_state["matches"] += 1
        away_state["matches"] += 1

        home_state["home_matches"] += 1
        away_state["away_matches"] += 1

    return pd.DataFrame(rows_out)


# ============================================================
# OUTPUT VALIDATION
# ============================================================

def validate_output(
    out_df,
    source_df,
    source_rows
):

    print(
        "\n[6/7] Validating generated "
        "feature dataset..."
    )

    # --------------------------------------------------------
    # Population
    # --------------------------------------------------------

    if len(out_df) != source_rows:

        fail(
            "FEATURE POPULATION MISMATCH: "
            f"source={source_rows:,}, "
            f"features={len(out_df):,}."
        )

    # --------------------------------------------------------
    # Match IDs
    # --------------------------------------------------------

    if out_df["match_id"].isna().any():

        fail(
            "Generated feature dataset contains "
            "missing match_id values."
        )

    if (
        out_df["match_id"]
        .astype(str)
        .str.strip()
        .eq("")
        .any()
    ):

        fail(
            "Generated feature dataset contains "
            "empty match_id values."
        )

    if out_df["match_id"].duplicated().any():

        duplicate_count = int(
            out_df["match_id"].duplicated().sum()
        )

        fail(
            f"Generated feature dataset contains "
            f"{duplicate_count:,} duplicate match IDs."
        )

    # --------------------------------------------------------
    # Source identity preservation
    # --------------------------------------------------------

    source_ids = (
        source_df[
            "zokascore_match_id"
        ]
        .astype(str)
        .tolist()
    )

    output_ids = (
        out_df[
            "match_id"
        ]
        .astype(str)
        .tolist()
    )

    if set(source_ids) != set(output_ids):

        missing_ids = (
            set(source_ids)
            - set(output_ids)
        )

        extra_ids = (
            set(output_ids)
            - set(source_ids)
        )

        fail(
            "Match identity population changed.\n"
            f"Missing IDs: {len(missing_ids):,}\n"
            f"Extra IDs: {len(extra_ids):,}"
        )

    # --------------------------------------------------------
    # Identity columns
    # --------------------------------------------------------

    for column in [
        "date",
        "home_team_id",
        "away_team_id",
        "target"
    ]:

        if out_df[column].isna().any():

            fail(
                f"Generated feature column "
                f"{column} contains missing values."
            )

    # --------------------------------------------------------
    # Target validation
    # --------------------------------------------------------

    valid_targets = {
        "HOME_WIN",
        "DRAW",
        "AWAY_WIN"
    }

    actual_targets = set(
        out_df["target"].unique()
    )

    invalid_targets = (
        actual_targets
        - valid_targets
    )

    if invalid_targets:

        fail(
            "Invalid generated target values: "
            + str(sorted(invalid_targets))
        )

    # --------------------------------------------------------
    # Numeric validation
    # --------------------------------------------------------

    numeric_columns = [
        column
        for column in out_df.columns
        if column not in IDENTITY_COLUMNS
    ]

    for column in numeric_columns:

        values = pd.to_numeric(
            out_df[column],
            errors="coerce"
        )

        if values.isna().any():

            fail(
                f"Generated feature contains "
                f"invalid values: {column}"
            )

        if not np.isfinite(
            values.to_numpy(
                dtype=float
            )
        ).all():

            fail(
                f"Generated feature contains "
                f"non-finite values: {column}"
            )

    # --------------------------------------------------------
    # Result accounting
    # --------------------------------------------------------

    home_wins = int(
        (
            out_df["target"]
            == "HOME_WIN"
        ).sum()
    )

    draws = int(
        (
            out_df["target"]
            == "DRAW"
        ).sum()
    )

    away_wins = int(
        (
            out_df["target"]
            == "AWAY_WIN"
        ).sum()
    )

    if (
        home_wins
        + draws
        + away_wins
        != source_rows
    ):

        fail(
            "Result accounting mismatch."
        )

    print(
        "   ✅ Population preserved."
    )

    print(
        "   ✅ Match IDs preserved and unique."
    )

    print(
        "   ✅ Schema validated."
    )

    print(
        "   ✅ Numeric integrity verified."
    )

    print(
        "   ✅ Target integrity verified."
    )

    print(
        f"   ↳ HOME_WIN: {home_wins:,}"
    )

    print(
        f"   ↳ DRAW:     {draws:,}"
    )

    print(
        f"   ↳ AWAY_WIN: {away_wins:,}"
    )

    return {
        "home_wins": home_wins,
        "draws": draws,
        "away_wins": away_wins,
    }


# ============================================================
# ATOMIC WRITE
# ============================================================

def write_output(
    out_df,
    source_rows
):

    print(
        "\n[7/7] Writing ML feature "
        "dataset atomically..."
    )

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    out_df.to_csv(
        TEMP_OUTPUT_FILE,
        index=False
    )

    # --------------------------------------------------------
    # Reload verification
    # --------------------------------------------------------

    reloaded = pd.read_csv(
        TEMP_OUTPUT_FILE,
        low_memory=False
    )

    if len(reloaded) != source_rows:

        fail(
            "Output reload population mismatch: "
            f"expected {source_rows:,}, "
            f"got {len(reloaded):,}."
        )

    if (
        reloaded["match_id"]
        .duplicated()
        .any()
    ):

        fail(
            "Output reload contains "
            "duplicate Match IDs."
        )

    if (
        reloaded.columns.tolist()
        != out_df.columns.tolist()
    ):

        fail(
            "Output reload schema mismatch."
        )

    # --------------------------------------------------------
    # Atomic publish
    # --------------------------------------------------------

    os.replace(
        TEMP_OUTPUT_FILE,
        OUTPUT_FILE
    )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(
        " ZOKASCORE V2 — STEP 40B: "
        "MULTI-ALPHA EWMA FEATURES"
    )
    print("=" * 60)

    # ========================================================
    # [1/7] SOURCE CHECK
    # ========================================================

    print(
        "\n[1/7] Checking Step 32 source..."
    )

    if not os.path.exists(
        SOURCE_FILE
    ):

        fail(
            "Step 32 source dataset not found:\n"
            + SOURCE_FILE
        )

    print(
        f"   ↳ Source: {SOURCE_FILE}"
    )

    # ========================================================
    # [2/7] LOAD
    # ========================================================

    print(
        "\n[2/7] Loading master_with_elo.csv..."
    )

    df = pd.read_csv(
        SOURCE_FILE,
        low_memory=False
    )

    source_rows = len(df)

    if source_rows == 0:

        fail(
            "Step 32 source dataset is empty."
        )

    print(
        f"   ↳ Rows loaded: {source_rows:,}"
    )

    # ========================================================
    # [3/7] VALIDATE
    # ========================================================

    df = validate_source(
        df
    )

    # ========================================================
    # [4/7] CHRONOLOGY
    # ========================================================

    print(
        "\n[4/7] Preparing deterministic chronology..."
    )

    df = df.sort_values(
        by=[
            "date",
            "zokascore_match_id"
        ],
        kind="mergesort"
    ).reset_index(
        drop=True
    )

    print(
        "   ✅ Chronology ordered by "
        "date + canonical Match ID."
    )

    # ========================================================
    # [5/7] FEATURES
    # ========================================================

    out_df = build_features(
        df
    )

    # ========================================================
    # [6/7] VALIDATION
    # ========================================================

    accounting = validate_output(
        out_df,
        df,
        source_rows
    )

    # ========================================================
    # [7/7] WRITE
    # ========================================================

    write_output(
        out_df,
        source_rows
    )

    # ========================================================
    # FINAL REPORT
    # ========================================================

    print()
    print("=" * 60)
    print(" STEP 40B COMPLETE: PASS")
    print("=" * 60)

    print(
        f"📊 Source rows:        {source_rows:,}"
    )

    print(
        f"📊 Feature rows:       {len(out_df):,}"
    )

    print(
        f"📐 EWMA alphas:        {ALPHAS}"
    )

    print(
        f"🧩 Feature columns:    "
        f"{len(out_df.columns)}"
    )

    print(
        f"📊 Home wins:          "
        f"{accounting['home_wins']:,}"
    )

    print(
        f"📊 Draws:              "
        f"{accounting['draws']:,}"
    )

    print(
        f"📊 Away wins:          "
        f"{accounting['away_wins']:,}"
    )

    print(
        f"📁 Output:             "
        f"{OUTPUT_FILE}"
    )

    print()
    print(
        "🔒 No hard-coded population expectation."
    )

    print(
        "🔒 Population inherited dynamically "
        "from Step 32."
    )

    print(
        "🔒 Exact source population preserved."
    )

    print(
        "🔒 Match identity set preserved."
    )

    print(
        "🔒 No ELO recalculation."
    )

    print(
        "🔒 No identity resolution."
    )

    print(
        "🔒 Features are strictly pre-match."
    )

    print(
        "🔒 Current match result applied "
        "only AFTER feature extraction."
    )

    print(
        "🔒 fast=0.35"
    )

    print(
        "🔒 medium=0.20"
    )

    print(
        "🔒 slow=0.08"
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    try:

        run()

    except Exception:

        if os.path.exists(
            TEMP_OUTPUT_FILE
        ):

            try:
                os.remove(
                    TEMP_OUTPUT_FILE
                )
            except OSError:
                pass

        print()
        print("=" * 60)
        print(" ❌ STEP 40B FAILED")
        print("=" * 60)

        raise