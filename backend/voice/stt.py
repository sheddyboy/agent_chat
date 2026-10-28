import io
import wave
from functools import lru_cache

import numpy as np
import onnx_asr
from core.config import settings


@lru_cache
def recognizer():
    # First call downloads the model from Hugging Face, then it loads from the cache
    return onnx_asr.load_model(settings.stt_model, quantization="int8")


def read_wav(data: bytes) -> tuple[np.ndarray, int]:
    """16-bit PCM WAV bytes to a mono float32 waveform and its sample rate."""
    with wave.open(io.BytesIO(data)) as w:
        if w.getsampwidth() != 2:
            raise ValueError("expected 16-bit PCM WAV")
        frames = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        samples = frames.reshape(-1, w.getnchannels()).mean(axis=1)
        return (samples / 32768).astype(np.float32), w.getframerate()


def transcribe(data: bytes) -> str:
    waveform, rate = read_wav(data)
    return recognizer().recognize(waveform, sample_rate=rate).strip()
