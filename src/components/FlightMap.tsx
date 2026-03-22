"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/ofp-parse";

const MAP_MAX_ZOOM = 20;
const TILE_MAX_NATIVE = 19;
const FIT_MAX_ZOOM = 15;
const FOLLOW_PAN_MS = 280;

/** Your aircraft — vibrant purple (GPS-style marker). */
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

function fillForOtherUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return OTHERS_PALETTE[h % OTHERS_PALETTE.length];
}

/**
 * Swallowtail chevron: one tip forward, base has an inverted-V notch; thick white
 * rim; short amber “heading” stem from the nose (rotates with aircraft).
 */
function swallowtailNavIcon(headingDeg: number, fillHex: string) {
  const h = Number.isFinite(headingDeg) ? headingDeg : 0;
  const w = 40;
  const hgt = 58;
  const cx = 20;
  const notchY = 50;
  const noseY = 14;
  return L.divIcon({
    className: "plane-live-marker leaflet-zoom-animated",
    html: `<div style="transform:rotate(${h}deg);transform-origin:${cx}px ${notchY}px;width:${w}px;height:${hgt}px;display:flex;align-items:center;justify-content:center;pointer-events:auto;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5))">
      <svg width="${w}" height="${hgt}" viewBox="0 0 40 58" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M${cx} ${noseY} L5 38 L${cx} ${notchY} L35 38 Z"
          fill="${fillHex}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
        <line x1="${cx}" y1="${noseY}" x2="${cx}" y2="2.5" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
    </div>`,
    iconSize: [w, hgt],
    iconAnchor: [cx, notchY],
  });
}

type PlaneOnMap = {
  userId: string;
  lat: number;
  lng: number;
  heading?: number;
  updatedAt: number;
};

function MapViewController({
  positions,
  myPlane,
  planes,
  followLive,
}: {
  positions: [number, number][];
  myPlane: { lat: number; lng: number; heading?: number } | null;
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

export function FlightMap({
  route,
  showLivePosition,
  accountId,
}: {
  route: LatLng[];
  showLivePosition: boolean;
  /** Session account id — used to style “you” vs other pilots. */
  accountId?: string | null;
}) {
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
    heading?: number;
  } | null = useMemo(() => {
    if (!accountId) return null;
    const p = planes.find((x) => x.userId === accountId);
    if (!p) return null;
    return { lat: p.lat, lng: p.lng, heading: p.heading };
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

  const iconForPlane = useCallback((p: PlaneOnMap) => {
    const isSelf = Boolean(accountId && p.userId === accountId);
    const fill = isSelf ? SELF_FILL : fillForOtherUserId(p.userId);
    return swallowtailNavIcon(p.heading ?? 0, fill);
  }, [accountId]);

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
        Route = amber line.{" "}
        <span className="text-violet-300/90">Purple chevron</span> = you; other
        colors = same shape for other pilots.
        {myPos ? (
          <>
            {" "}
            <span className="text-slate-400">
              Click <span className="text-violet-300/90">your</span> icon to{" "}
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
        className="h-[min(52vh,480px)] w-full z-0 [&_.leaflet-control-zoom]:border-slate-600 [&_.leaflet-control-zoom]:bg-slate-900/90 [&_.leaflet-control-zoom_a]:text-slate-200"
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
        {planes.map((p) => (
          <Marker
            key={p.userId}
            position={[p.lat, p.lng]}
            icon={iconForPlane(p)}
            zIndexOffset={
              accountId && p.userId === accountId ? 1000 : 500
            }
            eventHandlers={
              accountId && p.userId === accountId
                ? { click: onSelfMarkerClick }
                : {}
            }
          />
        ))}
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
