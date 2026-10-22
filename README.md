# Agent Chat

A local-first agentic chat platform. See [docs/PLAN.md](docs/PLAN.md) for the design and build order.

## Run

Needs Ollama running with `qwen3:8b` and `qwen3-embedding:0.6b` pulled.

```bash
# 1. Tracing (http://localhost:6006)
uvx --from arize-phoenix phoenix serve

# 2. Backend (http://localhost:8000)
cd backend && uv run uvicorn main:app --port 8000

# 3. Frontend (http://localhost:3000)
cd frontend && pnpm install && pnpm dev
```

The frontend reads the API URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
