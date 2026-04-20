import { ENV_API } from "./config";

function getPsiStatus(value) {
  if (value == null) return "loading";
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  return "Unhealthy";
}

function getPm25Status(value) {
  if (value == null) return "loading";
  if (value <= 55) return "Good";
  if (value <= 150) return "Moderate";
  return "Unhealthy";
}

function getSubIndexStatus(value) {
  if (value == null) return "loading";
  if (value <= 50) return "Good";
  return "Moderate";
}

const DEMO_ENV = {
  psi: 42, pm25: 18, o3: 12, co: 5, so2: 7, no2: 20,
  psiStatus: "Good",
  pm25Status: "Good",
  timestamp: new Date().toISOString(),
  regional: {
    psi:  { north: 40, south: 45, east: 38, west: 42, central: 44 },
    pm25: { north: 16, south: 20, east: 15, west: 18, central: 19 },
  },
  isDemo: true,
};

export async function fetchEnvironmentData() {
  try {
    const [psiRes, pm25Res] = await Promise.all([
      fetch(ENV_API.psi).then(r => {
        if (!r.ok) throw new Error(`PSI API ${r.status}`);
        return r.json();
      }),
      fetch(ENV_API.pm25).then(r => {
        if (!r.ok) throw new Error(`PM25 API ${r.status}`);
        return r.json();
      }),
    ]);

    // v2 structure
    const psiData = psiRes?.data?.readings;
    const pm25Data = pm25Res?.data?.readings;

    if (!psiData) {
      console.warn("PSI response missing readings:", psiRes);
      return DEMO_ENV;
    }

    const timestamp =
      psiRes?.data?.timestamp || new Date().toISOString();

    // ---- National values ----
    const natPsi  = psiData.psi_twenty_four_hourly?.national ?? null;
    const natPm25 = pm25Data?.pm25_one_hourly?.national ?? null;

    const natO3  = psiData.o3_sub_index?.national ?? null;
    const natCo  = psiData.co_sub_index?.national ?? null;
    const natSo2 = psiData.so2_sub_index?.national ?? null;
    const natNo2 = psiData.no2_one_hour_max?.national ?? null;

    return {
      psi: natPsi,
      pm25: natPm25,
      o3: natO3,
      co: natCo,
      so2: natSo2,
      no2: natNo2,

      psiStatus: getPsiStatus(natPsi),
      pm25Status: getPm25Status(natPm25),
      o3Status: getSubIndexStatus(natO3),
      coStatus: getSubIndexStatus(natCo),

      timestamp,

      regional: {
        psi:  psiData.psi_twenty_four_hourly || {},
        pm25: pm25Data?.pm25_one_hourly || {},
      },

      isDemo: false,
    };

  } catch (err) {
    console.error("Environment API fetch failed:", err);
    return DEMO_ENV;
  }
}