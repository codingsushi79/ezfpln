/**
 * Parses JSON from the MSFS bridge for POST /api/plane-position.
 * Keep in sync with ezflpln-msfs-bridge/src/plane-report.ts (schema + fields).
 */
export const PLANE_REPORT_SCHEMA_VERSION = 1 as const;

export type PlanePositionSnapshot = {
  lat: number;
  lng: number;
  headingTrueDeg?: number;
  trackTrueDeg?: number;
  altitudeFt?: number;
  groundSpeedKt?: number;
};

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function pickFinite(
  o: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export type ParsePlaneReportResult =
  | { ok: true; snapshot: PlanePositionSnapshot }
  | { ok: false; error: string };

/**
 * Validates body; each POST replaces telemetry for that user (no merge with
 * previous position). Omitted optional fields are left unset on the snapshot.
 */
export function parsePlaneReportPostBody(body: unknown): ParsePlaneReportResult {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;

  const sv = o.schemaVersion;
  if (sv !== undefined && Number(sv) !== PLANE_REPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schemaVersion (expected ${PLANE_REPORT_SCHEMA_VERSION})`,
    };
  }

  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "lat and lng must be finite numbers" };
  }

  const snapshot: PlanePositionSnapshot = { lat, lng };

  const headingTrueDeg = pickFinite(o, [
    "headingTrueDeg",
    "trueHeadingDeg",
    "heading",
    "headingDeg",
    "headingTrue",
  ]);
  if (headingTrueDeg !== undefined) {
    snapshot.headingTrueDeg = norm360(headingTrueDeg);
  }

  const trackTrueDeg = pickFinite(o, [
    "trackTrueDeg",
    "trackDeg",
    "trueTrackDeg",
  ]);
  if (trackTrueDeg !== undefined) {
    snapshot.trackTrueDeg = norm360(trackTrueDeg);
  }

  const altitudeFt = pickFinite(o, [
    "altitudeFt",
    "heightFt",
    "alt",
    "mslFt",
    "altitudeMslFt",
  ]);
  if (altitudeFt !== undefined) {
    snapshot.altitudeFt = altitudeFt;
  }

  const groundSpeedKt = pickFinite(o, [
    "groundSpeedKt",
    "speedKt",
    "gsKt",
    "groundSpeed",
  ]);
  if (groundSpeedKt !== undefined) {
    snapshot.groundSpeedKt = groundSpeedKt;
  }

  return { ok: true, snapshot };
}
