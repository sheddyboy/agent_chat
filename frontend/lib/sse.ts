export type ChatEvent = { type: string; [key: string]: unknown };

// POST and read the SSE stream with fetch, since EventSource only does GET.
// A null body makes it a GET, for following a running job.
export async function streamEvents(
  url: string,
  body: unknown,
  onEvent: (ev: ChatEvent) => void,
) {
  // FormData sets its own multipart header, so only JSON bodies get one
  const isForm = body instanceof FormData;
  const res = await fetch(
    url,
    body === null
      ? undefined
      : {
          method: "POST",
          headers: isForm ? undefined : { "Content-Type": "application/json" },
          body: isForm ? body : JSON.stringify(body),
        },
  );
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // sse-starlette ends lines with \r\n; normalize so one split works
    buffer += value.replace(/\r\n/g, "\n");
    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? ""; // last piece may be incomplete
    for (const msg of messages) {
      for (const line of msg.split("\n")) {
        if (line.startsWith("data:")) onEvent(JSON.parse(line.slice(5)));
      }
    }
  }
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Follow a background job from its first event; it keeps running if this page goes away
export function followJob(jobId: string, onEvent: (ev: ChatEvent) => void) {
  return streamEvents(`${API}/jobs/${jobId}/events`, null, onEvent);
}

// The running job of this kind for a thread, document or day, if there is one
export async function runningJob(kind: string, ref: string): Promise<string | null> {
  const r = await fetch(`${API}/jobs?kind=${kind}&ref=${encodeURIComponent(ref)}&status=running`);
  const jobs: { id: string }[] = r.ok ? await r.json() : [];
  return jobs[0]?.id ?? null;
}
