import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import { fetchLatestOfpJson, type SimbriefFetchParams } from "@/lib/simbrief";
import type { SessionData } from "@/types/session";

function paramsFromQuery(sp: URLSearchParams): SimbriefFetchParams | null {
  const userid = sp.get("userid")?.trim();
  const username = sp.get("username")?.trim();
  if (userid) return { userid };
  if (username) return { username };
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let params = paramsFromQuery(searchParams);

  if (!params) {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
    const sb = session.simbrief;
    if (sb?.userid) params = { userid: sb.userid };
    else if (sb?.username) params = { username: sb.username };
  }

  if (!params) {
    return NextResponse.json(
      {
        error:
          "No SimBrief pilot ID or username. Save one in the form or pass ?userid= or ?username=.",
      },
      { status: 400 },
    );
  }

  const result = await fetchLatestOfpJson(params);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, status: result.status },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  return NextResponse.json(result.data);
}
