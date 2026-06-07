"""
Document ingestion pipeline.
Handles loading, splitting, embedding, and storing documents in ChromaDB.
"""

import os
from pathlib import Path
from typing import List

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain.schema import Document

from app.config import (
    CHROMA_DB_PATH,
    UPLOAD_DIR,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    EMBEDDING_MODEL,
    GOOGLE_API_KEY,
)


def load_document(file_path: str) -> List[Document]:
    """Load a document based on its file extension."""
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
    elif ext == ".docx":
        loader = Docx2txtLoader(file_path)
    elif ext in [".txt", ".md"]:
        loader = TextLoader(file_path, encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    return loader.load()


def split_documents(documents: List[Document]) -> List[Document]:
    """Split documents into smaller chunks."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ".", " ", ""],
    )
    return splitter.split_documents(documents)


FAISS_INDEX_PATH = CHROMA_DB_PATH  # reuse same config key, now points to FAISS index folder


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=GOOGLE_API_KEY,
    )


def get_vector_store() -> FAISS:
    """Load existing FAISS index from disk, or raise if it doesn't exist yet."""
    embeddings = get_embeddings()
    if not os.path.exists(os.path.join(FAISS_INDEX_PATH, "index.faiss")):
        raise FileNotFoundError(
            "No documents have been ingested yet. Please upload a document first."
        )
    return FAISS.load_local(
        FAISS_INDEX_PATH,
        embeddings,
        allow_dangerous_deserialization=True,
    )


def ingest_file(file_path: str) -> int:
    """
    Full pipeline: load → split → embed → store.
    Returns the number of chunks stored.
    """
    documents = load_document(file_path)
    chunks = split_documents(documents)

    # Tag each chunk with the source filename
    source_name = Path(file_path).name
    for chunk in chunks:
        chunk.metadata["source"] = source_name

    embeddings = get_embeddings()
    os.makedirs(FAISS_INDEX_PATH, exist_ok=True)

    # If an index already exists, load and add to it; otherwise create fresh
    if os.path.exists(os.path.join(FAISS_INDEX_PATH, "index.faiss")):
        vector_store = FAISS.load_local(
            FAISS_INDEX_PATH,
            embeddings,
            allow_dangerous_deserialization=True,
        )
        vector_store.add_documents(chunks)
    else:
        vector_store = FAISS.from_documents(chunks, embeddings)

    vector_store.save_local(FAISS_INDEX_PATH)
    return len(chunks)
