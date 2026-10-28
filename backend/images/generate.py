import io
import threading
from concurrent.futures import ThreadPoolExecutor

from core.config import settings

# torch and diffusers are imported inside the functions: together they add about
# 10 s to backend startup, which only the first drawing should pay

_pipe = None
_timer = None
# MPS hangs when one pipeline is used from several threads, and tools run on any
# thread of a pool. So all torch work runs on this one thread, one call at a time.
_worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="imagegen")


def _load():
    import torch
    from diffusers import AutoencoderKL, AutoPipelineForText2Image

    # The stock SDXL VAE overflows in fp16, so diffusers upcasts it to fp32 for every
    # decode. Next to Ollama that peak made the GPU thrash (10 s+ per image); this
    # VAE is fine-tuned to stay in fp16.
    vae = AutoencoderKL.from_pretrained(settings.image_vae, dtype=torch.float16)
    return AutoPipelineForText2Image.from_pretrained(
        settings.image_model, vae=vae, dtype=torch.float16, variant="fp16"
    ).to("mps")


def _unload():
    import torch

    global _pipe
    _pipe = None
    torch.mps.empty_cache()


def _generate(prompt: str) -> bytes:
    import torch

    global _pipe, _timer
    if _timer:
        _timer.cancel()
    if _pipe is None:
        _pipe = _load()
    # Turbo is trained without classifier-free guidance, so it must be off
    image = _pipe(
        prompt=prompt, num_inference_steps=settings.image_steps, guidance_scale=0.0
    ).images[0]
    # Hand torch's cached buffers back so Ollama keeps room between drawings
    torch.mps.empty_cache()
    # Keep the model warm for follow-up drawings, then give the memory back
    _timer = threading.Timer(settings.image_unload_after_s, _worker.submit, [_unload])
    _timer.daemon = True
    _timer.start()
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def generate(prompt: str) -> bytes:
    """Draw a 512x512 image with SDXL Turbo on MPS and return it as PNG bytes."""
    return _worker.submit(_generate, prompt).result()
