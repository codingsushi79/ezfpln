import { Suspense } from "react";
import { HomeApp } from "@/components/HomeApp";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <HomeApp />
    </Suspense>
  );
}
