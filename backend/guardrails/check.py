from guardrails.classify import classify
from guardrails.pii import model_spans, redact, regex_spans
from guardrails.policy import GUARDS, INPUT


def run(name: str, text: str) -> dict:
    """One guard on the text: its top flagged label, that label's score, and whether it fired."""
    guard = GUARDS[name]
    if guard.get("task") == "spans":
        return run_spans(name, guard, text)
    scores = classify(guard["model"], text)
    label = max(guard["flag"], key=lambda f: scores.get(f, 0.0))
    score = round(scores.get(label, 0.0), 4)
    return {
        "guard": name,
        "model": guard["model"],
        "label": label,
        "score": score,
        "flagged": score >= guard["threshold"],
        "action": guard["action"],
        "scores": {k: round(v, 4) for k, v in scores.items()},
    }


def run_spans(name: str, guard: dict, text: str) -> dict:
    """A span guard: the parts of the text to redact, found by the model and by regex."""
    found = [
        s
        for s in model_spans(guard["model"], text) + regex_spans(text)
        if s["label"] in guard["redact"] and s["score"] >= guard["threshold"]
    ]
    return {
        "guard": name,
        "model": guard["model"],
        "label": ", ".join(sorted({s["label"] for s in found})),
        "score": round(max((s["score"] for s in found), default=0.0), 4),
        "flagged": bool(found),
        "action": guard["action"],
        "spans": [{**s, "score": round(s["score"], 4)} for s in found],
    }


def check_input(text: str) -> dict:
    """Every input guard on a user message: blocked if any blocking guard fired,
    and the text with every redact guard's spans replaced."""
    findings = [run(name, text) for name in INPUT]
    blocked = any(f["flagged"] and f["action"] == "block" for f in findings)
    spans = [s for f in findings if f["flagged"] and f["action"] == "redact" for s in f["spans"]]
    return {"blocked": blocked, "findings": findings, "text": redact(text, spans) if spans else text}
