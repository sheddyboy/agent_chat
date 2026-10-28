"use client";

import { useEffect, useRef, useState } from "react";
import { Home, Loader2, LocateFixed, MapPin, Plus, Search, X } from "lucide-react";
import type { Found, Place } from "@/components/weather/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// What the page shows: a saved place by id, or the browser's position
export type Selected = { id: number } | { lat: number; lon: number };

const where = (p: Found) => [p.region, p.country].filter(Boolean).join(", ");

export function Places({
  places,
  selected,
  onSelect,
  onChange,
}: {
  places: Place[];
  selected: Selected;
  onSelect: (s: Selected) => void;
  onChange: (places: Place[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const here = "lat" in selected ? selected : null;

  // Suggestions follow the typing, a moment after it pauses
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`${API}/weather/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setFound)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close the suggestions on a click anywhere else
  useEffect(() => {
    if (!found) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setFound(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [found]);

  async function save(p: Found) {
    const r = await fetch(`${API}/weather/places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const added: Place = await r.json();
    onChange(await fetch(`${API}/weather/places`).then((r) => r.json()));
    onSelect({ id: added.id! });
    setQuery("");
    setFound(null);
  }

  async function act(id: number, method: "POST" | "DELETE") {
    const r = await fetch(`${API}/weather/places/${id}${method === "POST" ? "/home" : ""}`, { method });
    if (!r.ok) return setError((await r.json()).detail);
    setError("");
    onChange(await r.json());
    if (method === "DELETE" && "id" in selected && selected.id === id) onSelect({ id: places.find((p) => p.is_home)!.id! });
  }

  function locate() {
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSelect({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (e) => {
        setLocating(false);
        setError(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Could not get your location.");
      },
      { timeout: 10_000 },
    );
  }

  const chip = "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors";

  return (
    <div className="space-y-3">
      <div ref={box} className="relative">
        <label className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3 transition-colors focus-within:border-foreground/30">
          {searching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setFound(null);
            }}
            placeholder="Search for a town or city"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {found && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover p-1 shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1">
            {found.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No places found.</li>}
            {found.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button onClick={() => save(p)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{p.name}</span>
                  <span className="truncate text-muted-foreground">{where(p)}</span>
                  <Plus className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {places.map((p) => {
          const active = "id" in selected && selected.id === p.id;
          return (
            <span key={p.id} className={`group ${chip} ${active ? "border-foreground/40 bg-muted" : "hover:bg-muted"}`}>
              <button onClick={() => onSelect({ id: p.id! })} className="flex items-center gap-1.5">
                {p.is_home ? <Home className="size-3.5" /> : <MapPin className="size-3.5 text-muted-foreground" />}
                {p.name}
              </button>
              {!p.is_home && (
                <span className="flex items-center gap-0.5 overflow-hidden transition-all group-hover:ml-1 group-hover:w-auto sm:w-0">
                  <button onClick={() => act(p.id!, "POST")} title="Make Home" aria-label={`Make ${p.name} Home`} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <Home className="size-3.5" />
                  </button>
                  <button onClick={() => act(p.id!, "DELETE")} title="Remove" aria-label={`Remove ${p.name}`} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </span>
          );
        })}
        <button onClick={locate} className={`${chip} ${here ? "border-foreground/40 bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}
          My location
        </button>
        {here && (
          <button
            onClick={() => save({ name: "My location", region: "", country: "", lat: here.lat, lon: here.lon })}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Save
          </button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
