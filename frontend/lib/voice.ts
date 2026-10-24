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
