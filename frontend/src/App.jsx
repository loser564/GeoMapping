// App.jsx
// Main application shell. Composes all modules together.
// Handles state management, tab routing, and data lifecycle.

import { useState, useEffect, useMemo } from "react";

import { ENV_POLL_INTERVAL_MS, SEVERITY_COLORS } from "./config";
import { readCSVFile, parseCSV } from "./csvParser";
import { readScoreFile, parseScoreCSV, mergeScores, mergeScoresOnDate } from "./symptomScores";
import { fetchEnvironmentData } from "./envService";
import { loadDemographics, loadSymptomScores, loadEnvHistory } from "./dataService";
import HeatmapCanvas, { filterPatients } from "./HeatmapCanvas";
import EnvPanel, { RegionalBreakdown } from "./EnvPanel";
import Analytics from "./Analytics";
import TimelineSlider from "./TimelineSlider";

const TABS = [
  { key: "map",   label: "Heatmap" },
  { key: "stats", label: "Analytics" }
];

// ---- Demographic filter definitions ----
const CATEGORICAL_FILTERS = [
  { key: "race",        label: "Race",         field: "race" },
  { key: "marital",     label: "Marital",      field: "marital" },
  { key: "education",   label: "Education",    field: "education" },
  { key: "property",    label: "Property",     field: "property" },
  { key: "smoking",     label: "Smoking",      field: "smoking" },
  { key: "alcohol",     label: "Alcohol",      field: "alcohol" },
];

const AGE_BANDS = [
  { label: "All",   min: 0,  max: Infinity },
  { label: "≤17",   min: 0,  max: 17 },
  { label: "18–30", min: 18, max: 30 },
  { label: "31–45", min: 31, max: 45 },
  { label: "46–60", min: 46, max: 60 },
  { label: "61+",   min: 61, max: Infinity },
];

const COMORB_BANDS = [
  { label: "All", min: 0, max: Infinity },
  { label: "0",   min: 0, max: 0 },
  { label: "1–3", min: 1, max: 3 },
  { label: "4–6", min: 4, max: 6 },
  { label: "6+",  min: 6, max: Infinity },
];

function getUniqueValues(patients, field) {
  return [...new Set(patients.map(p => p[field]).filter(Boolean))].sort();
}

function countComorbidities(symptoms) {
  if (!symptoms || symptoms.toLowerCase() === "unknown") return 0;
  return symptoms
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s !== "none" && s !== "nil" && s !== "na").length;
}

function applyAllFilters(patients, filters) {
  const ageBand    = AGE_BANDS.find(b => b.label === filters.ageBand)    || AGE_BANDS[0];
  const comorbBand = COMORB_BANDS.find(b => b.label === filters.comorbBand) || COMORB_BANDS[0];

  return patients.filter(p => {
    if (filters.severity > 0 && p.severity < filters.severity) return false;
    if (filters.symptom !== "all" && p.symptoms !== filters.symptom) return false;
    if (filters.ageBand !== "All") {
      if (p.age <= 0) return false;
      if (p.age < ageBand.min || p.age > ageBand.max) return false;
    }
    const comorbCount = countComorbidities(p.symptoms);
    if (filters.comorbBand !== "All") {
      if (comorbCount < comorbBand.min || comorbCount > comorbBand.max) return false;
    }
    for (const { key, field } of CATEGORICAL_FILTERS) {
      if (filters[key] !== "all" && p[field] !== filters[key]) return false;
    }
    return true;
  });
}

const DEFAULT_FILTERS = {
  severity:   0,
  symptom:    "all",
  ageBand:    "All",
  comorbBand: "All",
  race:       "all",
  marital:    "all",
  education:  "all",
  property:   "all",
  smoking:    "all",
  alcohol:    "all",
};

// ---- Sub-components ----

function SelectFilter({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 130 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}
      >
        <option value="all">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function BandFilter({ label, bands, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {bands.map(b => {
          const active = value === b.label;
          return (
            <button key={b.label} onClick={() => onChange(b.label)} style={{
              padding: "4px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer",
              border: active ? "1.5px solid #1e3a5f" : "1px solid #d1d5db",
              background: active ? "#1e3a5f" : "#fff",
              color: active ? "#fff" : "#374151",
              fontWeight: active ? 600 : 400,
            }}>
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeveritySummary({ patients }) {
  const low      = patients.filter(p => p.severity <= 3).length;
  const moderate = patients.filter(p => p.severity >= 4 && p.severity <= 6).length;
  const high     = patients.filter(p => p.severity >= 7).length;
  const total    = patients.length || 1;
  const actual   = patients.filter(p => p.scoreSource === "actual").length;
  const derived  = patients.length - actual;

  const pct = n => ((n / total) * 100).toFixed(1);

  const bands = [
    { label: "Low",      count: low,      color: "#059669", bg: "#ecfdf5" },
    { label: "Moderate", count: moderate, color: "#d97706", bg: "#fffbeb" },
    { label: "High",     count: high,     color: "#dc2626", bg: "#fef2f2" },
  ];

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        {bands.map(b => (
          <div key={b.label} style={{
            flex: 1, background: b.bg, border: `1px solid ${b.color}`,
            borderRadius: 8, padding: "10px 14px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {b.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: b.color, marginTop: 2 }}>
              {b.count}
            </div>
            <div style={{ fontSize: 11, color: b.color }}>{pct(b.count)}%</div>
          </div>
        ))}
      </div>
      {(actual > 0 || derived > 0) && (
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          <span style={{ color: "#059669", fontWeight: 600 }}>{actual} actual scores</span>
          {" · "}
          <span>{derived} derived from comorbidities</span>
        </div>
      )}
    </div>
  );
}

// ---- Main App ----

export default function App() {
  const [patients, setPatients]         = useState([]);
  const [scoreMap, setScoreMap]         = useState(null);
  const [envHistory, setEnvHistory]     = useState([]);
  const [envData, setEnvData]           = useState(null);
  const [timelineDate, setTimelineDate] = useState(null);
  const [timelineEnv, setTimelineEnv]   = useState(null);
  const [csvLoaded, setCsvLoaded]       = useState(false);
  const [s3Loading, setS3Loading]       = useState(true);
  const [s3Error, setS3Error]           = useState(null);
  const [csvErrors, setCsvErrors]       = useState([]);
  const [filters, setFilters]           = useState(DEFAULT_FILTERS);
  const [tab, setTab]                   = useState("map");
  const [showFilters, setShowFilters]   = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  // Auto-load all CSVs from S3 on mount
  useEffect(() => {
    async function loadFromS3() {
      setS3Loading(true);
      setS3Error(null);
      try {
        // Load all three in parallel
        const [demoText, scoresText, envText] = await Promise.allSettled([
          loadDemographics(),
          loadSymptomScores(),
          loadEnvHistory(),
        ]);

        // Parse demographics
        if (demoText.status === "fulfilled") {
          const { patients: parsed, errors } = parseCSV(demoText.value);
          setCsvErrors(errors.filter(e => !e.startsWith("WARNING")));
          if (parsed.length > 0) {
            // Parse scores first so we can merge immediately
            let map = null;
            if (scoresText.status === "fulfilled") {
              map = parseScoreCSV(scoresText.value);
              setScoreMap(map);
            }
            const merged = map ? mergeScores(parsed, map) : parsed;
            setPatients(merged);
            setCsvLoaded(true);
          }
        } else {
          setS3Error("Could not load demographics from S3. Upload a CSV manually below.");
        }

        // Parse env history
        if (envText.status === "fulfilled") {
          const lines = envText.value.trim().split("\n");
          const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
          const rows = lines.slice(1).map(line => {
            const vals = line.split(",").map(v => v.trim());
            const row = {};
            headers.forEach((h, i) => { row[h] = vals[i]; });
            return row;
          });
          setEnvHistory(rows);
        }

      } catch (err) {
        setS3Error(err.message);
      } finally {
        setS3Loading(false);
      }
    }
    loadFromS3();
  }, []);

  // Poll environment data
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const data = await fetchEnvironmentData();
      if (mounted) setEnvData(data);
    };
    poll();
    const interval = setInterval(poll, ENV_POLL_INTERVAL_MS);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // CSV upload — demographics
  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { patients: parsed, errors } = await readCSVFile(file);
      setCsvErrors(errors);
      if (parsed.length > 0) {
        const merged = scoreMap ? mergeScores(parsed, scoreMap) : parsed;
        setPatients(merged);
        setCsvLoaded(true);
        setFilters(DEFAULT_FILTERS);
      }
    } catch (err) {
      setCsvErrors([err.message]);
    }
  }

  // Score file upload — joins on patient_id
  async function handleScoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const map = await readScoreFile(file);
      setScoreMap(map);
      if (patients.length > 0) {
        setPatients(prev => mergeScores(prev, map));
      }
    } catch (err) {
      setCsvErrors([err.message]);
    }
  }

  // Env history CSV upload
  async function handleEnvHistory(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i]; });
      return row;
    });
    setEnvHistory(rows);
  }

  // Unique values for categorical filters
  const categoryOptions = useMemo(() => {
    const opts = {};
    for (const { key, field } of CATEGORICAL_FILTERS) {
      opts[key] = getUniqueValues(patients, field);
    }
    return opts;
  }, [patients]);

  const symptoms = useMemo(() =>
    [...new Set(patients.map(p => p.symptoms).filter(Boolean))], [patients]);

  // When timeline is active, carry-forward scores to the selected date
  const timelinePatients = useMemo(() => {
    if (!showTimeline || !timelineDate || !scoreMap) return patients;
    return mergeScoresOnDate(patients, scoreMap, timelineDate);
  }, [patients, scoreMap, showTimeline, timelineDate]);

  // Active env: use timeline env when scrubbing, otherwise live env
  const activeEnv = (showTimeline && timelineEnv) ? timelineEnv : envData;

  const filtered = useMemo(() =>
    applyAllFilters(timelinePatients, filters), [timelinePatients, filters]);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === "severity")   return v > 0;
    if (k === "ageBand")    return v !== "All";
    if (k === "comorbBand") return v !== "All";
    if (k === "symptom" || CATEGORICAL_FILTERS.find(f => f.key === k)) return v !== "all";
    return false;
  }).length;

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 900, margin: "0 auto", padding: 16, background: "#f8fafc" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1e3a5f, #2d5a8e)", color: "#fff", padding: "16px 20px", borderRadius: 10, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>SG Patient Symptom Geo-Mapping</h1>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
            Real-time environmental overlay | {csvLoaded ? "Data loaded" : "No data loaded"} | {patients.length} patients
          </div>
        </div>
      </div>

      {/* File uploads */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        {/* S3 status banner */}
        {s3Loading && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, padding: "6px 10px", background: "#f0f4f8", borderRadius: 6 }}>
            Loading data from S3...
          </div>
        )}
        {s3Error && (
          <div style={{ fontSize: 12, color: "#92400e", marginBottom: 10, padding: "6px 10px", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6 }}>
            {s3Error} — use manual upload below as fallback.
          </div>
        )}
        {!s3Loading && csvLoaded && (
          <div style={{ fontSize: 12, color: "#059669", marginBottom: 10, padding: "6px 10px", background: "#ecfdf5", border: "1px solid #059669", borderRadius: 6 }}>
            Data loaded from S3 — {patients.length} patients
            {scoreMap ? ` · ${scoreMap.size} scores` : ""}
            {envHistory.length ? ` · ${envHistory.length} weeks env history` : ""}
          </div>
        )}

        {/* Manual upload fallback */}
        <details>
          <summary style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", cursor: "pointer", marginBottom: 8 }}>
            Manual upload (override S3)
          </summary>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", minWidth: 110 }}>Demographics CSV:</label>
              <input type="file" accept=".csv" onChange={handleCSV} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", minWidth: 110 }}>Symptom Scores:</label>
              <input type="file" accept=".csv" onChange={handleScoreFile} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", minWidth: 110 }}>Env History:</label>
              <input type="file" accept=".csv" onChange={handleEnvHistory} style={{ fontSize: 12 }} />
            </div>
          </div>
        </details>
      </div>

      {csvErrors.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#991b1b", marginBottom: 12 }}>
          {csvErrors.slice(0, 5).map((err, i) => <div key={i}>{err}</div>)}
          {csvErrors.length > 5 && <div>...and {csvErrors.length - 5} more</div>}
        </div>
      )}

      {/* Environment Panel */}
      <EnvPanel envData={activeEnv} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
        {TABS.map((t, i) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            background: tab === t.key ? "#1e3a5f" : "#e5e7eb",
            color: tab === t.key ? "#fff" : "#374151",
            border: "none", cursor: "pointer",
            borderRadius: i === 0 ? "6px 0 0 6px" : i === TABS.length - 1 ? "0 6px 6px 0" : 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* MAP TAB */}
      {tab === "map" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button
              onClick={() => setShowFilters(f => !f)}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#374151" }}
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
              {activeFilterCount > 0 && (
                <span style={{ marginLeft: 6, background: "#1e3a5f", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fef2f2", cursor: "pointer", color: "#991b1b" }}
              >
                Clear all filters
              </button>
            )}
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Showing {filtered.length} of {patients.length}
            </span>
          </div>

          {showFilters && (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12 }}>
              {/* Row 1: Severity + Symptom */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 160 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Min Severity
                    <span style={{ marginLeft: 6, fontWeight: 400, color: "#6b7280" }}>
                      {filters.severity > 0 ? `${filters.severity}+` : "All"}
                    </span>
                  </label>
                  <input type="range" min={0} max={9} value={filters.severity}
                    onChange={e => setFilter("severity", parseInt(e.target.value))}
                    style={{ width: "100%" }} />
                </div>
                <SelectFilter
                  label="Symptom / Comorbidity"
                  value={filters.symptom}
                  options={symptoms}
                  onChange={v => setFilter("symptom", v)}
                />
              </div>

              {/* Row 2: Age band + Comorbidity band */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
                <BandFilter
                  label="Age Band"
                  bands={AGE_BANDS}
                  value={filters.ageBand}
                  onChange={v => setFilter("ageBand", v)}
                />
                <BandFilter
                  label="Comorbidities"
                  bands={COMORB_BANDS}
                  value={filters.comorbBand}
                  onChange={v => setFilter("comorbBand", v)}
                />
              </div>

              {/* Row 3: Categorical dropdowns */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {CATEGORICAL_FILTERS.map(({ key, label }) => (
                  <SelectFilter
                    key={key}
                    label={label}
                    value={filters[key]}
                    options={categoryOptions[key] || []}
                    onChange={v => setFilter(key, v)}
                  />
                ))}
              </div>
            </div>
          )}

          <SeveritySummary patients={filtered} />

          <HeatmapCanvas
            patients={showTimeline ? timelinePatients : patients}
            width={860} height={460}
            severityFilter={filters.severity}
            symptomFilter={filters.symptom}
            extraFilter={p => applyAllFilters([p], filters).length > 0}
          />

          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#6b7280", alignItems: "center" }}>
            <span>Severity:</span>
            {[
              [SEVERITY_COLORS.low,      "1-3 Low"],
              [SEVERITY_COLORS.moderate, "4-6 Moderate"],
              [SEVERITY_COLORS.high,     "7-10 High"],
            ].map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />
                {l}
              </span>
            ))}
          </div>

          <RegionalBreakdown regional={activeEnv?.regional} />

          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => setShowTimeline(t => !t)}
              disabled={!patients.some(p => p.scoreDate)}
              style={{
                fontSize: 12, padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                border: "1px solid #d1d5db",
                background: showTimeline ? "#1e3a5f" : "#fff",
                color: showTimeline ? "#fff" : "#374151",
                opacity: patients.some(p => p.scoreDate) ? 1 : 0.4,
              }}
            >
              {showTimeline ? "Hide Timeline" : "Show Env × Score Timeline"}
            </button>
            {!patients.some(p => p.scoreDate) && (
              <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                Upload symptom scores CSV to enable
              </span>
            )}
          </div>

          {showTimeline && (
            <TimelineSlider
              patients={patients}
              scoreMap={scoreMap}
              onDateChange={setTimelineDate}
              onEnvChange={setTimelineEnv}
            />
          )}
        </div>
      )}

      {tab === "stats" && <Analytics patients={filtered} envHistory={envHistory} />}

      <div style={{ marginTop: 16, fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
        Data source: api-open.data.gov.sg | Updated: {envData?.timestamp ? new Date(envData.timestamp).toLocaleString() : "--"} | POC v1.0
      </div>
    </div>
  );
}