import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(
  email: string,
): Promise<UserRow | undefined> {
  const e = normalizeEmail(email);
  const r = await query<{
    id: string;
    email: string;
    password_hash: string;
    created_at: string | number;
  }>(
    `SELECT id, email, password_hash, created_at
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

export async function createUser(
  email: string,
  password: string,
): Promise<UserRow> {
  const id = randomUUID();
  const e = normalizeEmail(email);
  const password_hash = hashPassword(password);
  const created_at = Date.now();
  const r = await query<{
    id: string;
    email: string;
    password_hash: string;
    created_at: string | number;
  }>(
    `INSERT INTO users (id, email, password_hash, created_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, password_hash, created_at`,
    [id, e, password_hash, created_at],
  );
  const row = r.rows[0];
  if (!row) throw new Error("Insert returned no row");
  return {
    ...row,
    created_at: Number(row.created_at),
  };
}
