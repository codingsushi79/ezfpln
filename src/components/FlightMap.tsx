"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng, RouteWaypointMarker } from "@/lib/ofp-parse";

const MAP_MAX_ZOOM = 20;
const TILE_MAX_NATIVE = 19;
const FIT_MAX_ZOOM = 15;
const FOLLOW_PAN_MS = 280;

/** Added to bridge heading for on-map HDG label + icon rotation. */
const DISPLAY_HDG_OFFSET_DEG = 14;

const SELF_FILL = "#7c3aed";

const OTHERS_PALETTE = [
  "#f97316",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
];

const tipClass =
  "[&_.leaflet-tooltip]:!rounded-xl [&_.leaflet-tooltip]:!border [&_.leaflet-tooltip]:!border-slate-600 [&_.leaflet-tooltip]:!bg-slate-900 [&_.leaflet-tooltip]:!text-slate-100 [&_.leaflet-tooltip]:!px-2.5 [&_.leaflet-tooltip]:!py-1.5 [&_.leaflet-tooltip]:!text-xs [&_.leaflet-tooltip]:!shadow-lg";

function fillForOtherUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return OTHERS_PALETTE[h % OTHERS_PALETTE.length];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtHdg(deg: number | undefined): string {
  if (deg === undefined || !Number.isFinite(deg)) return "HDG —";
  const v = Math.round(((deg % 360) + 360) % 360);
  return `HDG ${String(v).padStart(3, "0")}°`;
}

function fmtAlt(ft: number | undefined): string {
  if (ft === undefined || !Number.isFinite(ft)) return "ALT —";
  if (ft >= 17900) return `FL${Math.round(ft / 100)}`;
  return `${Math.round(ft)} ft`;
}

function fmtGs(kt: number | undefined): string {
  if (kt === undefined || !Number.isFinite(kt)) return "GS —";
  return `GS ${Math.round(kt)} kts`;
}

/** Pixel size of the rotating SVG (square viewBox). */
const PILOT_MARKER_PX = 48;
/**
 * Rotation + map anchor in viewBox coords (centroid of the wedge).
 * Asymmetric “navigation” shape so heading is obvious (Google Maps–style wedge).
 */
const PILOT_MARKER_OX = 24;
const PILOT_MARKER_OY = 24.4;

/**
 * Google Maps / CarPlay–style navigation wedge (no outer ring): sharp nose,
 * wide tail, center notch — reads clearly as “this way forward”. Main fill is
 * `fillHex`; left facet uses a white gloss so direction pops in any hue.
 */
function pilotMarkerSvg(fillHex: string): string {
  const stroke = "#ffffff";
  const sw = 2.2;
  const outline =
    "M 24 4.5 L 41.5 37.5 L 24 31.2 L 6.5 37.5 Z";
  return `<svg width="${PILOT_MARKER_PX}" height="${PILOT_MARKER_PX}" viewBox="0 0 ${PILOT_MARKER_PX} ${PILOT_MARKER_PX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="${outline}" fill="${fillHex}" />
        <path d="M 24 4.5 L 6.5 37.5 L 24 31.2 Z" fill="#ffffff" fill-opacity="0.32" />
        <path
          d="${outline}"
          fill="none"
          stroke="${stroke}"
          stroke-width="${sw}"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>`;
}

/** You: marker rotates; rounded stats box stays upright to the right. */
function selfPilotDivIcon(
  headingDeg: number,
  fillHex: string,
  lines: { hdg: string; alt: string; spd: string },
) {
  const h = Number.isFinite(headingDeg) ? headingDeg : 0;
  const W = 130;
  const H = 54;
  const ox = PILOT_MARKER_OX;
  const oy = PILOT_MARKER_OY;
  const anchorX = PILOT_MARKER_OX;
  const anchorY = H - PILOT_MARKER_PX + PILOT_MARKER_OY;
  const box = `${escapeHtml(lines.hdg)}<br>${escapeHtml(lines.alt)}<br>${escapeHtml(lines.spd)}`;
  return L.divIcon({
    className: "plane-live-marker leaflet-zoom-animated",
    html: `<div style="position:relative;width:${W}px;height:${H}px;pointer-events:auto;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5))">
      <div style="position:absolute;left:0;bottom:0;width:${PILOT_MARKER_PX}px;height:${PILOT_MARKER_PX}px;transform:rotate(${h}deg);transform-origin:${ox}px ${oy}px">
        ${pilotMarkerSvg(fillHex)}
      </div>
      <div style="position:absolute;left:54px;top:4px;min-width:72px;max-width:88px;border-radius:10px;border:1px solid rgba(148,163,184,0.45);background:rgba(15,23,42,0.95);padding:5px 8px;font:600 10px/1.35 ui-monospace,SFMono-Regular,monospace;color:#e2e8f0;text-align:left">
        ${box}
      </div>
    </div>`,
    iconSize: [W, H],
    iconAnchor: [anchorX, anchorY],
  });
}

/** Others: @username fixed above icon; marker rotates beneath. */
function otherPilotDivIcon(
  headingDeg: number,
  fillHex: string,
  username: string | null | undefined,
) {
  const h = Number.isFinite(headingDeg) ? headingDeg : 0;
  const W = 96;
  const H = 68;
  const ox = PILOT_MARKER_OX;
  const oy = PILOT_MARKER_OY;
  const anchorX = W / 2;
  const anchorY = H - PILOT_MARKER_PX + PILOT_MARKER_OY;
  const half = PILOT_MARKER_PX / 2;
  const label = username?.trim()
    ? `@${escapeHtml(username.trim())}`
    : "Pilot";
  return L.divIcon({
    className: "plane-live-marker leaflet-zoom-animated",
    html: `<div style="position:relative;width:${W}px;height:${H}px;pointer-events:auto;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))">
      <div style="position:absolute;left:0;right:0;top:0;text-align:center;font:700 11px/1.2 system-ui,sans-serif;color:#ede9fe;text-shadow:0 1px 4px rgba(0,0,0,0.85);padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${W}px">
        ${label}
      </div>
      <div style="position:absolute;left:50%;bottom:0;margin-left:-${half}px;width:${PILOT_MARKER_PX}px;height:${PILOT_MARKER_PX}px;transform:rotate(${h}deg);transform-origin:${ox}px ${oy}px">
        ${pilotMarkerSvg(fillHex)}
      </div>
    </div>`,
    iconSize: [W, H],
    iconAnchor: [anchorX, anchorY],
  });
}

type PlaneOnMap = {
  userId: string;
  lat: number;
  lng: number;
  username?: string | null;
  headingTrueDeg?: number;
  altitudeFt?: number;
  groundSpeedKt?: number;
  updatedAt: number;
};

function mapRotationDeg(p: PlaneOnMap): number {
  const h = p.headingTrueDeg;
  if (h === undefined || !Number.isFinite(h)) return 0;
  return ((h + DISPLAY_HDG_OFFSET_DEG) % 360 + 360) % 360;
}

function MapViewController({
  positions,
  myPlane,
  planes,
  followLive,
}: {
  positions: [number, number][];
  myPlane: {
    lat: number;
    lng: number;
    headingTrueDeg?: number;
  } | null;
  planes: PlaneOnMap[];
  followLive: boolean;
}) {
  const map = useMap();
  const routeSig = useMemo(() => JSON.stringify(positions), [positions]);
  const myPresence = myPlane ? 1 : 0;
  const planesRef = useRef(planes);
  useEffect(() => {
    planesRef.current = planes;
  }, [planes]);

  const planeCount = planes.length;

  useEffect(() => {
    if (followLive) return;
    const list = planesRef.current;
    const pts: [number, number][] = [...positions];
    for (const p of list) pts.push([p.lat, p.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.flyTo(pts[0], 12, { duration: 0.9, easeLinearity: 0.28 });
      return;
    }
    map.flyToBounds(L.latLngBounds(pts), {
      padding: [44, 44],
      maxZoom: FIT_MAX_ZOOM,
      duration: 1.2,
      easeLinearity: 0.28,
    });
  }, [map, routeSig, followLive, myPresence, positions, planeCount]);

  useEffect(() => {
    if (!followLive || !myPlane) return;
    map.panTo([myPlane.lat, myPlane.lng], {
      animate: true,
      duration: FOLLOW_PAN_MS / 1000,
      easeLinearity: 0.22,
    });
  }, [map, followLive, myPlane]);

  return null;
}

function statsTooltipLines(p: PlaneOnMap) {
  const rot = mapRotationDeg(p);
  return (
    <div className="space-y-0.5 font-mono leading-tight">
      <p>{fmtHdg(rot)}</p>
      <p>{fmtAlt(p.altitudeFt)}</p>
      <p>{fmtGs(p.groundSpeedKt)}</p>
    </div>
  );
}

export function FlightMap({
  route,
  waypoints,
  showLivePosition,
  accountId,
}: {
  route: LatLng[];
  waypoints?: RouteWaypointMarker[];
  showLivePosition: boolean;
  accountId?: string | null;
}) {
  const wp = waypoints ?? [];
  const positions = useMemo(
    () => route.map((p) => [p.lat, p.lng] as [number, number]),
    [route],
  );
  const [planes, setPlanes] = useState<PlaneOnMap[]>([]);
  const [followLive, setFollowLive] = useState(false);
  const followActive = followLive && showLivePosition;

  const myPlane: {
    lat: number;
    lng: number;
    headingTrueDeg?: number;
  } | null = useMemo(() => {
    if (!accountId) return null;
    const p = planes.find((x) => x.userId === accountId);
    if (!p) return null;
    return {
      lat: p.lat,
      lng: p.lng,
      headingTrueDeg: p.headingTrueDeg,
    };
  }, [planes, accountId]);

  useEffect(() => {
    if (!showLivePosition) return;
    const base =
      typeof window !== "undefined" ? window.location.origin : "";
    const es = new EventSource(`${base}/api/plane-position/stream`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as {
          planes?: PlaneOnMap[];
        };
        if (Array.isArray(d.planes)) {
          setPlanes(d.planes);
        } else {
          setPlanes([]);
        }
      } catch {
        setPlanes([]);
      }
    };
    es.onerror = () => {
      /* keep last positions; stream may reconnect */
    };
    return () => es.close();
  }, [showLivePosition]);

  const defaultCenter: [number, number] = positions[0] ??
    (planes[0] ? [planes[0].lat, planes[0].lng] : [39.5, -98.35]);

  const onSelfMarkerClick = useCallback(() => {
    if (!showLivePosition) return;
    setFollowLive((v) => !v);
  }, [showLivePosition]);

  const iconForPlane = useCallback(
    (p: PlaneOnMap) => {
      const isSelf = Boolean(accountId && p.userId === accountId);
      const fill = isSelf ? SELF_FILL : fillForOtherUserId(p.userId);
      if (isSelf) {
        const rot = mapRotationDeg(p);
        return selfPilotDivIcon(rot, fill, {
          hdg: fmtHdg(rot),
          alt: fmtAlt(p.altitudeFt),
          spd: fmtGs(p.groundSpeedKt),
        });
      }
      return otherPilotDivIcon(mapRotationDeg(p), fill, p.username);
    },
    [accountId],
  );

  const hasTraffic = planes.length > 0;
  const myPos: [number, number] | null = myPlane
    ? [myPlane.lat, myPlane.lng]
    : null;

  if (positions.length < 2 && !hasTraffic) {
    return (
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
        No lat/lon in this OFP for a route line.
        {!showLivePosition ? (
          <>
            {" "}
            Sign in here, generate a bridge code on the site, and enter it in the
            MSFS bridge to see live aircraft on the map.
          </>
        ) : (
          <>
            {" "}
            Live traffic appears when pilots connect the bridge with a code from
            this site.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/80 ring-1 ring-slate-600/30">
      <p className="border-b border-slate-700/80 bg-slate-900/60 px-4 py-2 text-xs text-slate-500">
        Amber line = route; rings = waypoints.{" "}
        <span className="text-violet-300/90">You</span> = purple diamond + stats
        box; <span className="text-slate-400">others</span> show @name above;
        hover them for HDG / ALT / GS (heading and ground speed from the bridge
        when connected).
        {myPos ? (
          <>
            {" "}
            <span className="text-slate-400">
              Click <span className="text-violet-300/90">your</span> marker to{" "}
              {followActive ? (
                <button
                  type="button"
                  onClick={() => setFollowLive(false)}
                  className="font-medium text-sky-300 underline decoration-sky-500/50 hover:text-sky-200"
                >
                  stop following
                </button>
              ) : (
                <span className="font-medium text-sky-300/90">
                  follow — map tracks you
                </span>
              )}
              .
            </span>
          </>
        ) : null}
        {!showLivePosition ? (
          <span className="ml-1 text-amber-200/80">
            Sign in to see live traffic.
          </span>
        ) : null}
      </p>
      <MapContainer
        center={defaultCenter}
        zoom={5}
        maxZoom={MAP_MAX_ZOOM}
        minZoom={2}
        zoomAnimation
        fadeAnimation
        className={`h-[min(52vh,480px)] w-full z-0 [&_.leaflet-control-zoom]:border-slate-600 [&_.leaflet-control-zoom]:bg-slate-900/90 [&_.leaflet-control-zoom_a]:text-slate-200 ${tipClass}`}
        scrollWheelZoom
        wheelPxPerZoomLevel={96}
        zoomSnap={0.25}
        zoomDelta={0.5}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={TILE_MAX_NATIVE}
        />
        {positions.length >= 2 ? (
          <Polyline
            positions={positions}
            pathOptions={{
              color: "#fbbf24",
              weight: 3,
              opacity: 0.9,
            }}
          />
        ) : null}
        {wp.map((w, i) => (
          <CircleMarker
            key={`${w.ident}-${i}-${w.lat}-${w.lng}`}
            center={[w.lat, w.lng]}
            radius={5}
            pathOptions={{
              color: "#fbbf24",
              fillColor: "#0f172a",
              fillOpacity: 0.92,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="font-mono text-[11px] text-slate-100">
                {w.ident}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
        {planes.map((p) => {
          const isSelf = Boolean(accountId && p.userId === accountId);
          return (
            <Marker
              key={p.userId}
              position={[p.lat, p.lng]}
              icon={iconForPlane(p)}
              zIndexOffset={isSelf ? 1000 : 500}
              eventHandlers={
                isSelf ? { click: onSelfMarkerClick } : {}
              }
            >
              {!isSelf ? (
                <Tooltip
                  direction="right"
                  offset={[10, -18]}
                  opacity={1}
                  sticky
                >
                  {statsTooltipLines(p)}
                </Tooltip>
              ) : null}
            </Marker>
          );
        })}
        <MapViewController
          positions={positions}
          myPlane={myPlane}
          planes={planes}
          followLive={followActive}
        />
      </MapContainer>
    </div>
  );
}
