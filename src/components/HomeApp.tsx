"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlightPlanView } from "@/components/FlightPlanView";

type SessionInfo = {
  navigraphConnected: boolean;
  user: {
    name?: string;
    email?: string;
    sub?: string;
    preferred_username?: string;
  } | null;
  simbrief: { userid?: string; username?: string } | null;
};

const authMessages: Record<string, string> = {
  ok: "Navigraph account connected.",
  denied: "Navigraph sign-in was cancelled.",
  invalid: "Missing authorization code. Try connecting again.",
  state: "OAuth state mismatch. Try connecting again.",
  config: "Navigraph is not configured on the server.",
  no_refresh: "Navigraph did not return a refresh token. Check app scopes.",
  error: "Navigraph sign-in failed. Try again.",
};

export function HomeApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pilotId, setPilotId] = useState("");
  const [username, setUsername] = useState("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingOfp, setLoadingOfp] = useState(false);
  const [ofpError, setOfpError] = useState<string | null>(null);
  const [ofpData, setOfpData] = useState<unknown | null>(null);

  const loadSession = useCallback(async () => {
    setLoadingSession(true);
    setSessionError(null);
    try {
      const res = await fetch("/api/session");
      const data = (await res.json()) as SessionInfo & { error?: string };
      if (!res.ok) {
        setSessionError(data.error ?? "Could not load session");
        setSession(null);
        return;
      }
      setSession(data);
      if (data.simbrief?.userid) setPilotId(data.simbrief.userid);
      if (data.simbrief?.username) setUsername(data.simbrief.username);
    } catch {
      setSessionError("Network error loading session.");
      setSession(null);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const auth = searchParams.get("auth");
    if (!auth) return;
    const msg = authMessages[auth] ?? `Auth: ${auth}`;
    setToast(msg);
    void loadSession();
    router.replace("/", { scroll: false });
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [searchParams, loadSession, router]);

  async function saveSimbrief() {
    setSaving(true);
    setOfpError(null);
    try {
      const body =
        pilotId.trim().length > 0
          ? { simbriefUserid: pilotId.trim() }
          : username.trim().length > 0
            ? { simbriefUsername: username.trim() }
            : { simbriefUserid: "", simbriefUsername: "" };

      const res = await fetch("/api/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setOfpError(data.error ?? "Could not save SimBrief settings");
        return;
      }
      await loadSession();
    } finally {
      setSaving(false);
    }
  }

  async function loadFlightPlan() {
    setLoadingOfp(true);
    setOfpError(null);
    setOfpData(null);
    try {
      const q = new URLSearchParams();
      if (pilotId.trim()) q.set("userid", pilotId.trim());
      else if (username.trim()) q.set("username", username.trim());
      const url = q.toString() ? `/api/ofp?${q}` : "/api/ofp";
      const res = await fetch(url);
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setOfpError(
          typeof data.error === "string" ? data.error : "Could not load OFP",
        );
        return;
      }
      setOfpData(data);
    } catch {
      setOfpError("Network error while loading the flight plan.");
    } finally {
      setLoadingOfp(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setPilotId("");
    setUsername("");
    setOfpData(null);
    await loadSession();
  }

  const displayName =
    session?.user?.name ||
    session?.user?.preferred_username ||
    session?.user?.email;

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(251,191,36,0.12),transparent)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {toast ? (
          <div
            className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            role="status"
          >
            {toast}
          </div>
        ) : null}

        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            EZ Flight Plan
          </h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Connect Navigraph, link SimBrief, and view your latest OFP with
            weights, ZFW CG (% MAC), cost index, and nav log in a clear layout.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
          <aside className="space-y-4 rounded-2xl border border-slate-700/80 bg-slate-900/50 p-5 backdrop-blur-sm">
            <h2 className="text-sm font-medium text-slate-300">Connections</h2>

            {sessionError ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {sessionError}
              </p>
            ) : null}

            <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Navigraph
              </p>
              {loadingSession ? (
                <p className="mt-2 text-sm text-slate-500">Checking session…</p>
              ) : session?.navigraphConnected ? (
                <div className="mt-2">
                  <p className="text-sm text-emerald-400/90">Connected</p>
                  {displayName ? (
                    <p className="mt-1 text-sm text-slate-300">{displayName}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Not connected — use the button below after configuring OAuth.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                <a
                  href="/api/auth/navigraph"
                  className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500"
                >
                  Sign in with Navigraph
                </a>
                {session?.navigraphConnected ? (
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                SimBrief
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Pilot ID or username loads your latest plan. ZFW CG appears when
                SimBrief includes it (e.g. % MAC fields in weights).
              </p>
              <label className="mt-3 block text-xs text-slate-500">
                Pilot ID
                <input
                  value={pilotId}
                  onChange={(e) => {
                    setPilotId(e.target.value);
                    if (e.target.value) setUsername("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-amber-500/60"
                  placeholder="e.g. 123456"
                  autoComplete="off"
                />
              </label>
              <p className="mt-2 text-center text-xs text-slate-600">or</p>
              <label className="mt-2 block text-xs text-slate-500">
                Username
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (e.target.value) setPilotId("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500/60"
                  placeholder="SimBrief username"
                  autoComplete="username"
                />
              </label>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSimbrief()}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save SimBrief profile"}
                </button>
                <button
                  type="button"
                  disabled={loadingOfp || (!pilotId.trim() && !username.trim())}
                  onClick={() => void loadFlightPlan()}
                  className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingOfp ? "Loading plan…" : "Import latest flight plan"}
                </button>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-600">
              Navigraph OAuth:{" "}
              <a
                href="https://developers.navigraph.com/docs/request-access"
                className="text-slate-500 underline hover:text-slate-400"
                target="_blank"
                rel="noopener noreferrer"
              >
                request access
              </a>
              . Redirect:{" "}
              <code className="rounded bg-slate-800 px-1 font-mono text-[10px] text-slate-400">
                {"{APP_URL}/api/auth/navigraph/callback"}
              </code>
            </p>
          </aside>

          <main className="min-h-[320px]">
            {ofpError ? (
              <div className="mb-6 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {ofpError}
              </div>
            ) : null}
            {!ofpData ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/20 px-6 py-16 text-center">
                <p className="text-slate-500">
                  No flight plan loaded yet. Save your SimBrief Pilot ID or
                  username, then import your latest OFP.
                </p>
              </div>
            ) : (
              <FlightPlanView data={ofpData} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
