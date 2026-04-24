// Analytics.jsx
// Renders summary stats, severity distribution
// and environmental correlation plots (PSI/PM2.5/Humidity/Temp vs avg symptom score).

import { useState, useEffect, useMemo } from "react";
import { fetchDayReadings } from "./envHistory";

// ---------------------------------------------------------------------------
// Region bounding boxes for patient filtering
// ---------------------------------------------------------------------------
const REGION_BOUNDS = {
  all:     null,
  north:   { latMin: 1.38, latMax: 1.47, lngMin: 103.65, lngMax: 103.95 },
  south:   { latMin: 1.22, latMax: 1.32, lngMin: 103.70, lngMax: 103.95 },
  east:    { latMin: 1.30, latMax: 1.42, lngMin: 103.88, lngMax: 104.05 },
  west:    { latMin: 1.30, latMax: 1.42, lngMin: 103.60, lngMax: 103.78 },
  central: { latMin: 1.32, latMax: 1.40, lngMin: 103.78, lngMax: 103.88 },
};

function inRegion(p, region) {
  if (!region || region === "all") return true;
  const b = REGION_BOUNDS[region];
  if (!b) return true;
  return p.lat >= b.latMin && p.lat <= b.latMax
      && p.lng >= b.lngMin && p.lng <= b.lngMax;
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------
function SummaryCards({ patients }) {
  const total    = patients.length;
  const avg      = total > 0
    ? (patients.reduce((s, p) => s + p.severity, 0) / total).toFixed(1)
    : "0";
  const high     = patients.filter(p => p.severity >= 7).length;
  const actual   = patients.filter(p => p.scoreSource === "actual").length;

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      {[
        { label: "TOTAL PATIENTS",  value: total,  bg: "#f0f4f8", color: "#1e3a5f" },
        { label: "AVG SEVERITY",    value: avg,    bg: "#fef2f2", color: "#dc2626" },
        { label: "HIGH SEVERITY",   value: high,   bg: "#ecfdf5", color: "#059669" },
        { label: "ACTUAL SCORES",   value: actual, bg: "#fffbeb", color: "#d97706" },
      ].map(c => (
        <div key={c.label} style={{ background: c.bg, borderRadius: 8, padding: 14, flex: 1, minWidth: 110, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{c.label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity histogram
// ---------------------------------------------------------------------------
function SeverityChart({ patients }) {
  const buckets = Array(10).fill(0);
  patients.forEach(p => { if (p.severity >= 1 && p.severity <= 10) buckets[p.severity - 1]++; });
  const max = Math.max(...buckets, 1);
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Severity Distribution</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
        {buckets.map((count, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>{count}</div>
            <div style={{
              width: "100%", height: `${(count / max) * 60}px`, minHeight: 2,
              background: i >= 6 ? "#dc2626" : i >= 3 ? "#d97706" : "#059669",
              borderRadius: "3px 3px 0 0",
            }} />
            <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Env vs Score scatter/line plot (SVG)
// ---------------------------------------------------------------------------
function EnvScatterPlot({ points, xLabel, yLabel, color }) {
  if (!points.length) return (
    <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>
      No data — upload symptom score CSV to enable correlation plots
    </div>
  );

  const W = 340, H = 160, PAD = { top: 10, right: 10, bottom: 30, left: 36 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs) || xMin + 1;
  const yMin = 0, yMax = 10;

  const toSvgX = x => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * iW;
  const toSvgY = y => PAD.top  + (1 - (y - yMin) / (yMax - yMin)) * iH;

  // Simple linear regression
  const n   = points.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0)
              / xs.reduce((s, x) => s + (x - xMean) ** 2, 0) || 0;
  const intercept = yMean - slope * xMean;
  const r2 = (() => {
    const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
    const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
    return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  })();

  const trendX1 = xMin, trendX2 = xMax;
  const trendY1 = slope * trendX1 + intercept;
  const trendY2 = slope * trendX2 + intercept;

  // X axis ticks
  const xTicks = 4;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => xMin + (i / xTicks) * (xMax - xMin));

  return (
    <div>
      <svg width={W} height={H} style={{ width: "100%", height: "auto" }}>
        {/* Grid lines */}
        {[0, 2, 4, 6, 8, 10].map(v => (
          <line key={v} x1={PAD.left} x2={W - PAD.right}
            y1={toSvgY(v)} y2={toSvgY(v)}
            stroke="#f3f4f6" strokeWidth={1} />
        ))}

        {/* Trend line */}
        <line
          x1={toSvgX(trendX1)} y1={Math.max(PAD.top, Math.min(H - PAD.bottom, toSvgY(trendY1)))}
          x2={toSvgX(trendX2)} y2={Math.max(PAD.top, Math.min(H - PAD.bottom, toSvgY(trendY2)))}
          stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i}
            cx={toSvgX(p.x)} cy={toSvgY(p.y)} r={3.5}
            fill={color} fillOpacity={0.6} stroke="#fff" strokeWidth={0.5}
          />
        ))}

        {/* Y axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#d1d5db" />
        {[0, 5, 10].map(v => (
          <g key={v}>
            <line x1={PAD.left - 3} x2={PAD.left} y1={toSvgY(v)} y2={toSvgY(v)} stroke="#9ca3af" />
            <text x={PAD.left - 5} y={toSvgY(v) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{v}</text>
          </g>
        ))}

        {/* X axis */}
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#d1d5db" />
        {xTickVals.map((v, i) => (
          <g key={i}>
            <line x1={toSvgX(v)} x2={toSvgX(v)} y1={H - PAD.bottom} y2={H - PAD.bottom + 3} stroke="#9ca3af" />
            <text x={toSvgX(v)} y={H - PAD.bottom + 12} textAnchor="middle" fontSize={8} fill="#9ca3af">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={PAD.left + iW / 2} y={H - 2} textAnchor="middle" fontSize={9} fill="#6b7280">{xLabel}</text>
        <text x={10} y={PAD.top + iH / 2} textAnchor="middle" fontSize={9} fill="#6b7280"
          transform={`rotate(-90, 10, ${PAD.top + iH / 2})`}>Score</text>
      </svg>

      {/* R² annotation */}
      <div style={{ fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 }}>
        R² = {r2.toFixed(3)} · slope {slope >= 0 ? "+" : ""}{slope.toFixed(3)} · n={n}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Analytics component
// ---------------------------------------------------------------------------
export default function Analytics({ patients, envHistory }) {
  const [region, setRegion]     = useState("all");
  const [envMetric, setEnvMetric] = useState("psi");

  // Filter patients by region
  const regionPatients = useMemo(() =>
    patients.filter(p => inRegion(p, region)),
    [patients, region]
  );

  // Patients with actual scores only (for correlation plots)
  const scoredPatients = useMemo(() =>
    regionPatients.filter(p => p.scoreSource === "actual" && p.scoreDate),
    [regionPatients]
  );

  // Build scatter plot points: join scored patients to weekly env history
  const ENV_METRICS = [
    { key: "psi",      label: "PSI (24hr)",    color: "#2d5a8e" },
    { key: "pm25",     label: "PM2.5 (ug/m3)", color: "#7c3aed" },
    { key: "humidity_avg", label: "Humidity (%)",  color: "#0891b2" },
    { key: "air_temp_avg",  label: "Temp (°C)",     color: "#d97706" },
  ];

  function getWeekStart(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  }

  const scatterPoints = useMemo(() => {
    if (!envHistory?.length || !scoredPatients.length) return {};
    const result = {};
    for (const { key } of ENV_METRICS) {
      result[key] = [];
    }
    const envByWeek = new Map(envHistory.map(r => [r.week_start, r]));

    scoredPatients.forEach(p => {
      const week = getWeekStart(p.scoreDate);
      const env  = envByWeek.get(week);
      if (!env) return;
      for (const { key } of ENV_METRICS) {
        const envVal = parseFloat(env[`${key}_national`] ?? env[key]);
        if (!isNaN(envVal)) {
          result[key].push({ x: envVal, y: p.severity });
        }
      }
    });
    return result;
  }, [scoredPatients, envHistory]);

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>

      {/* Region filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Region:</span>
        {Object.keys(REGION_BOUNDS).map(r => (
          <button key={r} onClick={() => setRegion(r)} style={{
            padding: "4px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer",
            border: region === r ? "1.5px solid #1e3a5f" : "1px solid #d1d5db",
            background: region === r ? "#1e3a5f" : "#fff",
            color: region === r ? "#fff" : "#374151",
            fontWeight: region === r ? 600 : 400,
            textTransform: "capitalize",
          }}>
            {r}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>
          {regionPatients.length} patients
        </span>
      </div>

      <SummaryCards patients={regionPatients} />

      <div style={{ marginBottom: 20 }}>
        <SeverityChart patients={regionPatients} />
      </div>

      {/* Env correlation plots */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 4 }}>
          Environmental Correlation
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          Avg symptom score vs environmental metric per patient per week.
          {!envHistory?.length && (
            <span style={{ color: "#d97706", marginLeft: 6 }}>
              Upload env_history.csv to populate these charts.
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {ENV_METRICS.map(({ key, label, color }) => (
            <div key={key} style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 6 }}>
                {label} vs Symptom Score
              </div>
              <EnvScatterPlot
                points={scatterPoints[key] || []}
                xLabel={label}
                yLabel="Score"
                color={color}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}