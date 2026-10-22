import type { ChatEvent } from "@/lib/sse";

// One row per node, tool call, guard check or approval request, in stream order
export function ActivityPanel({ events }: { events: ChatEvent[] }) {
  const ends = new Map(
    events.filter((e) => e.type === "tool_end").map((e) => [e.id as string, e]),
  );
  // A resumed turn has one done per request; show the latest trace
  const done = events.findLast((e) => e.type === "done");

  if (!events.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <ol className="space-y-2 text-sm">
      {events.map((e, i) => {
        switch (e.type) {
          case "node_start":
            return (
              <li key={i} className="text-muted-foreground">
                → {e.node as string}
              </li>
            );
          case "tool_start": {
            const end = ends.get(e.id as string);
            return (
              <li key={i} className="rounded-lg border p-2">
                <div className="flex justify-between font-medium">
                  <span>{e.name as string}</span>
                  <span className="text-xs text-muted-foreground">
                    {end ? `${end.ms} ms` : "running..."}
                  </span>
                </div>
                <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
                  {JSON.stringify(e.args)}
                </pre>
                {end && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer">Output</summary>
                    <pre className="mt-1 whitespace-pre-wrap">{end.output as string}</pre>
                  </details>
                )}
              </li>
            );
          }
          case "guard":
            return (
              <li key={i} className="rounded-lg bg-destructive/10 p-2 text-destructive">
                {e.blocked ? "Blocked" : "Passed"} by input guard (score {e.score as number})
              </li>
            );
          case "interrupt":
            return (
              <li key={i} className="rounded-lg border border-amber-500/50 p-2">
                Approval requested
              </li>
            );
          case "error":
            return (
              <li key={i} className="text-destructive">
                Error: {e.message as string}
              </li>
            );
          default:
            return null; // tool_end is shown with its tool_start, retrieval in Sources
        }
      })}
      {done && (
        <li className="pt-2 text-xs text-muted-foreground">trace {done.trace_id as string}</li>
      )}
    </ol>
  );
}
