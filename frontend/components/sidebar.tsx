"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, FileUser, LayoutGrid, MessageSquare, PanelLeft, Plus, Sparkles, Sun, Trash2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PAGE = 30;

type Thread = { thread_id: string; title: string; updated_at: string };

const item =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
// Links have no :disabled, so they get the same look by hand
const off = "pointer-events-none opacity-50";

// Left nav with recent chats from the backend, newest first, loaded a page at a time
// as the list scrolls. Desktop can collapse it to an icon rail; on small screens it
// is an overlay opened from the page header. `version` changes after each chat turn.
export function Sidebar({
  currentId,
  version = 0,
  disabled,
  open,
  onClose,
}: {
  currentId?: string;
  version?: number;
  disabled?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const here = (path: string) => (pathname === path ? "bg-sidebar-accent text-foreground" : "");
  const label = collapsed ? "md:hidden" : "";

  function loadFirstPage() {
    fetch(`${API}/threads?limit=${PAGE}`)
      .then((r) => r.json())
      .then((d) => {
        setThreads(d.threads);
        setNext(d.next);
      });
  }

  // A turn moves its chat to the top, so start again from the first page
  useEffect(loadFirstPage, [version]);

  // Load the next page when the bottom of the list scrolls into view
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMore.current) return;
      loadingMore.current = true;
      const d = await fetch(`${API}/threads?limit=${PAGE}&before=${encodeURIComponent(next)}`).then((r) => r.json());
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.thread_id));
        return [...prev, ...d.threads.filter((t: Thread) => !seen.has(t.thread_id))];
      });
      setNext(d.next);
      loadingMore.current = false;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [next]);

  async function remove(id: string) {
    await fetch(`${API}/threads/${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t.thread_id !== id));
    setConfirming(null);
    if (id === currentId) router.push("/c");
  }

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

        <Link href="/" onClick={onClose} className={`${item} ${here("/")} ${disabled ? off : ""}`}>
          <LayoutGrid className="size-4 shrink-0" />
          <span className={label}>Overview</span>
        </Link>
        <Link href="/c" onClick={onClose} className={`${item} ${here("/c")} ${disabled ? off : ""}`}>
          <Plus className="size-4 shrink-0" />
          <span className={label}>New chat</span>
        </Link>
        <Link href="/briefing" onClick={onClose} className={`${item} ${here("/briefing")}`}>
          <Sun className="size-4 shrink-0" />
          <span className={label}>Briefing</span>
        </Link>
        <Link href="/documents" className={`${item} ${here("/documents")}`}>
          <FileText className="size-4 shrink-0" />
          <span className={label}>Documents</span>
        </Link>
        <Link href="/resume" className={`${item} ${here("/resume")}`}>
          <FileUser className="size-4 shrink-0" />
          <span className={label}>Resume</span>
        </Link>

        {threads.length > 0 && (
          <div className={`mt-4 min-h-0 flex-1 overflow-y-auto ${label}`}>
            <p className="px-2 pb-1 text-xs text-muted-foreground/70">Recents</p>
            {threads.map((t) =>
              confirming === t.thread_id ? (
                <div key={t.thread_id} className={`${item} justify-between bg-sidebar-accent text-foreground`}>
                  <span className="truncate">Delete chat?</span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      onClick={() => remove(t.thread_id)}
                      className="rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                    <button onClick={() => setConfirming(null)} className="rounded px-1.5 py-0.5 text-xs hover:bg-muted">
                      Cancel
                    </button>
                  </span>
                </div>
              ) : (
                <div key={t.thread_id} className="group relative">
                  <Link
                    href={`/c/${t.thread_id}`}
                    onClick={onClose}
                    className={`${item} pr-8 ${t.thread_id === currentId ? "bg-sidebar-accent text-foreground" : ""} ${disabled ? off : ""}`}
                  >
                    <MessageSquare className="size-3.5 shrink-0" />
                    <span className="truncate">{t.title}</span>
                  </Link>
                  <button
                    onClick={() => setConfirming(t.thread_id)}
                    disabled={disabled}
                    title="Delete chat"
                    aria-label="Delete chat"
                    className="absolute top-1 right-1 hidden size-6 items-center justify-center rounded text-muted-foreground group-hover:flex hover:text-foreground focus-visible:flex disabled:hidden"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ),
            )}
            <div ref={sentinel} className="h-px" />
          </div>
        )}

        <div className="mt-auto">
          <ThemeToggle labelClass={label} />
        </div>
      </nav>
    </>
  );
}
