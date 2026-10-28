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
import {
  AttachMenu,
  AttachmentChip,
  DraftChip,
  ImageChip,
  ImageThumb,
  type Attachment,
  type Draft,
  type ImageDraft,
  type ImageRef,
  type LibraryDoc,
} from "@/components/attachments";
import { ApprovalCard } from "@/components/approval-card";
import { MicButton } from "@/components/mic-button";
import { Sidebar } from "@/components/sidebar";
import { SourcesPanel } from "@/components/sources-panel";
import { SpeakButton } from "@/components/speak-button";
import { Steps } from "@/components/steps";
import { ToolPicker, type Tool } from "@/components/tool-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { followJob, runningJob, streamEvents, type ChatEvent } from "@/lib/sse";
import { IMAGE_TYPES, uploadDocument, uploadImage } from "@/lib/upload";
import { speak } from "@/lib/voice";

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
  images?: ImageRef[];
  startedAt?: number;
  thoughtMs?: number;
};
// thinking / vision: Ollama reports the model can reason before answering / see images
type Model = { name: string; thinking: boolean; vision: boolean };

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
  // Images picked for the next message; unlike PDFs they belong to that message only
  const [imageDrafts, setImageDrafts] = useState<ImageDraft[]>([]);
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
  // The composer holds a transcript from the mic (editing it keeps this on)
  const [fromVoice, setFromVoice] = useState(false);
  // The turn in flight was asked by voice, so its answer is read aloud when it ends
  const readAloud = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const opening = useRef<string | null>(null);

  // The URL decides what is open: "/c" is a new chat, "/c/{id}" a saved one
  const pathname = usePathname();
  const urlId = pathname.startsWith("/c/") ? pathname.slice(3) : null;
  // "Ask about this" on the Documents page opens /c?attach={doc_id}
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
    setImageDrafts([]);
    const res = await fetch(`${API}/threads/${id}`);
    if (opening.current !== id) return; // the user opened another chat meanwhile
    if (!res.ok) return setStatus("missing");
    const d = await res.json();
    const jobId = await runningJob("chat", id);
    if (opening.current !== id) return;
    // An answer still being written (the page was closed or reloaded mid-turn): show the
    // history up to that question, then replay the job into a fresh answer
    const lastAsk = (d.messages as Message[]).findLastIndex((m) => m.role === "user");
    setMessages(
      jobId
        ? [...d.messages.slice(0, lastAsk + 1), { role: "assistant", content: "", events: [], startedAt: Date.now() }]
        : d.messages,
    );
    setThreadId(id);
    setTitle(d.title);
    if (d.model) setModel(d.model);
    setEnabledTools(d.enabled_tools);
    setThink(d.think);
    setStatus("ready");
    if (jobId) {
      setStreaming(true);
      await followJob(jobId, onEvent).catch(() => {});
      setStreaming(false);
      // The saved history is the full turn, including any part from before an approval
      if (opening.current === id) openThread(id);
    }
  }

  function reset() {
    opening.current = null;
    setStatus("ready");
    setSelected(null);
    setMessages([]);
    setDrafts([]);
    setImageDrafts([]);
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
    if (urlId) openThread(urlId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else reset();
    // Only a URL change should open or reset a chat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId]);

  useEffect(() => {
    if (!attachId || urlId) return;
    // Drop the param first so a refresh does not attach the file again
    window.history.replaceState(null, "", "/c");
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
    // The turn runs as a job; its first event names the thread, so a new chat gets its URL
    // straight away and a reload mid-answer can find the job again
    if (ev.type === "job") return setThreadId(ev.ref as string);
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
    let answer = "";
    try {
      await streamEvents(url, body, (ev) => {
        if (ev.type === "token") answer += ev.text;
        onEvent(ev);
      });
    } catch (e) {
      appendToLast(`\n\n**Error:** ${(e as Error).message}`);
    }
    setStreaming(false);
    // A turn paused for approval has no answer yet; it is read once the resumed run ends
    if (readAloud.current && answer.trim()) {
      readAloud.current = false;
      speak(answer);
    }
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

  function attachImages(files: File[]) {
    for (const file of files) {
      const key = crypto.randomUUID();
      setImageDrafts((prev) => [...prev, { key, name: file.name }]);
      const update = (change: Partial<ImageDraft>) =>
        setImageDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));
      uploadImage(file)
        .then((img) => update({ imageId: img.image_id }))
        .catch((e) => update({ error: (e as Error).message }));
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
  const canSee = models.find((m) => m.name === model)?.vision ?? false;
  const pending = last ? pendingInterrupt(last.events) : null;
  // A failed chip also blocks sending until it is removed
  const uploading = drafts.some((d) => !d.ready) || imageDrafts.some((d) => !d.imageId);
  // Images only go to a model that can see them
  const blind = imageDrafts.length > 0 && !canSee;

  async function send() {
    const message = input.trim();
    if (!message || streaming || pending || uploading || blind) return;
    const attachments = drafts.map((d) => ({ doc_id: d.docId!, name: d.name }));
    const images = imageDrafts.map((d) => ({ image_id: d.imageId!, name: d.name }));
    readAloud.current = fromVoice;
    setFromVoice(false);
    setInput("");
    setDrafts([]);
    setImageDrafts([]);
    setSelected(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, events: [], attachments, images },
      { role: "assistant", content: "", events: [], startedAt: Date.now() },
    ]);
    await run(`${API}/chat`, {
      message,
      thread_id: threadId,
      model,
      enabled_tools: enabledTools,
      attachments: attachments.map((a) => a.doc_id),
      images,
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
        // Same rule as the + button's pickers: PDFs and png/jpeg/webp images
        const files = Array.from(e.dataTransfer.files);
        attach(files.filter((f) => f.name.toLowerCase().endsWith(".pdf")));
        attachImages(files.filter((f) => IMAGE_TYPES.includes(f.type)));
      }}
    >
      {imageDrafts.length > 0 && (
        <div className="space-y-1.5 px-3 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {imageDrafts.map((d) => (
              <ImageChip key={d.key} draft={d} onRemove={() => setImageDrafts((prev) => prev.filter((x) => x.key !== d.key))} />
            ))}
          </div>
          {blind && <p className="text-xs text-muted-foreground">{model} can&apos;t see images, pick a vision model</p>}
        </div>
      )}
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
          onImages={attachImages}
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
              {[m.name, m.thinking && "thinks", m.vision && "sees"].filter(Boolean).join(" · ")}
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
            onText={(text) => {
              setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
              setFromVoice(true);
            }}
            disabled={streaming || !!pending}
          />
        </div>
        <Button
          type="submit"
          size="icon-sm"
          aria-label="Send"
          className="rounded-full"
          disabled={streaming || !!pending || uploading || blind || !input.trim()}
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
            <Link href="/c" className="text-sm underline underline-offset-4">
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
                      {!!m.images?.length && (
                        <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
                          {m.images.map((img) => (
                            <ImageThumb key={img.image_id} image={img} />
                          ))}
                        </div>
                      )}
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
                        {/* Pictures from the generate_image tool */}
                        {m.events
                          .filter((e) => e.type === "image")
                          .map((e) => (
                            <ImageThumb
                              key={e.image_id as string}
                              image={{ image_id: e.image_id as string, name: e.prompt as string }}
                              className="w-full max-w-sm"
                            />
                          ))}
                        {/* Link safety off: links open straight in a new tab instead of a confirm dialog */}
                        {m.content && (
                          <Streamdown
                            plugins={plugins}
                            linkSafety={{ enabled: false }}
                            isAnimating={streaming && i === messages.length - 1}
                          >
                            {m.content}
                          </Streamdown>
                        )}
                        {m.content && !(streaming && i === messages.length - 1) && (
                          <div className="-mt-1 -ml-1.5 flex">
                            <SpeakButton content={m.content} />
                          </div>
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
