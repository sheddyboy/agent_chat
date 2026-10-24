"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
import { getSpeaking, speak, stopSpeaking, subscribeSpeaking } from "@/lib/voice";

// Reads an assistant answer aloud; a second click stops it. Also shows Stop when the
// answer was started by auto-read rather than by this button
export function SpeakButton({ content }: { content: string }) {
  const playing = useSyncExternalStore(subscribeSpeaking, () => getSpeaking() === content, () => false);

  // Leaving the chat stops this answer's audio
  useEffect(
    () => () => {
      if (getSpeaking() === content) stopSpeaking();
    },
    [content],
  );

  return (
    <button
      type="button"
      onClick={(e) => {
        // The answer opens the side panel on click; this button shouldn't
        e.stopPropagation();
        if (playing) stopSpeaking();
        else speak(content);
      }}
      title={playing ? "Stop reading" : "Read aloud"}
      aria-label={playing ? "Stop reading" : "Read aloud"}
      aria-pressed={playing}
      className={`flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground ${
        playing ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {playing ? <Square className="size-3 fill-current" /> : <Volume2 className="size-3.5" />}
    </button>
  );
}
