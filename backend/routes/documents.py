from pathlib import Path

from jobs import runner
from core.config import settings
from core.db import get_document, list_documents
from core.events import event
from fastapi import APIRouter, HTTPException, UploadFile
from ingestion.pipeline import ingest, make_doc_id
from sse_starlette.sse import EventSourceResponse
from core.tracing import tracer

router = APIRouter(prefix="/documents", tags=["documents"])


async def stream_ingest(path: Path, doc_name: str):
    with tracer.start_as_current_span(
        "ingest", openinference_span_kind="chain"
    ) as span:
        span.set_input(doc_name)
        trace_id = format(span.get_span_context().trace_id, "032x")
        try:
            async for ev in ingest(str(path), doc_name):
                yield ev
        except Exception as e:
            span.record_exception(e)
            yield event("error", message=str(e))
        yield event("done", trace_id=trace_id)


@router.post("")
async def upload_document(file: UploadFile):
    if not file.filename:
        raise HTTPException(400, "file has no filename")
    data = await file.read()
    name = Path(file.filename).name
    # One folder per content hash, so two files with the same name never collide
    path = Path(settings.upload_dir) / make_doc_id(data) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    # A job, so ingestion finishes even if the page closes; the same file twice joins one job
    doc_id = make_doc_id(data)
    job_id = runner.running("ingest", doc_id) or runner.start("ingest", doc_id, stream_ingest(path, name))
    return EventSourceResponse(runner.follow(job_id))


@router.get("")
def documents():
    return list_documents()


@router.get("/{doc_id}")
def document_info(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    return doc
