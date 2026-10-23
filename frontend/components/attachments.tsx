"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, FileText, Library, Loader2, Plus, Upload, X } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// A file attached to a sent message
export type Attachment = { doc_id: string; name: string };
// A file picked in the composer; ready once its ingestion has finished
export type Draft = {
  key: string;
  name: string;
  docId?: string;
  stage?: string;
  done: number;
  total: number;
  ready: boolean;
  error?: string;
};

const chip = "flex h-8 max-w-56 items-center gap-1.5 rounded-lg border bg-background px-2 text-xs";

// A library row as GET /documents returns it (only the fields the picker uses)
export type LibraryDoc = { doc_id: string; name: string; pages: number | null; status: string };

const menuItem =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

// The composer's + button: upload new PDFs, or pick ones already in the library.
// `selected` holds the doc ids already in the composer; onToggle adds or removes one.
export function AttachMenu({
  onFiles,
  selected,
  onToggle,
}: {
  onFiles: (files: File[]) => void;
  selected: string[];
  onToggle: (doc: LibraryDoc) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "library">("menu");
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Close on a click anywhere outside the menu
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openLibrary() {
    setView("library");
    setQuery("");
    setDocs(null);
    fetch(`${API}/documents`)
      .then((r) => r.json())
      .then((list: LibraryDoc[]) => setDocs(list.filter((d) => d.status === "ready")));
  }

  const shown = docs?.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setView("menu");
          setOpen(!open);
        }}
        title="Attach PDFs"
        aria-label="Attach PDFs"
        aria-expanded={open}
        className={`flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${open ? "bg-muted text-foreground" : ""}`}
      >
        <Plus className="size-4" />
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ""; // picking the same file again still fires
        }}
      />
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border bg-popover p-1.5 text-sm shadow-xl">
          {view === "menu" ? (
            <>
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  input.current?.click();
                }}
              >
                <Upload />
                Upload PDFs
              </button>
              <button type="button" className={menuItem} onClick={openLibrary}>
                <Library />
                From library
              </button>
            </>
          ) : (
            <div className="space-y-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Enter would otherwise submit the composer form around this menu
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="Search documents"
                aria-label="Search documents"
                className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
              />
              <ul className="max-h-64 overflow-y-auto">
                {!shown || !docs ? (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground">Loading...</li>
                ) : !shown.length ? (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground">
                    {docs.length ? "No matches" : "No documents yet"}
                  </li>
                ) : (
                  shown.map((d) => (
                    <li key={d.doc_id}>
                      <button type="button" className={menuItem} onClick={() => onToggle(d)}>
                        <FileText />
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        {d.pages != null && <span className="text-xs text-muted-foreground">{d.pages}p</span>}
                        <Check className={selected.includes(d.doc_id) ? "" : "invisible"} />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DraftChip({ draft, onRemove }: { draft: Draft; onRemove: () => void }) {
  return (
    <div className={`${chip} ${draft.error ? "border-destructive/50" : ""}`} title={draft.error ?? draft.name}>
      {draft.error ? (
        <AlertCircle className="size-3.5 shrink-0 text-destructive" />
      ) : draft.ready ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
      <span className="min-w-0 truncate">{draft.name}</span>
      {!draft.ready && !draft.error && (
        <span className="shrink-0 font-mono text-muted-foreground">
          {draft.stage ? `${draft.stage} ${draft.done}/${draft.total}` : "uploading"}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${draft.name}`}
        className="-mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function AttachmentChip({ attachment }: { attachment: Attachment }) {
  return (
    <div className={chip} title={attachment.name}>
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{attachment.name}</span>
    </div>
  );
}
