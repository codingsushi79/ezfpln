import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { DatabaseError } from "pg";
import { getSessionOptions } from "@/lib/session";
import { createUser, normalizeUsername } from "@/lib/users-repo";
import type { SessionData } from "@/types/session";

export const runtime = "nodejs";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRe = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      username?: string;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    const rawUser = body.username?.trim() ?? "";
    const pilotUsername = normalizeUsername(rawUser);
    if (!emailRe.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    if (!usernameRe.test(pilotUsername)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–24 characters: letters, numbers, or underscore.",
        },
        { status: 400 },
      );
    }
    let user;
    try {
      user = await createUser(email, password, pilotUsername);
    } catch (e) {
      if (e instanceof DatabaseError && e.code === "23505") {
        return NextResponse.json(
          { error: "That email or username is already taken." },
          { status: 409 },
        );
      }
      throw e;
    }
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(
      cookieStore,
      getSessionOptions(),
    );
    session.account = {
      id: user.id,
      email: user.email,
      username: user.username ?? undefined,
    };
    await session.save();
    return NextResponse.json({
      ok: true,
      account: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
