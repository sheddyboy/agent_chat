from langchain_core.documents import Document
from langchain_pymupdf4llm import PyMuPDF4LLMLoader


def load_pages(path: str) -> list[Document]:
    """One markdown Document per page. Scanned pages are OCR'd by Tesseract when needed."""
    return PyMuPDF4LLMLoader(path, mode="page").load()
