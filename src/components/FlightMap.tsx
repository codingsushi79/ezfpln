"use client";

import { useEffect, useMemo, useState } from "react";
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

function FitBounds({
  positions,
  live,
}: {
  positions: [number, number][];
  live: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [...positions];
    if (live) pts.push(live);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 9);
      return;
    }
    const b = L.latLngBounds(pts);
    map.fitBounds(b, { padding: [40, 40], maxZoom: 9 });
  }, [map, positions, live]);
  return null;
}

function planeIcon(headingDeg: number) {
  const h = Number.isFinite(headingDeg) ? headingDeg : 0;
  return L.divIcon({
    className: "plane-live-marker",
    html: `<div style="transform:rotate(${h}deg);width:44px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,.55))">
      <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="wing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#38bdf8"/>
            <stop offset="100%" style="stop-color:#0ea5e9"/>
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r="20" fill="rgba(14,165,233,0.2)" stroke="#7dd3fc" stroke-width="1.2"/>
        <path d="M22 6 L32 24 L24 20 L22 28 L20 20 L12 24 Z" fill="url(#wing)" stroke="#0369a1" stroke-width="0.6"/>
        <path d="M22 20 L22 36" stroke="#e2e8f0" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="22" cy="22" r="2.2" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.4"/>
      </svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
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

  if (positions.length < 2 && !live) {
    return (
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
        No lat/lon in this OFP for a route line.
        {!showLivePosition ? (
          <>
            {" "}
            Sign in to your account and run the MSFS bridge while signed in here
            to see your live aircraft on the map.
          </>
        ) : (
          <>
            {" "}
            Live position from the MSFS bridge appears when you sign in through
            the bridge with the same account.
          </>
        )}
      </div>
    );
  }

  const livePos: [number, number] | null = live
    ? [live.lat, live.lng]
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/80 ring-1 ring-slate-600/30">
      <p className="border-b border-slate-700/80 bg-slate-900/60 px-4 py-2 text-xs text-slate-500">
        Route polyline from SimBrief; amber = plan. Cyan marker = your live
        aircraft (MSFS bridge + same account).
        {!showLivePosition ? (
          <span className="ml-1 text-amber-200/80">
            Sign in to see your position.
          </span>
        ) : null}
      </p>
      <MapContainer
        center={defaultCenter}
        zoom={5}
        className="h-[min(52vh,480px)] w-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
            key={`${livePos[0]}-${livePos[1]}-${live?.heading ?? 0}`}
            position={livePos}
            icon={planeIcon(live?.heading ?? 0)}
          />
        ) : null}
        <FitBounds positions={positions} live={livePos} />
      </MapContainer>
    </div>
  );
}
