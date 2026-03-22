import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/request-auth";
import {
  getPlanePosition,
  setPlanePosition,
  type PlanePosition,
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
    const body = (await request.json()) as Record<string, unknown>;
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "lat and lng must be numbers" },
        { status: 400, headers: cors },
      );
    }
    const heading =
      body.heading !== undefined ? Number(body.heading) : undefined;
    const altitudeFt =
      body.altitudeFt !== undefined
        ? Number(body.altitudeFt)
        : body.alt !== undefined
          ? Number(body.alt)
          : undefined;
    const next: Omit<PlanePosition, "updatedAt"> = {
      lat,
      lng,
      ...(Number.isFinite(heading) ? { heading } : {}),
      ...(Number.isFinite(altitudeFt) ? { altitudeFt } : {}),
    };
    setPlanePosition(userId, next);
    return NextResponse.json({ ok: true }, { headers: cors });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: cors },
    );
  }
}
