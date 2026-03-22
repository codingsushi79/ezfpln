export type PlanePosition = {
  lat: number;
  lng: number;
  heading?: number;
  altitudeFt?: number;
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
