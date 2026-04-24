"""
scrape_env_history.py

Scrapes weekly environmental readings (PSI, PM2.5, air temperature, humidity)
from Data.gov.sg for each week covered by the patient symptom score data.

Reads the symptom score CSV to determine the date range, then fetches two
readings per week (Monday and Friday of each week) and saves to a CSV.

Usage:
    python scrape_env_history.py
    python scrape_env_history.py -s data/scores.csv -o data/env_history.csv

Data.gov.sg API docs: https://api-open.data.gov.sg/v2/real-time/api/
"""

import os
import csv
import time
import logging
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# API config
# ---------------------------------------------------------------------------

BASE_URL = "https://api-open.data.gov.sg/v2/real-time/api"

ENDPOINTS = {
    "psi":      f"{BASE_URL}/psi",
    "pm25":     f"{BASE_URL}/pm25",
    "air_temp": f"{BASE_URL}/air-temperature",
    "humidity": f"{BASE_URL}/relative-humidity",
}

REGIONS = ["west", "east", "central", "south", "north"]


def get_headers() -> dict:
    key = os.environ.get("DATAGOVSG_API_KEY", "")
    return {"X-Api-Key": key} if key else {}


def fetch(endpoint: str, date_str: str, retries: int = 3, delay: float = 1.0) -> Optional[dict]:
    """Fetch one API endpoint for a given date string (YYYY-MM-DD)."""
    for attempt in range(retries):
        try:
            resp = requests.get(
                endpoint,
                params={"date": date_str},
                headers=get_headers(),
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") != 0:
                log.warning("API error for %s on %s: %s", endpoint, date_str, data.get("errorMsg"))
                return None
            return data
        except requests.RequestException as e:
            log.warning("Attempt %d failed for %s %s: %s", attempt + 1, endpoint, date_str, e)
            time.sleep(delay * (attempt + 1))
    return None


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------

def region_avg(readings_obj: Optional[dict]) -> Optional[float]:
    if not readings_obj:
        return None
    vals = [readings_obj[r] for r in REGIONS if r in readings_obj and readings_obj[r] is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def region_max(readings_obj: Optional[dict]) -> Optional[float]:
    if not readings_obj:
        return None
    vals = [readings_obj[r] for r in REGIONS if r in readings_obj and readings_obj[r] is not None]
    return max(vals) if vals else None


def station_avg(air_data: Optional[dict]) -> Optional[float]:
    """Average temperature or humidity across all weather stations."""
    if not air_data:
        return None
    readings_list = air_data.get("data", {}).get("readings", [])
    if not readings_list:
        return None
    station_vals = [d["value"] for d in readings_list[0].get("data", []) if d.get("value") is not None]
    return round(sum(station_vals) / len(station_vals), 2) if station_vals else None


def pick_midday_item(items: list) -> Optional[dict]:
    """From a list of hourly items for a day, pick the one closest to midday (12:00)."""
    if not items:
        return None
    def hour_of(item):
        ts = item.get("timestamp", "")
        try:
            return abs(datetime.fromisoformat(ts.replace("Z", "+00:00")).hour - 12)
        except Exception:
            return 99
    return min(items, key=hour_of)


# ---------------------------------------------------------------------------
# Date range from score CSV
# ---------------------------------------------------------------------------

def parse_date(raw: str) -> Optional[datetime]:
    raw = raw.strip()
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def get_date_range_from_scores(score_path: str) -> tuple[datetime, datetime]:
    dates = []
    with open(score_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        # Find the date column
        date_col = None
        for col in (reader.fieldnames or []):
            if col.lower() in ("responded_date", "date", "timestamp", "datetime"):
                date_col = col
                break
        if not date_col:
            raise ValueError(f"No date column found. Columns: {reader.fieldnames}")
        for row in reader:
            d = parse_date(row.get(date_col, ""))
            if d:
                dates.append(d)
    if not dates:
        raise ValueError("No valid dates found in score CSV.")
    return min(dates), max(dates)


def week_mondays(start: datetime, end: datetime) -> list[datetime]:
    """Return the Monday of each week between start and end (inclusive)."""
    # Snap start back to its Monday
    current = start - timedelta(days=start.weekday())
    weeks = []
    while current <= end:
        weeks.append(current)
        current += timedelta(weeks=1)
    return weeks

def week_fridays(start: datetime, end: datetime) -> list[datetime]:
    """Return the Friday of each week between start and end (inclusive)."""
    # Snap start back to its Friday
    current = start + timedelta(days=(4 - start.weekday()) % 7)
    weeks = []
    while current <= end:
        weeks.append(current)
        current += timedelta(weeks=1)
    return weeks

# ---------------------------------------------------------------------------
# Main scraping logic
# ---------------------------------------------------------------------------

def scrape_env_history(
    score_path: str,
    output_path: str,
    delay: float = 0.5,
) -> None:
    log.info("Reading date range from %s", score_path)
    start, end = get_date_range_from_scores(score_path)
    log.info("Score date range: %s to %s", start.date(), end.date())

    weeks = week_mondays(start, end)
    weeks += week_fridays(start, end)
    weeks = sorted(set(weeks))  # Remove duplicates if start/end are close
    log.info("Scraping %d weeks of environmental data", len(weeks))

    rows = []
    for i, week_start in enumerate(weeks, 1):
        date_str = week_start.strftime("%Y-%m-%d")
        log.info("Week %d/%d: %s", i, len(weeks), date_str)

        # Fetch all four endpoints for this date
        psi_data      = fetch(ENDPOINTS["psi"],      date_str)
        pm25_data     = fetch(ENDPOINTS["pm25"],     date_str)
        temp_data     = fetch(ENDPOINTS["air_temp"], date_str)
        humidity_data = fetch(ENDPOINTS["humidity"], date_str)

        # Pick midday reading for PSI/PM2.5 (they return hourly items)
        psi_items  = (psi_data  or {}).get("data", {}).get("items", [])
        pm25_items = (pm25_data or {}).get("data", {}).get("items", [])
        psi_item   = pick_midday_item(psi_items)
        pm25_item  = pick_midday_item(pm25_items)

        psi_readings  = (psi_item  or {}).get("readings", {})
        pm25_readings = (pm25_item or {}).get("readings", {})

        row = {
            "week_start":    date_str,
            "week_end":      (week_start + timedelta(days=6)).strftime("%Y-%m-%d"),
            # National aggregates
            "psi_national":  region_max(psi_readings.get("psi_twenty_four_hourly")),
            "pm25_national": region_max(pm25_readings.get("pm25_one_hourly")
                                        or psi_readings.get("pm25_twenty_four_hourly")),
            "o3_national":   region_avg(psi_readings.get("o3_sub_index")),
            "co_national":   region_avg(psi_readings.get("co_sub_index")),
            "so2_national":  region_avg(psi_readings.get("so2_sub_index")),
            "no2_national":  region_avg(psi_readings.get("no2_one_hour_max")),
            "air_temp_avg":  station_avg(temp_data),
            "humidity_avg":  station_avg(humidity_data),
        }

        # Regional breakdowns
        for region in REGIONS:
            row[f"psi_{region}"]  = (psi_readings.get("psi_twenty_four_hourly")  or {}).get(region)
            row[f"pm25_{region}"] = (pm25_readings.get("pm25_one_hourly")
                                     or psi_readings.get("pm25_twenty_four_hourly") or {}).get(region)

        rows.append(row)
        time.sleep(delay)

    if not rows:
        log.error("No data scraped.")
        return

    # Write CSV
    fieldnames = list(rows[0].keys())
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    log.info("Saved %d weeks of env data to %s", len(rows), output_path)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Scrape weekly PSI/PM2.5/air temp/humidity from Data.gov.sg "
                    "for the date range covered by your symptom score data.",
    )
    parser.add_argument("--scores",  "-s", default=None, help="Path to symptom score CSV.")
    parser.add_argument("--output",  "-o", default=None, help="Path to output env history CSV.")
    parser.add_argument("--delay",         default=0.5,  type=float, help="Delay between API calls (seconds).")
    args = parser.parse_args()

    if not args.scores:
        args.scores = input("Enter symptom score CSV path: ").strip().strip("'\"")
    if not Path(args.scores).is_file():
        log.error("Score file not found: %s", args.scores)
        return

    if not args.output:
        default = str(Path(args.scores).with_stem(
            Path(args.scores).stem.replace("_scores", "") + "_env_history"
        ))
        args.output = input(f"Enter output CSV path [{default}]: ").strip().strip("'\"") or default

    scrape_env_history(
        score_path=args.scores,
        output_path=args.output,
        delay=args.delay,
    )


if __name__ == "__main__":
    IN_DOCKER = Path("/data").exists() and os.environ.get("IN_DOCKER") == "1"
    DATA_DIR  = Path("/data") if IN_DOCKER else Path(__file__).resolve().parent.parent / "data"

    ## scrape for ntfgh
    scrape_env_history(
        score_path=str(DATA_DIR / "NTFGH_symptom_score.csv"),
        output_path=str(DATA_DIR / "NTFGH_env_history.csv"),
    )

    ## scrape for ttsh
    scrape_env_history(
        score_path=str(DATA_DIR / "TTSH_symptom_score.csv"),
        output_path=str(DATA_DIR / "TTSH_env_history.csv"),
    )