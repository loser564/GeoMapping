// envService.js
// Fetches real-time environment data from Data.gov.sg v2 APIs.
//
// PSI/PM2.5 response shape:
// { code: 0, data: { items: [{ timestamp, readings: { psi_twenty_four_hourly: { west, east, central, south, north }, ... } }] } }
//
// Air temp response shape:
// { code: 0, data: { stations: [{ id, name, location }], readings: [{ timestamp, data: [{ stationId, value }] }] } }
//
// Note: v2 API has NO national aggregate — we compute it as the average of the 5 regions.

import { ENV_API } from "./config";

const REGIONS = ["west", "east", "central", "south", "north"];

// Compute average of regional values as a national proxy
function regionAvg(regionObj) {
  if (!regionObj) return null;
  const vals = REGIONS.map(r => regionObj[r]).filter(v => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// Compute max of regional values (PSI national = max per NEA convention)
function regionMax(regionObj) {
  if (!regionObj) return null;
  const vals = REGIONS.map(r => regionObj[r]).filter(v => v != null);
  if (!vals.length) return null;
  return Math.max(...vals);
}

// Average air temperature across all stations
function avgAirTemp(airRes) {
  const readings = airRes?.data?.readings?.[0]?.data;
  if (!readings?.length) return null;
  const vals = readings.map(d => d.value).filter(v => v != null);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function getPsiStatus(v) {
  if (v == null) return "loading";
  if (v <= 50)  return "Good";
  if (v <= 100) return "Moderate";
  return "Unhealthy";
}

function getPm25Status(v) {
  if (v == null) return "loading";
  if (v <= 55)  return "Good";
  if (v <= 150) return "Moderate";
  return "Unhealthy";
}

function getSubIndexStatus(v) {
  if (v == null) return "loading";
  if (v <= 50)  return "Good";
  return "Moderate";
}

function getTempStatus(v) {
  if (v == null) return "loading";
  if (v <= 28)  return "Good";
  if (v <= 32)  return "Moderate";
  return "Unhealthy";
}


async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const json = await r.json();
  // data.gov.sg uses code:0 for success
  if (json.code !== 0) throw new Error(`API error: ${json.errorMsg || json.code}`);
  return json;
}

export async function fetchEnvironmentData() {
  try {
    const [psiRes, pm25Res, airTempRes] = await Promise.all([
      fetchJSON(ENV_API.psi),
      fetchJSON(ENV_API.pm25).catch(() => null),
      fetchJSON(ENV_API.airTemp).catch(() => null),
    ]);

    const psiReadings  = psiRes?.data?.items?.[0]?.readings;
    const pm25Readings = pm25Res?.data?.items?.[0]?.readings;

    if (!psiReadings) {
      console.warn("PSI readings missing. Response:", JSON.stringify(psiRes));
      return null;
    }

    const timestamp = psiRes?.data?.items?.[0]?.timestamp ?? new Date().toISOString();

    // Regional breakdowns (direct from API)
    const psiRegional  = psiReadings.psi_twenty_four_hourly  ?? {};
    const pm25Regional = pm25Readings?.pm25_one_hourly        ?? psiReadings.pm25_twenty_four_hourly ?? {};

    // National values: PSI uses max per NEA convention, others use average
    const natPsi  = regionMax(psiRegional);
    const natPm25 = regionMax(pm25Regional);
    const natO3   = regionAvg(psiReadings.o3_sub_index);
    const natCo   = regionAvg(psiReadings.co_sub_index);
    const natSo2  = regionAvg(psiReadings.so2_sub_index);
    const natNo2  = regionAvg(psiReadings.no2_one_hour_max);
    const airTemp = avgAirTemp(airTempRes);

    return {
      psi:     natPsi,
      pm25:    natPm25,
      o3:      natO3,
      co:      natCo,
      so2:     natSo2,
      no2:     natNo2,
      airTemp,
      psiStatus:  getPsiStatus(natPsi),
      pm25Status: getPm25Status(natPm25),
      o3Status:   getSubIndexStatus(natO3),
      coStatus:   getSubIndexStatus(natCo),
      tempStatus: getTempStatus(parseFloat(airTemp)),
      timestamp,
      regional: { psi: psiRegional, pm25: pm25Regional },
      isDemo: false,
    };

  } catch (err) {
    console.error("Environment fetch failed:", err.message);
    return null;
  }
}