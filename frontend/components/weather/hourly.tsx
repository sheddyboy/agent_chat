"use client";

import { Sunrise, Sunset } from "lucide-react";
import { SkyIcon } from "@/components/weather/sky-icon";
import type { Forecast } from "@/components/weather/types";

type Slot = { kind: "hour"; time: string; temp: number; code: number; rain: number; night: boolean } | { kind: "sun"; time: string; rise: boolean };

// The next 24 hours as a strip you scroll sideways, with sunrise and sunset slotted in
export function Hourly({ data }: { data: Forecast }) {
  const hours = data.hourly;
  const first = hours[0]?.time ?? "";
  const last = hours[hours.length - 1]?.time ?? "";
  const suns: Slot[] = data.daily
    .flatMap((d) => [
      { kind: "sun" as const, time: d.sunrise, rise: true },
      { kind: "sun" as const, time: d.sunset, rise: false },
    ])
    .filter((s) => s.time > first && s.time.slice(0, 13) <= last.slice(0, 13));
  const slots: Slot[] = [
    ...hours.map((h) => ({ kind: "hour" as const, time: h.time, temp: h.temp, code: h.code, rain: h.rain, night: !h.is_day })),
    ...suns,
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <section className="rounded-2xl border bg-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:duration-500" style={{ animationDelay: "100ms" }}>
      <h2 className="px-5 pt-4 text-xs text-muted-foreground uppercase tracking-wide">Next 24 hours</h2>
      <ol className="flex gap-1 overflow-x-auto px-3 pt-3 pb-4 [scrollbar-width:thin]">
        {slots.map((s, i) =>
          s.kind === "sun" ? (
            <li key={`sun-${s.time}`} className="flex w-16 shrink-0 flex-col items-center gap-2 rounded-xl px-1 py-2 text-center">
              <span className="font-mono text-xs text-muted-foreground">{s.time.slice(11, 16)}</span>
              {s.rise ? <Sunrise className="size-6 stroke-[1.5] text-amber-500" /> : <Sunset className="size-6 stroke-[1.5] text-amber-500" />}
              <span className="text-xs text-muted-foreground">{s.rise ? "Sunrise" : "Sunset"}</span>
            </li>
          ) : (
            <li
              key={s.time}
              className={`flex w-16 shrink-0 flex-col items-center gap-2 rounded-xl px-1 py-2 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:fill-mode-both ${i === 0 ? "bg-muted" : ""}`}
              style={{ animationDelay: `${150 + Math.min(i, 12) * 30}ms` }}
            >
              <span className={`font-mono text-xs ${i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>{i === 0 ? "Now" : s.time.slice(11, 16)}</span>
              <SkyIcon code={s.code} night={s.night} className="size-6 stroke-[1.5]" />
              <span className="font-mono text-sm font-medium tabular-nums">{Math.round(s.temp)}°</span>
              {/* Rain chance as a small bar; empty below 10% so dry hours stay quiet */}
              <span className="flex h-7 flex-col items-center justify-end gap-1">
                {s.rain >= 10 && <span className="font-mono text-[10px] text-sky-500 tabular-nums">{s.rain}%</span>}
                <span className="h-1 w-8 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-sky-500 transition-[width] duration-700" style={{ width: `${s.rain}%` }} />
                </span>
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
