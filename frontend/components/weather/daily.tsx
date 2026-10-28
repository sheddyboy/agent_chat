"use client";

import { SkyIcon } from "@/components/weather/sky-icon";
import type { Forecast } from "@/components/weather/types";

// Seven days, each with a low to high bar on one shared scale so warm and cold days stand out
export function Daily({ data }: { data: Forecast }) {
  const days = data.daily;
  const lo = Math.min(...days.map((d) => d.min));
  const hi = Math.max(...days.map((d) => d.max));
  const span = Math.max(hi - lo, 1);
  const today = data.time.slice(0, 10);

  return (
    <section className="rounded-2xl border bg-card p-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:duration-500" style={{ animationDelay: "200ms" }}>
      <h2 className="px-3 pt-2 pb-1 text-xs text-muted-foreground uppercase tracking-wide">7 days</h2>
      <ul>
        {days.map((d, i) => (
          <li
            key={d.date}
            className="grid grid-cols-[3.5rem_1.75rem_2.5rem_2rem_1fr_2rem] items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both"
            style={{ animationDelay: `${250 + i * 50}ms` }}
          >
            <span className="text-sm">
              {d.date === today ? "Today" : new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}
            </span>
            <SkyIcon code={d.code} className="size-5 stroke-[1.5]" />
            <span className="font-mono text-[11px] text-sky-500 tabular-nums">{d.rain >= 10 ? `${d.rain}%` : ""}</span>
            <span className="text-right font-mono text-sm text-muted-foreground tabular-nums">{Math.round(d.min)}°</span>
            <span className="relative h-1.5 rounded-full bg-muted">
              <span
                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400 via-foreground/60 to-amber-400 transition-all duration-700"
                style={{ left: `${((d.min - lo) / span) * 100}%`, width: `${((d.max - d.min) / span) * 100}%` }}
              />
            </span>
            <span className="font-mono text-sm tabular-nums">{Math.round(d.max)}°</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
