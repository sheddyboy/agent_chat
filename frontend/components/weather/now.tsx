"use client";

import { useCountUp } from "@/components/overview/card";
import { SkyIcon } from "@/components/weather/sky-icon";
import type { Forecast } from "@/components/weather/types";

// The big reading at the top: temperature, sky, feels like, today's range and what's coming
export function Now({ data }: { data: Forecast }) {
  const { current: c, daily, summary } = data;
  const temp = useCountUp(c.temp);
  return (
    <section className="flex flex-wrap items-center gap-x-8 gap-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
      <SkyIcon
        code={c.code}
        night={!c.is_day}
        className="size-20 shrink-0 stroke-[1] text-muted-foreground motion-safe:animate-[float_6s_ease-in-out_infinite] sm:size-24"
      />
      <div className="min-w-0">
        <p className="font-mono text-7xl font-semibold tracking-tighter tabular-nums sm:text-8xl">{Math.round(temp)}°</p>
        <p className="mt-1 text-lg capitalize">{c.sky}</p>
        <p className="text-sm text-muted-foreground">
          Feels like {Math.round(c.feels_like)}° · H {Math.round(daily[0].max)}° L {Math.round(daily[0].min)}°
        </p>
      </div>
      <p className="w-full rounded-xl border bg-card px-4 py-3 text-sm sm:w-auto sm:flex-1 sm:self-end">{summary}.</p>
    </section>
  );
}
