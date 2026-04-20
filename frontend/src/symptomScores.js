// symptomScores.js
// Parses the symptom score CSV and returns a map of patient_id -> latest score.
//
// Expected columns: patient_id, responded_date, missed_medication, symptoms_score
// If a patient has multiple rows, the one with the most recent responded_date is used.

import { parseCSVLine } from "./csvParser";

const SCORE_COL_ALIASES = {
  id:           ["patient_id", "chatbot_id", "id", "patientid"],
  date:         ["responded_date", "date", "timestamp", "datetime"],
  score:        ["symptoms_score", "symptom_score", "score", "severity"],
  missedMeds:   ["missed_medication", "missed_medications", "missed_med"],
};

function resolveCol(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(raw) {
  if (!raw) return null;
  // Handle D/M/YYYY HH:MM and D/M/YYYY
  const parts = raw.trim().split(" ")[0].split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  return new Date(raw);
}

// Returns Map<patientId, { score, missedMeds, date }>
// Only the most recent entry per patient (used for current snapshot)
export function parseScoreCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return new Map();

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const col = {};
  for (const [field, aliases] of Object.entries(SCORE_COL_ALIASES)) {
    col[field] = resolveCol(headers, aliases);
  }

  if (col.id === -1 || col.score === -1) {
    console.warn("Symptom score CSV missing required columns (patient_id, symptoms_score).");
    return new Map();
  }

  // All entries per patient, sorted by date ascending
  const allEntries = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const vals = parseCSVLine(line);
    const id    = vals[col.id]?.trim();
    const score = parseInt(vals[col.score]);
    if (!id || isNaN(score)) continue;

    const date       = col.date >= 0 ? parseDate(vals[col.date]) : null;
    const missedMeds = col.missedMeds >= 0 ? parseInt(vals[col.missedMeds]) || 0 : 0;

    if (!allEntries.has(id)) allEntries.set(id, []);
    allEntries.get(id).push({
      score: Math.min(10, Math.max(1, score)),
      missedMeds,
      date,
    });
  }

  // Sort each patient's entries by date ascending
  allEntries.forEach(entries => {
    entries.sort((a, b) => (a.date || 0) - (b.date || 0));
  });

  // Latest entry per patient for snapshot use
  const latestMap = new Map();
  allEntries.forEach((entries, id) => {
    const latest = entries[entries.length - 1];
    latestMap.set(id, latest);
  });

  // Attach full history to the map for timeline use
  latestMap._allEntries = allEntries;

  return latestMap;
}

// Given a patient id and a target date, find the score that applies on that date.
// Logic: carry forward the most recent score recorded on or before the target date.
// If the target date is before the patient's first record, return null.
export function getScoreOnDate(scoreMap, patientId, targetDate) {
  const allEntries = scoreMap._allEntries;
  if (!allEntries) return null;

  const entries = allEntries.get(patientId);
  if (!entries || !entries.length) return null;

  // Find the last entry whose date is <= targetDate
  let applicable = null;
  for (const entry of entries) {
    if (!entry.date) continue;
    if (entry.date <= targetDate) {
      applicable = entry;
    } else {
      break; // entries are sorted ascending, no need to continue
    }
  }

  return applicable; // null if targetDate is before first record
}

export function readScoreFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(parseScoreCSV(e.target.result));
    reader.onerror = () => reject(new Error("Failed to read symptom score file."));
    reader.readAsText(file);
  });
}

// Merge latest scores into patient array (used on initial load).
// Patients with a real score get it; others keep their derived score.
export function mergeScores(patients, scoreMap) {
  let matched = 0;
  const merged = patients.map(p => {
    const entry = scoreMap.get(p.id);
    if (entry) {
      matched++;
      return {
        ...p,
        severity:    entry.score,
        missedMeds:  entry.missedMeds,
        scoreSource: "actual",
        scoreDate:   entry.date?.toISOString() ?? null,
      };
    }
    return { ...p, scoreSource: "derived", missedMeds: 0 };
  });
  console.info(`Symptom scores matched: ${matched} / ${patients.length}`);
  return merged;
}

// Merge scores carried forward to a specific date (used by timeline slider).
// For each patient, finds the score that was active on targetDate using
// carry-forward logic: use the most recent score on or before that date.
// Patients with no record yet on this date are excluded from the result entirely.
export function mergeScoresOnDate(patients, scoreMap, targetDate) {
  const result = [];
  for (const p of patients) {
    const entry = getScoreOnDate(scoreMap, p.id, targetDate);
    if (entry) {
      // Patient has a score on or before this date — include with carry-forward score
      result.push({
        ...p,
        severity:    entry.score,
        missedMeds:  entry.missedMeds,
        scoreSource: "actual",
        scoreDate:   entry.date?.toISOString() ?? null,
      });
    }
    // No entry before targetDate: patient not yet registered — exclude from heatmap
  }
  return result;
}