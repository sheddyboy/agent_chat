"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { startRecording, transcribe } from "@/lib/voice";

// Parakeet is reliable up to about 20 to 30 seconds of audio, so stop before that
const MAX_SECONDS = 25;

// Push-to-talk: click to record, click again (or wait MAX_SECONDS) to transcribe.
// The text goes to onText; nothing is sent until the user presses Send.
export function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const stopRef = useRef<(() => Promise<Blob>) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  // Leaving the page mid-recording releases the mic
  useEffect(
    () => () => {
      clearInterval(timer.current);
      stopRef.current?.().catch(() => {});
    },
    [],
  );

  async function start() {
    setError("");
    try {
      stopRef.current = await startRecording();
    } catch {
      setError("Microphone blocked");
      return;
    }
    const startedAt = Date.now();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) finish();
    }, 250);
  }

  async function finish() {
    const stop = stopRef.current;
    if (!stop) return;
    stopRef.current = null;
    clearInterval(timer.current);
    setState("transcribing");
    try {
      const text = await transcribe(await stop());
      if (text) onText(text);
      else setError("Didn't catch that");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    }
    setState("idle");
  }

  const recording = state === "recording";
  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {recording && (
        <span className="text-xs text-muted-foreground tabular-nums">
          0:{String(seconds).padStart(2, "0")}
        </span>
      )}
      <button
        type="button"
        onClick={recording ? finish : start}
        disabled={state === "transcribing" || (disabled && !recording)}
        title={recording ? "Stop and transcribe" : "Speak your message"}
        aria-label={recording ? "Stop recording" : "Start recording"}
        aria-pressed={recording}
        className={`flex size-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          recording
            ? "animate-pulse bg-red-500/15 text-red-500"
            : "text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground"
        }`}
      >
        {state === "transcribing" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : recording ? (
          <Square className="size-3 fill-current" />
        ) : (
          <Mic className="size-3.5" />
        )}
      </button>
    </div>
  );
}
