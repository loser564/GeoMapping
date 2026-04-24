// HeatmapCanvas.jsx
// Renders patient heatmap overlaid on OpenStreetMap tiles.
// Supports pan, zoom, and severity/symptom filtering.

import { useRef, useEffect, useState, useCallback } from "react";
import { SG_CENTER, SEVERITY_COLORS } from "./config";

// Tile math helpers
function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

function latToTileY(lat, zoom) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, zoom);
}

function lngLatToPixel(lng, lat, zoom, originX, originY) {
  const x = lngToTileX(lng, zoom) * 256 - originX;
  const y = latToTileY(lat, zoom) * 256 - originY;
  return { x, y };
}

function pixelToLngLat(px, py, zoom, originX, originY) {
  const worldX = (px + originX) / 256;
  const worldY = (py + originY) / 256;
  const n = Math.pow(2, zoom);
  const lng = (worldX / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

// Tile image cache
const tileCache = {};
function getTileImage(x, y, z) {
  const key = `${z}/${x}/${y}`;
  if (tileCache[key]) return tileCache[key];

  const img = new Image();
  img.crossOrigin = "anonymous";
  // Use OSM tile server with subdomains for parallelism
  const s = ["a", "b", "c"][Math.abs(x + y) % 3];
  img.src = `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
  img.onload = () => { tileCache[key].loaded = true; };
  img.onerror = () => { tileCache[key].error = true; };
  tileCache[key] = { img, loaded: false, error: false };
  return tileCache[key];
}

export function filterPatients(patients, severityFilter, symptomFilter, extraFilter) {
  return patients.filter(p => {
    if (severityFilter > 0 && p.severity < severityFilter) return false;
    if (symptomFilter !== "all" && p.symptoms !== symptomFilter) return false;
    if (extraFilter && !extraFilter(p)) return false;
    return true;
  });
}

export default function HeatmapCanvas({ patients, width, height, severityFilter, symptomFilter, extraFilter }) {
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(12);
  const [center, setCenter] = useState(SG_CENTER);
  const dragRef = useRef(null);
  const rafRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    const n = Math.pow(2, zoom);
    const centerTileX = lngToTileX(center.lng, zoom);
    const centerTileY = latToTileY(center.lat, zoom);
    const originX = centerTileX * 256 - width / 2;
    const originY = centerTileY * 256 - height / 2;

    // Draw OSM tiles
    const tileXStart = Math.floor(originX / 256);
    const tileYStart = Math.floor(originY / 256);
    const tileXEnd = Math.ceil((originX + width) / 256);
    const tileYEnd = Math.ceil((originY + height) / 256);

    let allLoaded = true;
    for (let tx = tileXStart; tx <= tileXEnd; tx++) {
      for (let ty = tileYStart; ty <= tileYEnd; ty++) {
        const wrappedX = ((tx % n) + n) % n;
        if (ty < 0 || ty >= n) continue;

        const tile = getTileImage(wrappedX, ty, zoom);
        const screenX = tx * 256 - originX;
        const screenY = ty * 256 - originY;

        if (tile.loaded) {
          ctx.drawImage(tile.img, screenX, screenY, 256, 256);
        } else {
          allLoaded = false;
          ctx.fillStyle = "#e8eef5";
          ctx.fillRect(screenX, screenY, 256, 256);
          ctx.strokeStyle = "#d1d5db";
          ctx.strokeRect(screenX, screenY, 256, 256);
        }
      }
    }

    // Re-render once tiles load
    if (!allLoaded) {
      setTimeout(() => { draw(); }, 200);
    }

    // Filter patients
    const filtered = filterPatients(patients, severityFilter, symptomFilter, extraFilter);

    // Draw heatmap blobs
    filtered.forEach(p => {
      const { x, y } = lngLatToPixel(p.lng, p.lat, zoom, originX, originY);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return;

      const baseRadius = zoom >= 14 ? 12 : zoom >= 12 ? 10 : 8;
      const radius = baseRadius + p.severity * (zoom >= 14 ? 3 : 2);
      const alpha = 0.12 + (p.severity / 10) * 0.25;

      // Colour by severity band
      const [r, g, b] = p.severity >= 7 ? [220, 40, 40]    // red   - high
                      : p.severity >= 4 ? [217, 119, 6]    // amber - moderate
                      :                   [5,   150, 105];  // green - low

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0,   `rgba(${r}, ${g}, ${b}, ${alpha})`);
      gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${alpha * 0.2})`);
      gradient.addColorStop(1,   `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw dots
    const dotSize = zoom >= 14 ? 4 : zoom >= 12 ? 3 : 2;
    filtered.forEach(p => {
      const { x, y } = lngLatToPixel(p.lng, p.lat, zoom, originX, originY);
      if (x < -10 || x > width + 10 || y < -10 || y > height + 10) return;

      if (p.severity >= 7)      ctx.fillStyle = SEVERITY_COLORS.high;
      else if (p.severity >= 4) ctx.fillStyle = SEVERITY_COLORS.moderate;
      else                      ctx.fillStyle = SEVERITY_COLORS.low;

      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Zoom control and attribution overlay
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(width - 220, height - 22, 220, 22);
    ctx.fillStyle = "#666";
    ctx.font = "10px sans-serif";
    ctx.fillText("(c) OpenStreetMap contributors", width - 215, height - 8);

    // Patient count badge
    ctx.fillStyle = "rgba(30, 58, 95, 0.85)";
    ctx.fillRect(8, 8, 110, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(`${filtered.length} patients`, 16, 24);
  }, [patients, width, height, zoom, center, severityFilter, symptomFilter, extraFilter]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse drag to pan
  const handleMouseDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng };
  };

  const handleMouseMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;

    const scale = 256 * Math.pow(2, zoom);
    const newLng = dragRef.current.lng - (dx / scale) * 360;
    const latScale = Math.cos((dragRef.current.lat * Math.PI) / 180);
    const newLat = dragRef.current.lat + (dy / scale) * 360 / latScale;

    setCenter({ lat: Math.max(-85, Math.min(85, newLat)), lng: newLng });
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  // Attach wheel listener manually with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.max(10, Math.min(18, e.deltaY < 0 ? z + 1 : z - 1)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Touch support for mobile
  const touchRef = useRef(null);
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragRef.current = { x: t.clientX, y: t.clientY, lat: center.lat, lng: center.lng };
    }
  };

  const handleTouchMove = (e) => {
    if (!dragRef.current || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.x;
    const dy = t.clientY - dragRef.current.y;

    const scale = 256 * Math.pow(2, zoom);
    const newLng = dragRef.current.lng - (dx / scale) * 360;
    const latScale = Math.cos((dragRef.current.lat * Math.PI) / 180);
    const newLat = dragRef.current.lat + (dy / scale) * 360 / latScale;

    setCenter({ lat: Math.max(-85, Math.min(85, newLat)), lng: newLng });
  };

  const handleTouchEnd = () => { dragRef.current = null; };

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 8,
          cursor: dragRef.current ? "grabbing" : "grab",
          maxWidth: "100%",
          touchAction: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {/* Zoom controls */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <button
          onClick={() => setZoom(z => Math.min(18, z + 1))}
          style={zoomBtnStyle}
        >+</button>
        <div style={{
          background: "rgba(255,255,255,0.9)", textAlign: "center",
          fontSize: 11, padding: "2px 0", color: "#374151",
        }}>
          {zoom}
        </div>
        <button
          onClick={() => setZoom(z => Math.max(10, z - 1))}
          style={zoomBtnStyle}
        >-</button>
      </div>
      {/* Reset view button */}
      <button
        onClick={() => { setCenter(SG_CENTER); setZoom(12); }}
        style={{
          position: "absolute", bottom: 30, right: 12,
          background: "rgba(255,255,255,0.9)", border: "1px solid #d1d5db",
          borderRadius: 4, padding: "4px 8px", fontSize: 11,
          cursor: "pointer", color: "#374151",
        }}
      >
        Reset
      </button>
    </div>
  );
}

const zoomBtnStyle = {
  width: 30, height: 30, fontSize: 18, fontWeight: 700,
  background: "rgba(255,255,255,0.9)", border: "1px solid #d1d5db",
  borderRadius: 4, cursor: "pointer", color: "#374151",
  display: "flex", alignItems: "center", justifyContent: "center",
};