import asyncio
import hashlib
import uuid
from pathlib import Path

from core.db import set_document_status, upsert_document
from core.events import event

from ingestion.chunking import chunk_pages
from ingestion.loader import load_pages
from ingestion.store import count, vector_store

BATCH = 32


def make_doc_id(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


async def ingest(path: str, doc_name: str):
    """Yield one `ingestion` event per stage step and keep the documents row current.
    Blocking work runs in a thread."""
    doc_id = make_doc_id(Path(path).read_bytes())
    upsert_document(doc_id, doc_name, path, Path(path).stat().st_size)
    try:
        async for ev in run_stages(path, doc_id, doc_name):
            yield ev
    except Exception as e:
        set_document_status(doc_id, "failed", error=str(e))
        raise


async def run_stages(path: str, doc_id: str, doc_name: str):
    pages = await asyncio.to_thread(load_pages, path)
    yield event("ingestion", doc_id=doc_id, stage="load", done=len(pages), total=len(pages))

    chunks = chunk_pages(pages, doc_id, doc_name)
    total = len(chunks)
    yield event("ingestion", doc_id=doc_id, stage="chunk", done=total, total=total)

    # Stable ids so re-uploading the same file overwrites instead of duplicating
    ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:{i}")) for i in range(total)]
    store = await asyncio.to_thread(vector_store)
    for start in range(0, total, BATCH):
        end = start + BATCH
        await asyncio.to_thread(store.add_documents, chunks[start:end], ids=ids[start:end])
        yield event("ingestion", doc_id=doc_id, stage="embed", done=min(end, total), total=total)

    stored = await asyncio.to_thread(count, doc_id)
    set_document_status(doc_id, "ready", pages=len(pages), chunks=stored)
    yield event("ingestion", doc_id=doc_id, stage="store", done=stored, total=total)
