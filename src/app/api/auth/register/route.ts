import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { DatabaseError } from "pg";
import { getSessionOptions } from "@/lib/session";
import { createUser } from "@/lib/users-repo";
import type { SessionData } from "@/types/session";

export const runtime = "nodejs";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
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
    let user;
    try {
      user = await createUser(email, password);
    } catch (e) {
      if (e instanceof DatabaseError && e.code === "23505") {
        return NextResponse.json(
          { error: "That email is already registered." },
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
    session.account = { id: user.id, email: user.email };
    await session.save();
    return NextResponse.json({
      ok: true,
      account: { id: user.id, email: user.email },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
