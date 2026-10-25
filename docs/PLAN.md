# Plan: All-in-One Agentic Chat Platform

A local-first, ChatGPT/Claude-style agentic chat platform. It showcases agent orchestration (LangGraph), tool and MCP use, RAG (ingestion, hybrid retrieval, reranking), human-in-the-loop, live event streaming over SSE, and observability with Phoenix.

## Principles

- Local-first. Everything runs on this machine. Online MCPs are optional extras.
- No OOP. Plain functions, small flat files, no abstractions until there is a real second use.
- Extend by adding, not rewiring. A new tool, MCP server, model or event type should never require restructuring existing code.
- Build in vertical slices. Each slice is demoable on its own and committed when working.

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI, uv, sse-starlette |
| Orchestration | LangGraph (plain function nodes, direct `llm.invoke()`, no LCEL) |
| LLMs | Ollama via `ChatOllama` (qwen3, gpt-oss) |
| Embeddings | `qwen3-embedding:0.6b` via Ollama (dense), fastembed `Qdrant/bm25` (sparse) |
| Rerank | fastembed `Xenova/ms-marco-MiniLM-L-6-v2`, in-process |
| Voice | `onnx-asr` Parakeet TDT 0.6B v2 (speech to text), `kokoro-onnx` Kokoro 82M (text to speech), both int8 |
| PDF loading | `langchain-pymupdf4llm` (markdown per page, Tesseract OCR for scans) |
| Chunking | `MarkdownTextSplitter` from langchain-text-splitters |
| Vector store | Qdrant local mode (`QdrantClient(path=...)`) via langchain-qdrant |
| Checkpoints / threads | SQLite (`AsyncSqliteSaver`) |
| MCP | langchain-mcp-adapters (`MultiServerMCPClient`) |
| Observability | Phoenix (`arize-phoenix-otel` + `openinference-instrumentation-langchain`) |
| Frontend | Next.js, Tailwind, shadcn/ui, Streamdown for streaming markdown |

## Folder layout

```
backend/
  main.py           # FastAPI app and routes
  config.py         # pydantic-settings
  graph.py          # build_graph(), nodes as plain functions
  guard.py          # prompt-injection classifier (onnx)
  events.py         # event(type, **data) helper
  models.py         # task -> model name, cached loaders
  mcp_servers.json  # MCP servers, loaded at startup
  tools/            # one file per tool, ALL_TOOLS and SENSITIVE_TOOLS in __init__.py
  ingestion/        # loader.py, chunking.py, store.py, pipeline.py
  retrieval/        # hybrid.py, rerank.py
  voice/            # stt.py, tts.py
frontend/
docs/
  PLAN.md
```

## Extension points

- **Tools:** one file per `@tool` function in `tools/`, registered with one line in `ALL_TOOLS`.
- **MCP servers:** entries in `mcp_servers.json`. Local servers on by default, online ones in an optional block.
- **Models:** a dict in `models.py` mapping task to model name. Swapping a model means changing one string.
- **Events:** a new event type means one new `case` in the frontend and nothing else.

## Graph

```
START -> guard_input -> agent -> approval -> tools -> agent ... -> END
                          |
                          +-> END (no tool calls)
```

- `guard_input`: prompt-injection check on the user message. Blocked messages end the run with a refusal.
- `agent`: binds enabled tools to `ChatOllama(model=state["model"])`, calls `llm.invoke()`.
- `approval`: if any tool call is in `SENSITIVE_TOOLS`, `interrupt()` and wait. Reject adds a ToolMessage so the agent can adapt.
- `tools`: prebuilt `ToolNode` with `ALL_TOOLS` plus MCP tools.

RAG is a tool (`search_documents`), not a fixed pipeline. The agent decides when to retrieve.

### State

```python
class ChatState(TypedDict):
    messages: Annotated[list, add_messages]
    model: str
    enabled_tools: list[str]
    think: bool
    attachments: Annotated[list[dict], merge_attachments]  # [{doc_id, name}], only grows
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat` | `thread_id`, `message`, `model`, `enabled_tools`, `attachments` (doc ids, must be ready, else 400). Returns an SSE stream |
| POST | `/chat/{thread_id}/resume` | `{"action": "approve" \| "reject"}`. Returns an SSE stream |
| POST | `/documents` | Upload. Returns an SSE stream of ingestion progress |
| GET | `/documents` | The library: `[{doc_id, name, path, size_bytes, pages, chunks, status, error, created_at}]`, newest first |
| GET | `/documents/{doc_id}` | One library row (`status` is ingesting, ready or failed) |
| GET | `/threads` | `?limit=30&before=<cursor>`. Recent chats, newest first, `{threads, next}` |
| GET | `/threads/{thread_id}` | Title, model, tools, think and `messages` rebuilt from the checkpointer in the frontend's shape |
| DELETE | `/threads/{thread_id}` | Removes the thread row and its checkpoints |
| GET | `/models` | `{models, default}` for the model switcher |
| GET | `/tools` | `[{name, description, group, sensitive}]`, `group` is `local` or the MCP server |

## SSE events

Every event is one JSON object with a `type` field.

| type | Payload |
|---|---|
| `token` | `text` |
| `node_start` | `node` |
| `tool_start` | `id`, `name`, `args` |
| `tool_end` | `id`, `name`, `output` (truncated), `ms` |
| `retrieval` | `query`, `hits: [{doc, page, score, text}]` |
| `ingestion` | `doc_id`, `stage` (load/chunk/embed/store), `done`, `total` |
| `interrupt` | `tool_calls`, `thread_id` |
| `guard` | `blocked`, `score` |
| `title` | `title`, `thread_id`. First turn of a new chat only, sent right before `done` |
| `error` | `message` |
| `done` | `trace_id`, `thread_id` |

Source of events: `graph.astream(stream_mode=["messages", "updates", "custom"])`. Tokens come from `messages`, node/tool/interrupt events from `updates`, and retrieval/ingestion events from `custom` via `get_stream_writer()` inside tools.

## Build order

Backend slices are tested with `curl -N` before any frontend work.

- [x] **1. Streaming chat + tracing.** Graph with `agent` only, `/chat` streams `token` and `done`.
  Done when: curl shows tokens live and the run appears in Phoenix.
- [x] **2. Tools.** `tools` node with `get_datetime`, `calculator`, `web_search` (Tavily). `tool_start` / `tool_end` events.
  Done when: asking for the date or a sum triggers the right tool, visible in curl and Phoenix.
- [x] **3. Ingestion.** `/documents` upload, load, chunk, embed into Qdrant, `ingestion` events per stage.
  Done when: uploading a PDF streams progress and the chunks are in Qdrant.
- [x] **4. Retrieval.** `search_documents` tool with hybrid search and reranking, `retrieval` events, sources as the ToolMessage artifact.
  Done when: questions about an uploaded doc are answered with the right chunks cited.
- [x] **5. Human-in-the-loop.** Checkpointer, `approval` node, `interrupt` event, `/resume` endpoint.
  Done when: a sensitive tool pauses the run, and approve/reject both behave correctly.
- [x] **6. MCP.** Load servers from `mcp_servers.json` (start with Filesystem and Fetch).
  Done when: the agent uses an MCP tool exactly like a local one.
- [x] **7. Input guard.** Prompt-injection classifier in `guard_input`.
  Done when: an obvious injection attempt is blocked and logged.
- [x] **8. Frontend: chat.** Next.js chat reading the SSE stream, markdown rendering with Streamdown, code, math, Mermaid.
  Done when: streaming chat works in the browser with rendered markdown.
- [x] **9. Frontend: panels.** Activity panel, Sources panel, approval card, documents page with upload progress.
  Done when: every event type has a visible place in the UI.
- [ ] **10. Polish.** Model switcher, per-chat tool toggles, "View trace" button, docker compose, README, demo video.
- [x] **11. Evals.** One suite per component in `backend/evals/`, public datasets, our own evaluators, run as Phoenix experiments.
  - [x] **11a. Retrieval.** HotpotQA subset in a separate Qdrant folder, hit@5, recall@5, MRR, rerank on vs off.
  - [x] **11b. Answers.** Full graph with `search_documents` and a "Based on the documents" prefix, used-search, contains-answer, answer-recall and a faithfulness judge.
  - [x] **11c. Guard.** `injection_score` on `deepset/prompt-injections`, precision, recall and false positive rate at several thresholds.
  - [x] **11d. Tools.** 31 written prompts across every local tool plus no-tool cases, expected tool vs first tool call.
  Done when: each suite runs with one `uv run python -m evals.<suite>` and shows up as experiments in Phoenix.
- [x] **12. Chat persistence.** Chats survive a reload, like Claude: a URL per chat, paged recents, delete.
  - [x] **12a. Backend threads.** `db.py` with a `threads` table in `app.db`, `GET /threads` (keyset paging), `GET /threads/{id}` (history rebuilt by `history.py`), `DELETE /threads/{id}`.
  - [x] **12b. Frontend chats.** `/c/[id]` route, sidebar loads paged recents from the backend (infinite scroll), open and delete with inline confirm.
  - [x] **12c. Auto titles.** `titles.py` asks the default model for a 3 to 6 word title from the first user message, saved and sent as a `title` event.
  Done when: a refresh reopens any chat with its messages, sources and activity.
- [x] **13. Attachments.** Attach PDFs to a chat like Claude's `+` button; questions only search the attached files.
  - [x] **13a. Backend scoping.** `documents` table with ingestion status, `uploads/{doc_id}/name`, `GET /documents`, `attachments` (doc ids) on `/chat` merged into thread state, search filtered to them, a system note naming the files.
  - [x] **13b. Composer upload.** `+` button and drag-and-drop (PDFs only), chips with ingestion progress, Send blocked while any chip is uploading or failed, chips on sent and reopened messages. Upload logic shared with the Documents page in `lib/upload.ts`.
  - [x] **13c. Library picker.** The `+` opens a menu: Upload PDFs, or From library (searchable list of ready docs, toggles chips that are ready at once). The Documents page lists the whole library with status, and "Ask about this" opens `/?attach={doc_id}`.
  Done when: two chats with different attachments get answers only from their own files.

- [x] **14. Voice mode.** Talk to the agent and hear it answer, all local (F1 in `FUNTODOS.md`).
  - [x] **14a. Backend.** `voice/stt.py` (Parakeet via onnx-asr) and `voice/tts.py` (Kokoro via kokoro-onnx), both lazy `@lru_cache` loaders. `routes/voice.py` with `POST /voice/transcribe` (16-bit WAV in, `{text}` out) and `POST /voice/speak` (`{text}` in, WAV out).
  - [x] **14b. Mic button.** Push-to-talk in the composer. The browser records, resamples to 16 kHz mono WAV, posts it, and the transcript is appended to the input (no auto-send). Auto-stops at 25 s.
  - [x] **14c. Speaker button.** On each assistant answer. Markdown stripped (code skipped, tables announced), split into sentences, sentence n+1 fetched while n plays. One reply plays at a time.
  - [x] **14d. Auto-read.** A turn that started from the mic is read aloud when it finishes (after the approval, if it paused for one). What's playing lives in a small store in `lib/voice.ts`, so the answer's speaker button shows Stop either way.
  Done when: ask a question by voice, edit the transcript, send, and hear the answer start within about a second.

- [x] **15. Ask about images.** Attach a screenshot or photo and ask a vision model about it (F2 in `FUNTODOS.md`).
  - [x] **15a. Backend.** `images.py` stores images under a content hash in `uploads/images`. `routes/images.py` with `POST /images` (png, jpeg, webp, 10 MB cap) and `GET /images/{id}`. `/chat` takes `images`, kept as ids on the HumanMessage; `with_images` in the agent node sends the real image only to models Ollama lists with `vision`, others get `[image: name]`. `models.py` caches Ollama capabilities for `/models` (`thinking`, `vision`) and the agent. `num_ctx` raised to 8192, since tool schemas plus an image overflow Ollama's 4096 default.
  - [x] **15b. Composer.** "Upload images" in the `+` menu and drag-and-drop, downscaled in the browser to 1536 px before upload. Thumbnail chips in the composer, thumbnails on sent and reopened messages. Send is blocked with a hint while images are attached and the model can't see.
  Done when: ask qwen3-vl about a screenshot, then continue the same chat on a text model without errors.

- [x] **16. Draw tool.** The agent draws pictures with a local diffusion model (F3 in `FUNTODOS.md`). Ollama 0.40.9 has no image generation, so it runs in process.
  - [x] **16a. Backend.** `imagegen.py` loads SDXL Turbo with `diffusers` on MPS on first use (2 steps, 512x512, no guidance) and frees it after 5 idle minutes. All torch work runs on one worker thread, since MPS hung when the pipeline was used from several tool threads. The fp16-fix VAE replaces the stock one, whose fp32 upcast next to Ollama made the GPU thrash. `tools/generate_image.py` stores the PNG with `save_image`, emits an `image` event, and returns the id as the artifact so `history.py` rebuilds it. Sensitive, so the approval card shows the prompt first.
  - [x] **16b. Frontend.** `image` events render inline above the answer with `ImageThumb`, live and on reopened chats.
  Done when: approve two drawings in a row in one chat, both show inline and survive a refresh, and a rejected call shows no image.
- [x] **17. Gmail.** Read-only Gmail tools so the agent can pull, search and summarize my mail (I1 in `INTEGRATIONS.md`, which lists the limitations).
  - [x] **17a. Auth, search and read.** `integrations/google_auth.py` does a one-time browser login with the `gmail.readonly` scope and keeps the token in `secrets/`. `integrations/gmail.py` turns `since` (`24h`, `7d`, `1m`, `2026-10-01..2026-10-15`) into Gmail `after:`/`before:`, searches with metadata batches and cleans bodies. Snippets, subjects and bodies go through the injection guard. `tools/gmail.py` adds `search_emails` and `read_email`, registered only when the token exists. Answer links open in a new tab without Streamdown's confirm dialog.
  - Skipped **17b. Insights** (`email_insights` with stats and map-reduce over long ranges): overviews of the last day or two already work from one `search_emails` call.
  - Skipped **17c. UI and cache**: the tools menu already shows a gmail group when connected, and searches take under 2 s.
  Done when: "unread from the last 24h", "emails from X this month" and "open the second one" work in chat, and the app starts fine without a token.

- [ ] **18. Calendar and briefing.** Read-only Google Calendar tools and an on-demand morning briefing (I2 and I5 in `INTEGRATIONS.md`).
  - [ ] **18a. Calendar.** `google_auth.py` adds the `calendar.readonly` scope and loads the token with the scopes it was saved with, so a Gmail-only token keeps working. `integrations/google_calendar.py` reads all my calendars: `parse_when` (`today`, `tomorrow`, `this week`, `next week`, `7d`, a date or a range), events from one batch request, free slots from Google's freebusy within working hours. Titles and locations go through the guard. `tools/google_calendar.py` adds `list_events` and `free_slots`, registered only when the token has the calendar scope.
  - [ ] **18b. Briefing on demand.** `briefing.py` gathers the last 24h of mail (no promotions or social), today's events and the weather (Open-Meteo), writes the digest with one model call and saves it as a thread, so follow-ups work. `POST /briefing` and a Briefing button in the sidebar.
  - [ ] **18c. Scheduled briefing (later).** Run the briefing at a set time from the backend, skip if today's exists. GitHub reviews join it once I7 exists.
  Done when: "what's on my calendar this week", "when am I free tomorrow for an hour" and "prep me for my next meeting" work in chat, and the Briefing button opens a new chat with today's digest.

## Later ideas

Deep research subgraph, long-term memory, conversation branching, artifacts pane, voice input/output, `guard_output` node, rename and search chats, `@` mentions for documents, full-text context for small documents.

## Decisions log

- Qdrant over pgvector.
- Qdrant in local mode, no Docker. The folder is locked to one process, so inspect it through the API or with the server stopped.
- Dense and sparse (BM25) vectors are both stored at ingest so hybrid search needs no re-ingestion.
- Ids are stable (sha256 of file bytes, uuid5 per chunk) so re-uploading a file overwrites rather than duplicates.
- Page numbers from pymupdf4llm are 0-indexed; add 1 when showing citations.
- RAG as a tool rather than a fixed graph path.
- Hybrid search is one Qdrant query (dense + BM25 fused with RRF), top 20, then a cross-encoder reranks to top 5.
- Sources ride on the `search_documents` ToolMessage `artifact` instead of a `sources` state key: no reducer conflicts on parallel calls, and they stay tied to their turn once the checkpointer lands.
- Tools emit fully formed events through `get_stream_writer()`; `/chat` forwards every `custom` chunk as is.
- Voice runs on ONNX (onnx-asr, kokoro-onnx) instead of NeMo or PyTorch: same onnxruntime as the guard and fastembed, small install, espeak bundled by `espeakng-loader`.
- The browser converts recordings to 16 kHz WAV, so the backend needs no ffmpeg and reads audio with the stdlib `wave` module.
- Replies are spoken by fetching one sentence at a time from a plain `POST /voice/speak`, prefetching the next while one plays. Fast enough (about 0.2 s per sentence warm) that no streaming audio endpoint is needed.
- Voice calls are not traced; Phoenix stays focused on LLM spans.
- SQLite checkpointer for local-first simplicity.
- One SQLite file (`app.db`) holds LangGraph's checkpoints and our own tables; our code uses stdlib `sqlite3` with a short-lived connection per call.
- The checkpointer is the source of truth for messages. The `threads` table is only an index for the sidebar; `GET /threads/{id}` rebuilds the UI messages and events from the checkpoint (no `ms` or `trace_id`, those are not stored).
- Titles come from the first user message only (like Claude), so they also work when the first turn stops at an approval. The frontend treats `title` like `done` when checking for a pending interrupt.
- Questions only search the chat's attached documents (`search_scope = "attachments"`). A chat with none is not offered `search_documents` at all. Evals set `search_scope = "all"` to search the whole HotpotQA collection.
- Attachment names come from the `documents` table, never from the client. Each user message keeps its turn's attachments in `additional_kwargs` so history can show them.
- The frontend only accepts PDFs (picker and drop). The backend itself would also ingest anything PyMuPDF opens, such as `.txt`.
- `/?attach={doc_id}` is read with `useSearchParams` (so `/` renders `Chat` inside `<Suspense>`), adds the chip add-only (dev mode runs effects twice) and is cleared with `replaceState` so a refresh does not attach again.
- Uploads live in `uploads/{doc_id}/{name}`; the `documents` row tracks ingestion status so the library can show failed or in-progress files.
- Recent chats use keyset paging on `(updated_at, thread_id)` so pages stay stable while new chats arrive.
- The URL decides which chat is open (`/` new, `/c/{id}` saved). `Chat` reads `usePathname()` instead of route params, so a new chat can take its URL with `history.replaceState` after the first `done` without remounting. Next 16 keeps visited routes mounted but hidden (`Activity`), so state must follow the URL, not mount.
- Single event vocabulary with a `type` field for all streams.
- Tavily for web search; the one online dependency, needs `TAVILY_API_KEY`.
- `save_note` is the first sensitive tool; more join `SENSITIVE_TOOLS` with one line each.
- A reject answers every tool call in that AIMessage (each call needs a ToolMessage), then the agent adapts.
- Root spans carry `session.id = thread_id`, so a chat and its resumes form one Phoenix session.
- MCP servers live in `mcp_servers.json` in `MultiServerMCPClient` format and are loaded once at startup into `ALL_TOOLS`. A server that fails to start is logged and skipped.
- MCP sessions are stateless (one stdio process per call). Simple, but each call pays the spawn cost (~20s for `npx` filesystem); persistent sessions can come later if it hurts.
- The filesystem server is rooted at `backend/workspace/`. Its write tools (`write_file`, `edit_file`, `move_file`, `create_directory`) are in `SENSITIVE_TOOLS`.
- `tool_end` output uses `msg.text` so MCP content blocks read like plain local tool output.
- Input guard is `protectai/deberta-v3-base-prompt-injection-v2` run with onnxruntime + tokenizers (no torch), blocking at score >= 0.9. Benign text mentioning "ignore" can score ~0.88, so the threshold stays high.
- Only the user message is checked. Tool and RAG output are not (that would be a `guard_output` or per-tool check later).
- A blocked turn ends with a refusal AIMessage (score in `response_metadata`) so thread history stays coherent, plus a `guard` event and a warning log line.
- The frontend calls the API directly with CORS (`cors_origins` in config) rather than through a Next proxy, which can buffer SSE.
- SSE is read with `fetch` and a ~25 line parser in `lib/sse.ts`, since `EventSource` cannot POST. No client library.
- Streamdown v2 needs its plugins (`@streamdown/code`, `math`, `mermaid`) installed and passed in. Inline `$...$` math is on, so text with two dollar prices can occasionally render as math.
- Phoenix is not a backend dependency; run it with `uvx --from arize-phoenix phoenix serve`. If it is down, span export retries slow every request, so start it first.
- `node_start` comes from LangGraph's `tasks` stream mode: a task chunk without a `result` key is a node starting.
- Each assistant message keeps its own non-token events; the Activity and Sources panels show the latest turn, or an older one when clicked.
- A resumed run streams into the same assistant message. Sending is disabled while an approval is pending.
- The documents page lists only uploads from the current browser session; there is no list endpoint yet.
- The model switcher offers `chat_models` from config: installed Ollama models with the `tools` capability (qwen3:8b, gpt-oss, llama3.1:8b, qwen2.5-coder:14b).
- Tool toggles live in graph state (`enabled_tools`), so they are per thread and resumes keep them. Missing means all tools; the agent binds only the enabled ones while `ToolNode` keeps all.
- MCP tools carry their server name in `tool.metadata["server"]` so the UI can group them.
- "View trace" links to Phoenix's `/redirects/traces/{trace_id}`, which finds the project itself. The Phoenix UI URL comes from `NEXT_PUBLIC_PHOENIX_URL`.
- Gmail is our own tools on the Gmail API, not an MCP server, so we control what reaches an 8K context. Read-only scope; the token lives in `backend/secrets/` and the tools only register when it exists.
- The Gmail API client is built per call: its HTTP layer is not thread-safe and tool calls run in parallel.
- Email text goes through the injection guard, subject and snippet checked separately. Invisible preview padding (U+034F, zero-width characters) and long tracking URLs both pushed normal marketing mail over 0.9, so they are stripped first (links become `[link: domain]`). That took false positives on two days of real mail from 7 of 36 to 1 (a login code, which is fine to hide).
- `resultSizeEstimate` is too rough to show (201 for unrelated queries), so search only says whether Gmail has another page.
