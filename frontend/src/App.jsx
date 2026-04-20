// App.jsx
// Main application shell. Composes all modules together.
// Handles state management, tab routing, and data lifecycle.

import { useState, useEffect } from "react";

// Module imports (adjust paths to your project structure)
import { ENV_POLL_INTERVAL_MS, SEVERITY_COLORS } from "./config";
import { readCSVFile } from "./csvParser";
import { fetchEnvironmentData } from "./envService";
import HeatmapCanvas, { filterPatients } from "./HeatmapCanvas";
import EnvPanel, { RegionalBreakdown } from "./EnvPanel";
import Analytics from "./Analytics";


const TABS = [
  { key: "map",   label: "Heatmap" },
  { key: "stats", label: "Analytics" }
];

export default function App() {
  const [patients, setPatients] = useState([]);
  const [envData, setEnvData] = useState(null);
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [csvErrors, setCsvErrors] = useState([]);
  const [severityFilter, setSeverityFilter] = useState(0);
  const [symptomFilter, setSymptomFilter] = useState("all");
  const [tab, setTab] = useState("map");


  // Poll environment data
  useEffect(() => {
    let mounted = true;
    async function poll() {
      const data = await fetchEnvironmentData();
      if (mounted) setEnvData(data);
    }
    poll();
    const interval = setInterval(poll, ENV_POLL_INTERVAL_MS);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // CSV upload handler
  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { patients: parsed, errors } = await readCSVFile(file);
      setCsvErrors(errors);
      if (parsed.length > 0) {
        setPatients(parsed);
        setCsvLoaded(true);
      }
    } catch (err) {
      setCsvErrors([err.message]);
    }
  }

  const symptoms = [...new Set(patients.map(p => p.symptoms))];
  const filteredCount = filterPatients(patients, severityFilter, symptomFilter).length;

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      maxWidth: 900, margin: "0 auto", padding: 16, background: "#f8fafc",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1e3a5f, #2d5a8e)",
        color: "#fff", padding: "16px 20px", borderRadius: 10, marginBottom: 16,
      }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          SG Patient Symptom Geo-Mapping
        </h1>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
          Real-time environmental overlay |{" "}
          {csvLoaded ? "CSV loaded" : "Demo data"} |{" "}
          {patients.length} patients
        </div>
      </div>

      {/* CSV Upload */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
        padding: 12, marginBottom: 12, display: "flex",
        alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
          Upload CSV:
        </label>
        <input type="file" accept=".csv" onChange={handleCSV} style={{ fontSize: 12 }} />
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          Expected: id, lat, lng, severity, symptoms, age, timestamp
        </span>
      </div>

      {csvErrors.length > 0 && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6,
          padding: "8px 12px", fontSize: 12, color: "#991b1b", marginBottom: 12,
        }}>
          {csvErrors.slice(0, 5).map((err, i) => <div key={i}>{err}</div>)}
          {csvErrors.length > 5 && <div>...and {csvErrors.length - 5} more</div>}
        </div>
      )}

      {/* Environment Panel */}
      <EnvPanel envData={envData} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
        {TABS.map((t, i) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", fontSize: 13,
            fontWeight: tab === t.key ? 700 : 400,
            background: tab === t.key ? "#1e3a5f" : "#e5e7eb",
            color: tab === t.key ? "#fff" : "#374151",
            border: "none", cursor: "pointer",
            borderRadius: i === 0 ? "6px 0 0 6px" : i === TABS.length - 1 ? "0 6px 6px 0" : 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "map" && (
        <div>
          <div style={{
            display: "flex", gap: 12, marginBottom: 12,
            alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 12 }}>
              <label style={{ fontWeight: 600, color: "#374151" }}>Min Severity: </label>
              <input
                type="range" min={0} max={9} value={severityFilter}
                onChange={e => setSeverityFilter(parseInt(e.target.value))}
                style={{ width: 100, verticalAlign: "middle" }}
              />
              <span style={{ marginLeft: 6, fontWeight: 700 }}>
                {severityFilter > 0 ? `${severityFilter}+` : "All"}
              </span>
            </div>
            <div style={{ fontSize: 12 }}>
              <label style={{ fontWeight: 600, color: "#374151" }}>Symptom: </label>
              <select
                value={symptomFilter}
                onChange={e => setSymptomFilter(e.target.value)}
                style={{ fontSize: 12, padding: "2px 6px" }}
              >
                <option value="all">All</option>
                {symptoms.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>
              Showing {filteredCount} of {patients.length}
            </div>
          </div>

          <HeatmapCanvas
            patients={patients} width={860} height={420}
            severityFilter={severityFilter} symptomFilter={symptomFilter}
          />

          <div style={{
            display: "flex", gap: 16, marginTop: 8,
            fontSize: 11, color: "#6b7280", alignItems: "center",
          }}>
            <span>Severity:</span>
            {[
              [SEVERITY_COLORS.low, "1-3 Low"],
              [SEVERITY_COLORS.moderate, "4-6 Moderate"],
              [SEVERITY_COLORS.high, "7-10 High"],
            ].map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: c, display: "inline-block",
                }} />
                {l}
              </span>
            ))}
          </div>

          <RegionalBreakdown regional={envData?.regional} />
        </div>
      )}

      {tab === "stats" && <Analytics patients={patients} />}
      {tab === "aws" && <AwsGuide />}

      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
        Data source: api.data.gov.sg |{" "}
        Updated: {envData?.timestamp ? new Date(envData.timestamp).toLocaleString() : "--"} |{" "}
        POC v1.0
      </div>
    </div>
  );
}