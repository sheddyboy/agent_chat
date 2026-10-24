import io
import threading

from config import settings

# torch and diffusers are imported inside the functions: together they add about
# 10 s to backend startup, which only the first drawing should pay

_pipe = None
_timer = None
# The pipeline is not thread-safe, and tools run in a thread pool
_lock = threading.Lock()


def _unload():
    import torch

    global _pipe
    with _lock:
        _pipe = None
        torch.mps.empty_cache()


def generate(prompt: str) -> bytes:
    """Draw a 512x512 image with SDXL Turbo on MPS and return it as PNG bytes."""
    import torch
    from diffusers import AutoPipelineForText2Image

    global _pipe, _timer
    with _lock:
        if _timer:
            _timer.cancel()
        if _pipe is None:
            _pipe = AutoPipelineForText2Image.from_pretrained(
                settings.image_model, dtype=torch.float16, variant="fp16"
            ).to("mps")
        # Turbo is trained without classifier-free guidance, so it must be off
        image = _pipe(
            prompt=prompt, num_inference_steps=settings.image_steps, guidance_scale=0.0
        ).images[0]
        # Keep the model warm for follow-up drawings, then give the memory back
        _timer = threading.Timer(settings.image_unload_after_s, _unload)
        _timer.daemon = True
        _timer.start()
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()
