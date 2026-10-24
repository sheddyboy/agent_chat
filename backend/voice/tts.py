import io
import urllib.request
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np
from config import settings
from kokoro_onnx import Kokoro

RELEASE = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
)
MODEL_FILES = ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")


@lru_cache
def kokoro() -> Kokoro:
    # The model is not on Hugging Face in this format, so fetch it once from the release
    folder = Path(settings.voice_dir)
    folder.mkdir(parents=True, exist_ok=True)
    for name in MODEL_FILES:
        if not (folder / name).exists():
            urllib.request.urlretrieve(f"{RELEASE}/{name}", folder / name)
    return Kokoro(*(str(folder / name) for name in MODEL_FILES))


def speak(text: str) -> bytes:
    """Text to a 16-bit mono WAV."""
    audio, rate = kokoro().create(
        text, voice=settings.tts_voice, speed=settings.tts_speed
    )
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()
