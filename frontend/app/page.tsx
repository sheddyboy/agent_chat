"use client";

import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamEvents, type ChatEvent } from "@/lib/sse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Models write inline math as $...$, which the default plugin ignores
const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid };

type Message = { role: "user" | "assistant"; content: string };

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Append text to the assistant message being streamed
  function appendToLast(text: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, content: last.content + text }];
    });
  }

  function onEvent(ev: ChatEvent) {
    switch (ev.type) {
      case "token":
        appendToLast(ev.text as string);
        break;
      case "done":
        setThreadId(ev.thread_id as string);
        break;
      case "error":
        appendToLast(`\n\n**Error:** ${ev.message}`);
        break;
      default:
        break; // other events get a place in the UI in slice 9
    }
  }

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    try {
      await streamEvents(`${API}/chat`, { message, thread_id: threadId }, onEvent);
    } catch (e) {
      appendToLast(`\n\n**Error:** ${(e as Error).message}`);
    }
    setStreaming(false);
  }

  function newChat() {
    setMessages([]);
    setThreadId(null);
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-3">
        <h1 className="font-semibold">Agent Chat</h1>
        <Button variant="outline" size="sm" onClick={newChat} disabled={streaming}>
          New chat
        </Button>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto py-4">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2">
              {m.content}
            </div>
          ) : (
            <Streamdown
              key={i}
              plugins={plugins}
              isAnimating={streaming && i === messages.length - 1}
            >
              {m.content || (streaming ? "_Thinking..._" : "")}
            </Streamdown>
          ),
        )}
        <div ref={bottom} />
      </main>

      <form
        className="flex gap-2 py-4"
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
          placeholder="Ask anything"
          rows={2}
          className="resize-none"
        />
        <Button type="submit" disabled={streaming || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
