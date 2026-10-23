"""Load a HotpotQA subset into the eval Qdrant store and upload it to Phoenix. Run once."""

import uuid

from config import settings
from datasets import load_dataset
from ingestion.store import client, vector_store
from langchain_core.documents import Document
from phoenix.client import Client

DATASET = "hotpot-retrieval-v1"
ANSWERS_DATASET = "hotpot-answers-v1"
SIZE = 200
# Answer runs go through the full graph plus a judge, so they use a smaller slice
ANSWERS_SIZE = 50
BATCH = 64


def load_subset():
    ds = load_dataset("hotpotqa/hotpot_qa", "distractor", split="validation")
    return ds.shuffle(seed=42).select(range(SIZE))


def passages(rows) -> list[Document]:
    """One Document per context paragraph, deduplicated by title."""
    docs = {}
    for row in rows:
        for title, sentences in zip(row["context"]["title"], row["context"]["sentences"]):
            text = "".join(sentences).strip()
            docs[title] = Document(f"{title}\n{text}", metadata={"title": title, "doc": title})
    return list(docs.values())


def ingest(docs: list[Document]) -> None:
    store = vector_store()  # creates the collection if missing
    if client().count(settings.qdrant_collection).count:
        print("eval store already filled, skipping ingestion")
        return
    for i in range(0, len(docs), BATCH):
        batch = docs[i : i + BATCH]
        # Stable ids so a partial run can be resumed without duplicates
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, d.metadata["title"])) for d in batch]
        store.add_documents(batch, ids=ids)
        print(f"embedded {min(i + BATCH, len(docs))}/{len(docs)}")


def upload(rows, name: str) -> None:
    examples = [
        {
            "id": row["id"],
            "input": {"question": row["question"]},
            "output": {
                "gold_titles": sorted(set(row["supporting_facts"]["title"])),
                "answer": row["answer"],
            },
            "metadata": {"type": row["type"], "level": row["level"]},
        }
        for row in rows
    ]
    Client().datasets.create_dataset(name=name, examples=examples)
    print(f"uploaded {len(examples)} examples to Phoenix dataset {name}")


def main() -> None:
    rows = load_subset()
    docs = passages(rows)
    print(f"{len(rows)} questions, {len(docs)} passages")
    ingest(docs)
    upload(rows, DATASET)
    upload(rows.select(range(ANSWERS_SIZE)), ANSWERS_DATASET)


if __name__ == "__main__":
    main()
