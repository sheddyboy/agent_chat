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
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat` | `thread_id`, `message`, `model`, `enabled_tools`. Returns an SSE stream |
| POST | `/chat/{thread_id}/resume` | `{"action": "approve" \| "reject"}`. Returns an SSE stream |
| POST | `/documents` | Upload. Returns an SSE stream of ingestion progress |
| GET | `/documents/{doc_id}` | Chunk count for a document |
| GET | `/threads/{thread_id}` | Thread history from the checkpointer |

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
- [ ] **8. Frontend: chat.** Next.js chat reading the SSE stream, markdown rendering with Streamdown, code, math, Mermaid.
  Done when: streaming chat works in the browser with rendered markdown.
- [ ] **9. Frontend: panels.** Activity panel, Sources panel, approval card, documents page with upload progress.
  Done when: every event type has a visible place in the UI.
- [ ] **10. Polish.** Model switcher, per-chat tool toggles, "View trace" button, docker compose, README, demo video.

## Later ideas

Deep research subgraph, eval dashboard (RAGAS / Phoenix evals), long-term memory, conversation branching, artifacts pane, voice input/output, image generation, `guard_output` node.

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
- SQLite checkpointer for local-first simplicity.
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
