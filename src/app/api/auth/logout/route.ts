import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import type { SessionData } from "@/types/session";

export async function POST() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
  session.destroy();
  return NextResponse.json({ ok: true });
}
