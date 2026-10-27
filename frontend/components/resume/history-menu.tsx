"use client";

import { useEffect, useRef, useState } from "react";
import { History, RotateCcw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Version = { name: string; saved_at: string };

// Earlier versions, newest first. Restoring saves that version as the current one,
// so the version it replaces lands in history too and nothing is lost.
export function HistoryMenu({ onRestore, disabled }: { onRestore: (name: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/resume/history`)
      .then((r) => r.json())
      .then(setVersions);
    // Close on a click anywhere else
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <History className="size-3.5" />
        <span className="hidden sm:inline">History</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-top-1">
          {versions === null ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading...</p>
          ) : versions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No earlier versions yet.</p>
          ) : (
            versions.map((v) => (
              <button
                key={v.name}
                onClick={() => {
                  setOpen(false);
                  onRestore(v.name);
                }}
                className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="flex-1 font-mono">
                  {new Date(v.saved_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short", hour12: false })}
                </span>
                <RotateCcw className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
