"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Menu, Play } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { CompileLog } from "@/components/resume/compile-log";
import { Editor } from "@/components/resume/editor";
import { HistoryMenu } from "@/components/resume/history-menu";
import { Preview } from "@/components/resume/preview";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// One response of GET/PUT /resume and POST /resume/restore
type Resume = { tex: string; updated_at: string; has_pdf: boolean; ok?: boolean; log?: string };
type Status = "loading" | "saved" | "unsaved" | "compiling" | "error";

const PILL: Record<Status, [string, string]> = {
  loading: ["Loading", "bg-muted-foreground/40"],
  saved: ["Saved", "bg-emerald-500"],
  unsaved: ["Unsaved", "bg-amber-500"],
  compiling: ["Compiling", "bg-foreground motion-safe:animate-pulse"],
  error: ["Error", "bg-destructive"],
};

// Overleaf-style: LaTeX on the left, the compiled PDF on the right. Cmd/Ctrl+S saves and
// compiles; a source that does not compile is never saved, so the PDF is always the last good one.
export default function ResumePage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [tex, setTex] = useState("");
  const [saved, setSaved] = useState("");
  const [version, setVersion] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [log, setLog] = useState("");
  const [tab, setTab] = useState<"code" | "pdf">("code");
  // Read inside the focus listener without re-subscribing on every keystroke
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = tex !== saved;
  }, [tex, saved]);

  function apply(d: Resume) {
    setTex(d.tex);
    setSaved(d.tex);
    // Every save rewrites the file, so its time is a fresh key for the preview
    setVersion(d.updated_at);
    setHasPdf(d.has_pdf);
  }

  const load = useCallback(() => {
    fetch(`${API}/resume`)
      .then((r) => r.json())
      .then((d: Resume) => {
        apply(d);
        setStatus("saved");
      });
  }, []);

  useEffect(load, [load]);

  // Edits made from chat show up when you come back to the tab, unless you have your own
  useEffect(() => {
    const onFocus = () => !dirty.current && load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function send(path: string, method: string, body: unknown) {
    setStatus("compiling");
    const d: Resume = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (d.ok) {
      apply(d);
      setLog("");
      setStatus("saved");
    } else {
      // Keep the user's text in the editor so they can fix it
      setLog(d.log ?? "");
      setStatus("error");
    }
  }

  const compile = () => send("/resume", "PUT", { tex });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        document.getElementById("recompile")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown: Status = status === "saved" && tex !== saved ? "unsaved" : status;
  const [label, dot] = PILL[shown];

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="text-sm font-medium">Resume</h1>
          <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            <span className={`size-1.5 rounded-full transition-colors ${dot}`} />
            {label}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <HistoryMenu disabled={status === "compiling"} onRestore={(name) => send("/resume/restore", "POST", { name })} />
            <a
              href={`${API}/resume/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </a>
            <button
              id="recompile"
              onClick={compile}
              disabled={status === "compiling" || status === "loading"}
              title="Save and compile (Cmd+S)"
              className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
            >
              <Play className="size-3 fill-current" />
              Recompile
            </button>
          </div>
        </header>

        {/* Phones get tabs; from lg up both panes sit side by side */}
        <div className="flex shrink-0 gap-1 border-b p-1 lg:hidden">
          {(["code", "pdf"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 flex-1 rounded-md text-xs transition-colors ${tab === t ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            >
              {t === "code" ? "Code" : "Preview"}
            </button>
          ))}
        </div>

        <main className="flex min-h-0 flex-1">
          <section className={`min-w-0 flex-1 flex-col border-r lg:flex ${tab === "code" ? "flex" : "hidden"}`}>
            <div className="min-h-0 flex-1 overflow-hidden">
              {status !== "loading" && <Editor value={tex} onChange={setTex} />}
            </div>
            {log && <CompileLog log={log} onClose={() => setLog("")} />}
          </section>
          <section className={`min-w-0 flex-1 lg:block ${tab === "pdf" ? "block" : "hidden"}`}>
            <Preview version={version} hasPdf={hasPdf} compiling={status === "compiling"} />
          </section>
        </main>
      </div>
    </div>
  );
}
