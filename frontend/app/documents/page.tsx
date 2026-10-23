"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Menu, Upload } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/lib/upload";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STAGES = ["load", "chunk", "embed", "store"];

// Only files uploaded in this browser session; the backend has no list endpoint
type Upload = {
  name: string;
  docId?: string;
  stage?: string;
  done: number;
  total: number;
  chunks?: number;
  error?: string;
};

export default function Documents() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);

  function update(name: string, change: Partial<Upload>) {
    setUploads((prev) => prev.map((u) => (u.name === name ? { ...u, ...change } : u)));
  }

  async function upload(file: File) {
    setUploads((prev) => [{ name: file.name, done: 0, total: 0 }, ...prev.filter((u) => u.name !== file.name)]);
    try {
      const docId = await uploadDocument(file, (p) => update(file.name, p));
      const info = await fetch(`${API}/documents/${docId}`).then((r) => r.json());
      update(file.name, { chunks: info.chunks });
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
                const pct = u.chunks != null ? 100 : ((stageIndex + stageShare) / STAGES.length) * 100;
                return (
                  <li key={u.name} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {u.error ? (
                        <AlertCircle className="size-4 shrink-0 text-destructive" />
                      ) : u.chunks != null ? (
                        <CheckCircle2 className="size-4 shrink-0" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {u.error
                          ? "failed"
                          : u.chunks != null
                            ? `${u.chunks} chunks`
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
          </div>
        </main>
      </div>
    </div>
  );
}
