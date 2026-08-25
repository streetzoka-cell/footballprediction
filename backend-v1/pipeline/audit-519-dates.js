import os
import glob
import pandas as pd
from collections import defaultdict

# ============================================================
# CONFIG
# ============================================================

MASTER_FILE = r"C:\Users\COISA COMPUTERS\OneDrive\Desktop\Apk\footballprediction\backend-v1\data\source\ZOKASCORE_FINAL\ZOKASCORE_PUBLIC_MASTER.csv"

NEW_CSV_DIR = r"C:\Users\COISA COMPUTERS\OneDrive\Desktop\Apk\footballprediction\backend-v1\data\source\Historical-Excel-Data\data"

OUTPUT_FILE = r"C:\Users\COISA COMPUTERS\OneDrive\Desktop\Apk\footballprediction\backend-v1\data\source\ZOKASCORE_FINAL\audit_519_dates.csv"

# If your 519 matches are a specific season, change this.
# Leave None to automatically use all master matches found
# in the downloaded CSVs.
TARGET_SEASON = None


# ============================================================
# HELPERS
# ============================================================

def clean_team(name):
    if pd.isna(name):
        return ""

    name = str(name).strip().lower()

    # Basic normalization only.
    # We are NOT changing identities here.
    replacements = {
        "man utd": "manchester united",
        "man united": "manchester united",
        "man city": "manchester city",
        "spurs": "tottenham",
        "sheffield weds": "sheffield wednesday",
    }

    return replacements.get(name, name)


def clean_date(value):
    if pd.isna(value):
        return None

    dt = pd.to_datetime(value, dayfirst=True, errors="coerce")

    if pd.isna(dt):
        return None

    return dt.date()


# ============================================================
# LOAD MASTER
# ============================================================

print("=" * 80)
print("ZOKASCORE 519-MATCH DATE FORENSIC AUDIT")
print("=" * 80)

print("\nLoading master:")
print(MASTER_FILE)

master = pd.read_csv(
    MASTER_FILE,
    low_memory=False
)

print(f"Master rows: {len(master):,}")


required_master = [
    "zokascore_match_id",
    "date",
    "home_team",
    "away_team",
]

missing = [c for c in required_master if c not in master.columns]

if missing:
    raise RuntimeError(
        f"Master is missing required columns: {missing}"
    )


# ============================================================
# LOAD NEW CSV FILES
# ============================================================

csv_files = sorted(
    glob.glob(os.path.join(NEW_CSV_DIR, "*.csv"))
)

print(f"\nNew CSV files found: {len(csv_files)}")

if not csv_files:
    raise RuntimeError("No CSV files found.")


new_rows = []

for file in csv_files:

    filename = os.path.basename(file)

    try:
        df = pd.read_csv(
            file,
            low_memory=False
        )
    except Exception as e:
        print(f"WARNING: Could not read {filename}: {e}")
        continue

    required = [
        "Div",
        "Date",
        "HomeTeam",
        "AwayTeam",
        "FTHG",
        "FTAG",
    ]

    missing = [c for c in required if c not in df.columns]

    if missing:
        print(
            f"Skipping {filename} - missing columns: {missing}"
        )
        continue

    for _, row in df.iterrows():

        home = clean_team(row["HomeTeam"])
        away = clean_team(row["AwayTeam"])
        date = clean_date(row["Date"])

        if not home or not away or date is None:
            continue

        new_rows.append({
            "source_file": filename,
            "division": row["Div"],
            "date": date,
            "home_team": home,
            "away_team": away,
            "home_goals": row["FTHG"],
            "away_goals": row["FTAG"],
        })


new = pd.DataFrame(new_rows)

print(f"Downloaded CSV match rows: {len(new):,}")


# ============================================================
# BUILD LOOKUP
# ============================================================

lookup = defaultdict(list)

for _, row in new.iterrows():

    key = (
        row["home_team"],
        row["away_team"],
    )

    lookup[key].append(row.to_dict())


# ============================================================
# SELECT MASTER MATCHES
# ============================================================

master["master_date"] = master["date"].apply(clean_date)

master["home_clean"] = master["home_team"].apply(clean_team)
master["away_clean"] = master["away_team"].apply(clean_team)

if TARGET_SEASON is not None and "season" in master.columns:

    target = master[
        master["season"].astype(str) == str(TARGET_SEASON)
    ].copy()

else:

    target = master.copy()


print(f"\nMaster matches selected: {len(target):,}")


# ============================================================
# SEARCH EVERY MASTER MATCH
# ============================================================

results = []

for _, row in target.iterrows():

    home = row["home_clean"]
    away = row["away_clean"]

    key = (home, away)

    candidates = lookup.get(key, [])

    if not candidates:

        results.append({
            "zokascore_match_id": row["zokascore_match_id"],
            "master_date": row["master_date"],
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "season": row.get("season", ""),
            "status": "NOT_FOUND",
            "source_file": "",
            "csv_date": "",
            "date_difference_days": "",
            "master_home_score": row.get("home_score", ""),
            "master_away_score": row.get("away_score", ""),
            "csv_home_score": "",
            "csv_away_score": "",
        })

        continue


    # --------------------------------------------------------
    # If multiple records exist for the same teams,
    # try to identify the correct one using score.
    # --------------------------------------------------------

    master_home_score = row.get("home_score", "")
    master_away_score = row.get("away_score", "")

    selected = candidates[0]

    for candidate in candidates:

        try:
            if (
                float(candidate["home_goals"]) == float(master_home_score)
                and
                float(candidate["away_goals"]) == float(master_away_score)
            ):
                selected = candidate
                break
        except:
            pass


    csv_date = selected["date"]

    difference = None

    if row["master_date"] is not None and csv_date is not None:
        difference = (
            row["master_date"] - csv_date
        ).days


    if difference == 0:
        status = "DATE_MATCH"
    else:
        status = "DATE_DIFFERENCE"


    results.append({
        "zokascore_match_id": row["zokascore_match_id"],
        "master_date": row["master_date"],
        "home_team": row["home_team"],
        "away_team": row["away_team"],
        "season": row.get("season", ""),
        "status": status,
        "source_file": selected["source_file"],
        "csv_date": csv_date,
        "date_difference_days": difference,
        "master_home_score": master_home_score,
        "master_away_score": master_away_score,
        "csv_home_score": selected["home_goals"],
        "csv_away_score": selected["away_goals"],
    })


# ============================================================
# SAVE FULL AUDIT
# ============================================================

audit = pd.DataFrame(results)

audit.to_csv(
    OUTPUT_FILE,
    index=False
)


# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 80)
print("AUDIT SUMMARY")
print("=" * 80)

print(f"Matches checked:     {len(audit):,}")

print(
    f"Date matches:        "
    f"{(audit['status'] == 'DATE_MATCH').sum():,}"
)

print(
    f"Date differences:    "
    f"{(audit['status'] == 'DATE_DIFFERENCE').sum():,}"
)

print(
    f"Not found:           "
    f"{(audit['status'] == 'NOT_FOUND').sum():,}"
)


# ============================================================
# DATE DIFFERENCE DISTRIBUTION
# ============================================================

differences = audit[
    audit["status"] == "DATE_DIFFERENCE"
]["date_difference_days"]

if len(differences):

    print("\nDATE DIFFERENCE DISTRIBUTION")
    print("-" * 50)

    print(
        differences.value_counts()
        .sort_index()
        .to_string()
    )

    print("\nMost common difference:")

    print(
        differences.value_counts()
        .head(10)
        .to_string()
    )


# ============================================================
# CHELSEA vs LEEDS
# ============================================================

print("\n" + "=" * 80)
print("CHELSEA vs LEEDS")
print("=" * 80)

chelsea = audit[
    (
        audit["home_team"].str.lower() == "chelsea"
    )
    &
    (
        audit["away_team"].str.lower() == "leeds"
    )
]

if len(chelsea):

    print(
        chelsea[
            [
                "zokascore_match_id",
                "master_date",
                "csv_date",
                "date_difference_days",
                "status",
                "source_file",
                "master_home_score",
                "master_away_score",
                "csv_home_score",
                "csv_away_score",
            ]
        ].to_string(index=False)
    )

else:

    print("Chelsea vs Leeds was NOT found.")


# ============================================================
# SHOW DATE DIFFERENCES
# ============================================================

print("\n" + "=" * 80)
print("DATE DIFFERENCES")
print("=" * 80)

different = audit[
    audit["status"] == "DATE_DIFFERENCE"
].copy()

if len(different):

    print(
        different[
            [
                "master_date",
                "csv_date",
                "date_difference_days",
                "home_team",
                "away_team",
                "season",
                "source_file",
            ]
        ]
        .sort_values("date_difference_days")
        .to_string(index=False)
    )

else:

    print("No date differences found.")


print("\n" + "=" * 80)
print("AUDIT COMPLETE")
print("=" * 80)

print(f"\nFull audit saved to:")

print(OUTPUT_FILE)

print("\nMASTER WAS NOT MODIFIED.")