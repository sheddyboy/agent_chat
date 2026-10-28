"""Retrieval suite: does hybrid search (with and without rerank) find the gold paragraphs?"""

from core.config import settings
from phoenix.client import Client
from phoenix.client.experiments import run_experiment
from retrieval.hybrid import hybrid_search
from retrieval.rerank import rerank

from evals.hotpot import DATASET

TOP_N = 5


def rerank_on(input) -> list[str]:
    """The production path used by search_documents."""
    candidates = [doc for doc, _ in hybrid_search(input["question"], settings.retrieval_k)]
    return [doc.metadata["title"] for doc, _ in rerank(input["question"], candidates, TOP_N)]


def rerank_off(input) -> list[str]:
    return [doc.metadata["title"] for doc, _ in hybrid_search(input["question"], TOP_N)]


def hit_at_5(output, expected) -> float:
    return float(any(t in output for t in expected["gold_titles"]))


def recall_at_5(output, expected) -> float:
    gold = expected["gold_titles"]
    return sum(t in output for t in gold) / len(gold)


def mrr(output, expected) -> float:
    for rank, title in enumerate(output, 1):
        if title in expected["gold_titles"]:
            return 1 / rank
    return 0.0


def mean_scores(experiment) -> dict[str, float]:
    scores = {}
    for run in experiment["evaluation_runs"]:
        scores.setdefault(run.name, []).append(run.result["score"])
    return {name: round(sum(s) / len(s), 3) for name, s in scores.items()}


def main() -> None:
    dataset = Client().datasets.get_dataset(dataset=DATASET)
    results = {}
    for task in (rerank_on, rerank_off):
        name = task.__name__.replace("_", "-")
        experiment = run_experiment(
            dataset=dataset,
            task=task,
            evaluators=[hit_at_5, recall_at_5, mrr],
            experiment_name=name,
        )
        results[name] = mean_scores(experiment)
    for name, scores in results.items():
        print(name, scores)


if __name__ == "__main__":
    main()
