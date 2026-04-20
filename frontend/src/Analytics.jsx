// Analytics.jsx
// Renders summary statistics, severity distribution chart,
// and symptom breakdown bar chart.

function SummaryCards({ patients }) {
  const total = patients.length;
  const avg = total > 0
    ? (patients.reduce((s, p) => s + p.severity, 0) / total).toFixed(1)
    : "0";
  const highCount = patients.filter(p => p.severity >= 7).length;

  const cards = [
    { label: "TOTAL PATIENTS",  value: total,     bg: "#f0f4f8", color: "#1e3a5f" },
    { label: "AVG SEVERITY",    value: avg,       bg: "#fef2f2", color: "#dc2626" },
    { label: "HIGH SEVERITY",   value: highCount, bg: "#ecfdf5", color: "#059669" },
  ];

  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: c.bg, borderRadius: 8, padding: 14,
          flex: 1, minWidth: 120, textAlign: "center",
        }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{c.label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function SeverityChart({ patients }) {
  const buckets = Array(10).fill(0);
  patients.forEach(p => {
    if (p.severity >= 1 && p.severity <= 10) buckets[p.severity - 1]++;
  });
  const max = Math.max(...buckets, 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
      {buckets.map((count, i) => (
        <div key={i} style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", flex: 1,
        }}>
          <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>{count}</div>
          <div style={{
            width: "100%",
            height: `${(count / max) * 60}px`,
            minHeight: 2,
            background: i >= 6 ? "#dc2626" : i >= 3 ? "#d97706" : "#059669",
            borderRadius: "3px 3px 0 0",
          }} />
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{i + 1}</div>
        </div>
      ))}
    </div>
  );
}

function SymptomBreakdown({ patients }) {
  const symptoms = [...new Set(patients.map(p => p.symptoms))];
  const total = patients.length || 1;

  return (
    <div>
      {symptoms.map(s => {
        const count = patients.filter(p => p.symptoms === s).length;
        const pct = ((count / total) * 100).toFixed(1);
        return (
          <div key={s} style={{
            display: "flex", alignItems: "center",
            gap: 8, marginBottom: 6,
          }}>
            <div style={{ width: 110, fontSize: 12, fontWeight: 500, textTransform: "capitalize" }}>
              {s}
            </div>
            <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 16 }}>
              <div style={{
                width: `${pct}%`, background: "#2d5a8e",
                borderRadius: 4, height: 16, minWidth: 2,
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", width: 60, textAlign: "right" }}>
              {count} ({pct}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics({ patients }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb",
      borderRadius: 8, padding: 16,
    }}>
      <SummaryCards patients={patients} />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Severity Distribution</div>
        <SeverityChart patients={patients} />
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Symptom Breakdown</div>
        <SymptomBreakdown patients={patients} />
      </div>
    </div>
  );
}