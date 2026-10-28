"use client";

import { Sun } from "lucide-react";
import { Card, Empty, useCountUp, useWidget } from "@/components/overview/card";
import { SkyIcon } from "@/components/weather/sky-icon";

type Weather =
  | { connected: false }
  | {
      connected: true;
      place: string;
      temp: number;
      code: number;
      sky: string;
      is_day: boolean;
      min: number;
      max: number;
      summary: string;
      hourly: { time: string; temp: number; code: number; rain: number; is_day: boolean }[];
    };

const HOURS = 6;

// Home's weather at a glance: now, what's coming, and the next few hours; opens the Weather page
export function WeatherWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Weather>("/overview/weather", 15 * 60_000);
  const temp = useCountUp(data?.connected ? data.temp : undefined);

  if (!data || !data.connected)
    return (
      <Card title="Weather" icon={Sun} index={index} href="/weather" loading={!data && !error} error={error} className={className}>
        <Empty>No Home place yet. Add one on the Weather page.</Empty>
      </Card>
    );

  return (
    <Card title={`Weather · ${data.place}`} icon={Sun} index={index} href="/weather" className={className}>
      <div className="flex items-center gap-4">
        <SkyIcon
          code={data.code}
          night={!data.is_day}
          className="size-12 shrink-0 stroke-[1.25] text-muted-foreground motion-safe:animate-[float_6s_ease-in-out_infinite]"
        />
        <div className="min-w-0">
          <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{Math.round(temp)}°</p>
          <p className="truncate text-sm text-muted-foreground first-letter:uppercase">
            {data.sky} · H {Math.round(data.max)}° L {Math.round(data.min)}°
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm">{data.summary}</p>
      <ol className="mt-auto grid grid-cols-6 gap-1 pt-4 text-center">
        {data.hourly.slice(0, HOURS).map((h, i) => (
          <li
            key={h.time}
            className={`flex flex-col items-center gap-1 rounded-lg py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both ${i === 0 ? "bg-muted" : ""}`}
            style={{ animationDelay: `${250 + i * 50}ms` }}
          >
            <span className="font-mono text-[10px] text-muted-foreground">{i === 0 ? "Now" : h.time}</span>
            <SkyIcon code={h.code} night={!h.is_day} className="size-4 stroke-[1.5]" />
            <span className="font-mono text-xs tabular-nums">{Math.round(h.temp)}°</span>
            <span className="h-3 font-mono text-[9px] text-sky-500 tabular-nums">{h.rain >= 10 ? `${h.rain}%` : ""}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
