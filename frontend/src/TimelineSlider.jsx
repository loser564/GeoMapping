// TimelineSlider.jsx
// A timeline scrubber below the heatmap.
// Dragging the slider filters visible patients to those with scores
// recorded on/near the selected date, and shows the PSI/env conditions
// at that time as a mini chart.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { fetchDayReadings, closestReading, buildDateRange } from "./envHistory";
import { mergeScoresOnDate } from "./symptomScores";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateLabel(date) {
  return date.toLocaleDateString("en-SG", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatTimeLabel(date) {
  return date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
}

// Mini sparkline for PSI/score over the day
function DaySparkline({ readings, patients, selectedTime }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !readings.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const psiVals = readings.map(r => r.psi).filter(v => v != null);
    if (!psiVals.length) return;

    const maxPsi = Math.max(...psiVals, 100);
    const minPsi = Math.min(...psiVals, 0);
    const range  = maxPsi - minPsi || 1;

    const toX = i => (i / (readings.length - 1)) * W;
    const toY = v => H - ((v - minPsi) / range) * (H - 10) - 5;

    // PSI line
    ctx.beginPath();
    ctx.strokeStyle = "#2d5a8e";
    ctx.lineWidth = 2;
    readings.forEach((r, i) => {
      if (r.psi == null) return;
      i === 0 ? ctx.moveTo(toX(i), toY(r.psi)) : ctx.lineTo(toX(i), toY(r.psi));
    });
    ctx.stroke();

    // PSI fill
    ctx.beginPath();
    readings.forEach((r, i) => {
      if (r.psi == null) return;
      i === 0 ? ctx.moveTo(toX(i), toY(r.psi)) : ctx.lineTo(toX(i), toY(r.psi));
    });
    ctx.lineTo(toX(readings.length - 1), H);
    ctx.lineTo(0, H);
    ctx.fillStyle = "rgba(45,90,142,0.12)";
    ctx.fill();

    // Selected time marker
    if (selectedTime) {
      const closestIdx = readings.reduce((best, r, i) => {
        const diff = Math.abs(r.timestamp - selectedTime);
        const bestDiff = Math.abs(readings[best].timestamp - selectedTime);
        return diff < bestDiff ? i : best;
      }, 0);
      const x = toX(closestIdx);
      ctx.beginPath();
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Score dots: avg symptom score per hour bucket
    const hourBuckets = new Map();
    patients.forEach(p => {
      if (!p.scoreDate) return;
      const d = new Date(p.scoreDate);
      const h = d.getHours();
      if (!hourBuckets.has(h)) hourBuckets.set(h, []);
      hourBuckets.get(h).push(p.severity);
    });

    const maxScore = 10;
    hourBuckets.forEach((scores, h) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const readingIdx = readings.findIndex(r =>
        r.timestamp.getHours() === h
      );
      if (readingIdx < 0) return;
      const x = toX(readingIdx);
      const y = H - (avg / maxScore) * (H - 10) - 5;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = avg >= 7 ? "#dc2626" : avg >= 4 ? "#d97706" : "#059669";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Y-axis label
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px sans-serif";
    ctx.fillText(`PSI ${maxPsi}`, 2, 10);
    ctx.fillText(`PSI ${minPsi}`, 2, H - 3);

  }, [readings, patients, selectedTime]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={60}
      style={{ width: "100%", height: 60 }}
    />
  );
}

export default function TimelineSlider({ patients, scoreMap, onDateChange, onEnvChange }) {
  const dateRange = buildDateRange(patients);

  const [sliderVal, setSliderVal]     = useState(0);
  const [dayReadings, setDayReadings] = useState([]);
  const [currentEnv, setCurrentEnv]  = useState(null);
  const [loading, setLoading]        = useState(false);
  const [playing, setPlaying]        = useState(false);
  const playRef  = useRef(null);
  const prevDate = useRef(null);

  const totalDays = dateRange
    ? Math.max(1, Math.round((dateRange.max - dateRange.min) / DAY_MS))
    : 0;

  const selectedDate = dateRange
    ? new Date(dateRange.min.getTime() + (sliderVal / 100) * totalDays * DAY_MS)
    : null;

  // Fetch env data when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    fetchDayReadings(selectedDate).then(readings => {
      setDayReadings(readings);
      const env = closestReading(readings, selectedDate);
      setCurrentEnv(env);
      if (onEnvChange) onEnvChange(env);
      setLoading(false);
    });
  }, [selectedDate?.toDateString()]);

  // Notify parent of date change for patient filtering
  useEffect(() => {
    if (selectedDate && onDateChange) onDateChange(selectedDate);
  }, [sliderVal]);

  // Auto-play
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setSliderVal(v => {
          if (v >= 100) { setPlaying(false); return 100; }
          return v + (100 / totalDays);
        });
      }, 800);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [playing, totalDays]);

  if (!dateRange) return null;

  // Patients with carry-forward scores for the selected date.
  // Only includes patients who had submitted at least one score by this date.
  // Patients not yet registered are excluded entirely.
  const patientsOnDate = useMemo(() => {
    if (!selectedDate || !scoreMap) return [];
    return mergeScoresOnDate(patients, scoreMap, selectedDate);
  }, [patients, scoreMap, selectedDate?.toDateString()]);

  const avgScore = patientsOnDate.length
    ? (patientsOnDate.reduce((s, p) => s + p.severity, 0) / patientsOnDate.length).toFixed(1)
    : null;

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb",
      borderRadius: 8, padding: "12px 16px", marginTop: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a5f" }}>
          Environmental &amp; Symptom Timeline
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPlaying(p => !p)}
            style={{
              padding: "4px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer",
              background: playing ? "#dc2626" : "#1e3a5f", color: "#fff", border: "none",
            }}
          >
            {playing ? "⏹ Stop" : "▶ Play"}
          </button>
          <button
            onClick={() => { setSliderVal(0); setPlaying(false); }}
            style={{ padding: "4px 8px", fontSize: 12, borderRadius: 4, cursor: "pointer", border: "1px solid #d1d5db", background: "#f9fafb" }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Sparkline */}
      <DaySparkline
        readings={dayReadings}
        patients={patientsOnDate}
        selectedTime={selectedDate}
      />

      {/* Slider */}
      <div style={{ marginTop: 6 }}>
        <input
          type="range" min={0} max={100} step={100 / Math.max(totalDays, 1)}
          value={sliderVal}
          onChange={e => setSliderVal(parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
          <span>{formatDateLabel(dateRange.min)}</span>
          <span style={{ fontWeight: 600, color: "#374151" }}>
            {formatDateLabel(selectedDate)}
          </span>
          <span>{formatDateLabel(dateRange.max)}</span>
        </div>
      </div>

      {/* Env + score stats for selected date */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {[
          { label: "PSI",      value: currentEnv?.psi,  color: "#2d5a8e" },
          { label: "PM2.5",    value: currentEnv?.pm25, color: "#7c3aed" },
          { label: "O3",       value: currentEnv?.o3,   color: "#0891b2" },
          { label: "CO",       value: currentEnv?.co,   color: "#6b7280" },
          { label: "NO2",      value: currentEnv?.no2,  color: "#b45309" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "#f0f4f8", borderRadius: 6, padding: "6px 12px", textAlign: "center", minWidth: 70,
          }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>
              {loading ? "…" : (value ?? "--")}
            </div>
          </div>
        ))}

        {/* Divider */}
        <div style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />

        <div style={{ background: "#fef2f2", borderRadius: 6, padding: "6px 12px", textAlign: "center", minWidth: 90 }}>
          <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>PATIENTS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#dc2626" }}>{patientsOnDate.length}</div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>on this date</div>
        </div>

        <div style={{ background: "#fffbeb", borderRadius: 6, padding: "6px 12px", textAlign: "center", minWidth: 90 }}>
          <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>AVG SCORE</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#d97706" }}>
            {avgScore ?? "--"}
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>symptom</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: "#6b7280" }}>
        <span>
          <span style={{ display: "inline-block", width: 20, height: 2, background: "#2d5a8e", verticalAlign: "middle", marginRight: 4 }} />
          PSI (line)
        </span>
        <span>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#059669", verticalAlign: "middle", marginRight: 4 }} />
          Low scores
        </span>
        <span>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#d97706", verticalAlign: "middle", marginRight: 4 }} />
          Moderate
        </span>
        <span>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#dc2626", verticalAlign: "middle", marginRight: 4 }} />
          High
        </span>
      </div>
    </div>
  );
}