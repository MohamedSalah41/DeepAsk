<div align="center">

<br/>

<img src="https://img.shields.io/badge/Ask%20Me-Anything-1DB954?style=for-the-badge&labelColor=0d0d0d" />
<img src="https://img.shields.io/badge/RAG-Powered-ffffff?style=for-the-badge&labelColor=1DB954" />
<img src="https://img.shields.io/badge/Groq-LLaMA_3-1DB954?style=for-the-badge&logo=groq&logoColor=white&labelColor=0d0d0d" />

<br/><br/>

# 🟢 DeepAsk

### Your documents. Your questions. Private, local, instant.

Upload a PDF, Word file, or plain text — ask anything about it in plain English.  
Answers come strictly from your documents, not the internet.

<br/>

</div>

---

## How It Works

```
 Upload Doc
     │
     ▼
 Load (PDF / DOCX / TXT / MD)
     │
     ▼
 Split into chunks  ──────────────────────────────────────────┐
     │                                                         │
     ▼                                                         ▼
 Embed via sentence-transformers                      FAISS Vector Store
                                                              │
                                                              │
 Ask a Question ──► Embed Question ──► Search Top-K Chunks ──┘
                                                              │
                                                              ▼
                                                    Groq LLM (or Ollama)
                                                              │
                                                              ▼
                                                         ✅ Answer
```

---

## Stack

| Layer | Tool |
|---|---|
| Backend | FastAPI + Python |
| RAG Orchestration | LangChain |
| Vector Store | FAISS (local, no DB needed) |
| Embeddings | `all-MiniLM-L6-v2` (sentence-transformers) |
| LLM (cloud) | Groq — `llama3-8b-8192` |
| LLM (local fallback) | Ollama — `mistral-nemo` |
| Frontend | HTML · CSS · Vanilla JS |

If `GROQ_API_KEY` is set → Groq LLM + sentence-transformers. Otherwise → fully local Ollama.

---

## Original Plan

The first version was built around the Gemini API:

- Embeddings → `gemini-embedding-001` via `langchain-google-genai`
- LLM → `gemini-2.0-flash` via the same adapter
- API key → Google AI Studio free key (`AIza...`)
- No local fallback — everything went through Google's endpoint

Migrated to the current stack to remove the Google dependency, support fully local dev, and make Railway deployment free.

---

## Get Started

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Add your API key**
```bash
cp .env.example .env
# Set GROQ_API_KEY in .env — or leave blank to use Ollama locally
```

> Get a free Groq key at [console.groq.com](https://console.groq.com)

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
| `GET` | `/api/docs-list` | List all uploaded documents |
| `DELETE` | `/api/reset` | Clear all documents & vector store |

---

## Project Structure

```
deepask/
├── app/
│   ├── main.py        ← FastAPI entry point
│   ├── api.py         ← Routes
│   ├── ingest.py      ← Load → split → embed → store
│   ├── query.py       ← Retrieve → generate answer
│   ├── providers.py   ← LLM / embeddings factory (Groq or Ollama)
│   └── config.py      ← Settings from .env
├── frontend/
│   ├── index.html
│   ├── chat.html
│   ├── mindmap.html
│   ├── style.css
│   └── app.js
├── data/
│   ├── uploads/       ← Saved documents
│   └── chromadb/      ← FAISS index (auto-created)
├── .env.example
└── requirements.txt
```

---

<div align="center">

<sub>Built with LangChain · FastAPI · Groq · FAISS · sentence-transformers</sub>

</div>
