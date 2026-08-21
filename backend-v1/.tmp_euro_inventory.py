import pandas as pd
import os
import json

BASE = "data/source/Historical-Excel-Data"

files = [
    os.path.join(BASE, f)
    for f in os.listdir(BASE)
    if f.lower().startswith("all-euro-data-")
    and f.lower().endswith((".xls", ".xlsx"))
]

files.sort()

print("=" * 90)
print("ZOKASCORE EURO SOURCE FORENSIC INVENTORY")
print("=" * 90)
print(f"Files found: {len(files)}")

inventory = []

for f in files:
    name = os.path.basename(f)

    print("\n" + "=" * 90)
    print(name)
    print("=" * 90)

    try:
        xl = pd.ExcelFile(f)

        print("Format :", os.path.splitext(f)[1])
        print("Sheets :", len(xl.sheet_names))
        print("Names  :", ", ".join(xl.sheet_names))

        file_rows = 0
        valid_rows = 0
        invalid_rows = 0
        sheet_info = []

        global_min_date = None
        global_max_date = None

        for sheet in xl.sheet_names:
            try:
                df = pd.read_excel(f, sheet_name=sheet)

                rows = len(df)
                file_rows += rows

                required = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]

                missing = [c for c in required if c not in df.columns]

                if missing:
                    print(f"\n  {sheet}: {rows:,} rows | MISSING {missing}")
                    continue

                valid_mask = (
                    df["Date"].notna()
                    & df["HomeTeam"].notna()
                    & df["AwayTeam"].notna()
                    & df["FTHG"].notna()
                    & df["FTAG"].notna()
                    & df["FTR"].notna()
                )

                sheet_valid = int(valid_mask.sum())
                sheet_invalid = rows - sheet_valid

                valid_rows += sheet_valid
                invalid_rows += sheet_invalid

                dates = pd.to_datetime(df["Date"], errors="coerce")

                sheet_min = dates.min()
                sheet_max = dates.max()

                if pd.notna(sheet_min):
                    if global_min_date is None or sheet_min < global_min_date:
                        global_min_date = sheet_min

                if pd.notna(sheet_max):
                    if global_max_date is None or sheet_max > global_max_date:
                        global_max_date = sheet_max

                teams = set(
                    df.loc[valid_mask, "HomeTeam"].astype(str).str.strip()
                )
                teams.update(
                    df.loc[valid_mask, "AwayTeam"].astype(str).str.strip()
                )

                print(
                    f"  {sheet:<5} "
                    f"rows={rows:>7,} "
                    f"valid={sheet_valid:>7,} "
                    f"invalid={sheet_invalid:>5,} "
                    f"teams={len(teams):>4,} "
                    f"dates={sheet_min.date() if pd.notna(sheet_min) else 'NONE'} "
                    f"-> {sheet_max.date() if pd.notna(sheet_max) else 'NONE'}"
                )

                sheet_info.append({
                    "sheet": sheet,
                    "rows": rows,
                    "valid_rows": sheet_valid,
                    "invalid_rows": sheet_invalid,
                    "teams": len(teams),
                    "min_date": str(sheet_min.date()) if pd.notna(sheet_min) else None,
                    "max_date": str(sheet_max.date()) if pd.notna(sheet_max) else None,
                    "columns": list(df.columns),
                })

            except Exception as e:
                print(f"  {sheet}: ERROR -> {e}")

        print("\nFILE TOTAL")
        print(f"  Rows        : {file_rows:,}")
        print(f"  Valid       : {valid_rows:,}")
        print(f"  Invalid     : {invalid_rows:,}")
        print(f"  Date range  : {global_min_date.date() if global_min_date is not None else 'NONE'} -> {global_max_date.date() if global_max_date is not None else 'NONE'}")

        inventory.append({
            "file": name,
            "extension": os.path.splitext(f)[1],
            "sheets": len(xl.sheet_names),
            "rows": file_rows,
            "valid_rows": valid_rows,
            "invalid_rows": invalid_rows,
            "min_date": str(global_min_date.date()) if global_min_date is not None else None,
            "max_date": str(global_max_date.date()) if global_max_date is not None else None,
            "sheet_info": sheet_info,
        })

    except Exception as e:
        print(f"FILE ERROR: {e}")

print("\n" + "=" * 90)
print("FINAL SUMMARY")
print("=" * 90)

total_rows = sum(x["rows"] for x in inventory)
total_valid = sum(x["valid_rows"] for x in inventory)
total_invalid = sum(x["invalid_rows"] for x in inventory)

print(f"Files          : {len(inventory):,}")
print(f"Total rows     : {total_rows:,}")
print(f"Valid matches  : {total_valid:,}")
print(f"Invalid rows   : {total_invalid:,}")

out = os.path.join(BASE, "_euro_source_inventory.json")

with open(out, "w", encoding="utf-8") as fh:
    json.dump(inventory, fh, indent=2, ensure_ascii=False)

print("\nInventory written to:")
print(out)
print("\nREAD-ONLY AUDIT COMPLETE")
