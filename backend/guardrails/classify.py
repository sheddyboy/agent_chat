from functools import lru_cache
from threading import Lock

from transformers import pipeline

# Metal is not thread-safe: two requests loading or running a model at once crash the process
GPU = Lock()


@lru_cache
def classifier(model: str):
    # top_k=None returns every label's score, not just the winner
    return pipeline("text-classification", model=model, top_k=None, truncation=True)


def classify(model: str, text: str) -> dict[str, float]:
    """Every label's score for the text, e.g. {"SAFE": 0.02, "INJECTION": 0.98}."""
    with GPU:
        results = classifier(model)([text])[0]
    return {r["label"]: r["score"] for r in results}
