export type PlanePosition = {
  lat: number;
  lng: number;
  heading?: number;
  altitudeFt?: number;
  /** Ground or indicated speed, knots (from sim / bridge). */
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
