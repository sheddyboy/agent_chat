import { streamEvents } from "@/lib/sse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Progress = { docId: string; stage: string; done: number; total: number };

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
