from images.generate import generate
from images.store import save_image
from langchain_core.tools import tool
from langgraph.config import get_stream_writer


@tool(response_format="content_and_artifact")
def generate_image(prompt: str) -> tuple[str, dict]:
    """Draw a picture from a text description. Use when the user asks to draw, create or
    generate an image. `prompt` is a detailed English description of the picture. Needs user approval."""
    image_id = save_image(generate(prompt), "image/png")
    image = {"image_id": image_id, "prompt": prompt}
    get_stream_writer()({"type": "image", **image})
    return "Generated a 512x512 image, it is already shown to the user.", image
