// envHistory.js
// Fetches historical PSI and PM2.5 readings from Data.gov.sg for a given date.
// Used by the timeline slider to show environmental conditions at a point in time.
//
// Endpoint: GET /api/env/psi?date=YYYY-MM-DD
// Returns readings for every hour of that day.

const ENV_BASE = "/api/env";

// Cache to avoid re-fetching the same date
const _cache = new Map();

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function regionAvg(obj) {
  if (!obj) return null;
  const vals = Object.values(obj).filter(v => v != null && typeof v === "number");
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function regionMax(obj) {
  if (!obj) return null;
  const vals = Object.values(obj).filter(v => v != null && typeof v === "number");
  if (!vals.length) return null;
  return Math.max(...vals);
}

// Returns array of { timestamp, psi, pm25, o3, co, so2, no2, regional }
// one entry per reading in the day
export async function fetchDayReadings(date) {
  const dateStr = formatDate(date);
  if (_cache.has(dateStr)) return _cache.get(dateStr);

  try {
    const [psiRes, pm25Res] = await Promise.all([
      fetch(`${ENV_BASE}/psi?date=${dateStr}`).then(r => r.json()).catch(() => null),
      fetch(`${ENV_BASE}/pm25?date=${dateStr}`).then(r => r.json()).catch(() => null),
    ]);

    const psiItems  = psiRes?.data?.items  ?? [];
    const pm25Items = pm25Res?.data?.items ?? [];

    // Build a map from timestamp -> pm25 readings
    const pm25Map = new Map();
    for (const item of pm25Items) {
      pm25Map.set(item.timestamp, item.readings?.pm25_one_hourly ?? null);
    }

    const readings = psiItems.map(item => {
      const r    = item.readings ?? {};
      const pm25 = pm25Map.get(item.timestamp) ?? r.pm25_twenty_four_hourly ?? null;
      return {
        timestamp: new Date(item.timestamp),
        psi:  regionMax(r.psi_twenty_four_hourly),
        pm25: regionMax(pm25),
        o3:   regionAvg(r.o3_sub_index),
        co:   regionAvg(r.co_sub_index),
        so2:  regionAvg(r.so2_sub_index),
        no2:  regionAvg(r.no2_one_hour_max),
        regional: {
          psi:  r.psi_twenty_four_hourly  ?? {},
          pm25: pm25 ?? {},
        },
      };
    });

    _cache.set(dateStr, readings);
    return readings;
  } catch (err) {
    console.error("fetchDayReadings failed:", err);
    return [];
  }
}

// Given a target Date, find the closest reading from a list
export function closestReading(readings, target) {
  if (!readings.length) return null;
  return readings.reduce((best, r) => {
    const diff     = Math.abs(r.timestamp - target);
    const bestDiff = Math.abs(best.timestamp - target);
    return diff < bestDiff ? r : best;
  });
}

// Build the full date range covered by the symptom score data
export function buildDateRange(patients) {
  const dates = patients
    .map(p => p.scoreDate ? new Date(p.scoreDate) : null)
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!dates.length) return null;
  return { min: dates[0], max: dates[dates.length - 1] };
}