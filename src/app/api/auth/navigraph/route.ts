import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import { buildAuthorizeUrl, createPkcePair, getNavigraphConfig } from "@/lib/navigraph";
import type { SessionData } from "@/types/session";

export async function GET() {
  try {
    const { clientId, clientSecret, redirectUri } = getNavigraphConfig();
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "Navigraph OAuth is not configured. Set NAVIGRAPH_CLIENT_ID and NAVIGRAPH_CLIENT_SECRET.",
        },
        { status: 503 },
      );
    }

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());

    const state = randomBytes(24).toString("hex");
    const { codeVerifier, codeChallenge } = createPkcePair();
    session.oauth = { state, codeVerifier };
    await session.save();

    const url = buildAuthorizeUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth start failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
