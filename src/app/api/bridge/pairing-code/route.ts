import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import { issuePairingCodeForUser } from "@/lib/bridge-pairing";
import type { SessionData } from "@/types/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(
      cookieStore,
      getSessionOptions(),
    );
    const userId = session.account?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Sign in on the website to create a bridge link code." },
        { status: 401 },
      );
    }
    const { code, expiresAt } = await issuePairingCodeForUser(userId);
    return NextResponse.json({ ok: true, code, expiresAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
