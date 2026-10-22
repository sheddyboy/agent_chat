export type ChatEvent = { type: string; [key: string]: unknown };

// POST and read the SSE stream with fetch, since EventSource only does GET
export async function streamEvents(
  url: string,
  body: unknown,
  onEvent: (ev: ChatEvent) => void,
) {
  // FormData sets its own multipart header, so only JSON bodies get one
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
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
