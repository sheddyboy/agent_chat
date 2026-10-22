import type { ChatEvent } from "@/lib/sse";

type Hit = { doc: string; page: number | null; score: number; text: string };

// Hits are numbered per search, matching the [n] citations in the answer
export function SourcesPanel({ events }: { events: ChatEvent[] }) {
  const searches = events.filter((e) => e.type === "retrieval");

  if (!searches.length) return <p className="text-sm text-muted-foreground">No sources.</p>;

  return (
    <div className="space-y-4 text-sm">
      {searches.map((s, i) => (
        <section key={i} className="space-y-2">
          <p className="text-xs text-muted-foreground">Search: {s.query as string}</p>
          {(s.hits as Hit[]).map((h, n) => (
            <details key={n} className="rounded-lg border p-2">
              <summary className="cursor-pointer">
                [{n + 1}] {h.doc}
                {h.page != null && ` p.${h.page}`}
                <span className="ml-2 text-xs text-muted-foreground">{h.score}</span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs">{h.text}</p>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
