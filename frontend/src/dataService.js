// dataService.js
// Fetches CSV files from S3 via the csvReader Lambda API endpoint.

const IS_DEV_SERVER = window.location.hostname === "localhost"
  && window.location.port === "3000";

const API_GW_BASE = process.env.REACT_APP_API_GW_URL || "";
const DATA_BASE   = IS_DEV_SERVER ? "/data" : `${API_GW_BASE}/data`;

async function fetchCSV(endpoint) {
  const url  = `${DATA_BASE}/${endpoint}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  }
  return resp.text();
}

export async function loadDemographics() {
  return fetchCSV("demographics");
}

export async function loadSymptomScores() {
  return fetchCSV("scores");
}

export async function loadEnvHistory() {
  return fetchCSV("env-history");
}