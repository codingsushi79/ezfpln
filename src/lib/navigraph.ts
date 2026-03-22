import { createHash, randomBytes } from "crypto";

const AUTH = "https://identity.api.navigraph.com/connect/authorize";
const TOKEN = "https://identity.api.navigraph.com/connect/token";
const USERINFO = "https://identity.api.navigraph.com/connect/userinfo";

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(
    createHash("sha256").update(verifier, "utf8").digest(),
  );
  return { codeVerifier: verifier, codeChallenge: challenge };
}

export function getNavigraphConfig() {
  const clientId = process.env.NAVIGRAPH_CLIENT_ID;
  const clientSecret = process.env.NAVIGRAPH_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required (e.g. http://localhost:3000)");
  }
  const redirectUri = `${appUrl}/api/auth/navigraph/callback`;
  return { clientId, clientSecret, redirectUri, appUrl };
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const u = new URL(AUTH);
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", params.state);
  u.searchParams.set("scope", "openid offline_access email");
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export async function exchangeCodeForTokens(body: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: body.code,
    redirect_uri: body.redirectUri,
    client_id: body.clientId,
    client_secret: body.clientSecret,
    code_verifier: body.codeVerifier,
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error_description === "string"
        ? data.error_description
        : `Token exchange failed (${res.status})`,
    );
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function refreshAccessToken(body: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: body.refreshToken,
    client_id: body.clientId,
    client_secret: body.clientSecret,
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error_description === "string"
        ? data.error_description
        : `Refresh failed (${res.status})`,
    );
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function fetchNavigraphUserInfo(accessToken: string): Promise<{
  sub?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
}> {
  const res = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return {};
  return (await res.json()) as {
    sub?: string;
    name?: string;
    email?: string;
    preferred_username?: string;
  };
}
