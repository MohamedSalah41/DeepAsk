import os
from dotenv import load_dotenv

load_dotenv()

# ---------- vector store / ingestion ----------
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./data/chromadb")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./data/uploads")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))
TOP_K_RESULTS = int(os.getenv("TOP_K_RESULTS", "5"))

# ---------- Groq (cloud) ----------
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama3-8b-8192")

# ---------- Ollama (local fallback) ----------
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "mistral-nemo")

# ---------- Sentence-transformers (used for embeddings when Groq is active) ----------
SENTENCE_TRANSFORMER_MODEL = os.getenv(
    "SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2"
)
