import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import {
  fetchNavigraphUserInfo,
  getNavigraphConfig,
  refreshAccessToken,
} from "@/lib/navigraph";
import {
  persistNavigraphFromSession,
  syncIntegrationsForAccount,
} from "@/lib/session-integrations";
import {
  updateUserNavigraph,
  updateUserSimbrief,
} from "@/lib/users-repo";
import type { SessionData } from "@/types/session";

export const runtime = "nodejs";

async function ensureFreshAccess(session: SessionData): Promise<void> {
  const ng = session.navigraph;
  if (!ng?.refreshToken) return;

  const { clientId, clientSecret } = getNavigraphConfig();
  if (!clientId || !clientSecret) return;

  const exp = ng.accessExpiresAt ?? 0;
  if (ng.accessToken && exp > Date.now() + 60_000) return;

  try {
    const t = await refreshAccessToken({
      refreshToken: ng.refreshToken,
      clientId,
      clientSecret,
    });
    ng.accessToken = t.access_token;
    if (t.refresh_token) ng.refreshToken = t.refresh_token;
    ng.accessExpiresAt = Date.now() + (t.expires_in ?? 3600) * 1000;
    await persistNavigraphFromSession(session);
  } catch {
    session.navigraph = undefined;
    session.user = undefined;
    if (session.account?.id) {
      await updateUserNavigraph(session.account.id, null);
    }
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
    await syncIntegrationsForAccount(session);
    await session.save();
    await ensureFreshAccess(session);
    await persistNavigraphFromSession(session);
    if (session.navigraph) await session.save();

    const navigraphConnected = Boolean(session.navigraph?.refreshToken);
    let user = session.user;
    const token = session.navigraph?.accessToken;
    if (navigraphConnected && token) {
      const fresh = await fetchNavigraphUserInfo(token);
      if (Object.keys(fresh).length > 0) {
        user = { ...user, ...fresh };
        session.user = user;
        await session.save();
      }
    }

    return NextResponse.json({
      navigraphConnected,
      account: session.account
        ? {
            id: session.account.id,
            email: session.account.email,
            username: session.account.username ?? null,
          }
        : null,
      user: user
        ? {
            name: user.name,
            email: user.email,
            sub: user.sub,
            preferred_username: user.preferred_username,
          }
        : null,
      simbrief: session.simbrief ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Session unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      simbriefUserid?: string;
      simbriefUsername?: string;
    };
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());

    if (!session.account?.id) {
      return NextResponse.json(
        { error: "Create an account and sign in to save SimBrief settings." },
        { status: 401 },
      );
    }

    const uid = body.simbriefUserid?.trim();
    const uname = body.simbriefUsername?.trim();
    if (uid) {
      session.simbrief = { userid: uid, username: undefined };
    } else if (uname) {
      session.simbrief = { username: uname, userid: undefined };
    } else {
      session.simbrief = undefined;
    }
    await updateUserSimbrief(session.account.id, session.simbrief ?? null);
    await session.save();
    return NextResponse.json({ ok: true, simbrief: session.simbrief ?? null });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}
