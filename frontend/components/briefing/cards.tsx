"use client";

import { CalendarClock, CalendarDays, Mail, MessageCircleQuestion, Sparkles, Sun } from "lucide-react";
import { Streamdown } from "streamdown";
import { Card, Empty } from "@/components/overview/card";
import { Timeline } from "@/components/overview/timeline";
import { SkyIcon } from "@/components/weather/sky-icon";
import type { Briefing } from "@/components/briefing/types";

// What needs attention, written by the model
export function HeadsUp({ text, index }: { text: string; index: number }) {
  return (
    <Card title="Heads up" icon={Sparkles} index={index} className="md:col-span-2">
      <div className="text-sm leading-relaxed [&_li]:my-1">
        <Streamdown linkSafety={{ enabled: false }}>{text}</Streamdown>
      </div>
    </Card>
  );
}

// A day's calendar from the stored data; `now` only for today's briefing, viewed today
export function Day({
  title,
  part,
  now,
  index,
}: {
  title: string;
  part: NonNullable<Briefing["today"] | Briefing["tomorrow"]>;
  now?: Date | null;
  index: number;
}) {
  return (
    <Card title={title} icon={title === "Today" ? CalendarDays : CalendarClock} index={index}>
      {part.ok ? <Timeline events={part.events} free={"free" in part ? part.free : []} now={now} /> : <Empty>{part.note}</Empty>}
    </Card>
  );
}

// A past day's weather as it was when that briefing was written; today's uses the live card
export function Weather({ part, asOf, index }: { part: NonNullable<Briefing["weather"]>; asOf: string; index: number }) {
  return (
    <Card title={`Weather · as of ${asOf}`} icon={Sun} index={index}>
      {part.ok ? (
        <div className="flex items-center gap-4">
          <SkyIcon code={part.code} className="size-10 shrink-0 stroke-[1.25] text-muted-foreground" />
          <div>
            <p className="text-sm first-letter:uppercase">
              {part.sky}, {Math.round(part.min)}° to {Math.round(part.max)}°
            </p>
            <p className="text-xs text-muted-foreground">{part.summary ?? `${part.rain}% chance of rain`}</p>
          </div>
        </div>
      ) : (
        <Empty>{part.note}</Empty>
      )}
    </Card>
  );
}

// The model's picks, each opening in Gmail; Ask hands a question to the follow-up box
export function MailPicks({ briefing, onAsk, index }: { briefing: Briefing; onAsk: (q: string) => void; index: number }) {
  const { mail, mail_text, mail_note } = briefing;
  return (
    <Card title="Mail worth a look" icon={Mail} index={index} className="md:col-span-2">
      {mail_note ? (
        <Empty>{mail_note}</Empty>
      ) : mail.length === 0 ? (
        mail_text ? (
          <div className="text-sm">
            <Streamdown linkSafety={{ enabled: false }}>{mail_text}</Streamdown>
          </div>
        ) : (
          <Empty>Nothing that needs you.</Empty>
        )
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {mail.map((m, i) => (
            <li
              key={m.id}
              className="group/row flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-muted motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both"
              style={{ animationDelay: `${250 + i * 60}ms` }}
            >
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${m.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase group-hover/row:bg-background">
                  {m.from.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{m.from}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">{m.subject}</span>
                  </span>
                  {m.why && <span className="block truncate text-xs text-muted-foreground">{m.why}</span>}
                </span>
              </a>
              <button
                onClick={() => onAsk(`Tell me about the email from ${m.from} about "${m.subject}".`)}
                title="Ask about this email"
                className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover/row:opacity-100 focus-visible:opacity-100"
              >
                <MessageCircleQuestion className="size-3.5" />
                Ask
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
