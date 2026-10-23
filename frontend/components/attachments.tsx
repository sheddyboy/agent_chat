"use client";

import { useRef } from "react";
import { AlertCircle, Check, FileText, Loader2, Plus, X } from "lucide-react";

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

// The composer's + button; the file input stays hidden behind it
export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        title="Attach PDFs"
        aria-label="Attach PDFs"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
    </>
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
