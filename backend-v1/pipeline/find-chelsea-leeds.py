import os
import glob
import pandas as pd

CSV_DIR = r"C:\Users\COISA COMPUTERS\OneDrive\Desktop\Apk\footballprediction\backend-v1\data\source\Historical-Excel-Data\data"

print("=" * 80)
print("CHELSEA vs LEEDS — DOWNLOADED CSV SEARCH")
print("=" * 80)

found = []

for file in sorted(glob.glob(os.path.join(CSV_DIR, "*.csv"))):

    try:
        df = pd.read_csv(file, low_memory=False)
    except Exception as e:
        print(f"Could not read {os.path.basename(file)}: {e}")
        continue

    required = {"Date", "HomeTeam", "AwayTeam"}

    if not required.issubset(df.columns):
        continue

    matches = df[
        df["HomeTeam"].astype(str).str.strip().str.lower().eq("chelsea")
        &
        df["AwayTeam"].astype(str).str.strip().str.lower().eq("leeds")
    ]

    for _, row in matches.iterrows():

        found.append({
            "file": os.path.basename(file),
            "division": row.get("Div", ""),
            "date": row.get("Date", ""),
            "time": row.get("Time", ""),
            "home": row.get("HomeTeam", ""),
            "away": row.get("AwayTeam", ""),
            "home_score": row.get("FTHG", ""),
            "away_score": row.get("FTAG", ""),
            "result": row.get("FTR", ""),
        })


print(f"\nFound {len(found)} Chelsea vs Leeds match(es).\n")

for match in found:
    print("-" * 80)
    print(f"File       : {match['file']}")
    print(f"Division   : {match['division']}")
    print(f"Date       : {match['date']}")
    print(f"Time       : {match['time']}")
    print(f"Home       : {match['home']}")
    print(f"Away       : {match['away']}")
    print(f"Score      : {match['home_score']} - {match['away_score']}")
    print(f"Result     : {match['result']}")

print("\n" + "=" * 80)
print("SEARCH COMPLETE")
print("=" * 80)