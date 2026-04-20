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

// Route env API calls through the nginx proxy to avoid CORS.
// The proxy is always available when served via Docker/nginx.
// Only fall back to direct URLs when running via npm start (webpack dev server on :3000).
const IS_DEV_SERVER = window.location.hostname === "localhost"
  && window.location.port === "3000"
  && !window.location.pathname.startsWith("/api");

export const ENV_API = {
  psi:     IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/psi"              : "/api/env/psi",
  pm25:    IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/pm25"             : "/api/env/pm25",
  airTemp: IS_DEV_SERVER ? "https://api-open.data.gov.sg/v2/real-time/api/air-temperature"  : "/api/env/air-temperature",
};

export const ENV_POLL_INTERVAL_MS = 300000; // 5 minutes

export const SEVERITY_COLORS = {
  low:      "#059669",
  moderate: "#d97706",
  high:     "#b91c1c",
};

export const DEMO_CLUSTERS = [
  { lat: 1.35, lng: 103.75, weight: 0.35 },
  { lat: 1.38, lng: 103.78, weight: 0.25 },
  { lat: 1.32, lng: 103.85, weight: 0.15 },
  { lat: 1.30, lng: 103.80, weight: 0.10 },
  { lat: 1.35, lng: 103.90, weight: 0.08 },
  { lat: 1.40, lng: 103.85, weight: 0.07 },
];

export const SYMPTOM_LIST = [
  "cough",
  "wheeze",
  "breathlessness",
  "chest_tightness",
  "rhinitis",
];