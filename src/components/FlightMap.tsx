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

function navigationChevronIcon(headingDeg: number) {
  const h = Number.isFinite(headingDeg) ? headingDeg : 0;
  const w = 36;
  const hgt = 44;
  const ax = w / 2;
  const ay = hgt / 2 + 2;
  return L.divIcon({
    className: "plane-live-marker leaflet-zoom-animated",
    html: `<div style="transform:rotate(${h}deg);transform-origin:${ax}px ${ay}px;width:${w}px;height:${hgt}px;display:flex;align-items:center;justify-content:center;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) drop-shadow(0 1px 0 rgba(255,255,255,.12))">
      <svg width="${w}" height="${hgt}" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M18 3 L32 30 L22 25 L18 40 L14 25 L4 30 Z"
          fill="#38bdf8" stroke="#e0f2fe" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M18 10 L18 28" stroke="rgba(255,255,255,0.35)" stroke-width="1" stroke-linecap="round"/>
      </svg>
    </div>`,
    iconSize: [w, hgt],
    iconAnchor: [ax, ay],
  });
}

function MapViewController({
  positions,
  live,
  followLive,
}: {
  positions: [number, number][];
  live: { lat: number; lng: number; heading?: number } | null;
  followLive: boolean;
}) {
  const map = useMap();
  const routeSig = useMemo(() => JSON.stringify(positions), [positions]);
  /** Only toggles when live appears/disappears — not on every SSE tick. */
  const livePresence = live ? 1 : 0;
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (followLive) return;
    const l = liveRef.current;
    const pts: [number, number][] = [...positions];
    if (l) pts.push([l.lat, l.lng]);
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
  }, [map, routeSig, followLive, livePresence, positions]);

  useEffect(() => {
    if (!followLive || !live) return;
    map.panTo([live.lat, live.lng], {
      animate: true,
      duration: FOLLOW_PAN_MS / 1000,
      easeLinearity: 0.22,
    });
  }, [map, followLive, live]);

  return null;
}

export function FlightMap({
  route,
  showLivePosition,
}: {
  route: LatLng[];
  /** When true, subscribe to SSE (requires signed-in browser session). */
  showLivePosition: boolean;
}) {
  const positions = useMemo(
    () => route.map((p) => [p.lat, p.lng] as [number, number]),
    [route],
  );
  const [live, setLive] = useState<{
    lat: number;
    lng: number;
    heading?: number;
  } | null>(null);
  const [followLive, setFollowLive] = useState(false);
  const followActive = followLive && showLivePosition;

  useEffect(() => {
    if (!showLivePosition) return;
    const base =
      typeof window !== "undefined" ? window.location.origin : "";
    const es = new EventSource(`${base}/api/plane-position/stream`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as {
          lat?: number;
          lng?: number;
          heading?: number;
        } | null;
        if (
          d &&
          typeof d.lat === "number" &&
          typeof d.lng === "number" &&
          Number.isFinite(d.lat) &&
          Number.isFinite(d.lng)
        ) {
          setLive({
            lat: d.lat,
            lng: d.lng,
            heading: d.heading,
          });
        } else {
          setLive(null);
        }
      } catch {
        setLive(null);
      }
    };
    es.onerror = () => {
      /* keep last position; stream may reconnect */
    };
    return () => es.close();
  }, [showLivePosition]);

  const defaultCenter: [number, number] = positions[0] ??
    (live ? [live.lat, live.lng] : [39.5, -98.35]);

  const onMarkerClick = useCallback(() => {
    if (!showLivePosition) return;
    setFollowLive((v) => !v);
  }, [showLivePosition]);

  const livePos: [number, number] | null = live
    ? [live.lat, live.lng]
    : null;

  const heading = live?.heading ?? 0;
  const chevronIcon = useMemo(
    () => navigationChevronIcon(heading),
    [heading],
  );

  if (positions.length < 2 && !live) {
    return (
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
        No lat/lon in this OFP for a route line.
        {!showLivePosition ? (
          <>
            {" "}
            Sign in here, generate a bridge code on the site, and enter it in the
            MSFS bridge to see your live aircraft on the map.
          </>
        ) : (
          <>
            {" "}
            Live position appears after you link the bridge with a code from this
            site.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/80 ring-1 ring-slate-600/30">
      <p className="border-b border-slate-700/80 bg-slate-900/60 px-4 py-2 text-xs text-slate-500">
        Route polyline from SimBrief; amber = plan. Cyan chevron = you (bridge).
        {livePos ? (
          <>
            {" "}
            <span className="text-slate-400">
              Click the chevron to{" "}
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
            Sign in to see your position.
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
        {livePos ? (
          <Marker
            position={livePos}
            icon={chevronIcon}
            eventHandlers={{ click: onMarkerClick }}
            zIndexOffset={800}
          />
        ) : null}
        <MapViewController
          positions={positions}
          live={live}
          followLive={followActive}
        />
      </MapContainer>
    </div>
  );
}
