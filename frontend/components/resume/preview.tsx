"use client";

import { FileText, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// The compiled PDF in the browser's own viewer. `version` changes after each compile,
// which remounts the frame so it fades in with the new PDF.
export function Preview({ version, hasPdf, compiling }: { version: string | null; hasPdf: boolean; compiling: boolean }) {
  return (
    <div className="relative h-full bg-muted/40">
      {version && hasPdf ? (
        <iframe
          key={version}
          title="Resume preview"
          src={`${API}/resume/pdf?v=${encodeURIComponent(version)}#toolbar=0&navpanes=0&view=FitH`}
          className="h-full w-full motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <FileText className="size-8 stroke-[1.25] motion-safe:animate-pulse" />
          {version ? "No PDF yet. Fix the errors and recompile." : "Loading..."}
        </div>
      )}
      {compiling && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in">
          <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm">
            <Loader2 className="size-3.5 animate-spin" />
            Compiling
          </span>
        </div>
      )}
    </div>
  );
}
