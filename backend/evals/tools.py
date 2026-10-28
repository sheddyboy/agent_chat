"""Tool routing suite: does the agent pick the right tool (or none) on its first step?"""

from functools import partial

from agent.graph import agent
from langchain_core.messages import HumanMessage
from phoenix.client import Client
from phoenix.client.experiments import run_experiment

from evals.retrieval import mean_scores

DATASET = "tool-routing-v1"
MODELS = ["qwen3:8b", "llama3.1:8b"]

# No "based on the documents" hints here: routing is what this suite measures
CASES = {
    "search_documents": [
        "What does my contract say about termination?",
        "Summarize the PDF I uploaded.",
        "In my lease, how much notice do I have to give before moving out?",
        "What are the key findings in the report I shared?",
        "Find where my files mention the project deadline.",
        "According to my notes on the onboarding doc, who is my manager?",
        "What does the uploaded invoice list as the total amount due?",
        "Which chapter of my thesis covers the methodology?",
    ],
    "calculator": [
        "What's 17.5% of 2,340?",
        "Calculate (128 * 47) - 3,912.",
        "What is 2 to the power of 20?",
        "If I split a $486 bill between 6 people, how much does each pay?",
        "What's 1,234,567 divided by 89?",
    ],
    "get_datetime": [
        "What day is it today?",
        "What time is it right now?",
        "What's today's date?",
        "Is it a weekday or the weekend today?",
    ],
    "web_search": [
        "Who won yesterday's Champions League match?",
        "What is the current price of Bitcoin?",
        "What's the latest news about the James Webb Space Telescope?",
        "What's the weather forecast in Lagos this week?",
        "Who is the current CEO of OpenAI?",
    ],
    "save_note": [
        "Save a note titled groceries: milk, eggs, bread.",
        "Write down a note called meeting-ideas with: ship evals, fix guard.",
        "Make a note named reading-list containing Dune and Neuromancer.",
        "Please save this as a note titled todo: call the bank tomorrow.",
    ],
    "none": [
        "Write a haiku about rain.",
        "Explain recursion to a beginner.",
        "Hi, how are you?",
        "Give me three name ideas for a coffee shop.",
        "What is the difference between a list and a tuple in Python?",
    ],
}


def upload():
    examples = [
        {
            "id": f"{tool}-{i}",
            "input": {"prompt": prompt},
            "output": {"tool": tool},
            "metadata": {"tool": tool},
        }
        for tool, prompts in CASES.items()
        for i, prompt in enumerate(prompts)
    ]
    return Client().datasets.create_dataset(name=DATASET, examples=examples)


def route(input, model: str) -> dict:
    """One agent step with all local tools bound; the tools themselves never run."""
    reply = agent({"messages": [HumanMessage(input["prompt"])], "model": model, "think": False})
    calls = reply["messages"][0].tool_calls
    return {"tool": calls[0]["name"] if calls else "none", "calls": [c["name"] for c in calls]}


def correct_tool(output, expected) -> float:
    return float(output["tool"] == expected["tool"])


def called_any(output) -> float:
    return float(output["tool"] != "none")


def per_tool(dataset, experiment) -> dict[str, str]:
    """Correct picks per expected tool, e.g. {'calculator': '5/5'}."""
    # Task runs point at Phoenix's internal node_id, not our example id
    expected = {ex["node_id"]: ex["output"]["tool"] for ex in dataset.examples}
    totals = {}
    for run in experiment["task_runs"]:
        tool = expected[run["dataset_example_id"]]
        hits, n = totals.get(tool, (0, 0))
        totals[tool] = (hits + (run["output"]["tool"] == tool), n + 1)
    return {tool: f"{hits}/{n}" for tool, (hits, n) in totals.items()}


def main() -> None:
    dataset = upload()
    results = {}
    for model in MODELS:
        name = model.replace(":", "-")
        experiment = run_experiment(
            dataset=dataset,
            task=partial(route, model=model),
            evaluators=[correct_tool, called_any],
            experiment_name=name,
            experiment_metadata={"model": model},
            timeout=120,
        )
        results[name] = (mean_scores(experiment), per_tool(dataset, experiment))
    for name, (scores, tools) in results.items():
        print(name, scores)
        print("  ", tools)


if __name__ == "__main__":
    main()
