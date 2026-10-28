"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, MessageSquare, Wrench } from "lucide-react";
import { Streamdown } from "streamdown";
import { followJob, runningJob, streamEvents, type ChatEvent } from "@/lib/sse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Turn = { q: string; a: string; tools: string[]; paused?: boolean; error?: string };
type ThreadMessage = { role: "user" | "assistant"; content: string; events?: { type: string; name?: string }[] };

// Questions about the briefing, answered on the page. They run on the briefing's own
// thread, so the agent sees the gathered mail and calendar and can open an email.
export function FollowUp({
  threadId,
  question,
  setQuestion,
}: {
  threadId: string;
  question: string;
  setQuestion: (q: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Earlier follow-ups come back with the thread; its first turn is the briefing itself.
  // One still being answered (the page was left mid-answer) is followed again from the start.
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${API}/threads/${threadId}`).then((r) => (r.ok ? r.json() : null)),
      runningJob("chat", threadId),
    ]).then(([d, jobId]: [{ messages: ThreadMessage[] } | null, string | null]) => {
      if (!live) return;
      const rest = d?.messages.slice(2) ?? [];
      const asks = rest.flatMap((m, i) => (m.role === "user" ? [i] : []));
      const past: Turn[] = asks.map((at, n) => {
        const answer = rest.slice(at + 1, asks[n + 1] ?? rest.length).filter((m) => m.role === "assistant");
        const tools = answer.flatMap((m) => (m.events ?? []).filter((e) => e.type === "tool_start").map((e) => e.name ?? ""));
        return { q: rest[at].content, a: answer.map((m) => m.content).join(""), tools };
      });
      if (jobId && past.length) {
        // The last question is the one in progress: its answer is rebuilt from the job
        past[past.length - 1] = { ...past[past.length - 1], a: "", tools: [] };
        setTurns(past);
        setBusy(true);
        followJob(jobId, onStreamEvent).finally(() => setBusy(false));
      } else setTurns(past);
    });
    return () => {
      live = false;
    };
    // onStreamEvent only updates state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // A question handed over by a card's Ask button lands here, ready to send
  useEffect(() => {
    if (question) input.current?.focus();
  }, [question]);

  function update(change: (t: Turn) => Turn) {
    setTurns((prev) => [...prev.slice(0, -1), change(prev[prev.length - 1])]);
  }

  function onStreamEvent(ev: ChatEvent) {
    if (ev.type === "token") update((t) => ({ ...t, a: t.a + (ev.text as string) }));
    if (ev.type === "tool_start") update((t) => ({ ...t, tools: [...t.tools, ev.name as string] }));
    if (ev.type === "interrupt") update((t) => ({ ...t, paused: true }));
    if (ev.type === "error") update((t) => ({ ...t, error: ev.message as string }));
  }

  async function send() {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setBusy(true);
    setTurns((prev) => [...prev, { q, a: "", tools: [] }]);
    try {
      await streamEvents(`${API}/chat`, { message: q, thread_id: threadId }, onStreamEvent);
    } catch (e) {
      update((t) => ({ ...t, error: (e as Error).message }));
    }
    setBusy(false);
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:duration-500 md:col-span-2" style={{ animationDelay: "400ms" }}>
      {turns.map((t, i) => (
        <div key={i} className="space-y-2 motion-safe:animate-in motion-safe:fade-in">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm">{t.q}</p>
          {t.tools.length > 0 && (
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <Wrench className="size-3" />
              {t.tools.join(", ")}
            </p>
          )}
          {t.a ? (
            <div className="text-sm leading-relaxed">
              <Streamdown linkSafety={{ enabled: false }} isAnimating={busy && i === turns.length - 1}>
                {t.a}
              </Streamdown>
            </div>
          ) : (
            busy &&
            i === turns.length - 1 &&
            !t.paused && <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {t.paused && (
            <Link href={`/c/${threadId}`} className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4">
              <MessageSquare className="size-3.5" />
              Needs your approval, continue in chat
            </Link>
          )}
          {t.error && <p className="text-sm text-destructive">{t.error}</p>}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 rounded-xl border bg-background p-1.5 pl-3.5 transition-colors focus-within:border-foreground/30"
      >
        <input
          ref={input}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a follow-up about this briefing..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!question.trim() || busy}
          aria-label="Send"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition active:scale-95 disabled:opacity-30"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </form>
    </section>
  );
}
