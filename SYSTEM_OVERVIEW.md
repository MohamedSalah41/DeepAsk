# Personal Docs Q&A — System Overview

---

## What Was Built

A RAG (Retrieval-Augmented Generation) system that lets you:
- Upload your own PDF, Word, or text files
- Ask questions about them in plain English
- Get answers based **only** on what's in your documents — not from the internet

---

## Tree Architecture

```
-wht-is-the----rag/
│
├── app/                        ← Python backend (FastAPI)
│   ├── __init__.py
│   ├── main.py                 ← App entry point, starts the server
│   ├── api.py                  ← HTTP routes (upload, ask, list, reset)
│   ├── ingest.py               ← INGESTION PIPELINE (the RAG "store" part)
│   ├── query.py                ← QUERY PIPELINE (the RAG "retrieve + generate" part)
│   └── config.py               ← All settings loaded from .env
│
├── frontend/                   ← Simple browser UI
│   ├── index.html              ← One page: upload + ask + docs list
│   ├── style.css               ← Styling
│   └── app.js                  ← Calls the API from the browser
│
├── data/
│   ├── uploads/                ← Your uploaded documents are saved here
│   └── chromadb/               ← FAISS vector index lives here (the "memory")
│
├── .env                        ← Your secret API key + settings (never commit this)
├── .env.example                ← Template showing what .env should look like
├── .gitignore                  ← Excludes .env and data/ from git
├── requirements.txt            ← All Python dependencies
└── README.md                   ← Setup and run instructions
```

---

## What Each File Does

| File | Role |
|------|------|
| `main.py` | Creates the FastAPI app, enables CORS, mounts the frontend, registers routes |
| `api.py` | Defines 4 endpoints: POST `/upload`, POST `/ask`, GET `/docs-list`, DELETE `/reset` |
| `ingest.py` | Loads a file → splits into chunks → embeds chunks → saves to FAISS index on disk |
| `query.py` | Embeds the question → searches FAISS for matching chunks → sends chunks + question to Gemini → returns answer |
| `config.py` | Reads all settings from `.env` (API key, model names, chunk size, paths) |
| `frontend/` | Plain HTML/CSS/JS UI that talks to the API — no framework, no build step |
| `data/uploads/` | Where uploaded files get saved physically |
| `data/chromadb/` | Where the FAISS vector index is persisted (despite the folder name, it's now FAISS) |

---

## Where Exactly Is the RAG?

RAG = **Retrieval-Augmented Generation**. It has two phases:

### Phase 1 — Ingestion (store knowledge) — `ingest.py`

```
Your PDF/DOCX/TXT
        ↓
  Load full text                      ← PyPDFLoader / Docx2txtLoader / TextLoader
        ↓
  Split into small chunks             ← RecursiveCharacterTextSplitter (500 chars, 50 overlap)
        ↓
  Convert each chunk to a vector      ← Gemini Embedding API (models/gemini-embedding-001)
        ↓
  Save vectors to disk                ← FAISS index saved at data/chromadb/
```

This runs once per document when you upload it.

### Phase 2 — Query (answer questions) — `query.py`

```
Your question ("what are the cancellation terms?")
        ↓
  Convert question to a vector        ← Same Gemini Embedding API
        ↓
  Search FAISS for top 5 matching chunks  ← Vector similarity search
        ↓
  Build a prompt:
    "Here are relevant chunks: ...
     Answer this question: ..."
        ↓
  Send prompt to Gemini LLM           ← models/gemini-2.0-flash
        ↓
  Get answer + source filenames back
```

This runs every time you ask a question.

---

## Why the Gemini API?

The system uses the Gemini API for two separate things:

| What | Model Used | Why |
|------|-----------|-----|
| **Embeddings** | `models/gemini-embedding-001` | Converts text into vectors (numbers that represent meaning). Used during both ingestion and querying. |
| **Answer generation** | `models/gemini-2.0-flash` | The LLM that reads the retrieved chunks and writes the final answer in plain English. |

Without the API, the system has no way to understand meaning or generate language. The API is the "brain" — everything else is just plumbing.

---

## How to Run It

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set your API key in `.env`
```
GOOGLE_API_KEY=AIza...your-key-here
```
Get a free key at: https://aistudio.google.com/app/apikey
(must be an AI Studio key starting with `AIza`, not a Google Cloud key)

### 3. Start the server
```bash
uvicorn app.main:app --reload
```

### 4. Open the app
- UI: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs

---

## Dependencies

| Package | What it does |
|---------|-------------|
| `fastapi` | Web framework — handles HTTP requests |
| `uvicorn` | Runs the FastAPI server |
| `langchain` | Orchestrates the RAG pipeline (load → split → embed → retrieve → generate) |
| `langchain-google-genai` | LangChain adapter for Gemini embeddings and chat |
| `langchain-community` | Document loaders (PDF, DOCX, TXT) and FAISS vector store wrapper |
| `google-generativeai` | Google's official Python SDK for the Gemini API |
| `faiss-cpu` | Fast vector similarity search — stores and searches embeddings locally |
| `pypdf` | Reads PDF files |
| `python-docx` | Reads Word (.docx) files |
| `python-dotenv` | Loads `.env` file into environment variables |
| `python-multipart` | Handles file uploads in FastAPI |

---

## Current Status

| Component | Status |
|-----------|--------|
| Project structure | ✅ Done |
| FastAPI backend | ✅ Done |
| Ingestion pipeline | ✅ Done + tested |
| Query pipeline | ✅ Done |
| FAISS vector store | ✅ Working |
| Frontend UI | ✅ Done |
| Gemini embeddings | ✅ Working (gemini-embedding-001) |
| Gemini LLM answers | ⏳ Waiting on valid AI Studio API key |

---

## What's Blocking It Right Now

The current API keys are **Google Cloud project keys** with quota set to 0.
You need a free **AI Studio key** from https://aistudio.google.com/app/apikey.
It starts with `AIza...` and works immediately with no billing setup.
