import { ExternalLink } from "lucide-react";
import type { ChatEvent } from "@/lib/sse";

const PHOENIX = process.env.NEXT_PUBLIC_PHOENIX_URL ?? "http://localhost:6006";

// Timeline dot; its color carries the event's status
function Dot({ color }: { color: string }) {
  return <span className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-sidebar ${color}`} />;
}

// One row per node, tool call, guard check or approval request, in stream order
export function ActivityPanel({ events }: { events: ChatEvent[] }) {
  const ends = new Map(
    events.filter((e) => e.type === "tool_end").map((e) => [e.id as string, e]),
  );
  // A resumed turn has one done per request; show the latest trace
  const done = events.findLast((e) => e.type === "done");

  if (!events.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <div className="space-y-4">
      <ol className="ml-2 space-y-3 border-l pl-4 text-sm">
        {events.map((e, i) => {
          switch (e.type) {
            case "node_start":
              return (
                <li key={i} className="relative font-mono text-xs text-muted-foreground">
                  <Dot color="bg-muted-foreground/40" />
                  {e.node as string}
                </li>
              );
            case "tool_start": {
              const end = ends.get(e.id as string);
              return (
                <li key={i} className="relative">
                  <Dot color={end ? "bg-foreground" : "animate-pulse bg-amber-500"} />
                  <div className="rounded-lg border bg-card p-2">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-mono text-xs font-medium">{e.name as string}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {/* Reopened chats have no durations */}
                        {end ? (end.ms != null ? `${end.ms} ms` : "") : "running"}
                      </span>
                    </div>
                    <pre className="mt-1 overflow-x-auto font-mono text-xs text-muted-foreground">
                      {JSON.stringify(e.args)}
                    </pre>
                    {end && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Output
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-y-auto rounded-md bg-background p-2 font-mono whitespace-pre-wrap">
                          {end.output as string}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            }
            case "guard":
              return (
                <li key={i} className={`relative ${e.blocked ? "text-destructive" : "text-muted-foreground"}`}>
                  <Dot color={e.blocked ? "bg-destructive" : "bg-muted-foreground/40"} />
                  {e.blocked ? "Blocked" : "Passed"} by input guard
                  <span className="ml-1 font-mono text-xs">({e.score as number})</span>
                </li>
              );
            case "interrupt":
              return (
                <li key={i} className="relative text-amber-600 dark:text-amber-400">
                  <Dot color="bg-amber-500" />
                  Approval requested
                </li>
              );
            case "error":
              return (
                <li key={i} className="relative text-destructive">
                  <Dot color="bg-destructive" />
                  Error: {e.message as string}
                </li>
              );
            default:
              return null; // tool_end is shown with its tool_start, retrieval in Sources
          }
        })}
      </ol>
      {done && (
        // Phoenix resolves the project from the trace or session id and opens it
        <div className="grid auto-cols-fr grid-flow-col gap-2">
          {/* Reopened chats have no trace id, only the session */}
          {done.trace_id != null && (
            <a
              href={`${PHOENIX}/redirects/traces/${done.trace_id}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center justify-center gap-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              View trace <ExternalLink className="size-3.5" />
            </a>
          )}
          <a
            href={`${PHOENIX}/redirects/sessions/${done.thread_id}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 items-center justify-center gap-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            View session <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
