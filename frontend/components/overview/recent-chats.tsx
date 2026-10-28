"use client";

import Link from "next/link";
import { MessageSquare, MessagesSquare, Plus } from "lucide-react";
import { Card, Empty, useWidget } from "@/components/overview/card";

type Threads = { threads: { thread_id: string; title: string; updated_at: string }[] };

// "just now", "5m ago", "3h ago", "2d ago"
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(`${iso}Z`).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / (60 * 24))}d ago`;
}

export function RecentChatsWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Threads>("/threads?limit=5");

  return (
    <Card title="Recent chats" icon={MessagesSquare} index={index} loading={!data && !error} error={error} className={className}>
      {data?.threads.length === 0 ? (
        <Empty>No chats yet.</Empty>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {data?.threads.map((t, i) => (
            <li
              key={t.thread_id}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both"
              style={{ animationDelay: `${300 + i * 60}ms` }}
            >
              <Link href={`/c/${t.thread_id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted">
                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{ago(t.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/c"
        className="mt-auto flex h-9 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition-colors hover:bg-muted"
      >
        <Plus className="size-4" />
        New chat
      </Link>
    </Card>
  );
}
