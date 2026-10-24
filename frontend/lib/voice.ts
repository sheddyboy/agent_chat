const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// What the speech to text model expects
const RATE = 16000;

// Start recording from the mic. The returned stop() ends it and resolves with a 16 kHz mono WAV
export async function startRecording(): Promise<() => Promise<Blob>> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  return () =>
    new Promise((resolve, reject) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        toWav(new Blob(chunks, { type: recorder.mimeType })).then(resolve, reject);
      };
      recorder.stop();
    });
}

// The browser records webm/opus; decode it and render it again at 16 kHz mono so the
// backend can read it with the stdlib wave module (no ffmpeg)
async function toWav(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await recording.arrayBuffer()).finally(() => ctx.close());
  if (decoded.duration < 0.3) throw new Error("Too short, hold on a little longer");
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return encodeWav((await offline.startRendering()).getChannelData(0));
}

// 16-bit PCM WAV: a 44 byte header, then the samples
function encodeWav(samples: Float32Array): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([view], { type: "audio/wav" });
}

export async function transcribe(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "speech.wav");
  const r = await fetch(`${API}/voice/transcribe`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`Transcription failed (${r.status})`);
  return (await r.json()).text;
}

// What a reply sounds like read aloud: code is skipped, tables are announced, formatting is dropped
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, "\n") // fenced code, including one still open
    .replace(/(^\|.*\|[ \t]*\n?)+/gm, "See the table.\n")
    .replace(/\$\$[\s\S]*?\$\$/g, " ") // display math
    .replace(/\$(?!\s)[^$\n]+?\$/g, " ") // inline math, as the chat renders it
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^[ \t]*(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "") // headings, quotes, list markers
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "") // horizontal rules
    .replace(/\*+|~~/g, "") // bold, italics, strikethrough (underscores stay for snake_case)
    .replace(/[ \t]{2,}/g, " ");
}

// Sentences short enough for one /voice/speak call each. Short pieces such as list items are
// merged so the voice reads natural phrases, and very long ones are cut at a space
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (let part of text.split(/(?<=[.!?])\s+|\n+/)) {
    part = part.trim();
    while (part.length > 400) {
      const cut = part.lastIndexOf(" ", 400);
      out.push(part.slice(0, cut > 0 ? cut : 400));
      part = part.slice(cut > 0 ? cut + 1 : 400);
    }
    if (!part) continue;
    const last = out.at(-1);
    if (last !== undefined && last.length < 40) {
      // A pause between merged list items, which have no punctuation of their own
      out[out.length - 1] = /[.!?,:;]$/.test(last) ? `${last} ${part}` : `${last}. ${part}`;
    } else {
      out.push(part);
    }
  }
  return out;
}

function fetchSpeech(text: string, signal: AbortSignal): Promise<Blob> {
  const p = fetch(`${API}/voice/speak`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  }).then((r) => {
    if (!r.ok) throw new Error(`Speech failed (${r.status})`);
    return r.blob();
  });
  // A prefetch that gets aborted by stop() should not show up as an unhandled rejection
  p.catch(() => {});
  return p;
}

// One reply plays at a time. `speaking` is its text, so every speaker button (and auto-read)
// can tell which one is playing; `current` stops it
let speaking: string | null = null;
let current: (() => void) | null = null;
const listeners = new Set<() => void>();

export function subscribeSpeaking(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSpeaking = () => speaking;

export const stopSpeaking = () => current?.();

function setSpeaking(text: string | null) {
  speaking = text;
  listeners.forEach((l) => l());
}

// Read a reply aloud one sentence at a time, fetching sentence n+1 while n plays.
// Stops whatever was playing before; ends on its own when done or on a failed request
export function speak(markdown: string) {
  current?.();
  const parts = sentences(speechText(markdown));
  const controller = new AbortController();
  const audio = new Audio();
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    controller.abort();
    audio.pause();
    if (current === stop) {
      current = null;
      setSpeaking(null);
    }
  }
  current = stop;
  setSpeaking(markdown);

  (async () => {
    let next = parts.length ? fetchSpeech(parts[0], controller.signal) : null;
    for (let i = 0; next && !stopped; i++) {
      const url = URL.createObjectURL(await next);
      next = i + 1 < parts.length ? fetchSpeech(parts[i + 1], controller.signal) : null;
      audio.src = url;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        audio.play().catch(reject);
      }).finally(() => URL.revokeObjectURL(url));
    }
  })()
    .catch(() => {})
    .finally(stop);
}
