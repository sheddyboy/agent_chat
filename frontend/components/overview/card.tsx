"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, ArrowUpRight, type LucideIcon } from "lucide-react";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// GET a backend path once; data stays undefined while loading
export function useWidget<T>(path: string, refreshMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    function load() {
      fetch(`${API}${path}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? `${r.status} ${r.statusText}`);
          return r.json();
        })
        .then((d) => live && (setData(d), setError(undefined)))
        .catch((e) => live && setError(e.message));
    }
    load();
    const timer = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [path, refreshMs]);

  return { data, error };
}

// Eases a number from 0 to its value, so counts and temperatures roll in
export function useCountUp(value: number | undefined, ms = 700) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === undefined) return;
    // Reduced motion jumps straight to the value on the first frame
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = duration ? Math.min(1, (t - start) / duration) : 1;
      setShown(value * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

// Grey bars standing in for content while a widget loads
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 motion-safe:animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 rounded-md bg-muted" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

// Shown in place of content when a source is not set up
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// The shell every widget shares: title row, then loading, error or content.
// `index` staggers the entrance so the cards arrive one after another.
export function Card({
  title,
  icon: Icon,
  index,
  href,
  loading,
  error,
  className = "",
  children,
}: {
  title: string;
  icon: LucideIcon;
  index: number;
  href?: string;
  loading?: boolean;
  error?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`group flex flex-col gap-4 rounded-2xl border bg-card p-5 transition duration-300 hover:border-foreground/20 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:hover:-translate-y-0.5 ${className}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <header className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors group-hover:text-foreground">
          <Icon className="size-3.5" />
        </span>
        <h2 className="text-sm font-medium">{title}</h2>
        {href && (
          <Link
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            aria-label={`Open ${title}`}
            className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </header>
      {error ? (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      ) : loading ? (
        <Skeleton />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          {children}
        </div>
      )}
    </section>
  );
}
