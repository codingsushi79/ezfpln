import { NextResponse } from "next/server";
import { pickOptionalFinite } from "@/lib/plane-position-parse";
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
    /** True track over ground (° true) — direction of motion; bridge sends this. */
    const trackTrueDeg = pickOptionalFinite(body, [
      "trackTrueDeg",
      "trackDeg",
      "trueHeadingDeg",
      "trueTrackDeg",
    ]);
    const hasTrack = trackTrueDeg !== undefined;

    const headingLegacy = pickOptionalFinite(body, ["heading"]);

    const altitudeFt = pickOptionalFinite(body, [
      "altitudeFt",
      "heightFt",
      "alt",
      "mslFt",
      "altitudeMslFt",
    ]);

    const speedKtRaw = pickOptionalFinite(body, [
      "speedKt",
      "gsKt",
      "groundSpeedKt",
      "groundSpeed",
    ]);

    const prev = getPlanePosition(userId);

    const next: Omit<PlanePosition, "updatedAt"> = {
      lat,
      lng,
    };

    if (hasTrack) {
      next.trackTrueDeg = trackTrueDeg;
      next.heading = trackTrueDeg;
    } else {
      if (prev?.trackTrueDeg !== undefined) {
        next.trackTrueDeg = prev.trackTrueDeg;
      }
      if (headingLegacy !== undefined) {
        next.heading = headingLegacy;
      } else if (prev?.heading !== undefined) {
        next.heading = prev.heading;
      }
    }

    if (altitudeFt !== undefined) {
      next.altitudeFt = altitudeFt;
    } else if (prev?.altitudeFt !== undefined) {
      next.altitudeFt = prev.altitudeFt;
    }

    if (speedKtRaw !== undefined) {
      next.speedKt = speedKtRaw;
    } else if (prev?.speedKt !== undefined) {
      next.speedKt = prev.speedKt;
    }

    setPlanePosition(userId, next);
    return NextResponse.json({ ok: true }, { headers: cors });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: cors },
    );
  }
}
