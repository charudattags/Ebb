// Deterministic synthetic data generator for Ebb.
// Run: node scripts/generate-data.mjs
// Produces data/cohorts.json and data/borrowers.json.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

// ---------- seeded RNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260917);
const rand = () => rng();
const randRange = (lo, hi) => lo + rand() * (hi - lo);
const randInt = (lo, hi) => Math.floor(randRange(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- month helpers ----------
function ymToIndex(ym) {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}
function indexToYm(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function calMonth(idx) {
  // 0 = Jan .. 11 = Dec
  return ((idx % 12) + 12) % 12;
}
const CURRENT_YM = "2026-09";
const CURRENT_IDX = ymToIndex(CURRENT_YM);

// ---------- cohorts ----------
const rawCohorts = [
  {
    cohort_id: "flower_seller",
    trade: "Flower seller",
    raw: [1.3, 1.2, 1.0, 0.9, 0.8, 0.6, 0.6, 0.7, 0.9, 1.5, 1.6, 1.3],
    typical_recovery_weeks: 6,
    note: "Peaks Oct-Feb (wedding & festival season, Diwali). Buys stock a month ahead of demand, so cash is tightest in Sept/Mar even though sales aren't at their lowest then. Quiet through the monsoon (Jun-Aug).",
  },
  {
    cohort_id: "construction_labor",
    trade: "Construction laborer",
    raw: [1.1, 1.1, 1.0, 1.0, 0.9, 0.5, 0.4, 0.4, 0.6, 1.0, 1.2, 1.2],
    typical_recovery_weeks: 4,
    note: "Work collapses across the monsoon (Jun-Aug) when sites shut down, and recovers once the ground dries out in autumn.",
  },
  {
    cohort_id: "farm_produce",
    trade: "Farm produce seller",
    raw: [0.9, 1.0, 1.4, 1.3, 0.9, 0.7, 0.7, 0.8, 1.0, 1.3, 1.3, 0.9],
    typical_recovery_weeks: 3,
    note: "Tracks two harvests: rabi (Mar-Apr) and kharif (Oct-Nov). Buys seed/inputs a month ahead of each harvest window.",
  },
  {
    cohort_id: "tailor",
    trade: "Tailor",
    raw: [0.9, 0.9, 1.2, 1.3, 1.0, 0.8, 0.7, 0.8, 1.3, 1.4, 1.3, 1.1],
    typical_recovery_weeks: 3,
    note: "Wedding season (Mar-Apr) and festival season (Sep-Nov) drive orders; buys fabric a month ahead of both.",
  },
  {
    cohort_id: "street_food",
    trade: "Street food vendor",
    raw: [1.05, 1.05, 1.05, 1.05, 1.0, 0.8, 0.75, 0.85, 1.0, 1.1, 1.1, 1.05],
    typical_recovery_weeks: 2,
    note: "Mostly steady footfall-driven trade with a mild monsoon dip (Jun-Aug) when fewer people are out in the evenings.",
  },
  {
    cohort_id: "dairy",
    trade: "Dairy farmer",
    raw: [1.1, 1.1, 1.0, 0.95, 0.9, 0.9, 0.9, 0.9, 0.95, 1.0, 1.1, 1.15],
    typical_recovery_weeks: 2,
    note: "Demand and yield are both fairly stable year-round, with a small winter uptick.",
  },
  {
    cohort_id: "handicraft",
    trade: "Handicraft maker",
    raw: [0.8, 0.8, 0.85, 0.9, 0.9, 0.9, 0.95, 1.0, 1.1, 1.4, 1.5, 1.3],
    typical_recovery_weeks: 5,
    note: "Export and festival gifting orders concentrate Oct-Dec; buys raw material a month ahead of the order book filling up.",
  },
  {
    cohort_id: "auto_rickshaw",
    trade: "Auto-rickshaw driver",
    raw: [1.05, 1.1, 1.05, 0.95, 0.95, 0.85, 0.75, 0.8, 0.95, 1.15, 1.2, 1.1],
    typical_recovery_weeks: 3,
    note: "Fewer fares in the monsoon (Jun-Aug); picks up for exam season and festival travel (Oct-Feb). Vehicle upkeep spend rises just ahead of the festival rush.",
  },
  {
    cohort_id: "tourism_vendor",
    trade: "Tourism vendor",
    raw: [1.4, 1.5, 1.2, 1.0, 0.8, 0.5, 0.4, 0.4, 0.5, 0.9, 1.3, 1.5],
    typical_recovery_weeks: 6,
    note: "Tourist season runs Nov-Feb; the monsoon (Jun-Sep) is a near-total washout. Stocks up for the season a month before visitors return.",
  },
  {
    cohort_id: "grocery",
    trade: "Kirana store owner",
    raw: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.2, 1.25, 1.0],
    typical_recovery_weeks: 2,
    note: "Steady staple demand year-round with a festival bump (Oct-Nov) that requires stocking up in September.",
  },
];

const cohorts = rawCohorts.map((c) => {
  const mean = c.raw.reduce((a, b) => a + b, 0) / 12;
  const seasonal_profile = c.raw.map((v) => Number((v / mean).toFixed(4)));
  return {
    cohort_id: c.cohort_id,
    trade: c.trade,
    seasonal_profile,
    typical_recovery_weeks: c.typical_recovery_weeks,
    note: c.note,
  };
});
const cohortById = Object.fromEntries(cohorts.map((c) => [c.cohort_id, c]));

// ---------- borrower plan: cohort x archetype x history ----------
// Dip cohorts: September lands in (or just ahead of) their low season.
// Neutral cohorts: September is at or above their baseline.
const PLAN = [
  {
    cohort: "flower_seller",
    rows: [
      { archetype: "seasonal_in_dip", h: 30, name: "Meena Devi" },
      { archetype: "seasonal_in_dip", h: 26 },
      { archetype: "structural", h: 27, marginCompression: true },
      { archetype: "flat", h: 20 },
      { archetype: "improving", h: 23 },
    ],
  },
  {
    cohort: "construction_labor",
    rows: [
      { archetype: "seasonal_in_dip", h: 25 },
      { archetype: "temporary_shock", h: 22 },
      { archetype: "flat", h: 18 },
      { archetype: "flat", h: 24 },
      { archetype: "thin_file", h: 8 },
    ],
  },
  {
    cohort: "farm_produce",
    rows: [
      { archetype: "seasonal_in_dip", h: 24 },
      { archetype: "flat", h: 29 },
      { archetype: "flat", h: 16 },
      { archetype: "improving", h: 21 },
      { archetype: "structural", h: 28, marginCompression: false },
    ],
  },
  {
    cohort: "tailor",
    rows: [
      { archetype: "seasonal", h: 26 },
      { archetype: "seasonal", h: 24 },
      { archetype: "seasonal", h: 18 },
      { archetype: "seasonal", h: 20 },
      { archetype: "seasonal", h: 17 },
    ],
  },
  {
    cohort: "street_food",
    rows: [
      { archetype: "seasonal", h: 28 },
      { archetype: "seasonal", h: 22 },
      { archetype: "seasonal", h: 19 },
      { archetype: "seasonal", h: 24 },
      { archetype: "seasonal", h: 21 },
    ],
  },
  {
    cohort: "dairy",
    rows: [
      { archetype: "flat", h: 30 },
      { archetype: "flat", h: 26 },
      { archetype: "flat", h: 18 },
      { archetype: "improving", h: 20 },
      { archetype: "thin_file", h: 6 },
    ],
  },
  {
    cohort: "handicraft",
    rows: [
      { archetype: "seasonal_in_dip", h: 29 },
      { archetype: "seasonal_in_dip", h: 25 },
      { archetype: "temporary_shock", h: 20 },
      { archetype: "flat", h: 23 },
      { archetype: "structural", h: 27, marginCompression: true },
    ],
  },
  {
    cohort: "auto_rickshaw",
    rows: [
      { archetype: "seasonal_in_dip", h: 24 },
      { archetype: "temporary_shock", h: 21 },
      { archetype: "structural", h: 23, marginCompression: false },
      { archetype: "flat", h: 26 },
      { archetype: "flat", h: 17 },
    ],
  },
  {
    cohort: "tourism_vendor",
    rows: [
      { archetype: "seasonal_in_dip", h: 31 },
      { archetype: "seasonal_in_dip", h: 26 },
      { archetype: "temporary_shock", h: 23 },
      { archetype: "improving", h: 20 },
      { archetype: "improving", h: 29 },
    ],
  },
  {
    cohort: "grocery",
    rows: [
      { archetype: "seasonal_in_dip", h: 22 },
      { archetype: "temporary_shock", h: 24 },
      { archetype: "flat", h: 21 },
      { archetype: "flat", h: 18 },
      { archetype: "structural", h: 25, marginCompression: true },
    ],
  },
];

const FEMALE_FIRST = ["Meena", "Lakshmi", "Sunita", "Radha", "Kavita", "Anita", "Geeta", "Pooja", "Rekha", "Sarita", "Kamla", "Shanti", "Vimla", "Usha", "Nirmala", "Savita", "Manju", "Asha", "Suman", "Kiran", "Jyoti", "Rani", "Parvati", "Yamuna", "Chandni"];
const MALE_FIRST = ["Ramesh", "Suresh", "Manoj", "Rajesh", "Dinesh", "Vijay", "Anil", "Sunil", "Ashok", "Prakash", "Ravi", "Sanjay", "Mahesh", "Naresh", "Vinod", "Ganesh", "Arun", "Deepak", "Santosh", "Rakesh", "Mohan", "Gopal", "Shyam", "Harish", "Bhupendra"];
const LAST = ["Devi", "Kumari", "Sharma", "Verma", "Yadav", "Singh", "Patel", "Reddy", "Nair", "Gupta", "Das", "Mehta", "Joshi", "Chauhan", "Rathore", "Naidu", "Iyer", "Pillai", "Shah", "Bhat", "Sinha", "Mishra", "Pandey", "Rao", "Kohli"];
const REGIONS = ["Karnataka", "Maharashtra", "Tamil Nadu", "West Bengal", "Uttar Pradesh", "Rajasthan", "Bihar", "Gujarat", "Kerala", "Odisha", "Madhya Pradesh", "Assam"];

let nameIdx = 0;
function nextName(preferFemale) {
  if (preferFemale === undefined) preferFemale = rand() < 0.6;
  const first = preferFemale ? FEMALE_FIRST[nameIdx % FEMALE_FIRST.length] : MALE_FIRST[nameIdx % MALE_FIRST.length];
  const last = LAST[(nameIdx * 7) % LAST.length];
  nameIdx++;
  return `${first} ${last}`;
}

function emiFor(principal, apr, tenureMonths) {
  const r = apr / 1200;
  const factor = Math.pow(1 + r, tenureMonths);
  const emi = (principal * r * factor) / (factor - 1);
  return Math.round(emi);
}

// seasonality strength: how much of the cohort's seasonal_profile actually
// shows up in this borrower's own income/business/txn pattern.
function seasonalStrengthFor(archetype) {
  switch (archetype) {
    case "seasonal":
    case "seasonal_in_dip":
      return randRange(0.9, 1.1);
    case "flat":
    case "thin_file":
      return randRange(0.12, 0.25);
    case "structural":
    case "temporary_shock":
    case "improving":
      return randRange(0.08, 0.18);
    default:
      return 0.5;
  }
}

// capacity-factor trajectories (0-indexed month position i in [0, H-1])
function buildCapFactor(archetype, H, opts, params = {}) {
  const arr = new Array(H).fill(1);
  if (archetype === "structural") {
    const endFactor = params.endFactor ?? 0.5;
    const rate = (1 - endFactor) / Math.max(1, H - 1);
    for (let i = 0; i < H; i++) arr[i] = 1 - rate * i;
  } else if (archetype === "improving") {
    const endFactor = 1.55;
    const rate = (endFactor - 1) / Math.max(1, H - 1);
    for (let i = 0; i < H; i++) arr[i] = 1 + rate * i;
  } else if (archetype === "temporary_shock") {
    const s0 = H - 6;
    const trough = params.trough ?? 0.32;
    const recoveredEnd = params.recoveredEnd ?? 0.85;
    for (let i = 0; i < H; i++) {
      if (i < s0) arr[i] = 1;
      else if (i === s0) arr[i] = 0.6;
      else {
        const span = H - 1 - (s0 + 1);
        const t = span > 0 ? (i - (s0 + 1)) / span : 1;
        arr[i] = trough + (recoveredEnd - trough) * t;
      }
    }
    opts.shockWindow = [s0, s0 + 1];
  }
  return arr;
}

// deterministic (no-noise) surplus at a given month index, used to calibrate
// dip/shock/decline amplitude so the current month reliably breaches EMI
// for the archetypes that should be flagged this month.
function probeSurplus(i, loanStartIdx, cohort, seasonalStrength, capIncome, capTxn, baseIncome, baseEssential, baseBusiness) {
  const idx = loanStartIdx + i;
  const cm = calMonth(idx);
  const cmNext = calMonth(idx + 1);
  const seasIncome = 1 + seasonalStrength * (cohort.seasonal_profile[cm] - 1);
  const seasBiz = 1 + seasonalStrength * (cohort.seasonal_profile[cmNext] - 1);
  const income = baseIncome * seasIncome * capIncome[i];
  const business = baseBusiness * seasBiz * capTxn[i];
  return income - baseEssential - business;
}

const MARGIN_FLAT_TXN_STRENGTH = 0.06; // near-flat txn_count for margin-compression borrowers

const P_DISTRESS = 0.32; // chance a short month is covered by borrowing elsewhere

let distressCount = 0;
let borrowers = [];
let bIdCounter = 1;

for (const group of PLAN) {
  const cohort = cohortById[group.cohort];
  for (const row of group.rows) {
    const id = `B${String(bIdCounter).padStart(3, "0")}`;
    bIdCounter++;
    const H = row.h;
    const loanStartIdx = CURRENT_IDX - (H - 1);
    const loan_start = indexToYm(loanStartIdx);

    const archetype = row.archetype;
    const marginCompression = !!row.marginCompression;
    const preferFemale = row.name ? true : undefined;
    const name = row.name || nextName(preferFemale);
    const region = pick(REGIONS);

    const principal = randInt(20, 100) * 1000;
    const apr = randInt(19, 26);
    const tenure_months = Math.min(48, H + randInt(6, 18));
    const emi = emiFor(principal, apr, tenure_months);

    // baseline income calibrated relative to EMI so that a typical
    // (non-seasonal) month covers EMI comfortably, but a deep dip does not.
    const essentialFrac = randRange(0.2, 0.28);
    const businessFrac = randRange(0.32, 0.42);
    const fracRemaining = 1 - essentialFrac - businessFrac;
    const targetSurplusRatio = randRange(1.35, 1.85); // baseline surplus as a multiple of EMI
    const baseIncome = (emi * targetSurplusRatio) / fracRemaining;
    const baseEssential = baseIncome * essentialFrac;
    const baseBusiness = baseIncome * businessFrac;
    const baseTxn = randInt(50, 220);

    let seasonalStrength = seasonalStrengthFor(archetype);
    const capOpts = {};
    const shockParams = { trough: 0.3, recoveredEnd: 0.8 };
    let capFactorIncome = buildCapFactor(archetype, H, capOpts, shockParams);
    let capFactorTxn = marginCompression
      ? new Array(H).fill(1).map(() => 1 + randRange(-MARGIN_FLAT_TXN_STRENGTH, MARGIN_FLAT_TXN_STRENGTH))
      : capFactorIncome;

    // Calibrate so the flagged archetypes reliably fall short of EMI this
    // month (deterministic probe, no noise) — the shortfall must be real,
    // not an artifact of random draws washing it out.
    const currentI = H - 1;
    if (archetype === "seasonal_in_dip") {
      const target = randRange(0.45, 0.85);
      let guard = 0;
      while (
        probeSurplus(currentI, loanStartIdx, cohort, seasonalStrength, capFactorIncome, capFactorTxn, baseIncome, baseEssential, baseBusiness) >
          target * emi &&
        guard < 40
      ) {
        seasonalStrength *= 1.15;
        guard++;
      }
    } else if (archetype === "temporary_shock") {
      const target = randRange(0.45, 0.85);
      let guard = 0;
      while (
        probeSurplus(currentI, loanStartIdx, cohort, seasonalStrength, capFactorIncome, capFactorTxn, baseIncome, baseEssential, baseBusiness) >
          target * emi &&
        guard < 40
      ) {
        shockParams.recoveredEnd = Math.max(0.15, shockParams.recoveredEnd - 0.05);
        shockParams.trough = Math.max(0.1, shockParams.trough - 0.02);
        capFactorIncome = buildCapFactor(archetype, H, capOpts, shockParams);
        capFactorTxn = capFactorIncome;
        guard++;
      }
    } else if (archetype === "structural") {
      const target = randRange(0.15, 0.55);
      let guard = 0;
      let endFactor = 0.5;
      while (
        probeSurplus(currentI, loanStartIdx, cohort, seasonalStrength, capFactorIncome, capFactorTxn, baseIncome, baseEssential, baseBusiness) >
          target * emi &&
        guard < 40
      ) {
        endFactor = Math.max(0.05, endFactor - 0.05);
        capFactorIncome = buildCapFactor(archetype, H, capOpts, { endFactor });
        capFactorTxn = marginCompression
          ? capFactorTxn
          : capFactorIncome;
        guard++;
      }
    }

    const monthly_records = [];
    for (let i = 0; i < H; i++) {
      const idx = loanStartIdx + i;
      const month = indexToYm(idx);
      const cm = calMonth(idx);
      const cmNext = calMonth(idx + 1);

      const seasIncome = 1 + seasonalStrength * (cohort.seasonal_profile[cm] - 1);
      const seasBiz = 1 + seasonalStrength * (cohort.seasonal_profile[cmNext] - 1);

      const noiseIncome = 1 + randRange(-0.03, 0.03);
      const noiseBiz = 1 + randRange(-0.035, 0.035);
      const noiseEss = 1 + randRange(-0.02, 0.02);
      const noiseTxn = 1 + randRange(-0.03, 0.03);

      const income = Math.round(baseIncome * seasIncome * capFactorIncome[i] * noiseIncome);
      let expenses_business = Math.round(baseBusiness * seasBiz * capFactorTxn[i] * noiseBiz);
      const expenses_essential = Math.round(baseEssential * noiseEss);
      const txn_count = Math.max(5, Math.round(baseTxn * seasIncome * capFactorTxn[i] * noiseTxn));

      const emi_due = emi;
      const isCurrentFlagMonth =
        i === H - 1 && (archetype === "structural" || archetype === "seasonal_in_dip" || archetype === "temporary_shock");

      // Noise can occasionally wash out a calibrated dip right at the
      // current month; top up the (realistic) lead-in stock purchase so
      // the flagged archetypes reliably fall short this month.
      if (isCurrentFlagMonth) {
        const provisional = income - expenses_essential - expenses_business;
        const targetRatio = randRange(0.45, 0.85);
        if (provisional >= 0.92 * emi_due) {
          expenses_business += Math.round(provisional - targetRatio * emi_due);
        }
      }

      const surplus = income - expenses_essential - expenses_business;

      let amount_paid, days_late;
      if (surplus >= emi_due) {
        amount_paid = emi_due;
        days_late = i === H - 1 ? 0 : rand() < 0.06 ? randInt(1, 4) : 0;
      } else {
        const isDistress = !isCurrentFlagMonth && rand() < P_DISTRESS;
        if (isDistress) {
          amount_paid = emi_due;
          days_late = 0;
          distressCount++;
        } else {
          const payFrac = Math.max(0, Math.min(1, surplus / emi_due));
          amount_paid = Math.max(0, Math.round(emi_due * payFrac * randRange(0.7, 1.0)));
          const severity = Math.max(0, Math.min(1, (emi_due - surplus) / emi_due));
          days_late = Math.round(severity * randInt(15, 30)) + randInt(3, 10);
        }
      }

      monthly_records.push({
        month,
        income,
        expenses_essential,
        expenses_business,
        txn_count,
        emi_due,
        amount_paid,
        days_late,
      });
    }

    borrowers.push({
      id,
      name,
      trade: cohort.trade,
      region,
      cohort_id: cohort.cohort_id,
      principal,
      apr,
      tenure_months,
      loan_start,
      history_months: H,
      emi,
      monthly_records,
      ground_truth: {
        archetype,
        margin_compression: marginCompression,
        shock_window: capOpts.shockWindow || null,
      },
    });
  }
}

// ---------- stats / sanity check ----------
const currentLate = borrowers.filter((b) => {
  const last = b.monthly_records[b.monthly_records.length - 1];
  return last.amount_paid < last.emi_due || last.days_late > 0;
});
const byArchetype = {};
for (const b of borrowers) {
  const a = b.ground_truth.archetype;
  byArchetype[a] = (byArchetype[a] || 0) + 1;
}

console.log("Borrowers:", borrowers.length);
console.log("Archetype counts:", byArchetype);
console.log("Margin compression count:", borrowers.filter((b) => b.ground_truth.margin_compression).length);
console.log("Distress-payment months:", distressCount);
console.log("Late in current month (Sept 2026):", currentLate.length, currentLate.map((b) => b.id).join(","));

writeFileSync(join(DATA_DIR, "cohorts.json"), JSON.stringify(cohorts, null, 2));
writeFileSync(join(DATA_DIR, "borrowers.json"), JSON.stringify(borrowers, null, 2));
console.log("Wrote data/cohorts.json and data/borrowers.json");
