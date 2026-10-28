"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Menu, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Daily } from "@/components/weather/daily";
import { Details } from "@/components/weather/details";
import { Hourly } from "@/components/weather/hourly";
import { Now } from "@/components/weather/now";
import { Places, type Selected } from "@/components/weather/places";
import { RainBanner } from "@/components/weather/rain-banner";
import type { Forecast, Place } from "@/components/weather/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// The backend caches for 10 minutes and the models update about hourly
const REFRESH_MS = 15 * 60_000;

const query = (s: Selected) => ("id" in s ? `place_id=${s.id}` : `lat=${s.lat}&lon=${s.lon}`);

// Weather like a weather app: now, the next 24 hours, 7 days and details, for any saved place
export default function WeatherPage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch(`${API}/weather/places`)
      .then((r) => r.json())
      .then((ps: Place[]) => {
        setPlaces(ps);
        const home = ps.find((p) => p.is_home);
        if (home) setSelected({ id: home.id! });
        else setError("No places yet. Search for one to start.");
      });
  }, []);

  const load = useCallback(() => {
    if (!selected) return;
    fetch(`${API}/weather?${query(selected)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? `${r.status}`);
        return r.json();
      })
      .then((d: Forecast) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  }, [selected]);

  // Fresh on open, every 15 minutes, and whenever you come back to the tab
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const place = data?.place;
  const updated = data ? new Date(data.fetched_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "";

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="text-sm font-medium">Weather</h1>
          {data && (
            <button
              onClick={() => {
                setRefreshing(true);
                load();
              }}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" title="Refresh">
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Updated {updated}
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
            {selected && <Places places={places} selected={selected} onSelect={setSelected} onChange={setPlaces} />}

            {error && !data && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4" />
                {error}
              </p>
            )}

            {!data && !error && (
              <div className="space-y-4">
                <div className="h-32 rounded-2xl bg-card motion-safe:animate-pulse" />
                <div className="h-40 rounded-2xl bg-card motion-safe:animate-pulse" />
              </div>
            )}

            {data && place && (
              // Keyed by place, so switching places plays the entrance again
              <div key={`${place.lat},${place.lon}`} className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {place.name}
                  {(place.region || place.country) && ` · ${[place.region, place.country].filter(Boolean).join(", ")}`}
                </p>
                {data.alert && <RainBanner text={data.alert} />}
                <Now data={data} />
                <Hourly data={data} />
                <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                  <Daily data={data} />
                  <Details data={data} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
