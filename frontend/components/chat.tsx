"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Loader2, Menu, PanelRight, Sparkles, X } from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { ActivityPanel } from "@/components/activity-panel";
import { AttachMenu, AttachmentChip, DraftChip, type Attachment, type Draft, type LibraryDoc } from "@/components/attachments";
import { ApprovalCard } from "@/components/approval-card";
import { MicButton } from "@/components/mic-button";
import { Sidebar } from "@/components/sidebar";
import { SourcesPanel } from "@/components/sources-panel";
import { Steps } from "@/components/steps";
import { ToolPicker, type Tool } from "@/components/tool-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamEvents, type ChatEvent } from "@/lib/sse";
import { uploadDocument } from "@/lib/upload";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Models write inline math as $...$, which the default plugin ignores
const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid };
const SUGGESTIONS = [
  "Search my documents for the key findings",
  "Fetch https://example.com and summarize it",
  "List the files in the workspace",
  "Explain RAG with a mermaid diagram",
];

// events holds every non-token event of an assistant turn, for the side panel.
// thoughtMs is the time from startedAt to the first answer token
type Message = {
  role: "user" | "assistant";
  content: string;
  events: ChatEvent[];
  attachments?: Attachment[];
  startedAt?: number;
  thoughtMs?: number;
};
// thinking: Ollama reports the model can reason before answering
type Model = { name: string; thinking: boolean };

// The pending interrupt of a turn: nothing but "done" (and a new chat's "title")
// has arrived after it
function pendingInterrupt(events: ChatEvent[]) {
  const i = events.findLastIndex((e) => e.type === "interrupt");
  if (i === -1 || events.slice(i + 1).some((e) => e.type !== "done" && e.type !== "title")) return null;
  return events[i];
}

function chatTitle(messages: Message[]) {
  return messages.find((m) => m.role === "user")?.content.slice(0, 40) ?? "New chat";
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // Files picked for the next message; they upload as soon as they are picked
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  // The backend title once it exists; until then the first message stands in
  const [title, setTitle] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"activity" | "sources">("activity");
  const [showPanel, setShowPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [status, setStatus] = useState<"ready" | "loading" | "missing">("ready");
  // Bumped after each turn so the sidebar moves this chat to the top
  const [listVersion, setListVersion] = useState(0);
  // Model, tools and thinking are chosen per chat; New chat resets them to these defaults
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [model, setModel] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  // null means the chat never chose, so every tool is on (as in the backend)
  const [enabledTools, setEnabledTools] = useState<string[] | null>(null);
  const [think, setThink] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const opening = useRef<string | null>(null);

  // The URL decides what is open: "/" is a new chat, "/c/{id}" a saved one
  const pathname = usePathname();
  const urlId = pathname.startsWith("/c/") ? pathname.slice(3) : null;
  // "Ask about this" on the Documents page opens /?attach={doc_id}
  const attachId = useSearchParams().get("attach");

  useEffect(() => {
    // The pane is an overlay on small screens, so start it closed there
    if (window.innerWidth < 1024) setShowPanel(false);
    fetch(`${API}/models`)
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models);
        setDefaultModel(d.default);
        // A saved chat may already have set its model
        setModel((m) => m || d.default);
      });
    fetch(`${API}/tools`)
      .then((r) => r.json())
      .then(setTools);
  }, []);

  async function openThread(id: string) {
    opening.current = id;
    setStatus("loading");
    setSelected(null);
    setMessages([]);
    setDrafts([]);
    const res = await fetch(`${API}/threads/${id}`);
    if (opening.current !== id) return; // the user opened another chat meanwhile
    if (!res.ok) return setStatus("missing");
    const d = await res.json();
    setMessages(d.messages);
    setThreadId(id);
    setTitle(d.title);
    if (d.model) setModel(d.model);
    setEnabledTools(d.enabled_tools);
    setThink(d.think);
    setStatus("ready");
  }

  function reset() {
    opening.current = null;
    setStatus("ready");
    setSelected(null);
    setMessages([]);
    setDrafts([]);
    setThreadId(null);
    setTitle(null);
    setModel(defaultModel);
    setEnabledTools(null);
    setThink(false);
  }

  useEffect(() => {
    // Equal right after our own replaceState below: the open chat just got its URL
    if (urlId === threadId) return;
    // The URL lives outside React, so syncing to it is what this effect is for
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (urlId) openThread(urlId);
    else reset();
    // Only a URL change should open or reset a chat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId]);

  useEffect(() => {
    if (!attachId || urlId) return;
    // Drop the param first so a refresh does not attach the file again
    window.history.replaceState(null, "", "/");
    fetch(`${API}/documents/${attachId}`)
      .then((r) => (r.ok ? r.json() : null))
      // Add-only: dev mode runs this effect twice, and a toggle would undo itself
      .then((doc: LibraryDoc | null) => doc?.status === "ready" && addFromLibrary(doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachId]);

  useEffect(() => {
    // A new chat gets its URL once the backend has assigned the thread
    if (threadId && urlId !== threadId) window.history.replaceState(null, "", `/c/${threadId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Update the assistant message being streamed
  function updateLast(change: (m: Message) => Message) {
    setMessages((prev) => [...prev.slice(0, -1), change(prev[prev.length - 1])]);
  }

  function appendToLast(text: string) {
    updateLast((m) => ({ ...m, content: m.content + text }));
  }

  function onEvent(ev: ChatEvent) {
    if (ev.type === "token") {
      const now = Date.now();
      return updateLast((m) => ({
        ...m,
        content: m.content + ev.text,
        thoughtMs: m.thoughtMs ?? (m.startedAt ? now - m.startedAt : undefined),
      }));
    }
    updateLast((m) => {
      // Reasoning streams in small chunks; keep one event per stretch of thinking
      const prev = m.events[m.events.length - 1];
      if (ev.type === "reasoning" && prev?.type === "reasoning") {
        return { ...m, events: [...m.events.slice(0, -1), { ...prev, text: `${prev.text}${ev.text}` }] };
      }
      return { ...m, events: [...m.events, ev] };
    });
    if (ev.type === "done") {
      setThreadId(ev.thread_id as string);
      setListVersion((v) => v + 1);
    }
    if (ev.type === "title") setTitle(ev.title as string);
    if (ev.type === "error") appendToLast(`\n\n**Error:** ${ev.message}`);
  }

  async function run(url: string, body: unknown) {
    setStreaming(true);
    try {
      await streamEvents(url, body, onEvent);
    } catch (e) {
      appendToLast(`\n\n**Error:** ${(e as Error).message}`);
    }
    setStreaming(false);
  }

  function updateDraft(key: string, change: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));
  }

  function attach(files: File[]) {
    for (const file of files) {
      const key = crypto.randomUUID();
      setDrafts((prev) => [...prev, { key, name: file.name, done: 0, total: 0, ready: false }]);
      // A chip removed mid-upload just stops updating; the file still lands in the library
      uploadDocument(file, (p) => updateDraft(key, p))
        .then((docId) => updateDraft(key, { docId, ready: true }))
        .catch((e) => updateDraft(key, { error: (e as Error).message }));
    }
  }

  // Library files are already ingested, so their chips are ready at once
  function addFromLibrary(doc: LibraryDoc) {
    setDrafts((prev) =>
      prev.some((d) => d.docId === doc.doc_id)
        ? prev
        : [...prev, { key: doc.doc_id, name: doc.name, docId: doc.doc_id, done: 0, total: 0, ready: true }],
    );
  }

  function toggleLibrary(doc: LibraryDoc) {
    if (drafts.some((d) => d.docId === doc.doc_id)) setDrafts((prev) => prev.filter((d) => d.docId !== doc.doc_id));
    else addFromLibrary(doc);
  }

  const last = messages[messages.length - 1];
  const canThink = models.find((m) => m.name === model)?.thinking ?? false;
  const pending = last ? pendingInterrupt(last.events) : null;
  // A failed chip also blocks sending until it is removed
  const uploading = drafts.some((d) => !d.ready);

  async function send() {
    const message = input.trim();
    if (!message || streaming || pending || uploading) return;
    const attachments = drafts.map((d) => ({ doc_id: d.docId!, name: d.name }));
    setInput("");
    setDrafts([]);
    setSelected(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, events: [], attachments },
      { role: "assistant", content: "", events: [], startedAt: Date.now() },
    ]);
    await run(`${API}/chat`, {
      message,
      thread_id: threadId,
      model,
      enabled_tools: enabledTools,
      attachments: attachments.map((a) => a.doc_id),
      // A chat switched to a model that can't think must not ask it to
      think: think && canThink,
    });
  }

  function decide(action: "approve" | "reject") {
    // The resumed run keeps streaming into the same assistant message, timed afresh
    updateLast((m) => ({ ...m, startedAt: Date.now(), thoughtMs: undefined }));
    run(`${API}/chat/${threadId}/resume`, { action });
  }

  // The panel follows the latest turn unless the user clicked an older one
  const panelIndex = selected ?? messages.findLastIndex((m) => m.role === "assistant");
  const panelEvents = messages[panelIndex]?.events ?? [];
  const panelOpen = showPanel && messages.length > 0;

  const composer = (
    <form
      className="rounded-2xl border bg-card shadow-sm transition-colors focus-within:border-foreground/20"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        // Same rule as the + button's picker: PDFs only
        attach(Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".pdf")));
      }}
    >
      {drafts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {drafts.map((d) => (
            <DraftChip key={d.key} draft={d} onRemove={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))} />
          ))}
        </div>
      )}
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={pending ? "Approve or reject the tool call first" : "Ask anything..."}
        rows={2}
        autoFocus
        className="max-h-48 min-h-14 resize-none border-0 bg-transparent px-4 pt-3.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <AttachMenu
          onFiles={attach}
          selected={drafts.flatMap((d) => (d.docId ? [d.docId] : []))}
          onToggle={toggleLibrary}
        />
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={streaming}
          title="Model"
          className="h-7 max-w-44 cursor-pointer truncate rounded-md bg-transparent px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
        >
          {models.map((m) => (
            <option key={m.name} value={m.name} className="bg-popover text-popover-foreground">
              {m.thinking ? `${m.name} · thinks` : m.name}
            </option>
          ))}
        </select>
        <ToolPicker tools={tools} enabled={enabledTools ?? tools.map((t) => t.name)} onChange={setEnabledTools} />
        <button
          type="button"
          onClick={() => setThink(!think)}
          disabled={!canThink || streaming}
          aria-pressed={think && canThink}
          title={canThink ? "Let the model reason before answering" : `${model} can't think`}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            think && canThink
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground"
          }`}
        >
          <Brain className="size-3.5" />
          Think
        </button>
        <div className="ml-auto">
          <MicButton
            onText={(text) => setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text))}
            disabled={streaming || !!pending}
          />
        </div>
        <Button
          type="submit"
          size="icon-sm"
          aria-label="Send"
          className="rounded-full"
          disabled={streaming || !!pending || uploading || !input.trim()}
        >
          {streaming ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        currentId={threadId ?? undefined}
        version={listVersion}
        disabled={streaming}
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title ?? chatTitle(messages)}</h1>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Toggle activity panel"
              aria-label="Toggle activity panel"
              className={panelOpen ? "bg-muted" : ""}
              onClick={() => setShowPanel(!showPanel)}
            >
              <PanelRight />
            </Button>
          )}
        </header>

        {status === "loading" ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : status === "missing" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-muted-foreground">This chat doesn&apos;t exist or was deleted.</p>
            <Link href="/" className="text-sm underline underline-offset-4">
              Start a new chat
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-16">
            <div className="w-full max-w-2xl space-y-6">
              <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
                What can I help you with?
              </h2>
              {composer}
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex flex-col items-end gap-1.5">
                      {!!m.attachments?.length && (
                        <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
                          {m.attachments.map((a) => (
                            <AttachmentChip key={a.doc_id} attachment={a} />
                          ))}
                        </div>
                      )}
                      <div className="w-fit max-w-[80%] rounded-2xl bg-muted px-4 py-2 whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      onClick={() => {
                        setSelected(i);
                        setShowPanel(true);
                      }}
                      className={`-ml-3 flex cursor-pointer gap-3 border-l-2 pl-3 ${i === panelIndex && panelOpen ? "border-foreground/25" : "border-transparent"}`}
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card">
                        <Sparkles className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <Steps
                          events={m.events}
                          live={streaming && i === messages.length - 1}
                          answering={!!m.content}
                          thoughtMs={m.thoughtMs}
                        />
                        {m.content && (
                          <Streamdown plugins={plugins} isAnimating={streaming && i === messages.length - 1}>
                            {m.content}
                          </Streamdown>
                        )}
                        {i === messages.length - 1 && pending && (
                          <ApprovalCard
                            toolCalls={pending.tool_calls as { id: string; name: string; args: unknown }[]}
                            disabled={streaming}
                            onDecide={decide}
                          />
                        )}
                      </div>
                    </div>
                  ),
                )}
                <div ref={bottom} />
              </div>
            </main>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">{composer}</div>
          </>
        )}
      </div>

      {panelOpen && (
        <aside className="fixed inset-y-0 right-0 z-20 flex w-80 max-w-full flex-col border-l bg-sidebar lg:static">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(["activity", "sources"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 capitalize ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close panel" className="ml-auto" onClick={() => setShowPanel(false)}>
              <X />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "activity" ? <ActivityPanel events={panelEvents} /> : <SourcesPanel events={panelEvents} />}
          </div>
        </aside>
      )}
    </div>
  );
}
