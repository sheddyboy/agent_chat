from pathlib import Path

from core.config import settings
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from images import IMAGE_TYPES, image_path, save_image

router = APIRouter(prefix="/images", tags=["images"])


@router.post("")
async def upload_image(file: UploadFile):
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(400, "only png, jpeg and webp images are supported")
    data = await file.read()
    if len(data) > settings.image_max_mb * 1024 * 1024:
        raise HTTPException(400, f"image is over {settings.image_max_mb} MB")
    return {"image_id": save_image(data, file.content_type), "name": Path(file.filename or "image").name}


@router.get("/{image_id}")
def get_image(image_id: str):
    path = image_path(image_id)
    if not path:
        raise HTTPException(404, "image not found")
    return FileResponse(path)
