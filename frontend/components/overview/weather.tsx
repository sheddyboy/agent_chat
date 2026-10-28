"use client";

import { Sun } from "lucide-react";
import { SkyIcon } from "@/components/weather/sky-icon";
import { Card, Empty, useCountUp, useWidget } from "@/components/overview/card";

type Weather =
  | { connected: false }
  | {
      connected: true;
      temp: number;
      code: number;
      sky: string;
      min: number;
      max: number;
      rain: number;
      hourly: { time: string; temp: number }[];
    };

// The next hours as a soft line with a fill under it, drawn in the text colour
function Sparkline({ temps }: { temps: number[] }) {
  const w = 240;
  const h = 48;
  const lo = Math.min(...temps) - 1;
  const hi = Math.max(...temps) + 1;
  const points = temps.map((t, i) => [(i / (temps.length - 1)) * w, h - ((t - lo) / (hi - lo)) * h]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-12 w-full overflow-visible text-foreground motion-safe:[animation:reveal_1.2s_ease-out_both]"
    >
      <defs>
        <linearGradient id="weather-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#weather-fill)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function WeatherWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Weather>("/overview/weather", 30 * 60_000);
  const temp = useCountUp(data?.connected ? data.temp : undefined);

  if (!data || !data.connected)
    return (
      <Card title="Weather" icon={Sun} index={index} loading={!data && !error} error={error} className={className}>
        <Empty>No location set (weather_lat, weather_lon).</Empty>
      </Card>
    );

  return (
    <Card title="Weather" icon={Sun} index={index} className={className}>
      <div className="flex items-center gap-4">
        <SkyIcon code={data.code} className="size-12 shrink-0 stroke-[1.25] text-muted-foreground motion-safe:animate-[float_6s_ease-in-out_infinite]" />
        <div>
          <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{Math.round(temp)}°</p>
          <p className="text-sm capitalize text-muted-foreground">{data.sky}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Low", `${Math.round(data.min)}°`],
          ["High", `${Math.round(data.max)}°`],
          ["Rain", `${data.rain}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="font-mono text-sm tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {data.hourly.length > 1 && (
        <div className="mt-auto pt-4">
          <Sparkline temps={data.hourly.map((h) => h.temp)} />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{data.hourly[0].time}</span>
            <span>{data.hourly[data.hourly.length - 1].time}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
