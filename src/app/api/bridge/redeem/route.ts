import { NextResponse } from "next/server";
import { redeemPairingCode } from "@/lib/bridge-pairing";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const raw = body.code ?? "";
    const result = await redeemPairingCode(raw);
    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired code. Generate a new one on the website." },
        { status: 401, headers: cors },
      );
    }
    return NextResponse.json(
      { ok: true, token: result.token },
      { headers: cors },
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: cors },
    );
  }
}
