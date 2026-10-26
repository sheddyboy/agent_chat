"use client";

import { Fragment, useEffect, useState } from "react";
import { CalendarDays, Video } from "lucide-react";
import { Card, Empty, useWidget } from "@/components/overview/card";

type Event = {
  id: string;
  title: string;
  calendar: string;
  location: string;
  link: string;
  start: string;
  end: string;
  all_day: boolean;
  declined: boolean;
};
type Slot = { start: string; end: string };
type Schedule = { connected: false } | { connected: true; events: Event[]; free: Slot[] };

// One row of the timeline: a timed event or a free gap, in start order
type Row = { kind: "event"; event: Event; start: Date; end: Date } | { kind: "free"; start: Date; end: Date };

const clock = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function minutes(a: Date, b: Date) {
  const m = Math.round((b.getTime() - a.getTime()) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

// The current time, refreshed every minute so the "now" line moves on its own.
// Null until mounted, so prerendering never bakes in a build-time clock.
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ScheduleWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Schedule>("/overview/schedule");
  const now = useNow();

  if (!data || !data.connected || !now)
    return (
      <Card title="Today" icon={CalendarDays} index={index} loading={(!data || !now) && !error} error={error} className={className}>
        <Empty>Calendar is not connected.</Empty>
      </Card>
    );

  const allDay = data.events.filter((e) => e.all_day);
  const rows: Row[] = [
    ...data.events
      .filter((e) => !e.all_day)
      .map((e) => ({ kind: "event" as const, event: e, start: new Date(e.start), end: new Date(e.end) })),
    ...data.free.map((s) => ({ kind: "free" as const, start: new Date(s.start), end: new Date(s.end) })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
  // The "now" line goes before the first row that has not started yet
  const nowAt = rows.findIndex((r) => r.start > now);
  const nowLine = (
    <li className="relative flex items-center gap-3 py-1">
      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-foreground">{clock(now)}</span>
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inline-flex size-full rounded-full bg-foreground/60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2.5 rounded-full bg-foreground" />
      </span>
      <span className="h-px flex-1 bg-foreground/40" />
    </li>
  );

  return (
    <Card title="Today" icon={CalendarDays} index={index} href="https://calendar.google.com" className={className}>
      {allDay.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <span key={e.id} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
              {e.title}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>Nothing scheduled. The day is yours.</Empty>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => {
            const past = r.end <= now;
            return (
              <Fragment key={`${r.kind}-${r.start.getTime()}-${i}`}>
                {i === nowAt && nowLine}
                <li
                  className={`flex items-stretch gap-3 transition-opacity motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:fill-mode-both ${past ? "opacity-45" : ""}`}
                  style={{ animationDelay: `${200 + i * 50}ms` }}
                >
                  <span className="w-12 shrink-0 pt-2 text-right font-mono text-[11px] text-muted-foreground">
                    {clock(r.start)}
                  </span>
                  {r.kind === "free" ? (
                    <div className="flex flex-1 items-center rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
                      Free · {minutes(r.start, r.end)}
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border-l-2 border-l-foreground/70 bg-muted/50 px-3 py-2 transition-colors hover:bg-muted">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${r.event.declined ? "line-through" : ""}`}>{r.event.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {clock(r.start)} to {clock(r.end)} · {r.event.location || r.event.calendar}
                        </p>
                      </div>
                      {r.event.link && !past && (
                        <a
                          href={r.event.link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2 text-xs hover:bg-muted"
                        >
                          <Video className="size-3.5" />
                          Join
                        </a>
                      )}
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
          {nowAt === -1 && nowLine}
        </ol>
      )}
    </Card>
  );
}
