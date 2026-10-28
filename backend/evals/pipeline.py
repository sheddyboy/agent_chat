"""Input pipeline suite: every input guard together, on real prompts people sent a chatbot.

How often does check_input block a harmful prompt, and how often a harmless one?
"""

from collections import Counter

from datasets import load_dataset
from guardrails.check import check_input
from phoenix.client import Client
from phoenix.client.experiments import run_experiment

from evals.guard import balanced
from evals.retrieval import mean_scores

DATASET = "guard-pipeline-toxicchat-v1"


def upload():
    rows = load_dataset("lmsys/toxic-chat", "toxicchat0124", split="test")
    # Human labels: toxic (any kind) or a jailbreak attempt
    picked = balanced(rows, lambda r: r["toxicity"] == 1 or r["jailbreaking"] == 1, 300)
    examples = [
        {
            "id": f"toxicchat-{r['conv_id']}",
            "input": {"text": r["user_input"]},
            "output": {"harmful": r["toxicity"] == 1 or r["jailbreaking"] == 1, "jailbreak": r["jailbreaking"] == 1},
        }
        for r in picked
    ]
    return Client().datasets.create_dataset(name=DATASET, examples=examples)


def task(input) -> dict:
    result = check_input(input["text"])
    fired = [f["guard"] for f in result["findings"] if f["flagged"]]
    return {"blocked": result["blocked"], "fired": fired}


def correct(output, expected) -> float:
    return float(output["blocked"] == expected["harmful"])


def missed(output, expected) -> float:
    return float(expected["harmful"] and not output["blocked"])


def false_block(output, expected) -> float:
    return float(output["blocked"] and not expected["harmful"])


def fired_table(dataset, experiment) -> None:
    """How often each guard fired on harmful and on harmless prompts."""
    labels = {ex["node_id"]: ex["output"]["harmful"] for ex in dataset.examples}
    counts = {True: Counter(), False: Counter()}
    totals = Counter()
    for run in experiment["task_runs"]:
        harmful = labels[run["dataset_example_id"]]
        totals[harmful] += 1
        counts[harmful].update(run["output"]["fired"])
    for harmful in (True, False):
        rates = ", ".join(f"{g} {n / totals[harmful]:.1%}" for g, n in counts[harmful].most_common()) or "none"
        print(f"{'harmful ' if harmful else 'harmless'} ({totals[harmful]}): {rates}")


def main() -> None:
    dataset = upload()
    experiment = run_experiment(
        dataset=dataset,
        task=task,
        evaluators=[correct, missed, false_block],
        experiment_name="input-pipeline",
    )
    print(mean_scores(experiment))
    fired_table(dataset, experiment)


if __name__ == "__main__":
    main()
