import dynamic from "next/dynamic";
import {
  formatElevationDisplay,
  formatNavAltitude,
  formatNavDistance,
  parseAirport,
  parseAlternates,
  parseExternalLinks,
  parseFetchMeta,
  parseFuelLines,
  parseGeneralSummary,
  parseNavlog,
  parseParams,
  parseRouteLatLngs,
  parseRouteWaypointMarkers,
  parseTimes,
  parseTripTimeRows,
  parseUnitContext,
  parseWeightLimitMatrix,
  parseWeightLines,
  parseZfwCgSummary,
  withDistanceNm,
  type AirportCard,
} from "@/lib/ofp-parse";

const FlightMap = dynamic(
  () =>
    import("@/components/FlightMap").then((m) => ({ default: m.FlightMap })),
  { ssr: false },
);

function AirportPanel({
  title,
  a,
  accent,
}: {
  title: string;
  a: AirportCard;
  accent: "from" | "to";
}) {
  const ring =
    accent === "from" ? "ring-amber-500/30" : "ring-sky-500/30";
  return (
    <div
      className={`rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 ring-1 ${ring} backdrop-blur-sm`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
        {a.icao ?? "—"}
        {a.iata ? (
          <span className="ml-2 text-lg font-normal text-slate-500">
            / {a.iata}
          </span>
        ) : null}
      </p>
      {a.name ? (
        <p className="mt-1 text-sm text-slate-400">{a.name}</p>
      ) : null}
      <dl className="mt-4 space-y-2 text-sm">
        {a.plan_rwy ? (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Runway</dt>
            <dd className="font-mono text-slate-200">{a.plan_rwy}</dd>
          </div>
        ) : null}
        {a.elevation ? (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Elevation (MSL)</dt>
            <dd className="font-mono text-slate-200">
              {formatElevationDisplay(a.elevation) ?? a.elevation}
            </dd>
          </div>
        ) : null}
        {a.metar ? (
          <div className="mt-3 rounded-lg bg-slate-950/50 p-3">
            <dt className="text-xs text-slate-500">METAR</dt>
            <dd className="mt-1 font-mono text-xs leading-relaxed text-slate-300">
              {a.metar}
            </dd>
          </div>
        ) : null}
        {a.atis ? (
          <div className="rounded-lg bg-slate-950/50 p-3">
            <dt className="text-xs text-slate-500">ATIS</dt>
            <dd className="mt-1 font-mono text-xs text-slate-300">{a.atis}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-slate-100">{value}</p>
    </div>
  );
}

function WeightLimitMatrix({
  matrix,
}: {
  matrix: ReturnType<typeof parseWeightLimitMatrix>;
}) {
  const hasAny = matrix.rows.some((r) => r.est || r.max);
  if (!hasAny) return null;
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/50 p-5">
      <h3 className="text-sm font-medium text-slate-300">
        ZFW, TOW & LDW — estimated vs max ({matrix.unitShort})
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Same row = same limit type; compare columns for margin to max.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[280px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4 text-left font-medium" />
              <th className="px-3 py-2 text-right font-medium">Estimated</th>
              <th className="px-3 py-2 text-right font-medium">Max / limit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {matrix.rows.map((row) => (
              <tr key={row.kind} className="text-slate-300">
                <td className="py-2.5 pr-4 font-medium text-slate-400">
                  {row.kind}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-100">
                  {row.est ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-100">
                  {row.max ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/50 p-5">
      <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      <ul className="mt-3 divide-y divide-slate-800">
        {rows.map((r) => (
          <li
            key={`${r.label}-${r.value}`}
            className="flex justify-between gap-4 py-2.5 text-sm first:pt-0"
          >
            <span className="text-slate-500">{r.label}</span>
            <span className="font-mono text-slate-200">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlightPlanView({
  data,
  allowLiveMap,
  accountId,
}: {
  data: unknown;
  /** Browser session only — enables live SSE for your user. */
  allowLiveMap: boolean;
  /** Logged-in account id — styles “you” vs other pilots on the map. */
  accountId?: string | null;
}) {
  const d = data as { origin?: unknown; destination?: unknown };
  const origin = parseAirport(d.origin);
  const dest = parseAirport(d.destination);
  const general = parseGeneralSummary(data);
  const times = parseTimes(data);
  const units = parseUnitContext(data);
  const fuel = parseFuelLines(data, units);
  const weightMatrix = parseWeightLimitMatrix(data, units);
  const weights = parseWeightLines(data, units, { omitLimitMatrix: true });
  const navlog = parseNavlog(data);
  const alternates = parseAlternates(data);
  const params = parseParams(data);
  const fetchMeta = parseFetchMeta(data);
  const links = parseExternalLinks(data);
  const zfwCg = parseZfwCgSummary(data);
  const tripTimeRows = parseTripTimeRows(data);
  const routeLatLngs = parseRouteLatLngs(data);
  const routeWaypoints = parseRouteWaypointMarkers(data);

  const titleParts = [origin.icao, dest.icao].filter(Boolean);
  const routeTitle =
    titleParts.length === 2 ? `${titleParts[0]} → ${titleParts[1]}` : "Flight plan";

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-amber-400/90">Readable OFP</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              {routeTitle}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-400">
              {general.airline && general.flightNumber ? (
                <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-slate-200">
                  {general.airline}
                  {general.flightNumber}
                </span>
              ) : null}
              {general.callsign ? (
                <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-slate-200">
                  {general.callsign}
                </span>
              ) : null}
              {general.aircraft ? (
                <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-slate-200">
                  {general.aircraft}
                </span>
              ) : null}
              {general.initialAltitude ? (
                <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-slate-200">
                  {formatNavAltitude(general.initialAltitude)}
                </span>
              ) : null}
              {general.costIndex ? (
                <span
                  className="rounded-full bg-violet-500/15 px-3 py-1 font-mono text-violet-200 ring-1 ring-violet-500/35"
                  title="Cost index (unitless)"
                >
                  CI {general.costIndex} (index)
                </span>
              ) : null}
              {params.units ? (
                <span
                  className="rounded-full border border-slate-600 px-3 py-1 text-slate-400"
                  title="SimBrief weight & fuel units"
                >
                  Weights/fuel: {params.units}
                </span>
              ) : (
                <span className="rounded-full border border-slate-600 px-3 py-1 text-slate-500">
                  Weights/fuel: {units.weightShort} (default)
                </span>
              )}
            </div>
          </div>
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-300 ring-1 ring-amber-500/40 transition hover:bg-amber-500/25"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {zfwCg ? (
          <div className="mt-5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 ring-1 ring-cyan-500/20">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400/90">
              ZFW center of gravity
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-cyan-100">
              {zfwCg.primary}
            </p>
            {zfwCg.subtitle ? (
              <p className="mt-0.5 text-xs text-cyan-200/60">{zfwCg.subtitle}</p>
            ) : null}
          </div>
        ) : null}
        <p className="mt-4 text-xs text-slate-500">
          Units: distances NM, elevation ft MSL, navlog alt ft/FL, mass{" "}
          {units.weightShort}. Trip times below are hours/minutes; raw unix clock
          values from SimBrief are shown as HH:MM UTC.
        </p>
        {general.route ? (
          <div className="mt-6 rounded-xl border border-slate-700/50 bg-slate-950/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Route
            </p>
            <p className="mt-2 font-mono text-sm leading-relaxed text-slate-300">
              {general.route}
            </p>
          </div>
        ) : null}
        {(fetchMeta.userId || fetchMeta.staticId || general.ofpId) && (
          <p className="mt-4 text-xs text-slate-600">
            {fetchMeta.userId ? `SimBrief user ${fetchMeta.userId}` : null}
            {fetchMeta.staticId ? ` · static ${fetchMeta.staticId}` : null}
            {general.ofpId ? ` · OFP ${general.ofpId}` : null}
          </p>
        )}
      </header>

      <section>
        <h3 className="mb-3 text-sm font-medium text-slate-400">
          Route map
        </h3>
        <FlightMap
          route={routeLatLngs}
          waypoints={routeWaypoints}
          showLivePosition={allowLiveMap}
          accountId={accountId}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <AirportPanel title="Departure" a={origin} accent="from" />
        <AirportPanel title="Arrival" a={dest} accent="to" />
      </div>

      {alternates.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-medium text-slate-400">
            Alternates
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alternates.map((a, i) => (
              <AirportPanel
                key={`${a.icao ?? i}`}
                title={`Alternate ${i + 1}`}
                a={a}
                accent="to"
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-medium text-slate-400">
          Trip times
        </h3>
        {tripTimeRows.length > 0 ? (
          <DataList
            title="Trip times (h / min)"
            rows={tripTimeRows}
          />
        ) : (
          <p className="text-sm text-slate-500">
            No block / taxi / flight times in this OFP.
          </p>
        )}
        <h3 className="mb-3 mt-8 text-sm font-medium text-slate-400">
          Distance
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Stat label="Great circle (NM)" value={withDistanceNm(times.gcdNm)} />
          <Stat label="Route distance (NM)" value={withDistanceNm(times.routeNm)} />
        </div>
      </section>

      <WeightLimitMatrix matrix={weightMatrix} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DataList
          title={`Fuel (${units.weightLong}, ${units.weightShort})`}
          rows={fuel}
        />
        <DataList
          title={`Other weights & CG (${units.weightLong}, ${units.weightShort})`}
          rows={weights}
        />
      </div>

      {navlog.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/40">
          <div className="border-b border-slate-700/80 px-5 py-4">
            <h3 className="text-sm font-medium text-slate-300">Nav log</h3>
            <p className="mt-1 text-xs text-slate-500">
              Waypoints, airways, legs. Alt ft/FL, dist NM, wind kt.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-medium">Fix</th>
                  <th className="px-4 py-3 font-medium">Airway</th>
                  <th className="px-4 py-3 font-medium">Alt (ft/FL)</th>
                  <th className="px-4 py-3 font-medium">Dist (NM)</th>
                  <th className="px-4 py-3 font-medium">Wind (kt)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {navlog.map((row, i) => (
                  <tr
                    key={`${row.ident ?? "fix"}-${i}`}
                    className="text-slate-300 hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-100">
                      {row.ident ?? "—"}
                      {row.name ? (
                        <span className="ml-2 font-sans text-xs text-slate-500">
                          {row.name}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                      {row.via_airway ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {formatNavAltitude(row.altitude)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {formatNavDistance(row.distance)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      {row.wind ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
