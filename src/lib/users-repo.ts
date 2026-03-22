import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export type UserRow = {
  id: string;
  email: string;
  username: string | null;
  password_hash: string;
  created_at: number;
};

export type UserIntegrationsRow = {
  username: string | null;
  simbrief_userid: string | null;
  simbrief_username: string | null;
  navigraph_refresh_token: string | null;
  navigraph_access_token: string | null;
  navigraph_access_expires_at: string | number | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

export async function getUserByEmail(
  email: string,
): Promise<UserRow | undefined> {
  const e = normalizeEmail(email);
  const r = await query<{
    id: string;
    email: string;
    username: string | null;
    password_hash: string;
    created_at: string | number;
  }>(
    `SELECT id, email, username, password_hash, created_at
     FROM users WHERE lower(email) = lower($1)`,
    [e],
  );
  const row = r.rows[0];
  if (!row) return undefined;
  return {
    ...row,
    created_at: Number(row.created_at),
  };
}

export async function getUserIntegrationsById(
  userId: string,
): Promise<UserIntegrationsRow | null> {
  const r = await query<UserIntegrationsRow>(
    `SELECT username, simbrief_userid, simbrief_username,
            navigraph_refresh_token, navigraph_access_token, navigraph_access_expires_at
     FROM users WHERE id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function getUsernamesByIds(
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const r = await query<{ id: string; username: string | null }>(
    `SELECT id, username FROM users WHERE id = ANY($1::text[])`,
    [ids],
  );
  for (const row of r.rows) {
    if (row.username) map.set(row.id, row.username);
  }
  return map;
}

export async function createUser(
  email: string,
  password: string,
  username: string,
): Promise<UserRow> {
  const id = randomUUID();
  const e = normalizeEmail(email);
  const u = normalizeUsername(username);
  const password_hash = hashPassword(password);
  const created_at = Date.now();
  const r = await query<{
    id: string;
    email: string;
    username: string | null;
    password_hash: string;
    created_at: string | number;
  }>(
    `INSERT INTO users (id, email, password_hash, username, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, username, password_hash, created_at`,
    [id, e, password_hash, u, created_at],
  );
  const row = r.rows[0];
  if (!row) throw new Error("Insert returned no row");
  return {
    ...row,
    created_at: Number(row.created_at),
  };
}

export async function updateUserSimbrief(
  userId: string,
  simbrief: { userid?: string; username?: string } | null,
): Promise<void> {
  if (!simbrief || (!simbrief.userid && !simbrief.username)) {
    await query(
      `UPDATE users SET simbrief_userid = NULL, simbrief_username = NULL WHERE id = $1`,
      [userId],
    );
    return;
  }
  await query(
    `UPDATE users SET simbrief_userid = $2, simbrief_username = $3 WHERE id = $1`,
    [
      userId,
      simbrief.userid ?? null,
      simbrief.username ?? null,
    ],
  );
}

export async function updateUserNavigraph(
  userId: string,
  data: {
    refreshToken: string;
    accessToken?: string;
    accessExpiresAt?: number;
  } | null,
): Promise<void> {
  if (!data || !data.refreshToken) {
    await query(
      `UPDATE users SET navigraph_refresh_token = NULL, navigraph_access_token = NULL,
         navigraph_access_expires_at = NULL WHERE id = $1`,
      [userId],
    );
    return;
  }
  await query(
    `UPDATE users SET navigraph_refresh_token = $2, navigraph_access_token = $3,
       navigraph_access_expires_at = $4 WHERE id = $1`,
    [
      userId,
      data.refreshToken,
      data.accessToken ?? null,
      data.accessExpiresAt ?? null,
    ],
  );
}
