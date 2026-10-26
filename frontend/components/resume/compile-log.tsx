"use client";

import { AlertCircle, X } from "lucide-react";

// The LaTeX error from the last compile, under the editor; the saved version is untouched
export function CompileLog({ log, onClose }: { log: string; onClose: () => void }) {
  return (
    <div className="max-h-48 shrink-0 overflow-y-auto border-t bg-destructive/5 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:fade-in motion-safe:duration-300">
      <div className="sticky top-0 flex items-center gap-2 bg-inherit px-4 py-2 text-xs font-medium text-destructive backdrop-blur">
        <AlertCircle className="size-3.5" />
        Did not compile. The last good version is still saved.
        <button onClick={onClose} aria-label="Hide log" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <pre className="px-4 pb-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{log}</pre>
    </div>
  );
}
