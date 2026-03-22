import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
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

export function getUserByEmail(email: string): UserRow | undefined {
  const e = normalizeEmail(email);
  return getDb()
    .prepare(
      "SELECT id, email, password_hash, created_at FROM users WHERE email = ?",
    )
    .get(e) as UserRow | undefined;
}

export function createUser(email: string, password: string): UserRow {
  const db = getDb();
  const id = randomUUID();
  const e = normalizeEmail(email);
  const password_hash = hashPassword(password);
  const created_at = Date.now();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, e, password_hash, created_at);
  return { id, email: e, password_hash, created_at };
}
