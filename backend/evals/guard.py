"""Guard suites: does each classifier guard flag what it should and let the rest through?

    uv run python -m evals.guard            # every suite
    uv run python -m evals.guard hate       # one guard
"""

import sys

from datasets import load_dataset
from guardrails.check import run
from guardrails.policy import GUARDS
from phoenix.client import Client
from phoenix.client.experiments import run_experiment

from evals.retrieval import mean_scores

THRESHOLDS = [0.5, 0.7, 0.9]


def balanced(rows, is_hit, n: int) -> list:
    """n/2 hits and n/2 misses, so a rare label still gets enough examples."""
    rows = rows.shuffle(seed=0)
    hits = rows.filter(is_hit).select(range(n // 2))
    misses = rows.filter(lambda r: not is_hit(r)).select(range(n // 2))
    return list(hits) + list(misses)


def injection_rows() -> list[tuple[str, bool]]:
    return [(r["text"], bool(r["label"])) for r in load_dataset("deepset/prompt-injections", split="test")]


def hate_rows() -> list[tuple[str, bool]]:
    # The cardiffnlp hate model was trained on this, so it is only a fair test for other models
    rows = load_dataset("cardiffnlp/tweet_eval", "hate", split="test")
    return [(r["text"], bool(r["label"])) for r in balanced(rows, lambda r: r["label"] == 1, 300)]


def civil(field_names: list[str], n: int) -> list[tuple[str, bool]]:
    # Scores are the share of annotators who said yes; at 0.5 most of them did
    def hit(r):
        return any(r[f] >= 0.5 for f in field_names)

    rows = load_dataset("google/civil_comments", split="test")
    return [(r["text"], hit(r)) for r in balanced(rows, hit, n)]


# guard -> (Phoenix dataset name, rows as (text, should_flag))
SUITES = {
    "injection": ("guard-injections-v2", injection_rows),
    "hate": ("guard-hate-v1", hate_rows),
    "toxicity": ("guard-toxicity-v1", lambda: civil(["insult", "severe_toxicity", "identity_attack"], 300)),
    "threat": ("guard-threat-v1", lambda: civil(["threat"], 200)),
}


def upload(name: str, rows: list[tuple[str, bool]]):
    examples = [
        {"id": f"{name}-{i}", "input": {"text": text}, "output": {"flag": flag}}
        for i, (text, flag) in enumerate(rows)
    ]
    return Client().datasets.create_dataset(name=name, examples=examples)


def correct(output, expected) -> float:
    return float(output["flagged"] == expected["flag"])


def missed(output, expected) -> float:
    return float(expected["flag"] and not output["flagged"])


def false_flag(output, expected) -> float:
    return float(output["flagged"] and not expected["flag"])


def threshold_table(dataset, experiment) -> None:
    """Precision, recall and false positive rate at each threshold, from the scores already computed."""
    # Task runs point at Phoenix's internal node_id, not our example id
    labels = {ex["node_id"]: ex["output"]["flag"] for ex in dataset.examples}
    pairs = [(run["output"]["score"], labels[run["dataset_example_id"]]) for run in experiment["task_runs"]]
    for t in THRESHOLDS:
        tp = sum(s >= t and y for s, y in pairs)
        fp = sum(s >= t and not y for s, y in pairs)
        fn = sum(s < t and y for s, y in pairs)
        tn = sum(s < t and not y for s, y in pairs)
        precision = tp / (tp + fp) if tp + fp else 0.0
        print(
            f"threshold {t}: precision {precision:.3f}  recall {tp / (tp + fn):.3f}  "
            f"false positive rate {fp / (fp + tn):.3f}"
        )


def run_suite(guard_name: str) -> None:
    dataset_name, rows = SUITES[guard_name]
    guard = GUARDS[guard_name]
    dataset = upload(dataset_name, rows())

    def task(input) -> dict:
        finding = run(guard_name, input["text"])
        return {"score": finding["score"], "flagged": finding["flagged"]}

    # "owner/name" -> "name", so swapped models get their own experiment names
    model = guard["model"].split("/")[-1]
    experiment = run_experiment(
        dataset=dataset,
        task=task,
        evaluators=[correct, missed, false_flag],
        experiment_name=f"{guard_name}-{model}-t{guard['threshold']}",
        experiment_metadata={"guard": guard_name, "model": guard["model"], "threshold": guard["threshold"]},
    )
    print(guard_name, mean_scores(experiment))
    threshold_table(dataset, experiment)


def main() -> None:
    for name in sys.argv[1:] or SUITES:
        run_suite(name)


if __name__ == "__main__":
    main()
