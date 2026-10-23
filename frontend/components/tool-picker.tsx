import { Wrench } from "lucide-react";

export type Tool = { name: string; description: string; group: string; sensitive: boolean };

// Checkboxes for the tools this chat may use, grouped by "local" or MCP server
export function ToolPicker({
  tools,
  enabled,
  onChange,
}: {
  tools: Tool[];
  enabled: string[];
  onChange: (enabled: string[]) => void;
}) {
  const groups = Map.groupBy(tools, (t) => t.group);

  function toggle(names: string[], on: boolean) {
    onChange(on ? [...new Set([...enabled, ...names])] : enabled.filter((n) => !names.includes(n)));
  }

  return (
    <details className="relative">
      <summary className="flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Wrench className="size-3.5" />
        {enabled.length}/{tools.length}
      </summary>
      <div className="absolute bottom-full left-0 z-20 mb-2 max-h-96 w-72 space-y-3 overflow-y-auto rounded-xl border bg-popover p-3 text-sm shadow-xl">
        {[...groups].map(([group, list]) => {
          const names = list.map((t) => t.name);
          return (
            <div key={group}>
              <label className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <input
                  type="checkbox"
                  className="accent-foreground"
                  checked={names.every((n) => enabled.includes(n))}
                  onChange={(e) => toggle(names, e.target.checked)}
                />
                {group}
              </label>
              <ul className="mt-1.5 space-y-1 pl-5">
                {list.map((t) => (
                  <li key={t.name}>
                    <label className="flex items-center gap-2" title={t.description}>
                      <input
                        type="checkbox"
                        className="accent-foreground"
                        checked={enabled.includes(t.name)}
                        onChange={(e) => toggle([t.name], e.target.checked)}
                      />
                      <span className="truncate font-mono text-xs">{t.name}</span>
                      {t.sensitive && (
                        <span className="ml-auto shrink-0 text-[10px] text-amber-600 dark:text-amber-400">approval</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}
