import os
import json
import csv
import glob
import re
import shutil
import time
from datetime import datetime


# ============================================================
# ZOKASCORE V2 — SYNC & UPDATE ACTIVE FINAL MASTER
#
# IMPORTANT ARCHITECTURE
# ---------------------
# data/zokascore_football_data/ZOKASCORE_PUBLIC_MASTER.csv
#     = authoritative source / promotion source
#
# data/source/ZOKASCORE_FINAL/ZOKASCORE_PUBLIC_MASTER.csv
#     = ACTIVE OPERATIONAL MASTER
#
# This script intentionally modifies ONLY the ACTIVE FINAL
# master and the existing processed Elo master.
#
# It does NOT modify the authoritative canonical master.
# ============================================================


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

RESULTS_DIR = os.path.join(
    BASE_DIR,
    "public_data",
    "results"
)

# ------------------------------------------------------------
# ACTIVE OPERATIONAL MASTER
# ------------------------------------------------------------

RAW_MASTER_CSV = os.path.join(
    BASE_DIR,
    "data",
    "source",
    "ZOKASCORE_FINAL",
    "ZOKASCORE_PUBLIC_MASTER.csv"
)

# ------------------------------------------------------------
# EXISTING ELO MASTER
# ------------------------------------------------------------

MASTER_CSV = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "master_with_elo.csv"
)

# ------------------------------------------------------------
# BACKUP LOCATION
# ------------------------------------------------------------

BACKUP_DIR = os.path.join(
    BASE_DIR,
    "data",
    "source",
    "ZOKASCORE_FINAL",
    "append-results-backups"
)


# ============================================================
# HELPERS
# ============================================================

def generate_zk_match_id(date_str, home_name, away_name):
    """
    Generates a unique Zoka match ID.

    Example:
        ZK_18721130_SCOTLAND_ENGLAND
    """

    date_clean = str(date_str).replace("-", "")

    home_clean = re.sub(
        r"[^a-zA-Z0-9]",
        "",
        str(home_name).upper()
    )

    away_clean = re.sub(
        r"[^a-zA-Z0-9]",
        "",
        str(away_name).upper()
    )

    return (
        f"ZK_{date_clean}_"
        f"{home_clean}_"
        f"{away_clean}"
    )


def get_csv_headers(filepath):

    if not os.path.exists(filepath):
        return []

    with open(
        filepath,
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as f:

        reader = csv.reader(f)

        return next(reader, [])


def timestamp():

    return datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )


def safe_remove(filepath):

    if not os.path.exists(filepath):
        return

    for attempt in range(5):

        try:

            os.remove(filepath)

            return

        except PermissionError:

            if attempt == 4:
                raise

            time.sleep(0.5)


def copy_with_verification(source, destination):

    shutil.copy2(
        source,
        destination
    )

    source_size = os.path.getsize(source)
    destination_size = os.path.getsize(destination)

    if source_size != destination_size:

        raise RuntimeError(
            "Backup verification failed:\n"
            f"Source size: {source_size}\n"
            f"Backup size: {destination_size}"
        )


def replace_with_retry(temp_filepath, filepath):

    """
    Windows-safe replacement.

    The temporary file is already completely written
    and closed before this function is called.
    """

    last_error = None

    for attempt in range(10):

        try:

            os.replace(
                temp_filepath,
                filepath
            )

            return

        except PermissionError as error:

            last_error = error

            print(
                f"   Replacement locked "
                f"(attempt {attempt + 1}/10)..."
            )

            time.sleep(1)

    raise PermissionError(
        "Unable to replace active master after "
        "10 attempts.\n"
        f"Target: {filepath}\n"
        f"Temporary: {temp_filepath}\n"
        f"Last error: {last_error}"
    )


# ============================================================
# PROCESS ONE CSV
# ============================================================

def process_csv_memory_safe(
    filepath,
    json_updates,
    make_backup=False
):

    headers = get_csv_headers(filepath)

    if not headers:

        raise RuntimeError(
            f"CSV has no headers or does not exist:\n{filepath}"
        )

    temp_filepath = filepath + ".tmp"

    # Remove stale temp from an earlier failed execution.
    if os.path.exists(temp_filepath):

        print(
            "   Removing stale temporary file..."
        )

        safe_remove(temp_filepath)

    existing_ids = set()

    updated_count = 0
    appended_count = 0

    # --------------------------------------------------------
    # BACKUP ACTIVE FILE
    # --------------------------------------------------------

    backup_file = None

    if make_backup:

        os.makedirs(
            BACKUP_DIR,
            exist_ok=True
        )

        backup_file = os.path.join(
            BACKUP_DIR,
            f"ZOKASCORE_PUBLIC_MASTER_{timestamp()}.csv"
        )

        print(
            f"   Creating backup:\n"
            f"   {backup_file}"
        )

        copy_with_verification(
            filepath,
            backup_file
        )

        print(
            "   Backup verification: PASS"
        )

    # --------------------------------------------------------
    # PHASE 1
    # READ ORIGINAL -> WRITE TEMP
    # --------------------------------------------------------

    with open(
        filepath,
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as infile:

        with open(
            temp_filepath,
            "w",
            encoding="utf-8",
            newline=""
        ) as outfile:

            reader = csv.DictReader(infile)

            writer = csv.DictWriter(
                outfile,
                fieldnames=headers,
                extrasaction="ignore"
            )

            writer.writeheader()

            for row in reader:

                zk_id = (
                    row.get(
                        "zokascore_match_id",
                        ""
                    )
                    or ""
                ).strip()

                existing_ids.add(
                    zk_id
                )

                # --------------------------------------------
                # UPDATE EXISTING SCORE
                # --------------------------------------------

                if zk_id in json_updates:

                    update = json_updates[
                        zk_id
                    ]

                    new_home = str(
                        update["home_score"]
                    )

                    new_away = str(
                        update["away_score"]
                    )

                    old_home = str(
                        row.get(
                            "home_score",
                            ""
                        )
                    )

                    old_away = str(
                        row.get(
                            "away_score",
                            ""
                        )
                    )

                    if (
                        old_home != new_home
                        or
                        old_away != new_away
                    ):

                        row["home_score"] = (
                            new_home
                        )

                        row["away_score"] = (
                            new_away
                        )

                        updated_count += 1

                writer.writerow(row)

    # --------------------------------------------------------
    # PHASE 2
    # APPEND NEW MATCHES TO TEMP
    # --------------------------------------------------------

    with open(
        temp_filepath,
        "a",
        encoding="utf-8",
        newline=""
    ) as outfile:

        writer = csv.DictWriter(
            outfile,
            fieldnames=headers,
            extrasaction="ignore"
        )

        for zk_id, data in json_updates.items():

            if zk_id in existing_ids:
                continue

            row_data = {
                header: ""
                for header in headers
            }

            row_data.update({

                "zokascore_match_id":
                    zk_id,

                "date":
                    data["date_str"],

                "home_team":
                    data["home_name"],

                "away_team":
                    data["away_name"],

                "competition":
                    data["league"],

                "home_score":
                    data["home_score"],

                "away_score":
                    data["away_score"]
            })

            # --------------------------------------------
            # ELO MASTER SUPPORT
            # --------------------------------------------

            if "home_elo_pre" in headers:

                row_data.update({

                    "home_elo_pre":
                        1500.0,

                    "away_elo_pre":
                        1500.0,

                    "home_elo_post":
                        1500.0,

                    "away_elo_post":
                        1500.0,

                    "home_elo_delta":
                        0.0,

                    "away_elo_delta":
                        0.0
                })

            writer.writerow(
                row_data
            )

            appended_count += 1

            existing_ids.add(
                zk_id
            )

    # --------------------------------------------------------
    # IMPORTANT:
    # ALL FILE HANDLES ARE NOW CLOSED.
    # --------------------------------------------------------

    # Verify temporary file exists.
    if not os.path.exists(
        temp_filepath
    ):

        raise RuntimeError(
            "Temporary CSV was not created."
        )

    temp_size = os.path.getsize(
        temp_filepath
    )

    if temp_size == 0:

        raise RuntimeError(
            "Temporary CSV is empty."
        )

    # --------------------------------------------------------
    # REPLACE ACTIVE FILE
    # --------------------------------------------------------

    replace_with_retry(
        temp_filepath,
        filepath
    )

    # --------------------------------------------------------
    # FINAL FILE CHECK
    # --------------------------------------------------------

    final_size = os.path.getsize(
        filepath
    )

    if final_size != temp_size:

        raise RuntimeError(
            "Final file size does not match "
            "temporary file size after replacement."
        )

    return (
        updated_count,
        appended_count,
        len(existing_ids),
        backup_file
    )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print(
        " ZOKASCORE V2 — SYNC & UPDATE ACTIVE FINAL MASTER"
    )
    print("=" * 60)

    print()
    print(
        "ACTIVE MASTER:"
    )
    print(
        RAW_MASTER_CSV
    )

    print()
    print(
        "AUTHORITATIVE SOURCE IS NOT MODIFIED."
    )

    # ========================================================
    # VERIFY ACTIVE MASTER
    # ========================================================

    if not os.path.exists(
        RAW_MASTER_CSV
    ):

        raise FileNotFoundError(
            "ACTIVE FINAL MASTER NOT FOUND:\n"
            f"{RAW_MASTER_CSV}"
        )

    print()
    print(
        "Active FINAL master: PASS"
    )

    # ========================================================
    # 1/3
    # SCAN RESULTS
    # ========================================================

    print()
    print(
        "[1/3] Scanning public_data/results "
        "for new matches and score updates..."
    )

    json_updates = {}

    result_files = glob.glob(
        os.path.join(
            RESULTS_DIR,
            "*.json"
        )
    )

    for filepath in result_files:

        try:

            with open(
                filepath,
                "r",
                encoding="utf-8"
            ) as f:

                data = json.load(f)

            if isinstance(data, dict):

                matches = data.get(
                    "data",
                    data
                )

            else:

                matches = data

            if not isinstance(
                matches,
                list
            ):
                continue

            for m in matches:

                if not isinstance(
                    m,
                    dict
                ):
                    continue

                home_name = (
                    m.get(
                        "homeTeamName"
                    )
                    or
                    m.get(
                        "homeTeam",
                        {}
                    ).get(
                        "name"
                    )
                )

                away_name = (
                    m.get(
                        "awayTeamName"
                    )
                    or
                    m.get(
                        "awayTeam",
                        {}
                    ).get(
                        "name"
                    )
                )

                date_str = (
                    m.get(
                        "dateStr"
                    )
                    or
                    (
                        m.get(
                            "date",
                            ""
                        ).split(
                            "T"
                        )[0]
                        if m.get("date")
                        else ""
                    )
                )

                if (
                    not home_name
                    or
                    not away_name
                    or
                    not date_str
                ):
                    continue

                zk_match_id = (
                    generate_zk_match_id(
                        date_str,
                        home_name,
                        away_name
                    )
                )

                home_score = (
                    m.get(
                        "homeScore",
                        0
                    )
                    or 0
                )

                away_score = (
                    m.get(
                        "awayScore",
                        0
                    )
                    or 0
                )

                league = (
                    m.get(
                        "leagueName"
                    )
                    or
                    m.get(
                        "league",
                        {}
                    ).get(
                        "name",
                        "Unknown"
                    )
                )

                json_updates[
                    zk_match_id
                ] = {

                    "home_name":
                        home_name,

                    "away_name":
                        away_name,

                    "date_str":
                        date_str,

                    "home_score":
                        home_score,

                    "away_score":
                        away_score,

                    "league":
                        league
                }

        except Exception as error:

            print(
                f"   WARNING: Error reading "
                f"{os.path.basename(filepath)}: "
                f"{error}"
            )

    print(
        f"   ↳ Found "
        f"{len(json_updates):,} "
        f"live results to process."
    )

    # ========================================================
    # 2/3
    # ACTIVE FINAL MASTER
    # ========================================================

    print()
    print(
        "[2/3] Processing ACTIVE FINAL "
        "ZOKASCORE_PUBLIC_MASTER.csv..."
    )

    (
        raw_updated,
        raw_appended,
        raw_total,
        backup_file
    ) = process_csv_memory_safe(
        RAW_MASTER_CSV,
        json_updates,
        make_backup=True
    )

    print(
        f"   ↳ Existing IDs processed: "
        f"{raw_total:,}"
    )

    print(
        f"   ↳ Updated scores: "
        f"{raw_updated:,}"
    )

    print(
        f"   ↳ Appended new matches: "
        f"{raw_appended:,}"
    )

    # ========================================================
    # 3/3
    # ELO MASTER
    # ========================================================

    print()
    print(
        "[3/3] Processing Elo Master CSV..."
    )

    if not os.path.exists(
        MASTER_CSV
    ):

        print(
            "   WARNING: Elo master does not exist."
        )

        elo_updated = 0
        elo_appended = 0
        elo_total = 0

    else:

        (
            elo_updated,
            elo_appended,
            elo_total,
            _
        ) = process_csv_memory_safe(
            MASTER_CSV,
            json_updates,
            make_backup=False
        )

        print(
            f"   ↳ Existing IDs processed: "
            f"{elo_total:,}"
        )

        print(
            f"   ↳ Updated scores: "
            f"{elo_updated:,}"
        )

        print(
            f"   ↳ Appended new matches: "
            f"{elo_appended:,}"
        )

    # ========================================================
    # RESULT
    # ========================================================

    print()
    print("=" * 60)
    print(
        "SYNC COMPLETE"
    )
    print("=" * 60)

    print()
    print(
        "ACTIVE FINAL MASTER"
    )

    print(
        f"   Updated scores: "
        f"{raw_updated:,}"
    )

    print(
        f"   Appended matches: "
        f"{raw_appended:,}"
    )

    print()
    print(
        "ELO MASTER"
    )

    print(
        f"   Updated scores: "
        f"{elo_updated:,}"
    )

    print(
        f"   Appended matches: "
        f"{elo_appended:,}"
    )

    print()
    print(
        "Backup:"
    )

    print(
        f"   {backup_file}"
    )

    print()
    print(
        "ACTIVE MASTER:"
    )

    print(
        f"   {RAW_MASTER_CSV}"
    )

    print()
    print(
        "Authoritative canonical master was NOT modified."
    )

    print()
    print(
        "Run Step 32 to recalculate Elo for newly appended "
        "historical matches."
    )

    print("=" * 60)


if __name__ == "__main__":
    run()