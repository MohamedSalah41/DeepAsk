<div align="center">

<br/>

<img src="https://img.shields.io/badge/Ask%20Me-Anything-1DB954?style=for-the-badge&labelColor=0d0d0d" />
<img src="https://img.shields.io/badge/RAG-Powered-ffffff?style=for-the-badge&labelColor=1DB954" />
<img src="https://img.shields.io/badge/Gemini-2.0_Flash-1DB954?style=for-the-badge&logo=google&logoColor=white&labelColor=0d0d0d" />

<br/><br/>

# 🟢 Ask Me

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
 Load (PDF / DOCX / TXT)
     │
     ▼
 Split into chunks  ──────────────────────────────────────────┐
     │                                                         │
     ▼                                                         ▼
 Embed via Gemini                                     FAISS Vector Store
                                                              │
                                                              │
 Ask a Question ──► Embed Question ──► Search Top 5 Chunks ──┘
                                                              │
                                                              ▼
                                                     Gemini 2.0 Flash
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
| Embeddings | `gemini-embedding-001` |
| LLM | `gemini-2.0-flash` |
| Frontend | HTML · CSS · Vanilla JS |

---

## Get Started

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Add your API key**
```bash
cp .env.example .env
# Open .env and set your GOOGLE_API_KEY
```

> Get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey) — must start with `AIza`

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
ask-me/
├── app/
│   ├── main.py       ← FastAPI entry point
│   ├── api.py        ← Routes
│   ├── ingest.py     ← Load → split → embed → store
│   ├── query.py      ← Retrieve → generate answer
│   └── config.py     ← Settings from .env
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   ├── uploads/      ← Saved documents
│   └── chromadb/     ← FAISS index (auto-created)
├── .env.example
└── requirements.txt
```

---

<div align="center">

<sub>Built with LangChain · FastAPI · Gemini · FAISS</sub>

</div>
