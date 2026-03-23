"use client";

import React, { useEffect } from "react";

const MAC_DMG_URL =
  "https://github.com/codingsushi79/ezfpln/releases/download/v1.0.0/EzFlightPlan.dmg";
const MSFS_EXE_URL =
  "https://github.com/codingsushi79/ezflpln-msfs-bridge/releases/download/v1.0.0/EzFlightPlan.exe";

function DownloadCard({
  title,
  url,
  fileLabel,
  description,
  autoStart,
}: {
  title: string;
  url: string;
  fileLabel: string;
  description: string;
  autoStart?: boolean;
}) {
  const confirmAndOpen = () => {
    // Browser-controlled download links often require a user gesture.
    // We gate the actual open() behind a confirm dialog.
    const ok = window.confirm(`Start downloading ${fileLabel}?`);
    if (!ok) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/50 p-6 backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {fileLabel}
      </h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.preventDefault();
          confirmAndOpen();
        }}
        className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
      >
        Download
      </a>

      {autoStart ? (
        <p className="mt-4 text-xs text-slate-400">
          Your download has started automatically. If it hasn&apos;t click{" "}
          <a
            className="text-amber-200 underline underline-offset-4"
            href={url}
            target="_blank"
            rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                confirmAndOpen();
              }}
          >
            HERE
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

export default function DownloadPage() {
  useEffect(() => {
    // Best-effort “auto start” without redirecting this page.
    // We open in a new tab so the user stays on /download.
    try {
      window.open(MAC_DMG_URL, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(251,191,36,0.12),transparent)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Download
          </h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Get the desktop apps for EZ Flight Plan and the optional MSFS
            bridge injector.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <DownloadCard
            title="macOS app"
            url={MAC_DMG_URL}
            fileLabel="EzFlightPlan.dmg"
            description="The flight planning app."
            autoStart
          />
          <DownloadCard
            title="MSFS injector"
            url={MSFS_EXE_URL}
            fileLabel="EzFlightPlan.exe"
            description="Desktop bridge that sends live aircraft data to this website."
          />
        </div>

        <div className="mt-8 rounded-2xl border border-slate-700/80 bg-slate-900/40 p-5 backdrop-blur-sm">
          <p className="text-sm text-slate-300">
            Tip: after installing the bridge (Windows), pair it using the
            6-character code shown in the app.
          </p>
        </div>
      </div>
    </div>
  );
}

