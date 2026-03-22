/**
 * Parse optional numeric fields from bridge JSON. Skips null, "", and
 * non-finite values so we don't treat missing data as 0° / 0 ft / 0 kt.
 */
export function pickOptionalFinite(
  body: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  for (const k of keys) {
    const v = body[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
