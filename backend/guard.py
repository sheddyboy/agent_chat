from functools import lru_cache

import numpy as np
from config import settings
from huggingface_hub import hf_hub_download
from onnxruntime import InferenceSession
from tokenizers import Tokenizer


@lru_cache
def classifier() -> tuple[InferenceSession, Tokenizer]:
    session = InferenceSession(hf_hub_download(settings.guard_model, "onnx/model.onnx"))
    tokenizer = Tokenizer.from_file(hf_hub_download(settings.guard_model, "onnx/tokenizer.json"))
    tokenizer.enable_truncation(512)
    return session, tokenizer


def injection_score(text: str) -> float:
    """Probability (0-1) that the text is a prompt-injection attempt."""
    session, tokenizer = classifier()
    enc = tokenizer.encode(text)
    feed = {
        "input_ids": np.array([enc.ids], dtype=np.int64),
        "attention_mask": np.array([enc.attention_mask], dtype=np.int64),
    }
    # Only feed the inputs this export declares
    names = {i.name for i in session.get_inputs()}
    logits = session.run(None, {k: v for k, v in feed.items() if k in names})[0][0]
    probs = np.exp(logits - logits.max())
    return float(probs[1] / probs.sum())  # label 1 is INJECTION
