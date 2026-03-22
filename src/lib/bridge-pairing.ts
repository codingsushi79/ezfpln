import { randomInt } from "node:crypto";
import { query } from "@/lib/db";
import { mintBridgeTokenForUser } from "@/lib/bridge-auth";

/** Uppercase letters and digits, excluding ambiguous 0/O and 1/I. */
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LEN = 6;
const PAIRING_TTL_MS = 10 * 60 * 1000;

function randomPairingCode(): string {
  let s = "";
  for (let i = 0; i < PAIRING_CODE_LEN; i++) {
    s += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]!;
  }
  return s;
}

/** Normalize user input: uppercase, strip non-alphanumeric. */
export function normalizePairingCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function issuePairingCodeForUser(
  userId: string,
): Promise<{ code: string; expiresAt: number }> {
  await query(`DELETE FROM bridge_pairing_codes WHERE user_id = $1`, [userId]);
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomPairingCode();
    try {
      await query(
        `INSERT INTO bridge_pairing_codes (code, user_id, expires_at) VALUES ($1, $2, $3)`,
        [code, userId, expiresAt],
      );
      return { code, expiresAt };
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") continue;
      throw e;
    }
  }
  throw new Error("Could not allocate pairing code");
}

/**
 * Consumes a valid code and mints a bridge token. Returns null if invalid or expired.
 */
export async function redeemPairingCode(
  rawCode: string,
): Promise<{ token: string } | null> {
  const normalized = normalizePairingCodeInput(rawCode);
  if (normalized.length !== PAIRING_CODE_LEN) return null;
  const now = Date.now();
  const r = await query<{ user_id: string }>(
    `DELETE FROM bridge_pairing_codes
     WHERE code = $1 AND expires_at > $2
     RETURNING user_id`,
    [normalized, now],
  );
  const userId = r.rows[0]?.user_id;
  if (!userId) return null;
  const token = await mintBridgeTokenForUser(userId);
  return { token };
}
