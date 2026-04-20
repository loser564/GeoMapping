"""
postal_geocoder.py

Given a 3-digit de-identified postal prefix (e.g. "760"),
queries the OneMap API to find all valid 6-digit postal codes
that start with those digits, then randomly picks one.
Returns the full postal code + lat/lng coordinates.

Usage:
    python postal_geocoder.py

Requires ONEMAP_EMAIL and ONEMAP_PASSWORD environment variables
(free registration at https://www.onemap.gov.sg/apidocs/register).
"""

import os
import csv
import time
import random
import logging
from typing import Optional
from dotenv import load_dotenv
load_dotenv()

import requests

import json
from pathlib import Path

CACHE_FILE = Path("onemap_prefix_cache.json")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
ONEMAP_AUTH_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"


def get_auth_token(strict: bool = True) -> Optional[str]:
    """Obtain an auth token. If strict, raise if credentials missing/invalid."""
    email = os.environ.get("ONEMAP_EMAIL")
    password = os.environ.get("ONEMAP_PASSWORD")
    if not email or not password:
        msg = "ONEMAP_EMAIL / ONEMAP_PASSWORD env vars not set."
        if strict:
            raise RuntimeError(msg + " Register at onemap.gov.sg/apidocs/register")
        log.warning(msg)
        return None

    resp = requests.post(
        ONEMAP_AUTH_URL,
        json={"email": email, "password": password},
        timeout=10,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError(f"No access_token in auth response: {resp.json()}")
    log.info("Authenticated with OneMap.")
    return token


def search_onemap(query: str, token: str, page: int = 1) -> dict:
    resp = requests.get(
        ONEMAP_SEARCH_URL,
        params={
            "searchVal": query,
            "returnGeom": "Y",
            "getAddrDetails": "Y",
            "pageNum": page,
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _load_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text())
    return {}


def _save_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, indent=2))


def find_valid_postals_for_prefix(
    prefix: str,
    token: str,
    target_count: int = 10,
    max_probes: int = 100,
    delay: float = 0.15,
) -> list[dict]:
    """
    Probe the 1000-suffix space for a 3-digit prefix by querying OneMap
    with full 6-digit candidates. Stop once target_count valid postals
    are found or max_probes is reached.

    Uses a stride pattern (every 10th suffix, offset 5) to sample evenly:
    005, 015, 025, ..., then fills gaps if needed.
    """
    prefix = str(prefix).strip().zfill(3)
    results = []
    seen_postals = set()

    # Generate probe order: stride-10 first (5, 15, 25, ... 995),
    # then fill in the other positions if we need more.
    stride_probes = list(range(5, 1000, 10))
    fill_probes = [s for s in range(1000) if s not in set(stride_probes)]
    random.shuffle(fill_probes)
    probe_order = stride_probes + fill_probes

    for i, suffix in enumerate(probe_order[:max_probes]):
        candidate = f"{prefix}{suffix:03d}"
        try:
            data = search_onemap(candidate, token=token, page=1)
        except requests.RequestException as e:
            log.debug("Probe %s failed: %s", candidate, e)
            time.sleep(delay)
            continue

        for r in data.get("results", []):
            postal = r.get("POSTAL", "")
            if (
                postal == candidate
                and postal not in seen_postals
            ):
                try:
                    lat = float(r.get("LATITUDE", 0))
                    lng = float(r.get("LONGITUDE", 0))
                except (TypeError, ValueError):
                    continue
                if lat > 0 and lng > 0:
                    seen_postals.add(postal)
                    results.append({
                        "postal": postal,
                        "lat": lat,
                        "lng": lng,
                        "address": r.get("ADDRESS", ""),
                        "building": r.get("BUILDING", ""),
                        "block": r.get("BLK_NO", ""),
                        "road": r.get("ROAD_NAME", ""),
                    })
                    break  # one match per probe is enough

        time.sleep(delay)

        if len(results) >= target_count:
            break

    return results


_prefix_cache: dict[str, list[dict]] = {}


def complete_postal(prefix: str, token: str) -> Optional[dict]:
    prefix = str(prefix).strip().zfill(3)
    if prefix not in _prefix_cache:
        _prefix_cache[prefix] = find_valid_postals_for_prefix(prefix, token=token)
    candidates = _prefix_cache[prefix]
    if not candidates:
        return None
    return random.choice(candidates)


def process_csv(
    input_path: str,
    output_path: str,
    postal_col: str = "postal_deidentified",
    delay: float = 0.15,
) -> None:
    token = get_auth_token(strict=True)

    # Load persistent cache from previous runs
    global _prefix_cache
    _prefix_cache = _load_cache()
    log.info("Loaded %d cached prefixes from disk", len(_prefix_cache))

    with open(input_path, "r", newline="", encoding="utf-8") as fin:
        reader = csv.DictReader(fin)
        fieldnames = list(reader.fieldnames or [])
        for col in ["postal_full", "lat", "lng", "address_resolved"]:
            if col not in fieldnames:
                fieldnames.append(col)
        rows = list(reader)

    log.info("Loaded %d rows from %s", len(rows), input_path)

    unique_prefixes = {
        str(row.get(postal_col, "")).strip().zfill(3)
        for row in rows
        if str(row.get(postal_col, "")).strip()
    }
    log.info("Found %d unique postal prefixes", len(unique_prefixes))

    to_fetch = sorted(p for p in unique_prefixes if p not in _prefix_cache)
    log.info("Need to fetch %d new prefixes", len(to_fetch))

    for i, prefix in enumerate(to_fetch, 1):
        candidates = find_valid_postals_for_prefix(
            prefix, token=token, delay=delay,
        )
        _prefix_cache[prefix] = candidates
        log.info(
            "Prefix %s: %d candidates (%d/%d)",
            prefix, len(candidates), i, len(to_fetch),
        )
        # Checkpoint every 10 prefixes
        if i % 10 == 0:
            _save_cache(_prefix_cache)
            log.info("Checkpoint saved.")

    _save_cache(_prefix_cache)

    resolved = failed = 0
    for row in rows:
        prefix = str(row.get(postal_col, "")).strip().zfill(3)
        result = complete_postal(prefix, token=token)
        if result:
            row["postal_full"] = result["postal"]
            row["lat"] = result["lat"]
            row["lng"] = result["lng"]
            row["address_resolved"] = result["address"]
            resolved += 1
        else:
            row["postal_full"] = row["lat"] = row["lng"] = row["address_resolved"] = ""
            failed += 1

    log.info("Resolved: %d, Failed: %d", resolved, failed)

    with open(output_path, "w", newline="", encoding="utf-8") as fout:
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    log.info("Output written to %s", output_path)

if __name__ == "__main__":
    process_csv(
        input_path="data\\TTS_deidentified_demographics.csv",
        output_path="TTS_deidentified_demographics_geocoded.csv",
    )