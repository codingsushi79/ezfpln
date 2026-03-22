export type PlanePosition = {
  lat: number;
  lng: number;
  /**
   * True track over ground (° true): direction of motion. Optional; the MSFS
   * bridge sends nose heading as `heading` unless a client sends track.
   */
  trackTrueDeg?: number;
  /**
   * Direction for map rotation when `trackTrueDeg` is absent (legacy bridges
   * that sent nose heading only).
   */
  heading?: number;
  /** Altitude / height MSL, feet. */
  altitudeFt?: number;
  /** Ground speed, knots. */
  speedKt?: number;
  updatedAt: number;
};

const byUser = new Map<string, PlanePosition>();

export function setPlanePosition(
  userId: string,
  input: Omit<PlanePosition, "updatedAt">,
): PlanePosition {
  const p = { ...input, updatedAt: Date.now() };
  byUser.set(userId, p);
  return p;
}

export function getPlanePosition(userId: string): PlanePosition | null {
  return byUser.get(userId) ?? null;
}

export function clearPlanePosition(userId: string): void {
  byUser.delete(userId);
}

const STALE_MS = 15 * 60 * 1000;

export type PlanePositionWithUser = {
  userId: string;
} & PlanePosition;

/** All recent positions (bridge + sim), for multiplayer map. */
export function getAllPlanePositions(): PlanePositionWithUser[] {
  const now = Date.now();
  const out: PlanePositionWithUser[] = [];
  for (const [userId, p] of byUser) {
    if (now - p.updatedAt > STALE_MS) continue;
    out.push({ userId, ...p });
  }
  return out;
}
