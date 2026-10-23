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
      <summary className="cursor-pointer whitespace-nowrap rounded-md border px-2 py-1 text-sm">
        Tools {enabled.length}/{tools.length}
      </summary>
      <div className="absolute bottom-full right-0 z-20 mb-2 max-h-96 w-72 space-y-3 overflow-y-auto rounded-lg border bg-background p-3 text-sm shadow-lg">
        {[...groups].map(([group, list]) => {
          const names = list.map((t) => t.name);
          return (
            <div key={group}>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={names.every((n) => enabled.includes(n))}
                  onChange={(e) => toggle(names, e.target.checked)}
                />
                {group}
              </label>
              <ul className="mt-1 space-y-1 pl-5">
                {list.map((t) => (
                  <li key={t.name}>
                    <label className="flex items-center gap-2" title={t.description}>
                      <input
                        type="checkbox"
                        checked={enabled.includes(t.name)}
                        onChange={(e) => toggle([t.name], e.target.checked)}
                      />
                      {t.name}
                      {t.sensitive && <span className="text-xs text-amber-600">needs approval</span>}
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
