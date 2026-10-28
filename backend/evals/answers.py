"""Answer suite: does the full graph search, get the answer right, and stay faithful to the sources?"""

import re
import string
from functools import partial

from core.config import settings
from agent.graph import build_graph
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_ollama import ChatOllama
from phoenix.client import Client
from phoenix.client.experiments import run_experiment

from evals.hotpot import ANSWERS_DATASET
from evals.retrieval import mean_scores

MODELS = ["qwen3:8b", "llama3.1:8b"]
# Steers the model to search, so this suite measures answers and leaves routing to the tools suite
PREFIX = "Based on the documents, "
# Bigger than the models under test, and never grades its own answers
JUDGE_MODEL = "gpt-oss:latest"

JUDGE_PROMPT = """You check whether an answer is supported by retrieved passages.

Passages:
{contexts}

Question: {question}
Answer: {answer}

Is every factual claim in the answer supported by the passages? Ignore style and citation markers.
Reply with PASS or FAIL on the first line, then one sentence explaining why."""

graph = build_graph()


def answer_question(input, model: str) -> dict:
    state = graph.invoke(
        {
            "messages": [HumanMessage(PREFIX + input["question"])],
            "model": model,
            "enabled_tools": ["search_documents"],
            "think": False,
        }
    )
    searches = [
        m for m in state["messages"] if isinstance(m, ToolMessage) and m.name == "search_documents"
    ]
    return {
        "answer": state["messages"][-1].text,
        "contexts": [hit["text"] for m in searches for hit in (m.artifact or [])],
        "searched": bool(searches),
    }


def normalize(text: str) -> str:
    text = text.lower().translate(str.maketrans("", "", string.punctuation))
    return re.sub(r"\s+", " ", text).strip()


def used_search(output) -> float:
    return float(output["searched"])


def contains_answer(output, expected) -> float:
    return float(normalize(expected["answer"]) in normalize(output["answer"]))


def answer_recall(output, expected) -> float:
    """Share of gold answer words in the reply; partial credit for long gold phrases."""
    gold = normalize(expected["answer"]).split()
    reply = set(normalize(output["answer"]).split())
    return sum(w in reply for w in gold) / len(gold)


def faithful(input, output) -> dict:
    if not output["contexts"]:
        return {"score": 0.0, "label": "FAIL", "explanation": "Nothing was retrieved."}
    prompt = JUDGE_PROMPT.format(
        contexts="\n\n".join(output["contexts"]),
        question=input["question"],
        answer=output["answer"],
    )
    # reasoning=True keeps gpt-oss's thinking out of the verdict text
    llm = ChatOllama(model=JUDGE_MODEL, base_url=settings.ollama_url, reasoning=True)
    reply = llm.invoke(prompt).text.strip()
    label = "PASS" if reply.upper().startswith("PASS") else "FAIL"
    explanation = reply.split("\n", 1)[-1].strip()
    return {"score": float(label == "PASS"), "label": label, "explanation": explanation}


def main() -> None:
    dataset = Client().datasets.get_dataset(dataset=ANSWERS_DATASET)
    results = {}
    for model in MODELS:
        name = model.replace(":", "-") + "-docs"
        experiment = run_experiment(
            dataset=dataset,
            task=partial(answer_question, model=model),
            evaluators=[used_search, contains_answer, answer_recall, faithful],
            experiment_name=name,
            experiment_metadata={"model": model, "judge": JUDGE_MODEL, "prefix": PREFIX},
            # Full graph runs plus a judge call are slow on local models
            timeout=300,
        )
        results[name] = mean_scores(experiment)
    for name, scores in results.items():
        print(name, scores)


if __name__ == "__main__":
    main()
