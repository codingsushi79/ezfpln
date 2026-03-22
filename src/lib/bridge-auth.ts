import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export function hashBridgeTokenPlain(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

/** Returns user id if valid. */
export function verifyBridgeToken(plain: string): string | null {
  const hash = hashBridgeTokenPlain(plain);
  const row = getDb()
    .prepare("SELECT user_id FROM bridge_tokens WHERE token_hash = ?")
    .get(hash) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

export function touchBridgeToken(plain: string): void {
  const hash = hashBridgeTokenPlain(plain);
  getDb()
    .prepare(
      "UPDATE bridge_tokens SET last_used_at = ? WHERE token_hash = ?",
    )
    .run(Date.now(), hash);
}

/**
 * Replaces any existing bridge tokens for this user. Returns the plaintext
 * token once (store only in the bridge / env).
 */
export function mintBridgeTokenForUser(userId: string): string {
  const db = getDb();
  db.prepare("DELETE FROM bridge_tokens WHERE user_id = ?").run(userId);
  const id = randomUUID();
  const plain = `ezfl_${randomBytes(32).toString("base64url")}`;
  const token_hash = hashBridgeTokenPlain(plain);
  const created_at = Date.now();
  db.prepare(
    "INSERT INTO bridge_tokens (id, user_id, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, NULL)",
  ).run(id, userId, token_hash, created_at);
  return plain;
}
