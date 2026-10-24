# Fun todos

Ideas pulled from Hugging Face (trending models and Spaces, October 2026) that would make the app more fun to use. Each one plugs into something we already have: SSE streaming, the tools folder, attachments, the MCP loader or the Qdrant library. Pick one, then move it into `PLAN.md` as a numbered slice.

## Summary

| # | Idea | Models | Runs locally? | Effort |
|---|---|---|---|---|
| F1 | Voice mode (done, slice 14) | Parakeet 0.6B, Kokoro 82M | Yes, easily | Medium |
| F2 | Ask about images | Qwen3.5 4B/9B vision via Ollama | Yes | Small |
| F3 | Draw tool | SDXL Turbo (3B) | Yes, but heavy | Medium |
| F4 | HF Spaces over MCP | Whatever the Space runs | No, cloud | Small |
| F5 | Chat with audio | Parakeet + pyannote diarization | Yes | Medium |
| F6 | Quiz me on my docs | Current chat model | Yes | Small |
| F7 | Better OCR for scans | Nemotron-3.5-Parse 0.6B | Yes | Small |
| F8 | Embedding bake-off | embeddinggemma-2 0.7B | Yes | Small |

Machine: M4 Pro, 24 GB unified memory. The chat model (`qwen3:8b`, about 6 GB loaded) plus any one extra from this list fits comfortably. Image generation next to `gpt-oss` (13 GB) will not.

## Todos

- [x] **F1. Voice mode.** Mic button in the composer, speaker button on assistant messages.
  - Speech to text: `nvidia/parakeet-tdt-0.6b-v2` (fast, English) or `nvidia/nemotron-3.5-asr-streaming-0.6b` (live partial transcripts). Fallback `openai/whisper-large-v3`.
  - Text to speech: `hexgrad/Kokoro-82M`, or `gradium/phonon-40m-en` if we want even smaller.
  - Backend: `POST /transcribe` (audio in, text out) and `POST /speak` (text in, audio out). One file each.
  - Local: yes. Both models are under 1 GB and fine on CPU or MPS.

- [ ] **F2. Ask about images.** Attach a screenshot or photo like a PDF and ask about it.
  - A vision chat model in Ollama (Qwen3.5 4B or 9B, or another vision tag Ollama ships). Image goes in the message, no ingestion needed.
  - Extends the slice 13 `+` menu with image types.
  - Local: yes, about 3 to 6 GB. The model switcher already exists, so this is mostly frontend plus passing image bytes through.

- [ ] **F3. Draw tool.** `generate_image` tool the agent can call, image shown inline in the chat.
  - `stabilityai/sdxl-turbo` via `diffusers` on MPS, 1 to 4 steps. Upgrade path: `FLUX-3-Image-Klein` GGUF.
  - Goes in `SENSITIVE_TOOLS` so the approval card shows before it runs (it is slow).
  - Local: yes, about 7 GB and a few seconds per image. Unload Ollama models first if memory is tight.

- [ ] **F4. Hugging Face Spaces over MCP.** Add the Hugging Face MCP server to the optional online block in `mcp_servers.json`.
  - Gives the agent Spaces like TRELLIS.2 (image to 3D), image editors and video models.
  - Local: no. Runs on HF's GPUs and needs an HF token. Opt in only, matching the local-first rule.

- [ ] **F5. Chat with audio.** Upload a meeting or podcast, ask "what did Sam promise to do?"
  - Transcribe with the F1 model, label speakers with `pyannote/speaker-diarization-community-1`, then feed the transcript into the existing ingestion pipeline.
  - Local: yes. Diarization is slow on long files but fine in the background with ingestion progress events. pyannote needs a free HF token to download.
  - Depends on F1.

- [ ] **F6. Quiz me on my docs.** Flashcards generated from random Qdrant chunks of the attached or library docs.
  - No new models. One endpoint, one small UI card that flips.
  - Local: yes.

- [ ] **F7. Better OCR for scans.** Try a small OCR model instead of Tesseract for image-only PDFs.
  - `nvidia/Nemotron-3.5-Parse` (0.6B) or `ATH-MaaS/OvisOCR3` (0.9B). Keeps tables and layout better than Tesseract.
  - Local: yes. Swap inside `ingestion/loader.py` behind a config flag, compare on a few real scans.

- [ ] **F8. Embedding bake-off.** Run the 11a retrieval evals with `google/embeddinggemma-2` against `qwen3-embedding:0.6b`.
  - Needs a separate eval Qdrant folder, which we already have.
  - Local: yes. Only worth switching if hit@5 and MRR clearly improve.

## Notes

- Sizes come from Hugging Face listing pages, which are sometimes wrong. Check the model card before downloading.
- Prefer models Ollama can serve. Fall back to `transformers` / `diffusers` / `onnxruntime` in process only when Ollama has no build.
