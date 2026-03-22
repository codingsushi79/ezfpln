import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import type { SessionData } from "@/types/session";
import {
  touchBridgeToken,
  verifyBridgeToken,
} from "@/lib/bridge-auth";

/**
 * Resolves a user id from `Authorization: Bearer` (bridge) or signed session
 * cookie (browser).
 */
export async function getUserIdFromRequest(
  request: Request,
): Promise<string | null> {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : null;
  if (bearer) {
    const uid = verifyBridgeToken(bearer);
    if (uid) {
      touchBridgeToken(bearer);
      return uid;
    }
    return null;
  }
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions(),
  );
  return session.account?.id ?? null;
}
