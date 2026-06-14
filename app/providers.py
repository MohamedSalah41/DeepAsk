"""
Provider factory for embeddings and LLM.

Resolution order:
  - If GROQ_API_KEY is set → use Groq for LLM + sentence-transformers for embeddings
  - Otherwise             → use Ollama for both (local, no API key required)
"""

import os
from app.config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_EMBED_MODEL,
    OLLAMA_LLM_MODEL,
    SENTENCE_TRANSFORMER_MODEL,
)


def get_embeddings():
    """
    Return an embeddings instance.
    - Groq path: uses HuggingFace sentence-transformers locally
      (Groq doesn't host an embeddings endpoint, so we keep embeddings local
       regardless — fast and free either way).
    - Ollama path: uses the configured Ollama embedding model.
    """
    if GROQ_API_KEY:
        from langchain_community.embeddings import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(model_name=SENTENCE_TRANSFORMER_MODEL)
    else:
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(
            base_url=OLLAMA_BASE_URL,
            model=OLLAMA_EMBED_MODEL,
        )


def get_llm():
    """
    Return a chat LLM instance.
    - Groq path: uses ChatGroq with the configured model.
    - Ollama path: uses ChatOllama with the configured local model.
    """
    if GROQ_API_KEY:
        from langchain_groq import ChatGroq
        return ChatGroq(
            api_key=GROQ_API_KEY,
            model_name=GROQ_MODEL,
            temperature=0,
        )
    else:
        from langchain_ollama import ChatOllama
        return ChatOllama(
            base_url=OLLAMA_BASE_URL,
            model=OLLAMA_LLM_MODEL,
            temperature=0,
        )
