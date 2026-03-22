import { createHash, randomBytes, randomUUID } from "node:crypto";
import { query } from "@/lib/db";

export function hashBridgeTokenPlain(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

/** Returns user id if valid. */
export async function verifyBridgeToken(
  plain: string,
): Promise<string | null> {
  const hash = hashBridgeTokenPlain(plain);
  const r = await query<{ user_id: string }>(
    "SELECT user_id FROM bridge_tokens WHERE token_hash = $1",
    [hash],
  );
  return r.rows[0]?.user_id ?? null;
}

export async function touchBridgeToken(plain: string): Promise<void> {
  const hash = hashBridgeTokenPlain(plain);
  await query(
    "UPDATE bridge_tokens SET last_used_at = $1 WHERE token_hash = $2",
    [Date.now(), hash],
  );
}

/**
 * Replaces any existing bridge tokens for this user. Returns the plaintext
 * token once (store only in the bridge / env).
 */
export async function mintBridgeTokenForUser(userId: string): Promise<string> {
  await query("DELETE FROM bridge_tokens WHERE user_id = $1", [userId]);
  const id = randomUUID();
  const plain = `ezfl_${randomBytes(32).toString("base64url")}`;
  const token_hash = hashBridgeTokenPlain(plain);
  const created_at = Date.now();
  await query(
    `INSERT INTO bridge_tokens (id, user_id, token_hash, created_at, last_used_at)
     VALUES ($1, $2, $3, $4, NULL)`,
    [id, userId, token_hash, created_at],
  );
  return plain;
}
