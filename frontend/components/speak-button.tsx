"use client";

import { useEffect, useRef, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { speak } from "@/lib/voice";

// Reads an assistant answer aloud; a second click stops it
export function SpeakButton({ content }: { content: string }) {
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<() => void>(undefined);

  // Leaving the chat stops this reply's audio
  useEffect(() => () => stopRef.current?.(), []);

  return (
    <button
      type="button"
      onClick={(e) => {
        // The answer opens the side panel on click; this button shouldn't
        e.stopPropagation();
        if (playing) {
          stopRef.current?.();
        } else {
          setPlaying(true);
          stopRef.current = speak(content, () => setPlaying(false));
        }
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
