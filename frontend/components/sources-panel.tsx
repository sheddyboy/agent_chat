import { FileText } from "lucide-react";
import type { ChatEvent } from "@/lib/sse";

type Hit = { doc: string; page: number | null; score: number; text: string };

// Hits are numbered per search, matching the [n] citations in the answer
export function SourcesPanel({ events }: { events: ChatEvent[] }) {
  const searches = events.filter((e) => e.type === "retrieval");

  if (!searches.length) return <p className="text-sm text-muted-foreground">No sources for this turn.</p>;

  return (
    <div className="space-y-5 text-sm">
      {searches.map((s, i) => (
        <section key={i} className="space-y-2">
          <p className="truncate text-xs text-muted-foreground">
            Search <span className="text-foreground">&ldquo;{s.query as string}&rdquo;</span>
          </p>
          {(s.hits as Hit[]).map((h, n) => (
            <details key={n} className="group rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-2 [&::-webkit-details-marker]:hidden">
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px]">
                  {n + 1}
                </span>
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {h.doc}
                  {h.page != null && <span className="text-muted-foreground"> p.{h.page}</span>}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{h.score}</span>
              </summary>
              <p className="border-t p-2 text-xs whitespace-pre-wrap text-muted-foreground">{h.text}</p>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
