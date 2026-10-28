import re
from functools import lru_cache

from transformers import pipeline

# Digits in groups, as people type card numbers; luhn() rejects the random ones
CARD = re.compile(r"\b\d(?:[ -]?\d){12,18}\b")
IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b")
# Spans come back with a leading space or a trailing full stop
EDGE = " \t\n.,;:!?"


@lru_cache
def tagger(model: str):
    # Labels each token, and "simple" merges B-/I- pieces into whole spans
    tag = pipeline("token-classification", model=model, aggregation_strategy="simple", stride=64)
    # Unset in the tokenizer config, which would let one pass run past the trained length.
    # At 512, long text is read in overlapping windows (the stride) instead
    tag.tokenizer.model_max_length = 512
    return tag


def luhn(digits: str) -> bool:
    """The checksum every real card number passes."""
    total = 0
    for i, d in enumerate(reversed(digits)):
        n = int(d) * (2 if i % 2 else 1)
        total += n - 9 if n > 9 else n
    return total % 10 == 0


def model_spans(model: str, text: str) -> list[dict]:
    spans = []
    for e in tagger(model)(text):
        start, end = e["start"], e["end"]
        while start < end and text[start] in EDGE:
            start += 1
        while end > start and text[end - 1] in EDGE:
            end -= 1
        if start < end:
            spans.append({"label": e["entity_group"], "start": start, "end": end, "score": float(e["score"]), "source": "model"})
    return spans


def regex_spans(text: str) -> list[dict]:
    """Exact patterns the model may miss; labels match the model's so one redact list covers both."""
    spans = [
        {"label": "CREDITCARDNUMBER", "start": m.start(), "end": m.end(), "score": 1.0, "source": "regex"}
        for m in CARD.finditer(text)
        if luhn(re.sub(r"\D", "", m[0]))
    ]
    spans += [
        {"label": "ACCOUNTNUM", "start": m.start(), "end": m.end(), "score": 1.0, "source": "regex"}
        for m in IBAN.finditer(text)
    ]
    return spans


def redact(text: str, spans: list[dict]) -> str:
    """Replace each span with [LABEL]; overlapping spans (model and regex on one number) become one."""
    merged = []
    for s in sorted(spans, key=lambda s: s["start"]):
        if merged and s["start"] < merged[-1]["end"]:
            merged[-1] = {**merged[-1], "end": max(merged[-1]["end"], s["end"])}
        else:
            merged.append(s)
    for s in reversed(merged):
        text = f"{text[: s['start']]}[{s['label']}]{text[s['end'] :]}"
    return text
