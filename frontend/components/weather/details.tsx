"use client";

import { Droplets, Sun, Sunrise, Wind, type LucideIcon } from "lucide-react";
import type { Forecast } from "@/components/weather/types";

// The UK Met Office bands
function uvLabel(uv: number) {
  return uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme";
}

function Tile({ icon: Icon, label, value, note, index }: { icon: LucideIcon; label: string; value: string; note: string; index: number }) {
  return (
    <div
      className="rounded-2xl border bg-card p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:fill-mode-both"
      style={{ animationDelay: `${300 + index * 60}ms` }}
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

export function Details({ data }: { data: Forecast }) {
  const { current: c, daily } = data;
  const today = daily[0];
  return (
    <section className="grid grid-cols-2 gap-3">
      <Tile icon={Wind} label="Wind" value={`${Math.round(c.wind)} mph`} note={`Gusts ${Math.round(c.gusts)} mph`} index={0} />
      <Tile icon={Droplets} label="Humidity" value={`${c.humidity}%`} note={c.humidity >= 80 ? "Damp" : c.humidity <= 40 ? "Dry" : "Comfortable"} index={1} />
      <Tile icon={Sun} label="UV index" value={`${Math.round(c.uv)}`} note={uvLabel(c.uv)} index={2} />
      <Tile icon={Sunrise} label="Sun" value={today.sunrise.slice(11, 16)} note={`Sets ${today.sunset.slice(11, 16)}`} index={3} />
    </section>
  );
}
