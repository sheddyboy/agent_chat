"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarDays, Mail, Menu, RefreshCw, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Day, HeadsUp, MailPicks, Weather } from "@/components/briefing/cards";
import { FollowUp } from "@/components/briefing/follow-up";
import { useNow } from "@/components/overview/timeline";
import { WeatherWidget } from "@/components/overview/weather";
import type { Briefing } from "@/components/briefing/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Shown in turn while the briefing is written; the request itself takes 15 to 45 s
const STAGES = [
  { icon: CalendarDays, text: "Checking your calendar" },
  { icon: Mail, text: "Reading your mail" },
  { icon: Sparkles, text: "Writing your briefing" },
];

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const longDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

// Today's briefing as a page. Opening it with none for today writes one automatically.
export default function BriefingPage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [day, setDay] = useState("today");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [past, setPast] = useState<{ day: string }[]>([]);
  const [stage, setStage] = useState(0);
  const [question, setQuestion] = useState("");
  const now = useNow();
  const followUp = useRef<HTMLDivElement>(null);

  const loadPast = useCallback(() => {
    fetch(`${API}/briefing`)
      .then((r) => r.json())
      .then(setPast);
  }, []);

  const generate = useCallback(async () => {
    setStatus("generating");
    setStage(0);
    try {
      const r = await fetch(`${API}/briefing`, { method: "POST" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      setBriefing(await r.json());
      setDay("today");
      setStatus("ready");
      loadPast();
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [loadPast]);

  // Today with none yet is written straight away; a past day just shows what was kept
  useEffect(() => {
    let live = true;
    fetch(`${API}/briefing/${day}`).then(async (r) => {
      if (!live) return;
      if (r.ok) {
        setBriefing(await r.json());
        setStatus("ready");
      } else if (r.status === 404 && day === "today") generate();
      else {
        setError(`${r.status} ${r.statusText}`);
        setStatus("error");
      }
    });
    return () => {
      live = false;
    };
  }, [day, generate]);

  useEffect(loadPast, [loadPast]);

  // Step through the stages while generating, staying on the last one
  useEffect(() => {
    if (status !== "generating") return;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [status]);

  function ask(q: string) {
    setQuestion(q);
    followUp.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const isToday = briefing && now ? briefing.day === localDay(now) : false;
  // Today's briefing shows the live forecast; a past day keeps the weather it was written with
  const weatherCard = (index: number) =>
    isToday ? (
      <WeatherWidget index={index} />
    ) : (
      briefing?.weather && (
        <Weather
          part={briefing.weather}
          asOf={new Date(`${briefing.created_at}Z`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
          index={index}
        />
      )
    );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="text-sm font-medium">Briefing</h1>
          {past.length > 0 && (
            <select
              value={briefing?.day ?? ""}
              onChange={(e) => setDay(e.target.value === localDay(new Date()) ? "today" : e.target.value)}
              aria-label="Past briefings"
              className="ml-auto h-8 rounded-md border bg-background px-2 text-xs lg:hidden"
            >
              {past.map((p) => (
                <option key={p.day} value={p.day}>
                  {shortDay(p.day)}
                </option>
              ))}
            </select>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-10">
            <div className="min-w-0 flex-1 space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
                <div>
                  <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                    {briefing ? `Generated ${new Date(`${briefing.created_at}Z`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : "Daily briefing"}
                  </p>
                  <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                    {briefing ? longDay(briefing.day) : now ? longDay(localDay(now)) : " "}
                  </h2>
                </div>
                {status === "ready" && isToday && (
                  <button
                    onClick={generate}
                    className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm transition-colors hover:bg-muted active:scale-[0.98]"
                  >
                    <RefreshCw className="size-4" />
                    Regenerate
                  </button>
                )}
              </div>

              {status === "generating" && (
                <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card px-6 py-16 text-center">
                  <div className="relative flex size-14 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-foreground/20 motion-safe:animate-ping [animation-duration:2s]" />
                    {(() => {
                      const Icon = STAGES[stage].icon;
                      return <Icon key={stage} className="size-6 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in" />;
                    })()}
                  </div>
                  <ol className="space-y-2">
                    {STAGES.map((s, i) => (
                      <li
                        key={s.text}
                        className={`text-sm transition-all duration-500 ${i === stage ? "text-foreground" : i < stage ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-muted-foreground/50"}`}
                      >
                        {s.text}
                        {i === stage && "..."}
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">This takes about half a minute.</p>
                </div>
              )}

              {status === "error" && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center">
                  <AlertCircle className="size-6 text-destructive" />
                  <p className="text-sm">Could not load the briefing ({error}).</p>
                  <button onClick={generate} className="text-sm underline underline-offset-4">
                    Try again
                  </button>
                </div>
              )}

              {status === "ready" && briefing && (
                // Keyed by day and time, so switching days or regenerating plays the entrance again
                <div key={`${briefing.day}-${briefing.created_at}`} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <HeadsUp text={briefing.heads_up} index={0} />
                  {briefing.today && <Day title="Today" part={briefing.today} now={isToday ? now : null} index={1} />}
                  {briefing.tomorrow ? <Day title="Tomorrow" part={briefing.tomorrow} index={2} /> : weatherCard(2)}
                  {briefing.tomorrow && <div className="md:col-span-2">{weatherCard(3)}</div>}
                  <MailPicks briefing={briefing} onAsk={ask} index={4} />
                  <div ref={followUp} className="md:col-span-2">
                    <FollowUp key={briefing.thread_id} threadId={briefing.thread_id} question={question} setQuestion={setQuestion} />
                  </div>
                </div>
              )}

              {status === "loading" && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`h-40 rounded-2xl border bg-card motion-safe:animate-pulse ${i === 0 ? "md:col-span-2" : ""}`} />
                  ))}
                </div>
              )}
            </div>

            {past.length > 0 && (
              <aside className="hidden w-44 shrink-0 lg:block">
                <p className="px-2 pb-2 text-xs text-muted-foreground">Past briefings</p>
                <ul className="space-y-0.5">
                  {past.map((p) => (
                    <li key={p.day}>
                      <button
                        onClick={() => setDay(now && p.day === localDay(now) ? "today" : p.day)}
                        className={`flex h-8 w-full items-center rounded-md px-2 text-left text-sm transition-colors hover:bg-muted ${briefing?.day === p.day ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                      >
                        {now && p.day === localDay(now) ? "Today" : shortDay(p.day)}
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
