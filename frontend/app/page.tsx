"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { ActivityPanel } from "@/components/activity-panel";
import { ApprovalCard } from "@/components/approval-card";
import { SourcesPanel } from "@/components/sources-panel";
import { ToolPicker, type Tool } from "@/components/tool-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamEvents, type ChatEvent } from "@/lib/sse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Models write inline math as $...$, which the default plugin ignores
const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid };

// events holds every non-token event of an assistant turn, for the side panel
type Message = { role: "user" | "assistant"; content: string; events: ChatEvent[] };

// The pending interrupt of a turn: nothing but "done" has arrived after it
function pendingInterrupt(events: ChatEvent[]) {
  const i = events.findLastIndex((e) => e.type === "interrupt");
  if (i === -1 || events.slice(i + 1).some((e) => e.type !== "done")) return null;
  return events[i];
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"activity" | "sources">("activity");
  const [showPanel, setShowPanel] = useState(false);
  // Model and tools are chosen per chat; New chat resets them to these defaults
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [model, setModel] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    if (ev.type === "token") return appendToLast(ev.text as string);
    updateLast((m) => ({ ...m, events: [...m.events, ev] }));
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
      { role: "assistant", content: "", events: [] },
    ]);
    await run(`${API}/chat`, { message, thread_id: threadId, model, enabled_tools: enabledTools });
  }

  function decide(action: "approve" | "reject") {
    // The resumed run keeps streaming into the same assistant message
    run(`${API}/chat/${threadId}/resume`, { action });
  }

  function newChat() {
    setMessages([]);
    setThreadId(null);
    setSelected(null);
    setModel(defaultModel);
    setEnabledTools(tools.map((t) => t.name));
  }

  // The panel follows the latest turn unless the user clicked an older one
  const panelIndex = selected ?? messages.findLastIndex((m) => m.role === "assistant");
  const panelEvents = messages[panelIndex]?.events ?? [];

  return (
    <div className="flex h-dvh w-full">
      <div className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col px-4">
        <header className="flex items-center justify-between py-3">
          <h1 className="font-semibold">Agent Chat</h1>
          <div className="flex gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={streaming}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <Link href="/documents" className="px-2 py-1 text-sm hover:underline">
              Documents
            </Link>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowPanel(!showPanel)}>
              Panel
            </Button>
            <Button variant="outline" size="sm" onClick={newChat} disabled={streaming}>
              New chat
            </Button>
          </div>
        </header>

        <main className="flex-1 space-y-6 overflow-y-auto py-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto w-fit max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2">
                {m.content}
              </div>
            ) : (
              <div
                key={i}
                onClick={() => setSelected(i)}
                className={`space-y-3 rounded-lg ${i === panelIndex ? "ring-1 ring-border ring-offset-8" : ""}`}
              >
                <Streamdown plugins={plugins} isAnimating={streaming && i === messages.length - 1}>
                  {m.content || (streaming && i === messages.length - 1 ? "_Thinking..._" : "")}
                </Streamdown>
                {i === messages.length - 1 && pending && (
                  <ApprovalCard
                    toolCalls={pending.tool_calls as { id: string; name: string; args: unknown }[]}
                    disabled={streaming}
                    onDecide={decide}
                  />
                )}
              </div>
            ),
          )}
          <div ref={bottom} />
        </main>

        <form
          className="flex items-end gap-2 py-4"
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
            placeholder={pending ? "Approve or reject the tool call first" : "Ask anything"}
            rows={2}
            className="resize-none"
          />
          <div className="flex flex-col items-end gap-2">
            <ToolPicker tools={tools} enabled={enabledTools} onChange={setEnabledTools} />
            <Button type="submit" disabled={streaming || !!pending || !input.trim()}>
              Send
            </Button>
          </div>
        </form>
      </div>

      <aside
        className={`${showPanel ? "fixed inset-y-0 right-0 z-10 flex" : "hidden"} w-80 flex-col border-l bg-background lg:static lg:flex`}
      >
        <div className="flex gap-1 border-b p-2">
          <Button size="sm" variant={tab === "activity" ? "secondary" : "ghost"} onClick={() => setTab("activity")}>
            Activity
          </Button>
          <Button size="sm" variant={tab === "sources" ? "secondary" : "ghost"} onClick={() => setTab("sources")}>
            Sources
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tab === "activity" ? <ActivityPanel events={panelEvents} /> : <SourcesPanel events={panelEvents} />}
        </div>
      </aside>
    </div>
  );
}
