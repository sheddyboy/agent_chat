from pathlib import Path

from jobs import runner
from core.config import settings
from documents.store import get_document, list_documents
from fastapi import APIRouter, HTTPException, UploadFile
from documents.ingestion.pipeline import make_doc_id, stream_ingest
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/documents", tags=["documents"])


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
