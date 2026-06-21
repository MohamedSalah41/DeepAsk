# DeepAsk

Upload a document, ask questions about it in plain English. Answers come strictly from your files.

---

## How It Works

```
Upload Doc → Load (PDF / DOCX / TXT / MD) → Split into chunks → Embed (sentence-transformers)
                                                                         │
                                                                  FAISS Vector Store
                                                                         │
Ask a Question → Embed Question → Search Top-K Chunks ──────────────────┘
                                                                         │
                                                                  Groq LLM (or Ollama)
                                                                         │
                                                                     Answer
```

---

## Original Plan

The first version of this project was designed around the Gemini API:

- Embeddings → `gemini-embedding-001` via `langchain-google-genai`
- LLM → `gemini-2.0-flash` via the same adapter
- API key → Google AI Studio free key (`AIza...`)
- No local fallback — everything went through the Gemini endpoint

It was migrated to the current stack (Groq + sentence-transformers / Ollama) to remove the Google API dependency, enable fully local development, and make Railway deployment free.

---

## Stack

| Layer | Tool |
|---|---|
| Backend | FastAPI + Python |
| RAG | LangChain |
| Vector Store | FAISS (local) |
| Embeddings | `all-MiniLM-L6-v2` (sentence-transformers) |
| LLM (cloud) | Groq — `llama3-8b-8192` |
| LLM (local) | Ollama — `mistral-nemo` |
| Frontend | HTML · CSS · Vanilla JS |

If `GROQ_API_KEY` is set, the app uses Groq for the LLM and sentence-transformers for embeddings. Otherwise it falls back to a fully local Ollama setup.

---

## Get Started

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Add your API key**
```bash
cp .env.example .env
# Set GROQ_API_KEY in .env (or leave blank to use Ollama locally)
```

**3. Start the server**
```bash
uvicorn app.main:app --reload
```

**4. Open the app**
- UI → http://localhost:8000
- API docs → http://localhost:8000/docs

---

## API

| Method | Endpoint | What it does |
|---|---|---|
| `POST` | `/api/upload` | Upload & ingest a document |
| `POST` | `/api/ask` | Ask a question |
| `GET` | `/api/docs-list` | List uploaded documents |
| `DELETE` | `/api/reset` | Clear all documents & vector store |

---

## Project Structure

```
├── app/
│   ├── main.py        ← FastAPI entry point
│   ├── api.py         ← Routes
│   ├── ingest.py      ← Load → split → embed → store
│   ├── query.py       ← Retrieve → generate answer
│   ├── providers.py   ← LLM / embeddings factory (Groq or Ollama)
│   └── config.py      ← Settings from .env
├── frontend/          ← HTML · CSS · JS
├── data/
│   ├── uploads/       ← Saved documents
│   └── chromadb/      ← FAISS index (auto-created)
├── .env.example
└── requirements.txt
```
