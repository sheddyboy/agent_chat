"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CloudRain } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_MS = 15 * 60_000;

// A slim notice when rain starts or stops within the hour
export function RainBanner({ text, place, href }: { text: string; place?: string; href?: string }) {
  const body = (
    <>
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-500">
        <span className="absolute inset-0 rounded-full bg-sky-500/20 motion-safe:animate-ping [animation-duration:2.5s]" />
        <CloudRain className="relative size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        {text}
        {place && <span className="text-muted-foreground"> · {place}</span>}
      </span>
      {href && <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
    </>
  );
  const cls =
    "group flex items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-500";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-sky-500/10`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// Home's rain alert, checked every 15 minutes; renders nothing when there is none
export function RainAlert() {
  const [alert, setAlert] = useState<{ alert: string | null; place?: string } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`${API}/weather/alert`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setAlert)
        .catch(() => setAlert(null));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return alert?.alert ? <RainBanner text={alert.alert} place={alert.place} href="/weather" /> : null;
}
