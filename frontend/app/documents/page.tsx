"use client";

import Link from "next/link";
import { useState } from "react";
import { streamEvents, type ChatEvent } from "@/lib/sse";

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

  function update(name: string, change: Partial<Upload>) {
    setUploads((prev) => prev.map((u) => (u.name === name ? { ...u, ...change } : u)));
  }

  async function upload(file: File) {
    setUploads((prev) => [{ name: file.name, done: 0, total: 0 }, ...prev.filter((u) => u.name !== file.name)]);
    const form = new FormData();
    form.append("file", file);
    let docId = "";

    function onEvent(ev: ChatEvent) {
      if (ev.type === "ingestion") {
        docId = ev.doc_id as string;
        update(file.name, {
          docId,
          stage: ev.stage as string,
          done: ev.done as number,
          total: ev.total as number,
        });
      } else if (ev.type === "error") {
        update(file.name, { error: ev.message as string });
      }
    }

    try {
      await streamEvents(`${API}/documents`, form, onEvent);
      if (docId) {
        const info = await fetch(`${API}/documents/${docId}`).then((r) => r.json());
        update(file.name, { chunks: info.chunks });
      }
    } catch (e) {
      update(file.name, { error: (e as Error).message });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-3">
      <header className="flex items-center justify-between">
        <h1 className="font-semibold">Documents</h1>
        <Link href="/" className="text-sm hover:underline">
          Back to chat
        </Link>
      </header>

      <label className="block cursor-pointer rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-muted">
        Click to upload PDFs
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

      <ul className="space-y-3">
        {uploads.map((u) => {
          // Each finished stage counts as a quarter of the bar
          const stageIndex = u.stage ? STAGES.indexOf(u.stage) : -1;
          const stageShare = u.total ? u.done / u.total : 0;
          const pct = u.chunks != null ? 100 : ((stageIndex + stageShare) / STAGES.length) * 100;
          return (
            <li key={u.name} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-muted-foreground">
                  {u.error
                    ? "failed"
                    : u.chunks != null
                      ? `${u.chunks} chunks`
                      : u.stage
                        ? `${u.stage} ${u.done}/${u.total}`
                        : "uploading..."}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-muted">
                <div
                  className={`h-full transition-all ${u.error ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.max(pct, 0)}%` }}
                />
              </div>
              {u.error && <p className="text-xs text-destructive">{u.error}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
