from functools import lru_cache

from transformers import pipeline


@lru_cache
def classifier(model: str):
    # top_k=None returns every label's score, not just the winner
    return pipeline("text-classification", model=model, top_k=None, truncation=True)


def classify(model: str, text: str) -> dict[str, float]:
    """Every label's score for the text, e.g. {"SAFE": 0.02, "INJECTION": 0.98}."""
    return {r["label"]: r["score"] for r in classifier(model)([text])[0]}
