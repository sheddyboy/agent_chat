import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from guardrails.check import run
from guardrails.classify import classify
from guardrails.policy import GUARDS, INPUT

router = APIRouter(prefix="/guardrails", tags=["guardrails"])


class CheckRequest(BaseModel):
    text: str = Field(min_length=1)
    guards: list[str] | None = None  # policy guards to run; all of them when left out
    models: list[str] = []  # any Hugging Face classifier ids, run as-is for comparison


@router.get("")
def policy():
    """The guards from policy.py and the order user messages go through them."""
    return {"guards": GUARDS, "input": INPUT}


# Plain def: FastAPI runs it in a thread, so model calls don't block the event loop
@router.post("/check")
def check(req: CheckRequest):
    """Run policy guards and any extra models on the text, with every label's score."""
    names = list(GUARDS) if req.guards is None else req.guards
    if unknown := [n for n in names if n not in GUARDS]:
        raise HTTPException(400, f"unknown guards: {unknown}; known: {list(GUARDS)}")
    findings = [run(name, req.text) for name in names]
    models = []
    for model in req.models:
        # The first call downloads the model, so its ms include that
        start = time.perf_counter()
        try:
            scores = classify(model, req.text)
        except (OSError, ValueError) as e:
            # Typos, gated repos without a login, and models that aren't text classifiers
            raise HTTPException(400, f"{model}: {e}")
        models.append(
            {
                "model": model,
                "scores": {k: round(v, 4) for k, v in scores.items()},
                "ms": round((time.perf_counter() - start) * 1000),
            }
        )
    return {"findings": findings, "models": models}
