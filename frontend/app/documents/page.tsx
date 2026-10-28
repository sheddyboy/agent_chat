"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Menu, MessageSquarePlus, Upload } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/lib/upload";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STAGES = ["load", "chunk", "embed", "store"];

// An upload in progress, or one that failed; finished uploads move to the library list
type Upload = {
  name: string;
  docId?: string;
  stage?: string;
  done: number;
  total: number;
  error?: string;
};

// One row of GET /documents
type Doc = {
  doc_id: string;
  name: string;
  size_bytes: number;
  pages: number | null;
  chunks: number | null;
  status: "ingesting" | "ready" | "failed";
  error: string | null;
  created_at: string;
};

function size(bytes: number) {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function Documents() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  function loadLibrary() {
    fetch(`${API}/documents`)
      .then((r) => r.json())
      .then(setDocs);
  }

  useEffect(loadLibrary, []);

  function update(name: string, change: Partial<Upload>) {
    setUploads((prev) => prev.map((u) => (u.name === name ? { ...u, ...change } : u)));
  }

  async function upload(file: File) {
    setUploads((prev) => [{ name: file.name, done: 0, total: 0 }, ...prev.filter((u) => u.name !== file.name)]);
    try {
      await uploadDocument(file, (p) => update(file.name, p));
      setUploads((prev) => prev.filter((u) => u.name !== file.name));
      loadLibrary();
    } catch (e) {
      update(file.name, { error: (e as Error).message });
    }
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="text-sm font-medium">Documents</h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center transition-colors hover:border-foreground/25 hover:bg-muted/50">
              <span className="flex size-10 items-center justify-center rounded-full border bg-background">
                <Upload className="size-4" />
              </span>
              <span className="text-sm font-medium">Click to upload PDFs</span>
              <span className="text-xs text-muted-foreground">Each file is chunked, embedded and stored for search</span>
              <input
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  for (const file of Array.from(e.target.files ?? [])) upload(file);
                  e.target.value = ""; // allow re-uploading the same file
                }}
              />
            </label>

            <ul className="space-y-2">
              {uploads.map((u) => {
                // Each finished stage counts as a quarter of the bar
                const stageIndex = u.stage ? STAGES.indexOf(u.stage) : -1;
                const stageShare = u.total ? u.done / u.total : 0;
                const pct = ((stageIndex + stageShare) / STAGES.length) * 100;
                return (
                  <li key={u.name} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {u.error ? (
                        <AlertCircle className="size-4 shrink-0 text-destructive" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {u.error
                          ? "failed"
                          : u.stage
                              ? `${u.stage} ${u.done}/${u.total}`
                              : "uploading..."}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${u.error ? "bg-destructive" : "bg-foreground"}`}
                        style={{ width: `${Math.max(pct, 0)}%` }}
                      />
                    </div>
                    {u.error && <p className="text-xs text-destructive">{u.error}</p>}
                  </li>
                );
              })}
            </ul>

            <section className="space-y-2">
              <h2 className="text-xs text-muted-foreground">Library</h2>
              {docs?.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
              {!!docs?.length && (
              <ul className="divide-y rounded-xl border bg-card">
                {docs.map((d) => (
                  <li key={d.doc_id} className="flex items-center gap-3 p-3 text-sm">
                    {d.status === "failed" ? (
                      <AlertCircle className="size-4 shrink-0 text-destructive" />
                    ) : d.status === "ingesting" ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className={`truncate text-xs ${d.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                        {d.status === "failed"
                          ? d.error
                          : d.status === "ingesting"
                            ? "Ingesting..."
                            : `${d.pages} pages · ${d.chunks} chunks · ${size(d.size_bytes)} · ${new Date(`${d.created_at}Z`).toLocaleDateString()}`}
                      </p>
                    </div>
                    {d.status === "ready" && (
                      <Link
                        href={`/c?attach=${d.doc_id}`}
                        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MessageSquarePlus className="size-3.5" />
                        Ask about this
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
