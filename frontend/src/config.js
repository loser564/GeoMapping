// config.js
// Central configuration for the SG Patient Geo-Mapping application.
// All magic numbers, coordinates, and API endpoints live here.

export const SG_CENTER = { lat: 1.3521, lng: 103.8198 };

export const SG_BOUNDS = {
  latMin: 1.22,
  latMax: 1.47,
  lngMin: 103.6,
  lngMax: 104.05,
};

export const SG_OUTLINE = [
  [1.26, 103.65], [1.26, 103.99], [1.22, 103.99], [1.22, 104.04],
  [1.33, 104.04], [1.40, 103.98], [1.45, 103.83], [1.44, 103.70],
  [1.40, 103.65], [1.35, 103.62], [1.26, 103.65],
];

export const REGIONS = {
  north:   { lat: 1.4180, lng: 103.8200, label: "North" },
  south:   { lat: 1.2700, lng: 103.8200, label: "South" },
  east:    { lat: 1.3500, lng: 103.9400, label: "East" },
  west:    { lat: 1.3500, lng: 103.7000, label: "West" },
  central: { lat: 1.3521, lng: 103.8198, label: "Central" },
};

// Read API Gateway base URL from .env (REACT_APP_API_GW_URL)
// Set in frontend/.env:
//   REACT_APP_API_GW_URL=https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/dev
const API_GW_BASE = process.env.REACT_APP_API_GW_URL || "";

// When running locally via npm start, call data.gov.sg directly.
// When deployed (Amplify / Docker), route through API Gateway / nginx proxy.
const IS_DEV_SERVER = window.location.hostname === "localhost"
  && window.location.port === "3000";

export const ENV_API = {
  psi:      IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/psi"              : `${API_GW_BASE}/env/psi`,
  pm25:     IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/pm25"             : `${API_GW_BASE}/env/pm25`,
  airTemp:  IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/air-temperature"  : `${API_GW_BASE}/env/air-temp`,
  humidity: IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/relative-humidity": `${API_GW_BASE}/env/humidity`,
};

export const ENV_POLL_INTERVAL_MS = 300000; // 5 minutes

export const SEVERITY_COLORS = {
  low:      "#059669",
  moderate: "#d97706",
  high:     "#b91c1c",
};

export const SYMPTOM_LIST = [
  "cough",
  "wheeze",
  "breathlessness",
  "chest_tightness",
  "rhinitis",
];