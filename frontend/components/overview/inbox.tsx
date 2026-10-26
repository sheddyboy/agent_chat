"use client";

import { Mail } from "lucide-react";
import { Card, Empty, useCountUp, useWidget } from "@/components/overview/card";

type Inbox =
  | { connected: false }
  | { connected: true; unread: number; mails: { id: string; from: string; subject: string; date: string }[] };

// "16:20" for today, "Mon" for earlier this week
function when(date: string) {
  const d = new Date(date.replace(" ", "T"));
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { weekday: "short" });
}

export function InboxWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Inbox>("/overview/inbox", 5 * 60_000);
  const unread = useCountUp(data?.connected ? data.unread : undefined);

  if (!data || !data.connected)
    return (
      <Card title="Inbox" icon={Mail} index={index} loading={!data && !error} error={error} className={className}>
        <Empty>Gmail is not connected.</Empty>
      </Card>
    );

  return (
    <Card title="Inbox" icon={Mail} index={index} href="https://mail.google.com" className={className}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{Math.round(unread)}</span>
        <span className="text-sm text-muted-foreground">unread</span>
      </div>
      {data.mails.length === 0 ? (
        <Empty>No unread mail from real people this week.</Empty>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {data.mails.map((m, i) => (
            <li
              key={m.id}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both"
              style={{ animationDelay: `${250 + i * 60}ms` }}
            >
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${m.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                  {m.from.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.from}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.subject}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{when(m.date)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
