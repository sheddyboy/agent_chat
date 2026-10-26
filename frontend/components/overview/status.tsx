"use client";

import { Activity } from "lucide-react";
import { Card, useWidget } from "@/components/overview/card";

type Status = {
  ollama: { up: boolean; loaded: string[] };
  default_model: string;
  phoenix: boolean;
  documents: number;
  google: { gmail: boolean; calendar: boolean };
};

// A coloured dot: green when up, amber when partly, grey when down
function Dot({ state }: { state: "up" | "partial" | "down" }) {
  const colour = state === "up" ? "bg-emerald-500" : state === "partial" ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <span className="relative flex size-2 shrink-0">
      {state === "up" && <span className={`absolute inline-flex size-full rounded-full ${colour} opacity-60 motion-safe:animate-ping [animation-duration:2.5s]`} />}
      <span className={`relative inline-flex size-2 rounded-full ${colour}`} />
    </span>
  );
}

export function StatusWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Status>("/overview/status", 30_000);

  const rows = data && [
    {
      name: "Ollama",
      state: data.ollama.up ? "up" : "down",
      detail: data.ollama.up ? data.ollama.loaded[0] ?? `idle · ${data.default_model}` : "not running",
    },
    { name: "Phoenix", state: data.phoenix ? "up" : "down", detail: data.phoenix ? "tracing" : "not running" },
    { name: "Library", state: data.documents ? "up" : "down", detail: `${data.documents} documents` },
    {
      name: "Google",
      state: data.google.gmail && data.google.calendar ? "up" : data.google.gmail ? "partial" : "down",
      detail: data.google.calendar ? "mail and calendar" : data.google.gmail ? "mail only" : "not connected",
    },
  ] as const;

  return (
    <Card title="System" icon={Activity} index={index} loading={!data && !error} error={error} className={className}>
      <ul className="space-y-2.5">
        {rows?.map((r) => (
          <li key={r.name} className="flex items-center gap-3 text-sm">
            <Dot state={r.state} />
            <span className="font-medium">{r.name}</span>
            <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{r.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
