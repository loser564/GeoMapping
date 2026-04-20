// csvParser.js
// Handles CSV file reading, parsing, and validation.
// Supports pre-geocoded CSVs (with lat/lng from postal_geocoder.py output).

// Parses a single CSV line respecting quoted fields (handles comorbidities with commas)
function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// Column alias mapping - maps internal field names to possible CSV header names
const COLUMN_ALIASES = {
  id:               ["chatbot_id", "id", "patient_id", "patientid", "pid"],
  lat:              ["lat", "latitude"],
  lng:              ["lng", "longitude", "lon", "long"],
  severity:         ["severity", "score", "symptom_score", "symptom_severity", "total_score"],
  symptoms:         ["comorbidities", "symptoms", "symptom", "diagnosis", "condition"],
  age:              ["dob", "age", "patient_age", "date_of_birth"],
  timestamp:        ["timestamp", "date", "datetime", "recorded_at", "created_at"],
  gender:           ["gender", "sex"],
  race:             ["race", "ethnicity"],
  postal:           ["postal_full", "postal_deidentified", "postal", "postal_code", "postcode"],
  smoking:          ["smoking_habit_self", "smoking", "smoker"],
  alcohol:          ["alcohol_habit", "alcohol"],
  marital:          ["marital_status", "marital"],
  education:        ["education_level", "education"],
  property:         ["property_type", "property", "housing"],
  patientClass:     ["patient_class", "class"],
  smokingHousehold: ["smoking_habit_household"],
  addressResolved:  ["address_resolved", "address"],
};

function resolveColumn(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Derive a 1-10 severity score from comorbidities string
function deriveSeverity(comorbidities) {
  if (!comorbidities || comorbidities.trim() === "") return 1;
  const cleaned = comorbidities
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s !== "none" && s !== "nil" && s !== "na" && s !== "");
  const count = cleaned.length;
  if (count === 0) return 1;
  if (count === 1) return 3;
  if (count === 2) return 5;
  if (count === 3) return 7;
  return Math.min(10, 7 + (count - 3));
}

// Parse DD/MM/YYYY or D/M/YYYY (Singapore format) into age
function dobToAge(dob) {
  if (!dob) return 0;
  const parts = dob.split("/");
  let d;
  if (parts.length === 3) {
    const [day, month, year] = parts;
    d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  } else {
    d = new Date(dob);
  }
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
}

export function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { patients: [], errors: ["File has fewer than 2 lines."] };

  // Parse header line
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  // Resolve column indices from aliases
  const col = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    col[field] = resolveColumn(headers, aliases);
  }

  // Validate: must have lat/lng
  const hasCoords = col.lat !== -1 && col.lng !== -1;
  if (!hasCoords) {
    return {
      patients: [],
      errors: [
        "CSV has no lat/lng columns.",
        "Run postal_geocoder.py first to geocode your data,",
        "then upload the geocoded output file.",
        "Detected headers: " + headers.join(", "),
      ],
    };
  }

  const patients = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Use quote-aware parser for every row
    const vals = parseCSVLine(line);

    // Parse coordinates
    const lat = parseFloat(vals[col.lat] || "");
    const lng = parseFloat(vals[col.lng] || "");

    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      errors.push(`Row ${i + 1}: invalid coordinates (lat=${vals[col.lat]}, lng=${vals[col.lng]})`);
      continue;
    }

    // Severity: use explicit column if present, otherwise derive from comorbidities
    let severity = 1;
    if (col.severity >= 0 && vals[col.severity]) {
      severity = parseInt(vals[col.severity]) || 1;
    } else if (col.symptoms >= 0) {
      severity = deriveSeverity(vals[col.symptoms]);
    }

    // Age: parse from dob (DD/MM/YYYY) or direct integer
    let age = 0;
    if (col.age >= 0 && vals[col.age]) {
      const raw = vals[col.age];
      age = raw.includes("/") ? dobToAge(raw) : (parseInt(raw) || 0);
    }

    // Helper to safely get a value by column index
    const get = (field) => col[field] >= 0 ? (vals[col[field]] || "") : "";

    patients.push({
      id:               get("id") || `P${i}`,
      lat,
      lng,
      severity,
      symptoms:         get("symptoms") || "unknown",
      age,
      timestamp:        get("timestamp") || new Date().toISOString(),
      gender:           get("gender"),
      race:             get("race"),
      postal:           get("postal"),
      smoking:          get("smoking"),
      smokingHousehold: get("smokingHousehold"),
      alcohol:          get("alcohol"),
      marital:          get("marital"),
      education:        get("education"),
      property:         get("property"),
      patientClass:     get("patientClass"),
      address:          get("addressResolved"),
    });
  }

  return { patients, errors };
}

export function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(parseCSV(e.target.result));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}