import { NextResponse } from "next/server";
import { parsePlaneReportPostBody } from "@/lib/bridge-plane-report";
import { getUserIdFromRequest } from "@/lib/request-auth";
import {
  getPlanePosition,
  setPlanePosition,
} from "@/lib/plane-position-store";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      {
        error:
          "Sign in on the web or send Authorization: Bearer <bridge token> (link the bridge with a site pairing code).",
      },
      { status: 401, headers: cors },
    );
  }
  const p = getPlanePosition(userId);
  return NextResponse.json(p, { headers: cors });
}

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        {
          error:
            "Sign in on the web or send Authorization: Bearer <bridge token> (link the bridge with a site pairing code).",
        },
        { status: 401, headers: cors },
      );
    }
    const body: unknown = await request.json();
    const parsed = parsePlaneReportPostBody(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: 400, headers: cors },
      );
    }
    setPlanePosition(userId, parsed.snapshot);
    return NextResponse.json({ ok: true }, { headers: cors });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: cors },
    );
  }
}
