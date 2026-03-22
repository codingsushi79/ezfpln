/** Loose helpers for SimBrief JSON (`json=1`); shapes vary slightly by flight. */

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function pickStr(obj: unknown, key: string): string | undefined {
  const o = asRecord(obj);
  const v = o?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function pickNum(obj: unknown, key: string): number | undefined {
  const o = asRecord(obj);
  const v = o?.[key];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return undefined;
}

/** SimBrief often uses numbers for times; try string or number per key. */
function pickTimeValue(obj: unknown, ...keys: string[]): string | undefined {
  const o = asRecord(obj);
  if (!o) return undefined;
  for (const k of keys) {
    const sv = pickStr(o, k);
    if (sv !== undefined && sv.length > 0) return sv;
    const nv = pickNum(o, k);
    if (nv !== undefined && !Number.isNaN(nv)) return String(nv);
  }
  return undefined;
}

export function child(obj: unknown, key: string): unknown {
  const o = asRecord(obj);
  return o?.[key];
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export type AirportCard = {
  icao?: string;
  iata?: string;
  name?: string;
  elevation?: string;
  plan_rwy?: string;
  metar?: string;
  atis?: string;
};

export function parseAirport(block: unknown): AirportCard {
  const r = asRecord(block) ?? {};
  return {
    icao: pickStr(r, "icao_code") ?? pickStr(r, "icao"),
    iata: pickStr(r, "iata_code") ?? pickStr(r, "iata"),
    name: pickStr(r, "name"),
    elevation: pickStr(r, "elevation") ?? pickStr(r, "plan_elev"),
    plan_rwy: pickStr(r, "plan_rwy"),
    metar: pickStr(r, "metar") ?? pickStr(r, "metar_available"),
    atis: pickStr(r, "atis"),
  };
}

export type NavlogRow = {
  ident?: string;
  name?: string;
  type?: string;
  via_airway?: string;
  altitude?: string;
  distance?: string;
  time?: string;
  fuel?: string;
  wind?: string;
  lat?: string;
  lon?: string;
  stage?: string;
};

export function parseNavlog(ofp: unknown): NavlogRow[] {
  const nav = asRecord(child(ofp, "navlog"));
  const fixes = asArray(nav?.fix);
  return fixes.map((fix) => {
    const f = asRecord(fix) ?? {};
    const wind = asRecord(child(f, "wind_data"));
    const windLevel = asRecord(child(wind, "level")) ?? wind;
    const windStr =
      pickStr(windLevel, "dir") && pickStr(windLevel, "spd")
        ? `${pickStr(windLevel, "dir")}° / ${pickStr(windLevel, "spd")} kt`
        : undefined;
    return {
      ident: pickStr(f, "ident"),
      name: pickStr(f, "name"),
      type: pickStr(f, "type"),
      via_airway: pickStr(f, "via_airway"),
      altitude: pickStr(f, "altitude") ?? pickStr(f, "flightphase"),
      distance: pickStr(f, "distance"),
      time: pickStr(f, "time_leg") ?? pickStr(f, "time_total"),
      fuel: pickStr(f, "fuel_leg") ?? pickStr(f, "fuel_totalused"),
      wind: windStr,
      lat: pickStr(f, "pos_lat"),
      lon: pickStr(f, "pos_long"),
      stage: pickStr(f, "stage"),
    };
  });
}

export type LatLng = { lat: number; lng: number };

function coordFromRecord(r: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = pickNum(r, k);
    if (n !== undefined && Number.isFinite(n)) return n;
    const s = pickStr(r, k);
    if (s) {
      const v = Number.parseFloat(s);
      if (Number.isFinite(v)) return v;
    }
  }
  return undefined;
}

function parseCoordBlock(block: unknown): LatLng | null {
  const r = asRecord(block);
  if (!r) return null;
  const latV = coordFromRecord(r, ["pos_lat", "latitude", "lat"]);
  const lngV = coordFromRecord(r, ["pos_long", "pos_lon", "longitude", "lng", "lon"]);
  if (
    latV === undefined ||
    lngV === undefined ||
    !Number.isFinite(latV) ||
    !Number.isFinite(lngV)
  ) {
    return null;
  }
  return { lat: latV, lng: lngV };
}

/** Ordered route points for maps: origin → nav fixes → destination. */
export function parseRouteLatLngs(ofp: unknown): LatLng[] {
  const pts: LatLng[] = [];
  const push = (p: LatLng | null) => {
    if (!p) return;
    const last = pts[pts.length - 1];
    if (
      last &&
      Math.abs(last.lat - p.lat) < 1e-7 &&
      Math.abs(last.lng - p.lng) < 1e-7
    ) {
      return;
    }
    pts.push(p);
  };
  push(parseCoordBlock(child(ofp, "origin")));
  const nav = asRecord(child(ofp, "navlog"));
  for (const fix of asArray(nav?.fix)) {
    push(parseCoordBlock(fix));
  }
  push(parseCoordBlock(child(ofp, "destination")));
  return pts;
}

export type RouteWaypointMarker = { lat: number; lng: number; ident: string };

/** Fixes with coordinates for map pins (origin, navlog fixes, destination). */
export function parseRouteWaypointMarkers(ofp: unknown): RouteWaypointMarker[] {
  const out: RouteWaypointMarker[] = [];
  const push = (p: LatLng | null, ident: string) => {
    if (!p || !ident.trim()) return;
    const last = out[out.length - 1];
    if (
      last &&
      Math.abs(last.lat - p.lat) < 1e-7 &&
      Math.abs(last.lng - p.lng) < 1e-7
    ) {
      return;
    }
    out.push({ lat: p.lat, lng: p.lng, ident: ident.trim() });
  };
  const origin = asRecord(child(ofp, "origin")) ?? {};
  push(
    parseCoordBlock(child(ofp, "origin")),
    pickStr(origin, "icao_code") ??
      pickStr(origin, "icao") ??
      "DEP",
  );
  const nav = asRecord(child(ofp, "navlog"));
  for (const fix of asArray(nav?.fix)) {
    const f = asRecord(fix) ?? {};
    const ident =
      pickStr(f, "ident") ?? pickStr(f, "name") ?? "·";
    push(parseCoordBlock(fix), ident);
  }
  const dest = asRecord(child(ofp, "destination")) ?? {};
  push(
    parseCoordBlock(child(ofp, "destination")),
    pickStr(dest, "icao_code") ?? pickStr(dest, "icao") ?? "ARR",
  );
  return out;
}

export type FuelLine = { label: string; value: string };

/** Display suffixes derived from SimBrief `params.units` (weights & fuel). */
export type UnitContext = {
  /** e.g. "lb", "kg" */
  weightShort: string;
  /** e.g. "pounds", "kilograms" */
  weightLong: string;
  raw: string | undefined;
};

export function parseUnitContext(ofp: unknown): UnitContext {
  const p = asRecord(child(ofp, "params")) ?? {};
  const raw = pickStr(p, "units")?.toUpperCase();
  if (raw === "KGS" || raw === "KG") {
    return { weightShort: "kg", weightLong: "kilograms", raw };
  }
  if (raw === "LBS" || raw === "LB") {
    return { weightShort: "lb", weightLong: "pounds", raw };
  }
  return { weightShort: "kg", weightLong: "kilograms", raw };
}

/** True if value looks like a plain number (safe to append weight unit). */
function isBareNumberString(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s.trim());
}

function withWeightUnit(val: string, u: UnitContext): string {
  const t = val.trim();
  if (!t) return val;
  if (!isBareNumberString(t)) return val;
  return `${t} ${u.weightShort}`;
}

/** Exported for navlog / tables. */
export function formatMassWithUnit(
  val: string | undefined,
  u: UnitContext,
): string {
  if (!val) return "—";
  return withWeightUnit(val, u);
}

export function formatElevationDisplay(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const t = val.trim();
  if (/\b(ft|m)\b/i.test(t) || /′|'/.test(t)) return t;
  if (isBareNumberString(t)) return `${t} ft`;
  return t;
}

export function withDistanceNm(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const t = val.trim();
  if (!t) return val;
  const lower = t.toLowerCase();
  if (
    /\b(nm|sm|mi|km)\b/.test(lower) ||
    lower.endsWith("nm") ||
    lower.endsWith(" mi")
  ) {
    return val;
  }
  if (isBareNumberString(t)) return `${t} NM`;
  return val;
}

/** Navlog leg distance / column value */
export function formatNavDistance(val: string | undefined): string {
  if (!val) return "—";
  return withDistanceNm(val) ?? val;
}

/** Navlog altitude — append ft when SimBrief sends a bare number. */
export function formatNavAltitude(val: string | undefined): string {
  if (!val) return "—";
  const t = val.trim();
  if (/fl\s*\d/i.test(t) || /\bft\b/i.test(t) || /′|'/.test(t)) return t;
  if (isBareNumberString(t)) return `${t} ft`;
  return t;
}

export function parseFuelLines(ofp: unknown, units?: UnitContext): FuelLine[] {
  const u = units ?? parseUnitContext(ofp);
  const fuel = asRecord(child(ofp, "fuel")) ?? {};
  const labels: [string, string][] = [
    ["plan_ramp", "Ramp fuel"],
    ["plan_takeoff", "Takeoff fuel"],
    ["taxi", "Taxi fuel"],
    ["enroute_burn", "Trip fuel"],
    ["plan_landing", "Landing fuel"],
    ["alternate_burn", "Alternate fuel"],
    ["reserve", "Reserve fuel"],
    ["extra", "Extra fuel"],
    ["plan_block", "Block fuel"],
    ["min_takeoff", "Min takeoff fuel"],
    ["max_takeoff", "Max takeoff fuel"],
    ["ballast", "Ballast fuel"],
  ];
  const out: FuelLine[] = [];
  for (const [key, label] of labels) {
    const raw = pickStr(fuel, key) ?? pickNum(fuel, key)?.toString();
    if (raw) {
      out.push({
        label: `${label} (${u.weightShort})`,
        value: withWeightUnit(raw, u),
      });
    }
  }
  return out;
}

export type WeightLine = { label: string; value: string };

/** CG / MAC at ZFW — SimBrief uses several possible keys across layouts. */
const ZFW_CG_KEYS: [string, string][] = [
  ["zfw_mac", "ZFW CG (% MAC)"],
  ["zfw_cg", "ZFW CG (%)"],
  ["cg_zfw", "ZFW CG"],
  ["mac_zfw", "ZFW % MAC"],
  ["zfwcg", "ZFW CG"],
  ["cg_percent_zfw", "ZFW CG (%)"],
  ["trim_zfw", "ZFW trim"],
  ["stab_zfw", "ZFW stabilizer"],
];

function weightValue(w: Record<string, unknown>, key: string): string | undefined {
  return pickStr(w, key) ?? pickNum(w, key)?.toString();
}

/**
 * Best-effort ZFW center-of-gravity for the banner (prefers % MAC).
 */
export function parseZfwCgSummary(ofp: unknown): {
  primary: string;
  subtitle?: string;
} | null {
  const w = asRecord(child(ofp, "weights")) ?? {};
  for (const [key, label] of ZFW_CG_KEYS) {
    const v = weightValue(w, key);
    if (v) {
      const isMac = /mac/i.test(label) || key.includes("mac");
      const primary = isMac ? `${v}% MAC (ZFW)` : `${v} (${label})`;
      return { primary, subtitle: label };
    }
  }
  const loads = asRecord(child(ofp, "loads"));
  if (loads) {
    for (const [key, label] of ZFW_CG_KEYS) {
      const v = weightValue(loads, key);
      if (v) {
        const isMac = /mac/i.test(label) || key.includes("mac");
        return {
          primary: isMac ? `${v}% MAC (ZFW)` : `${v} (${label})`,
          subtitle: `${label} (loads)`,
        };
      }
    }
  }
  return null;
}

const WEIGHT_ROW_KEYS = new Set([
  "oew",
  "pax_weight",
  "bag_weight",
  "cargo",
  "freight",
  "payload",
  "est_zfw",
  "est_tow",
  "est_ldw",
  "max_zfw",
  "max_tow",
  "max_ldw",
  "mzfw",
  "mtow",
  "mlw",
]);

/** Shown in the ZFW/TOW/LDW comparison matrix instead of the list. */
const LIMIT_MATRIX_KEYS = new Set([
  "est_zfw",
  "max_zfw",
  "mzfw",
  "est_tow",
  "max_tow",
  "mtow",
  "est_ldw",
  "max_ldw",
  "mlw",
]);

export type WeightLimitRow = {
  kind: "ZFW" | "TOW" | "LDW";
  est?: string;
  max?: string;
};

export function parseWeightLimitMatrix(
  ofp: unknown,
  units?: UnitContext,
): { unitShort: string; rows: WeightLimitRow[] } {
  const u = units ?? parseUnitContext(ofp);
  const w = asRecord(child(ofp, "weights")) ?? {};
  const fmt = (raw: string | undefined) =>
    raw ? withWeightUnit(raw, u) : undefined;
  return {
    unitShort: u.weightShort,
    rows: [
      {
        kind: "ZFW",
        est: fmt(weightValue(w, "est_zfw")),
        max: fmt(weightValue(w, "max_zfw")) ?? fmt(weightValue(w, "mzfw")),
      },
      {
        kind: "TOW",
        est: fmt(weightValue(w, "est_tow")),
        max: fmt(weightValue(w, "max_tow")) ?? fmt(weightValue(w, "mtow")),
      },
      {
        kind: "LDW",
        est: fmt(weightValue(w, "est_ldw")),
        max: fmt(weightValue(w, "max_ldw")) ?? fmt(weightValue(w, "mlw")),
      },
    ],
  };
}

export function parseWeightLines(
  ofp: unknown,
  units?: UnitContext,
  opts?: { omitLimitMatrix?: boolean },
): WeightLine[] {
  const u = units ?? parseUnitContext(ofp);
  const w = asRecord(child(ofp, "weights")) ?? {};
  const used = new Set<string>();
  const omitLm = opts?.omitLimitMatrix === true;

  const ordered: [string, string][] = [
    ["oew", "OEW"],
    ["pax_count", "PAX (count)"],
    ["pax_weight", "PAX weight"],
    ["bag_weight", "Baggage"],
    ["cargo", "Cargo"],
    ["freight", "Freight"],
    ["payload", "Payload"],
    ["est_zfw", "Est. ZFW"],
    ...ZFW_CG_KEYS,
    ["tow_mac", "TOW CG (% MAC)"],
    ["takeoff_mac", "TOW CG (% MAC)"],
    ["ldw_mac", "LDW CG (% MAC)"],
    ["landing_mac", "LDW CG (% MAC)"],
    ["est_tow", "Est. TOW"],
    ["est_ldw", "Est. LDW"],
    ["max_zfw", "Max ZFW"],
    ["max_tow", "Max TOW"],
    ["max_ldw", "Max LDW"],
    ["mzfw", "MZFW"],
    ["mtow", "MTOW"],
    ["mlw", "MLW"],
    ["stab_to", "Stab (takeoff)"],
    ["trim_to", "Trim (takeoff)"],
    ["cg_takeoff", "CG takeoff"],
  ];

  const out: WeightLine[] = [];
  for (const [key, label] of ordered) {
    if (omitLm && LIMIT_MATRIX_KEYS.has(key)) continue;
    const v = weightValue(w, key);
    if (v) {
      used.add(key);
      const isMass = WEIGHT_ROW_KEYS.has(key);
      const labelWithUnit = isMass ? `${label} (${u.weightShort})` : label;
      const value =
        key === "pax_count" || !isMass ? v : withWeightUnit(v, u);
      out.push({ label: labelWithUnit, value });
    }
  }

  const cgMacExtra = /^(cg|mac|trim|stab|zfw|tow|ldw)/i;
  for (const key of Object.keys(w).sort()) {
    if (used.has(key)) continue;
    if (!cgMacExtra.test(key) && !/cg|mac|trim|stab/i.test(key)) continue;
    const v = weightValue(w, key);
    if (v) {
      const lbl = humanizeWeightKey(key);
      const isPct = /mac|cg|percent/i.test(key) && !/weight|tow|zfw|ldw$/i.test(key);
      const isCount = /count|pax$/i.test(key) && key !== "pax_weight";
      out.push({
        label: isPct || isCount ? lbl : `${lbl} (${u.weightShort})`,
        value: isPct || isCount ? v : withWeightUnit(v, u),
      });
    }
  }

  return out;
}

function humanizeWeightKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** SimBrief often sends Unix epoch seconds (or ms) for clock-like fields. */
const UNIX_SEC_LOWER = 946_684_800; // 2000-01-01
const UNIX_SEC_UPPER = 4_102_444_800; // ~2099

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function secondsToHhMm(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return String(totalSec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  const s = Math.round(totalSec % 60);
  return s > 0 ? `${s}s` : "0m";
}

function durationSecondsFromBareNumber(n: number, kind: "taxi" | "enroute"): number {
  if (kind === "taxi") {
    if (n <= 120) return n * 60;
    return n;
  }
  if (n > 3600) return n;
  if (n <= 24 * 60) return n * 60;
  return n;
}

function colonPartsToSeconds(parts: number[]): number | null {
  if (parts.some((x) => Number.isNaN(x))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

/** Parse a duration field to seconds (ignores unix clock integers). */
function tryDurationToSeconds(
  raw: string | undefined,
  kind: "taxi" | "enroute",
): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= UNIX_SEC_LOWER && n <= UNIX_SEC_UPPER) return undefined;
    if (n >= 1e12 && n < 1e15) return undefined;
    return durationSecondsFromBareNumber(n, kind);
  }
  if (s.includes(":")) {
    const parts = s.split(":").map((x) => Number.parseInt(x, 10));
    return colonPartsToSeconds(parts) ?? undefined;
  }
  return undefined;
}

/**
 * Block / flight / taxi durations → hours & minutes.
 * Bare numbers: taxi ≤120 → minutes; flight/block ≤1440 → minutes, else seconds.
 */
export function formatSimBriefDuration(
  raw: string | undefined,
  kind: "taxi" | "enroute",
): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= UNIX_SEC_LOWER && n <= UNIX_SEC_UPPER) {
      const d = new Date(n * 1000);
      if (!Number.isNaN(d.getTime()))
        return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
    }
    if (n >= 1e12 && n < 1e15) {
      const d = new Date(n);
      if (!Number.isNaN(d.getTime()))
        return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
    }
    return secondsToHhMm(durationSecondsFromBareNumber(n, kind));
  }
  if (s.includes(":")) {
    const parts = s.split(":").map((x) => Number.parseInt(x, 10));
    const sec = colonPartsToSeconds(parts);
    if (sec !== null) return secondsToHhMm(sec);
  }
  return s;
}

export function parseGeneralSummary(ofp: unknown) {
  const g = asRecord(child(ofp, "general")) ?? {};
  return {
    airline: pickStr(g, "icao_airline"),
    flightNumber: pickStr(g, "flight_number"),
    callsign: pickStr(g, "callsign") ?? pickStr(g, "flight_number"),
    aircraft: pickStr(g, "aircraft") ?? pickStr(g, "icao_type"),
    route: pickStr(g, "route") ?? pickStr(g, "route_ifps"),
    flightType: pickStr(g, "flight_type"),
    initialAltitude:
      pickStr(g, "initial_altitude") ?? pickStr(g, "cruise_altitude"),
    costIndex: pickStr(g, "costindex") ?? pickStr(g, "civalue"),
    ofpLayout: pickStr(g, "ofp_layout"),
    ofpId: pickStr(g, "ofp_id"),
    release: pickStr(g, "release"),
  };
}

export function parseTimes(ofp: unknown) {
  const times = asRecord(child(ofp, "times")) ?? {};
  const dist = asRecord(child(ofp, "distance")) ?? {};
  return {
    estOut: pickTimeValue(times, "est_out"),
    estOff: pickTimeValue(times, "est_off"),
    estOn: pickTimeValue(times, "est_on"),
    estIn: pickTimeValue(times, "est_in"),
    schedOut: pickTimeValue(times, "sched_out"),
    schedIn: pickTimeValue(times, "sched_in"),
    schedOff: pickTimeValue(times, "sched_off"),
    schedOn: pickTimeValue(times, "sched_on"),
    gateOut: pickTimeValue(times, "gate_out"),
    gateIn: pickTimeValue(times, "gate_in"),
    blockOut: pickTimeValue(times, "block_out"),
    blockOn: pickTimeValue(times, "block_on"),
    blockTime: pickTimeValue(
      times,
      "block_time",
      "blocktime",
      "total_block",
      "block",
      "blockTime",
    ),
    flightTime: pickTimeValue(
      times,
      "flight_time",
      "flighttime",
      "flightTime",
    ),
    airborneTime: pickTimeValue(
      times,
      "airborne_time",
      "time_airborne",
      "flight_time_airborne",
      "air_time",
      "time_flight",
    ),
    taxiOut: pickTimeValue(
      times,
      "taxi_out",
      "taxiout",
      "taxi_out_time",
      "taxi_out_minutes",
    ),
    taxiIn: pickTimeValue(
      times,
      "taxi_in",
      "taxin",
      "taxi_in_time",
      "taxi_in_minutes",
    ),
    contFuelTime: pickTimeValue(times, "contfuel_time"),
    reserveTime: pickTimeValue(times, "reserve_time"),
    ete: pickTimeValue(
      times,
      "ete",
      "time_enroute",
      "enroute_time",
      "time_enr",
      "enroute",
    ),
    timeEnroute: pickTimeValue(times, "time_enroute", "enroute_time"),
    gcdNm: pickStr(dist, "gcd_nm") ?? pickStr(dist, "air_distance"),
    routeNm: pickStr(dist, "route_nm") ?? pickStr(dist, "total_distance"),
  };
}

export type TripTimeRow = { label: string; value: string };

function pickNestedSegmentTime(
  parent: Record<string, unknown> | undefined,
  segment: string,
  ...keys: string[]
): string | undefined {
  if (!parent) return undefined;
  const nested = asRecord(parent[segment]);
  if (!nested) return undefined;
  return pickTimeValue(nested, ...keys);
}

function sortAirKeys(keys: string[]): string[] {
  const rank = (k: string) => {
    if (/^ete$/i.test(k)) return 0;
    if (/flight_time|time_enroute|enroute_time/i.test(k)) return 1;
    if (/airborne|air_time|flt_time/i.test(k)) return 2;
    return 5;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

function scanBlockLikeDuration(
  obj: Record<string, unknown> | undefined,
): string | undefined {
  if (!obj) return undefined;
  const priority = [
    "block_time",
    "blocktime",
    "time_block",
    "total_block",
    "blk_time",
    "blktm",
    "block_tm",
    "tot_block",
  ];
  for (const k of priority) {
    const v = pickTimeValue(obj, k);
    if (v) return v;
  }
  const exclude =
    /taxi|sched|est_|gate|reserve|cont|fuel|hold|turn|delay|std|sta/i;
  for (const key of Object.keys(obj).sort()) {
    if (exclude.test(key)) continue;
    const kl = key.toLowerCase();
    const isBlockDur =
      /^block_time$|^blocktime$|^time_block$|^total_block|^blk_time$/i.test(
        key,
      ) ||
      (kl.includes("block") &&
        (kl.includes("time") || kl.includes("dur") || kl.includes("tot")) &&
        !kl.includes("out") &&
        !kl.includes("on") &&
        !kl.includes("fuel") &&
        !kl.includes("taxi"));
    if (!isBlockDur) continue;
    const v = pickTimeValue(obj, key);
    if (v) return v;
  }
  return undefined;
}

function scanAirborneLikeDuration(
  obj: Record<string, unknown> | undefined,
): string | undefined {
  if (!obj) return undefined;
  const priority = [
    "ete",
    "time_enroute",
    "enroute_time",
    "flight_time",
    "flighttime",
    "time_flight",
    "time_flt",
    "flt_time",
    "airborne_time",
    "time_airborne",
    "flight_time_airborne",
    "air_time",
    "enr_time",
    "time_enr",
    "hobbs",
  ];
  for (const k of priority) {
    const v = pickTimeValue(obj, k);
    if (v) return v;
  }
  const exclude =
    /taxi|block_time|blocktime|block_out|block_on|sched|est_|gate|reserve|cont|fuel|hold|turn|delay|std|sta/i;
  for (const key of sortAirKeys(Object.keys(obj))) {
    if (exclude.test(key)) continue;
    const kl = key.toLowerCase();
    if (
      /^ete$/i.test(key) ||
      /flight.?time|time.?enroute|enroute.?time|airborne|air.?time|flt.?time/i.test(
        kl,
      )
    ) {
      const v = pickTimeValue(obj, key);
      if (v) return v;
    }
  }
  return undefined;
}

function pickFromLastNavFix(
  ofp: unknown,
  ...keys: string[]
): string | undefined {
  const nav = asRecord(child(ofp, "navlog"));
  const fixes = asArray(nav?.fix);
  if (fixes.length === 0) return undefined;
  const last = asRecord(fixes[fixes.length - 1]) ?? {};
  return pickTimeValue(last, ...keys);
}

function collectTripDurations(ofp: unknown): {
  blockTime: string | undefined;
  flightTime: string | undefined;
  taxiOut: string | undefined;
  taxiIn: string | undefined;
} {
  const t = parseTimes(ofp);
  const times = asRecord(child(ofp, "times")) ?? {};
  const general = asRecord(child(ofp, "general")) ?? {};
  const schedule = asRecord(child(ofp, "schedule")) ?? {};
  const navlog = asRecord(child(ofp, "navlog")) ?? {};
  const params = asRecord(child(ofp, "params")) ?? {};
  const root = asRecord(ofp) ?? {};

  const taxiOut =
    t.taxiOut ??
    pickTimeValue(general, "taxi_out", "taxiout") ??
    pickTimeValue(schedule, "taxi_out");

  const taxiIn =
    t.taxiIn ??
    pickTimeValue(general, "taxi_in", "taxin") ??
    pickTimeValue(schedule, "taxi_in");

  const flightTime =
    t.airborneTime ??
    t.flightTime ??
    pickTimeValue(
      general,
      "ete",
      "time_enroute",
      "enroute_time",
      "flight_time",
      "flighttime",
    ) ??
    t.ete ??
    t.timeEnroute ??
    scanAirborneLikeDuration(times) ??
    scanAirborneLikeDuration(general) ??
    scanAirborneLikeDuration(schedule) ??
    scanAirborneLikeDuration(params) ??
    pickNestedSegmentTime(
      times,
      "flight",
      "time",
      "duration",
      "total",
      "ete",
    ) ??
    pickNestedSegmentTime(times, "enroute", "time", "ete", "duration") ??
    pickTimeValue(navlog, "ete", "flight_time", "time_enroute") ??
    pickFromLastNavFix(
      ofp,
      "time_total",
      "total_time",
      "flight_time",
      "ete",
      "time_enroute",
    ) ??
    scanAirborneLikeDuration(navlog);

  let blockTime =
    t.blockTime ??
    scanBlockLikeDuration(times) ??
    pickTimeValue(
      general,
      "block_time",
      "blocktime",
      "time_block",
      "total_block",
    ) ??
    scanBlockLikeDuration(general) ??
    scanBlockLikeDuration(schedule) ??
    scanBlockLikeDuration(params) ??
    pickNestedSegmentTime(times, "block", "time", "duration", "total") ??
    pickTimeValue(navlog, "block_time", "total_time") ??
    scanBlockLikeDuration(navlog) ??
    pickTimeValue(root, "block_time", "blocktime");

  if (!blockTime && flightTime) {
    const f = tryDurationToSeconds(flightTime, "enroute");
    const o = tryDurationToSeconds(taxiOut, "taxi") ?? 0;
    const i = tryDurationToSeconds(taxiIn, "taxi") ?? 0;
    if (f !== undefined && f > 0) {
      blockTime = String(Math.round(f + o + i));
    }
  }

  return { blockTime, flightTime, taxiOut, taxiIn };
}

/**
 * Total block, taxi out, time in the air, taxi in.
 * Pulls times from `times`, `general`, `schedule`, `navlog`, nested objects, and fuzzy keys.
 */
export function parseTripTimeRows(ofp: unknown): TripTimeRow[] {
  const { blockTime, flightTime, taxiOut, taxiIn } = collectTripDurations(ofp);
  const rows: TripTimeRow[] = [];

  const push = (
    label: string,
    raw: string | undefined,
    kind: "taxi" | "enroute",
  ) => {
    const value = formatSimBriefDuration(raw, kind);
    if (value) rows.push({ label, value });
  };

  push("Total (block to block)", blockTime, "enroute");
  push("Taxi out", taxiOut, "taxi");

  let airborneRaw = flightTime;
  if (airborneRaw && blockTime && airborneRaw === blockTime) {
    airborneRaw = undefined;
  }

  let airborneDerived = false;
  if (!airborneRaw) {
    const blockSec = tryDurationToSeconds(blockTime, "enroute");
    const outSec = tryDurationToSeconds(taxiOut, "taxi") ?? 0;
    const inSec = tryDurationToSeconds(taxiIn, "taxi") ?? 0;
    if (blockSec !== undefined) {
      const airSec = Math.max(0, Math.round(blockSec - outSec - inSec));
      if (airSec >= 60) {
        airborneRaw = String(airSec);
        airborneDerived = true;
      }
    }
  }

  if (airborneRaw) {
    const value = formatSimBriefDuration(airborneRaw, "enroute");
    if (value) {
      rows.push({
        label: airborneDerived
          ? "In the air (block − taxi out − taxi in)"
          : "In the air (airborne / enroute)",
        value,
      });
    }
  }

  push("Taxi in", taxiIn, "taxi");

  return rows;
}

export function parseAlternates(ofp: unknown): AirportCard[] {
  const alts = child(ofp, "alternate");
  if (!alts) return [];
  const list = Array.isArray(alts) ? alts : [alts];
  return list.map((a) => parseAirport(a));
}

export function parseFetchMeta(ofp: unknown) {
  const f = asRecord(child(ofp, "fetch")) ?? {};
  return {
    userId: pickStr(f, "userid"),
    staticId: pickStr(f, "static_id"),
    status: pickStr(f, "status"),
  };
}

export function parseParams(ofp: unknown) {
  const p = asRecord(child(ofp, "params")) ?? {};
  return {
    units: pickStr(p, "units"),
    requestId: pickStr(p, "request_id"),
  };
}

export function parseExternalLinks(ofp: unknown): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const pdf = asRecord(child(ofp, "pdf"));
  const pdfUrl = pickStr(pdf, "link") ?? pickStr(pdf, "url");
  if (pdfUrl) out.push({ label: "OFP PDF", href: pdfUrl });
  const links = asRecord(child(ofp, "links"));
  if (links) {
    for (const [k, v] of Object.entries(links)) {
      if (typeof v === "string" && v.startsWith("http")) {
        out.push({ label: k.replace(/_/g, " "), href: v });
      }
    }
  }
  return out;
}
