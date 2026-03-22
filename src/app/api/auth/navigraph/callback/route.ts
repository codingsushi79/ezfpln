import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import {
  exchangeCodeForTokens,
  fetchNavigraphUserInfo,
  getNavigraphConfig,
} from "@/lib/navigraph";
import type { SessionData } from "@/types/session";
import { updateUserNavigraph } from "@/lib/users-repo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const home = base ? `${base}/` : "/";

  try {
    const { searchParams } = new URL(request.url);
    const err = searchParams.get("error");
    if (err) {
      return NextResponse.redirect(`${home}?auth=denied`);
    }
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      return NextResponse.redirect(`${home}?auth=invalid`);
    }

    const { clientId, clientSecret, redirectUri } = getNavigraphConfig();
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${home}?auth=config`);
    }

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());

    const oauth = session.oauth;
    if (!oauth || oauth.state !== state || !oauth.codeVerifier) {
      return NextResponse.redirect(`${home}?auth=state`);
    }

    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: oauth.codeVerifier,
      redirectUri,
      clientId,
      clientSecret,
    });

    session.oauth = undefined;
    const refresh = tokens.refresh_token ?? "";
    if (refresh === "") {
      delete session.navigraph;
      await session.save();
      return NextResponse.redirect(`${home}?auth=no_refresh`);
    }

    const accessExpiresAt =
      Date.now() + (tokens.expires_in ?? 3600) * 1000;
    session.navigraph = {
      refreshToken: refresh,
      accessToken: tokens.access_token,
      accessExpiresAt,
    };

    const user = await fetchNavigraphUserInfo(tokens.access_token);
    if (Object.keys(user).length > 0) {
      session.user = user;
    }

    if (session.account?.id) {
      await updateUserNavigraph(session.account.id, {
        refreshToken: refresh,
        accessToken: tokens.access_token,
        accessExpiresAt,
      });
    }

    await session.save();
    return NextResponse.redirect(`${home}?auth=ok`);
  } catch {
    return NextResponse.redirect(`${home}?auth=error`);
  }
}
