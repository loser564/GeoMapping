"""
fill_missing_coords.py

For rows where postal_full / lat / lng / address_resolved are missing (NA),
randomly borrows a valid coordinate set from another row in the same file.

Usage:
    python fill_missing_coords.py
    python fill_missing_coords.py -i data/geocoded.csv -o data/geocoded_filled.csv
"""

import csv
import random
import logging
import argparse
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

FILL_COLS = ["postal_full", "lat", "lng", "address_resolved"]
NA_VALUES = {"", "na", "nan", "none", "null", "n/a"}


def _is_valid_coord(value: str) -> bool:
    try:
        return float(str(value).strip()) != 0.0
    except ValueError:
        return False


def is_missing(value: str) -> bool:
    cleaned = str(value).strip().lower()
    if cleaned in NA_VALUES:
        return True
    # Catch numeric zero values for lat/lng
    try:
        return float(cleaned) == 0.0
    except ValueError:
        return False


def row_is_complete(row: dict) -> bool:
    for col in FILL_COLS:
        val = row.get(col, "")
        if is_missing(val):
            return False
        # Extra check: lat/lng must parse as non-zero floats
        if col in ("lat", "lng"):
            try:
                if float(str(val).strip()) == 0.0:
                    return False
            except ValueError:
                return False
    return True


def fill_missing(input_path: str, output_path: str) -> None:
    with open(input_path, "r", newline="", encoding="utf-8-sig") as f:
        # quoting=csv.QUOTE_ALL handles fields like comorbidities
        # that contain commas within quoted strings
        reader = csv.DictReader(f, quoting=csv.QUOTE_MINIMAL)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    log.info("Loaded %d rows from %s", len(rows), input_path)

    # Check all fill columns exist
    missing_cols = [c for c in FILL_COLS if c not in fieldnames]
    if missing_cols:
        log.error(
            "Missing expected columns: %s. "
            "Run postal_geocoder.py first to generate these columns.",
            ", ".join(missing_cols),
        )
        return

    # Build pool of donor rows (rows with complete coordinates)
    donor_pool = [row for row in rows if row_is_complete(row)]

    if not donor_pool:
        log.error("No rows with complete coordinates found. Cannot fill anything.")
        return

    log.info("Donor pool: %d rows with complete coordinates", len(donor_pool))

    # Identify rows that need filling
    missing_rows = [i for i, row in enumerate(rows) if not row_is_complete(row)]
    log.info("Rows needing fill: %d", len(missing_rows))

    # Show which columns are bad for the first 10 missing rows
    for i in missing_rows[:10]:
        bad = {
            col: rows[i].get(col, "") for col in FILL_COLS
            if is_missing(rows[i].get(col, ""))
            or (col in ("lat", "lng") and not _is_valid_coord(rows[i].get(col, "")))
        }
        log.debug("Row %d bad columns: %s", i + 2, bad)  # +2 for 1-index + header

    if not missing_rows:
        log.info("No missing values found. Nothing to do.")
        return

    # Fill each missing row from a random donor
    for i in missing_rows:
        donor = random.choice(donor_pool)
        for col in FILL_COLS:
            rows[i][col] = donor[col]

    # Write output
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    log.info("Filled %d rows. Output written to %s", len(missing_rows), output_path)


def main():
    parser = argparse.ArgumentParser(
        description="Fill missing lat/lng/postal rows by sampling from valid rows "
                    "in the same file.",
    )
    parser.add_argument("--input",  "-i", default=None)
    parser.add_argument("--output", "-o", default=None)
    args = parser.parse_args()

    if not args.input:
        args.input = input("Enter input CSV file path: ").strip().strip("'\"")

    if not args.input or not Path(args.input).is_file():
        log.error("Input file not found: %s", args.input)
        return

    if not args.output:
        default = str(Path(args.input).with_stem(Path(args.input).stem + "_filled"))
        args.output = input(
            f"Enter output CSV file path [{default}]: "
        ).strip().strip("'\"") or default

    fill_missing(args.input, args.output)


if __name__ == "__main__":
    # Hardcoded paths for direct execution
    IN_DOCKER = Path("/data").exists() and __import__("os").environ.get("IN_DOCKER") == "1"
    DATA_DIR  = Path("/data") if IN_DOCKER else Path(__file__).resolve().parent.parent / "data"

    fill_missing(
        input_path=str(DATA_DIR / "NTF_deidentified_demographics_geocoded.csv"),
        output_path=str(DATA_DIR / "NTF_deidentified_demographics_filled.csv"),
    )