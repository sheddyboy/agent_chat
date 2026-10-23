"use client";

import { useState } from "react";
import { Ban, Brain, Check, ChevronRight, Clock, FileSearch, Hand, Loader2, ShieldX, TriangleAlert } from "lucide-react";
import type { ChatEvent } from "@/lib/sse";

type Step = { icon: React.ReactNode; label: React.ReactNode; detail?: string; done: boolean };

const spin = <Loader2 className="size-3.5 animate-spin" />;

// Turn the stream into readable steps; node_start is too noisy to show here
function toSteps(events: ChatEvent[], live: boolean): Step[] {
  const ends = new Map(events.filter((e) => e.type === "tool_end").map((e) => [e.id as string, e]));
  const steps: Step[] = [];
  events.forEach((e, i) => {
    // Only the newest step can still be in progress
    const last = live && i === events.length - 1;
    if (e.type === "reasoning") {
      steps.push({ icon: last ? spin : <Brain className="size-3.5" />, label: "Thinking", detail: e.text as string, done: !last });
    } else if (e.type === "tool_start") {
      const end = ends.get(e.id as string);
      // The approval node answers a rejected call with this exact text
      const rejected = end?.output === "User rejected this tool call.";
      // Without an end, a call is either running now or paused for approval
      const verb = rejected ? "Rejected" : end ? "Ran" : live ? "Running" : "Requested";
      const icon = rejected ? <Ban className="size-3.5" /> : end ? <Check className="size-3.5" /> : live ? spin : <Clock className="size-3.5" />;
      steps.push({
        icon,
        label: (
          <>
            {verb} <code className="font-mono text-xs">{e.name as string}</code>
            {end?.ms != null && !rejected && <span className="ml-1.5 font-mono text-xs opacity-60">{end.ms as number} ms</span>}
          </>
        ),
        done: !!end,
      });
    } else if (e.type === "retrieval") {
      steps.push({
        icon: <FileSearch className="size-3.5" />,
        label: `Searched documents for "${e.query}", ${(e.hits as unknown[]).length} results`,
        done: true,
      });
    } else if (e.type === "guard" && e.blocked) {
      steps.push({ icon: <ShieldX className="size-3.5 text-destructive" />, label: "Input blocked by guard", done: true });
    } else if (e.type === "interrupt") {
      steps.push({ icon: <Hand className="size-3.5 text-amber-500" />, label: "Waiting for approval", done: true });
    } else if (e.type === "error") {
      steps.push({ icon: <TriangleAlert className="size-3.5 text-destructive" />, label: "Error", detail: e.message as string, done: true });
    }
  });
  return steps;
}

// Collapsible block above an assistant answer, like v0 and Claude: open while
// the agent works, folded to "Thought for Ns" once the answer starts
export function Steps({
  events,
  live,
  answering,
  thoughtMs,
}: {
  events: ChatEvent[];
  live: boolean;
  answering: boolean;
  thoughtMs?: number;
}) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const steps = toSteps(events, live);
  if (!live && !steps.length) return null;

  const open = toggled ?? (live && !answering);
  const current = steps.findLast((s) => !s.done);
  const title = live
    ? current?.label ?? "Thinking"
    : thoughtMs != null
      ? `Thought for ${Math.max(1, Math.round(thoughtMs / 1000))}s`
      : `Worked through ${steps.length} step${steps.length === 1 ? "" : "s"}`;

  return (
    <div className="text-sm">
      <button
        onClick={(e) => {
          e.stopPropagation(); // the message click selects the turn for the pane
          setToggled(!open);
        }}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <span className={live ? "animate-pulse" : ""}>{title}</span>
        {steps.length > 0 && <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />}
      </button>
      {open && steps.length > 0 && (
        <ol className="mt-2 space-y-2 border-l pl-3">
          {steps.map((s, i) => (
            <li key={i} className="text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="shrink-0">{s.icon}</span>
                <span className="min-w-0 truncate">{s.label}</span>
              </div>
              {s.detail && (
                <p className="mt-1 ml-5.5 max-h-40 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap opacity-80">
                  {s.detail}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
