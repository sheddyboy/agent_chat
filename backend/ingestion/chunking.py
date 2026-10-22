from config import settings
from langchain_core.documents import Document
from langchain_text_splitters import MarkdownTextSplitter


def chunk_pages(pages: list[Document], doc_id: str, doc_name: str) -> list[Document]:
    splitter = MarkdownTextSplitter(
        chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap
    )
    chunks = splitter.split_documents(pages)
    for i, chunk in enumerate(chunks):
        chunk.metadata = {
            "doc_id": doc_id,
            "doc": doc_name,
            "page": chunk.metadata.get("page"),
            "chunk_index": i,
        }
    return chunks
