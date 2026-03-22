import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions } from "@/lib/session";
import { getUserByEmail } from "@/lib/users-repo";
import { verifyPassword } from "@/lib/password";
import { mintBridgeTokenForUser } from "@/lib/bridge-auth";
import type { SessionData } from "@/types/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      client?: string;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    const user = getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    if (body.client === "bridge") {
      const token = mintBridgeTokenForUser(user.id);
      return NextResponse.json({
        ok: true,
        token,
        email: user.email,
      });
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
