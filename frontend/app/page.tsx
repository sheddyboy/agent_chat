"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Menu, PanelRight, Sparkles, X } from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { ActivityPanel } from "@/components/activity-panel";
import { ApprovalCard } from "@/components/approval-card";
import { Sidebar } from "@/components/sidebar";
import { SourcesPanel } from "@/components/sources-panel";
import { Steps } from "@/components/steps";
import { ToolPicker, type Tool } from "@/components/tool-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamEvents, type ChatEvent } from "@/lib/sse";

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
  startedAt?: number;
  thoughtMs?: number;
};
// A chat parked in the sidebar; only lives for this browser session
type SavedChat = { id: string; messages: Message[]; threadId: string | null; model: string; enabledTools: string[] };

// The pending interrupt of a turn: nothing but "done" has arrived after it
function pendingInterrupt(events: ChatEvent[]) {
  const i = events.findLastIndex((e) => e.type === "interrupt");
  if (i === -1 || events.slice(i + 1).some((e) => e.type !== "done")) return null;
  return events[i];
}

function chatTitle(messages: Message[]) {
  return messages.find((m) => m.role === "user")?.content.slice(0, 40) ?? "New chat";
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"activity" | "sources">("activity");
  const [showPanel, setShowPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [chatId, setChatId] = useState("first");
  const [saved, setSaved] = useState<SavedChat[]>([]);
  // Model and tools are chosen per chat; New chat resets them to these defaults
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [model, setModel] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The pane is an overlay on small screens, so start it closed there
    if (window.innerWidth < 1024) setShowPanel(false);
    fetch(`${API}/models`)
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models);
        setDefaultModel(d.default);
        setModel(d.default);
      });
    fetch(`${API}/tools`)
      .then((r) => r.json())
      .then((list: Tool[]) => {
        setTools(list);
        setEnabledTools(list.map((t) => t.name));
      });
  }, []);

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
    if (ev.type === "done") setThreadId(ev.thread_id as string);
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

  const last = messages[messages.length - 1];
  const pending = last ? pendingInterrupt(last.events) : null;

  async function send() {
    const message = input.trim();
    if (!message || streaming || pending) return;
    setInput("");
    setSelected(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, events: [] },
      { role: "assistant", content: "", events: [], startedAt: Date.now() },
    ]);
    await run(`${API}/chat`, { message, thread_id: threadId, model, enabled_tools: enabledTools });
  }

  function decide(action: "approve" | "reject") {
    // The resumed run keeps streaming into the same assistant message, timed afresh
    updateLast((m) => ({ ...m, startedAt: Date.now(), thoughtMs: undefined }));
    run(`${API}/chat/${threadId}/resume`, { action });
  }

  // Park the open chat in the sidebar list, keeping its place if already there
  function saveCurrent() {
    if (!messages.length) return;
    const chat = { id: chatId, messages, threadId, model, enabledTools };
    setSaved((prev) =>
      prev.some((c) => c.id === chatId) ? prev.map((c) => (c.id === chatId ? chat : c)) : [chat, ...prev],
    );
  }

  function load(chat: SavedChat) {
    setChatId(chat.id);
    setMessages(chat.messages);
    setThreadId(chat.threadId);
    setModel(chat.model);
    setEnabledTools(chat.enabledTools);
    setSelected(null);
  }

  function newChat() {
    saveCurrent();
    load({ id: crypto.randomUUID(), messages: [], threadId: null, model: defaultModel, enabledTools: tools.map((t) => t.name) });
  }

  function openChat(id: string) {
    if (id === chatId) return;
    saveCurrent();
    load(saved.find((c) => c.id === id)!);
  }

  // The open chat shows in the list before it has ever been parked
  const listed =
    !messages.length || saved.some((c) => c.id === chatId) ? saved : [{ id: chatId, messages }, ...saved];

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
    >
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
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={streaming}
          title="Model"
          className="h-7 max-w-44 cursor-pointer truncate rounded-md bg-transparent px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
        >
          {models.map((m) => (
            <option key={m} className="bg-popover text-popover-foreground">
              {m}
            </option>
          ))}
        </select>
        <ToolPicker tools={tools} enabled={enabledTools} onChange={setEnabledTools} />
        <Button
          type="submit"
          size="icon-sm"
          aria-label="Send"
          className="ml-auto rounded-full"
          disabled={streaming || !!pending || !input.trim()}
        >
          {streaming ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        chats={listed.map((c) => ({ id: c.id, title: chatTitle(c.messages) }))}
        currentId={chatId}
        onNew={newChat}
        onOpen={openChat}
        disabled={streaming}
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" className="md:hidden" onClick={() => setShowSidebar(true)}>
            <Menu />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{chatTitle(messages)}</h1>
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

        {messages.length === 0 ? (
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
                    <div
                      key={i}
                      className="ml-auto w-fit max-w-[80%] rounded-2xl bg-muted px-4 py-2 whitespace-pre-wrap"
                    >
                      {m.content}
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
