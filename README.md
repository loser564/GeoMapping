# GeoMapping-Entenna

A Singapore-focused health geospatial visualization platform that maps patient health outcomes against real-time and historical environmental conditions (air quality, temperature).

## What It Does

- Displays patient locations on an interactive OpenStreetMap heatmap, color-coded by symptom severity
- Filters patients by demographic attributes (age, race, comorbidities, lifestyle, etc.)
- Scrubs through time to see patient data and environmental conditions on specific dates
- Shows real-time and historical PSI, PM2.5, O3, CO, SO2, NO2, and air temperature by Singapore region
- Provides summary analytics: severity distributions, symptom breakdowns, patient counts

## Architecture

### Repository Structure

```
GeoMapping-Entenna/
├── geocoder/          Python geocoding service
├── frontend/          React single-page application
│   ├── amplify/       AWS Amplify backend config & Lambda functions
│   └── Dockerfile     Nginx-served production build (local Docker)
├── data/              De-identified patient CSV files
└── docker-compose.yml Orchestrates geocoder + frontend locally
```

### AWS Architecture (Production)

```
                        ┌─────────────────────────────────┐
                        │         AWS Amplify Hosting      │
                        │   (React SPA, HTTPS, CDN, CI/CD) │
                        └────────────────┬────────────────┘
                                         │
              ┌──────────────────────────▼──────────────────────────┐
              │                  AWS Cognito                         │
              │           (User authentication & login)              │
              └──────────────────────────┬──────────────────────────┘
                                         │
              ┌──────────────────────────▼──────────────────────────┐
              │               API Gateway  (envAPI)                  │
              │         REST endpoints proxied to Lambda             │
              └───┬──────────┬────────────┬──────────┬──────────────┘
                  │          │            │          │
          ┌───────▼──┐ ┌─────▼────┐ ┌────▼───┐ ┌───▼──────┐
          │ envPSI   │ │ envPM25  │ │envTemp │ │envHumid  │   ← Lambda
          │(PSI data)│ │(PM2.5)   │ │(temp)  │ │(humidity)│     functions
          └──────────┘ └──────────┘ └────────┘ └──────────┘
                   (all fetch from Data.gov.sg APIs)

              ┌─────────────────────────────────────────────────────┐
              │               AWS S3  (patientcsv)                   │
              │         Stores de-identified patient CSVs            │
              └──────────────────────┬──────────────────────────────┘
                                     │  on upload
                             ┌───────▼──────────┐
                             │ S3Trigger Lambda  │   reads new CSV,
                             │  + csvReader      │   parses & serves data
                             └───────────────────┘
```

| AWS Service | Purpose |
|-------------|---------|
| **Amplify Hosting** | Hosts the React frontend with CI/CD from `main` branch |
| **Cognito** | User pool for authenticated access to the dashboard |
| **API Gateway (envAPI)** | REST API routing environmental data requests to Lambda |
| **Lambda — envPSI** | Fetches live PSI readings from Data.gov.sg |
| **Lambda — envPM25** | Fetches live PM2.5 readings from Data.gov.sg |
| **Lambda — envTemp** | Fetches live air temperature from Data.gov.sg |
| **Lambda — envHumidity** | Fetches live humidity readings from Data.gov.sg |
| **S3 (patientcsv)** | Stores uploaded patient CSV files securely |
| **Lambda — S3Trigger / csvReader** | Triggered on S3 upload; reads and processes patient CSVs |

## Code Files

### Geocoder (Python)

| File | Description |
|------|-------------|
| `geocoder/postal_geocoder.py` | Converts de-identified 3-digit postal prefixes to lat/lng coordinates using the Singapore OneMap API. Caches results to minimize API calls. Requires `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` environment variables. |
| `geocoder/fill_missing_coords.py` | Fills rows with missing coordinates by borrowing valid lat/lng values from other rows in the same dataset. Ensures complete geographic coverage before visualization. |

### Frontend (React)

| File | Description |
|------|-------------|
| `frontend/src/App.jsx` | Main application shell. Manages tab state (Heatmap vs Analytics), all demographic filter state, and filter application logic. Orchestrates all sub-components. |
| `frontend/src/HeatmapCanvas.jsx` | Canvas-based interactive map. Renders patient dots on OpenStreetMap tiles with severity-based color coding (green=low, orange=moderate, red=high). Supports zoom, pan, and severity/symptom filtering. |
| `frontend/src/TimelineSlider.jsx` | Date scrubber below the heatmap. Filters patients to those with scores on or near the selected date. Displays a mini sparkline of PSI and environmental conditions for the day. |
| `frontend/src/Analytics.jsx` | Analytics tab with summary cards (total patients, average severity, high-severity count), a severity distribution histogram, and a symptom breakdown bar chart. |
| `frontend/src/EnvPanel.jsx` | Environment panel showing real-time PSI, PM2.5, O3, CO, SO2, NO2, and air temperature. Includes a regional breakdown (North, South, East, West, Central) with color-coded status indicators. |
| `frontend/src/csvParser.js` | Parses demographic CSV files. Handles commas inside quoted fields, maps flexible column headers to standard fields, validates coordinates, derives severity from comorbidity counts, and parses dates/ages. |
| `frontend/src/symptomScores.js` | Parses symptom score CSV files. Implements carry-forward logic (uses most recent score on or before a selected date) and merges scores with patient demographic data. |
| `frontend/src/envService.js` | Fetches real-time PSI, PM2.5, and air temperature from Data.gov.sg APIs. Aggregates regional readings to national values. Falls back to demo data if the API is unavailable. |
| `frontend/src/envHistory.js` | Fetches historical air quality readings for a given date from two Data.gov.sg endpoints in parallel: PSI (24-hr) and PM2.5 (1-hr). Returns per-hour records with PSI, PM2.5, O3, CO, SO2, and NO2 sub-indices plus a regional breakdown (North/South/East/West/Central). Includes `closestReading()` to snap a timestamp to the nearest available record, and `buildDateRange()` to compute the min/max date span from patient score data. Results are cached by date to avoid redundant fetches. |
| `frontend/src/config.js` | Central configuration: Singapore map center/bounds, region coordinates, API endpoint URLs, severity color scheme, and symptom list. |

## Data Files

The `data/` folder contains de-identified patient CSVs from two hospitals (NTF and TTS):

- `*_demographics.csv` — raw demographic data
- `*_demographics_filled.csv` — demographics with missing fields filled in
- `*_demographics_geocoded.csv` — demographics with lat/lng coordinates added
- `*_symptom_score.csv/xlsx` — symptom scores per patient over time
- `combined_demographics.csv` / `combined_symptom_scores.csv` — merged datasets from both hospitals

## Live Demo

**URL:** https://dev.d3c301i5p0m13s.amplifyapp.com

| Field | Value |
|-------|-------|
| Username | test-user |
| Password | testing123 |

---

## Setup

### Local Development (Docker)

1. Copy `.env` and fill in `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`.
2. Run the geocoder to convert postal codes to coordinates (if needed).
3. Start both services:

```bash
docker-compose up
```

The frontend will be available at `http://localhost`.

### Docker Image

The frontend is containerized via the `Dockerfile` in `frontend/`. It builds a production React bundle and serves it with Nginx.

```bash
# Build the image
docker build -t geomapping-frontend ./frontend

# Run the container
docker run -p 80:80 geomapping-frontend
```

---

## AWS Deployment (Amplify)

The frontend is deployed on **AWS Amplify** for continuous delivery.

### How It Works

- Amplify pulls from the `main` branch and auto-deploys on every push.
- Build settings are defined in `frontend/amplify/` and the Amplify console.
- The app is served over HTTPS via Amplify's managed CDN.

### Deploy Your Own

1. Push the repo to GitHub (or connect your fork to Amplify).
2. In the [AWS Amplify Console](https://console.aws.amazon.com/amplify/), choose **Host web app** → connect your repository.
3. Set the build root to `frontend/` and the framework to **React**.
4. Add any required environment variables (e.g. API keys) under **Environment variables** in the Amplify console.
5. Trigger a deployment — Amplify will build and publish the site automatically.
