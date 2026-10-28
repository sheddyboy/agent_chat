from guardrails.classify import classify
from guardrails.policy import GUARDS, INPUT


def run(name: str, text: str) -> dict:
    """One guard on the text: its top flagged label, that label's score, and whether it fired."""
    guard = GUARDS[name]
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


def check_input(text: str) -> dict:
    """Every input guard on a user message; blocked if any blocking guard fired."""
    findings = [run(name, text) for name in INPUT]
    blocked = any(f["flagged"] and f["action"] == "block" for f in findings)
    return {"blocked": blocked, "findings": findings}
