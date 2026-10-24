import { streamEvents } from "@/lib/sse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Longest side sent to the model; bigger images only cost tokens and time
const MAX_SIDE = 1536;

// Shrink an image to MAX_SIDE in a canvas; small ones are sent as they are
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // PNG keeps screenshots sharp; photos are smaller as JPEG
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not resize image"))), type, 0.9),
  );
}

// Upload an image for the next message; resolves with its id once stored
export async function uploadImage(file: File): Promise<{ image_id: string; name: string }> {
  const form = new FormData();
  form.append("file", await downscale(file), file.name);
  const res = await fetch(`${API}/images`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `${res.status} ${res.statusText}`);
  return res.json();
}

export type Progress ={ docId: string; stage: string; done: number; total: number };

// Upload a PDF and follow its ingestion stream; resolves with the doc id once stored
export async function uploadDocument(file: File, onProgress: (p: Progress) => void): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  let docId = "";
  let error = "";
  await streamEvents(`${API}/documents`, form, (ev) => {
    if (ev.type === "ingestion") {
      docId = ev.doc_id as string;
      onProgress({ docId, stage: ev.stage as string, done: ev.done as number, total: ev.total as number });
    } else if (ev.type === "error") {
      error = ev.message as string;
    }
  });
  if (error) throw new Error(error);
  if (!docId) throw new Error("upload ended before ingestion started");
  return docId;
}
