import base64
import hashlib
import re
from pathlib import Path

from core.config import settings

IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MIME_TYPES = {ext: mime for mime, ext in IMAGE_TYPES.items()}


def save_image(data: bytes, content_type: str) -> str:
    """Store an image under its content hash, so the same image is kept once."""
    image_id = hashlib.sha256(data).hexdigest()[:16]
    path = Path(settings.image_dir) / f"{image_id}{IMAGE_TYPES[content_type]}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return image_id


def image_path(image_id: str) -> Path | None:
    # Ids are hex only, so one can never point outside image_dir
    if not re.fullmatch(r"[0-9a-f]{16}", image_id):
        return None
    return next(Path(settings.image_dir).glob(f"{image_id}.*"), None)


def image_block(path: Path) -> dict:
    """A LangChain image content block, which ChatOllama passes to the model."""
    return {
        "type": "image",
        "base64": base64.b64encode(path.read_bytes()).decode(),
        "mime_type": MIME_TYPES[path.suffix],
    }
