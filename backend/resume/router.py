from resume import latex
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/resume", tags=["resume"])


class Source(BaseModel):
    tex: str


class Version(BaseModel):
    name: str


@router.get("")
async def get_resume():
    # The first visit compiles the template, which can take a few seconds
    return await run_in_threadpool(latex.info)


@router.put("")
async def put_resume(body: Source):
    # 200 either way: a compile error is a normal result the editor shows
    ok, log = await run_in_threadpool(latex.save, body.tex)
    return {"ok": ok, "log": log, **(await run_in_threadpool(latex.info))}


@router.get("/pdf")
def pdf():
    path = latex.pdf_path()
    if not path.exists():
        raise HTTPException(404, "no PDF yet")
    return FileResponse(path, media_type="application/pdf", headers={"Cache-Control": "no-store"})


@router.get("/history")
def history():
    return latex.history()


@router.post("/restore")
async def restore(body: Version):
    ok, log = await run_in_threadpool(latex.restore, body.name)
    return {"ok": ok, "log": log, **(await run_in_threadpool(latex.info))}
