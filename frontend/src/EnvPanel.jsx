// EnvPanel.jsx
// Renders environment metric cards and regional PSI/PM2.5 breakdown.

const STATUS_COLORS = {
  Good:      { text: "#059669", bg: "#ecfdf5" },
  Moderate:  { text: "#d97706", bg: "#fffbeb" },
  Unhealthy: { text: "#dc2626", bg: "#fef2f2" },
  loading:   { text: "#6b7280", bg: "#f3f4f6" },
};

function EnvCard({ title, value, unit, status, detail }) {
  const scheme = STATUS_COLORS[status] || STATUS_COLORS.loading;
  return (
    <div style={{
      background: scheme.bg, border: `1px solid ${scheme.text}`,
      borderRadius: 8, padding: "10px 14px", minWidth: 120, flexShrink: 0,
    }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: scheme.text, marginTop: 2 }}>
        {value ?? "--"}
        <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: scheme.text, marginTop: 2 }}>
        {status}{detail ? ` — ${detail}` : ""}
      </div>
    </div>
  );
}

function RegionalBreakdown({ regional }) {
  if (!regional?.psi || !Object.keys(regional.psi).length) return null;

  const psiByRegion  = regional.psi;
  const pm25ByRegion = regional.pm25 || {};
  const regions      = Object.keys(psiByRegion);

  return (
    <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Regional Breakdown
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {regions.map(region => {
          const psi  = psiByRegion[region];
          const pm25 = pm25ByRegion[region];
          const psiColor = psi <= 50 ? "#059669" : psi <= 100 ? "#d97706" : "#dc2626";
          return (
            <div key={region} style={{ background: "#f0f4f8", borderRadius: 6, padding: "8px 14px", textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "capitalize", color: "#374151", marginBottom: 4 }}>
                {region}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: psiColor }}>
                {psi}
              </div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>PSI</div>
              {pm25 != null && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#2d5a8e", marginTop: 4 }}>{pm25}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>PM2.5</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EnvPanel({ envData }) {
  const sub = (v) => v == null ? "loading" : v <= 50 ? "Good" : "Moderate";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
        <EnvCard title="PSI (24hr)" value={envData?.psi}     unit=""       status={envData?.psiStatus  || "loading"} detail={envData?.isDemo ? "demo" : ""} />
        <EnvCard title="PM2.5"      value={envData?.pm25}    unit="ug/m3"  status={envData?.pm25Status || "loading"} />
        <EnvCard title="O3 Index"   value={envData?.o3}      unit=""       status={sub(envData?.o3)} />
        <EnvCard title="CO Index"   value={envData?.co}      unit=""       status={sub(envData?.co)} />
        <EnvCard title="SO2"        value={envData?.so2}     unit=""       status={sub(envData?.so2)} />
        <EnvCard title="NO2"        value={envData?.no2}     unit="ug/m3"  status={sub(envData?.no2)} />
        <EnvCard title="Temp"       value={envData?.airTemp} unit="°C"     status={envData?.tempStatus || "loading"} />
      </div>

      {envData?.isDemo && (
        <div style={{
          background: "#fffbeb", border: "1px solid #f59e0b",
          borderRadius: 6, padding: "8px 12px", fontSize: 12,
          color: "#92400e", marginBottom: 12,
        }}>
          Showing demo environment data — nginx proxy unreachable or API returned an error.
          Check that Docker is running and DATAGOVSG_API_KEY is set in your .env file.
        </div>
      )}
    </div>
  );
}

export { RegionalBreakdown };