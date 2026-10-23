"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, MessageSquare, PanelLeft, Plus, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export type ChatSummary = { id: string; title: string };

const item =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

// Left nav with this session's chats. Desktop can collapse it to an icon rail;
// on small screens it is an overlay opened from the page header.
// Without onNew (the documents page) New chat is a link back to the chat page.
export function Sidebar({
  chats = [],
  currentId,
  onNew,
  onOpen,
  disabled,
  open,
  onClose,
}: {
  chats?: ChatSummary[];
  currentId?: string;
  onNew?: () => void;
  onOpen?: (id: string) => void;
  disabled?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = collapsed ? "md:hidden" : "";

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}
      <nav
        className={`${open ? "fixed inset-y-0 left-0 z-40 flex" : "hidden"} w-64 shrink-0 flex-col gap-1 border-r bg-sidebar p-2 md:static md:flex ${collapsed ? "md:w-12" : "md:w-60"}`}
      >
        <div className="mb-2 flex h-8 items-center justify-between">
          <div className={`flex items-center gap-2 px-1 ${label}`}>
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">Agent Chat</span>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            className="hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:flex"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        {onNew ? (
          <button
            className={item}
            disabled={disabled}
            onClick={() => {
              onNew();
              onClose();
            }}
          >
            <Plus className="size-4 shrink-0" />
            <span className={label}>New chat</span>
          </button>
        ) : (
          <Link href="/" className={item}>
            <Plus className="size-4 shrink-0" />
            <span className={label}>New chat</span>
          </Link>
        )}
        <Link href="/documents" className={item}>
          <FileText className="size-4 shrink-0" />
          <span className={label}>Documents</span>
        </Link>

        {chats.length > 0 && (
          <div className={`mt-4 min-h-0 flex-1 overflow-y-auto ${label}`}>
            <p className="px-2 pb-1 text-xs text-muted-foreground/70">This session</p>
            {chats.map((c) => (
              <button
                key={c.id}
                disabled={disabled}
                onClick={() => {
                  onOpen?.(c.id);
                  onClose();
                }}
                className={`${item} ${c.id === currentId ? "bg-sidebar-accent text-foreground" : ""}`}
              >
                <MessageSquare className="size-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <ThemeToggle labelClass={label} />
        </div>
      </nav>
    </>
  );
}
