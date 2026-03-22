import { type SessionOptions } from "iron-session";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters (generate a random string).",
    );
  }
  return secret;
}

export function getSessionOptions(): SessionOptions {
  return {
    password: getSessionSecret(),
    cookieName: "ezflpln_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 14,
      path: "/",
    },
  };
}
