"use client";

import Link from "next/link";
import { Download, FileUser, PenLine } from "lucide-react";
import { API, Card, useWidget } from "@/components/overview/card";

type Resume = { tex: string; updated_at: string };

// "today", "yesterday", "5 days ago"
function since(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export function ResumeWidget({ index, className }: { index: number; className?: string }) {
  const { data, error } = useWidget<Resume>("/resume");
  // The section titles are a quick outline of what is on it
  const sections = data ? [...data.tex.matchAll(/^\s*\\section\{([^}]*)\}/gm)].map((m) => m[1]) : [];

  return (
    <Card title="Resume" icon={FileUser} index={index} href="/resume" loading={!data && !error} error={error} className={className}>
      {data && (
        <>
          <p className="text-sm text-muted-foreground">Updated {since(data.updated_at)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <span key={s} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                {s}
              </span>
            ))}
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
            <Link href="/resume" className="flex h-9 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition-colors hover:bg-muted">
              <PenLine className="size-4" />
              Edit
            </Link>
            <a
              href={`${API}/resume/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition-colors hover:bg-muted"
            >
              <Download className="size-4" />
              PDF
            </a>
          </div>
        </>
      )}
    </Card>
  );
}
