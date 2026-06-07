# 📄 Personal Docs Q&A — RAG System

Upload your own PDFs, Word files, or text files and ask questions about them in plain English.
Answers come strictly from your documents — not from the internet.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Backend | Python + FastAPI |
| RAG pipeline | LangChain |
| Vector store | ChromaDB (local) |
| Embeddings + LLM | OpenAI API |
| Frontend | Plain HTML/CSS/JS |

---

## Project Structure

```
.
├── app/
│   ├── main.py       # FastAPI app entry point
│   ├── api.py        # Routes: /upload, /ask, /docs-list, /reset
│   ├── ingest.py     # Load → split → embed → store pipeline
│   ├── query.py      # Retrieve → generate answer pipeline
│   └── config.py     # All settings (reads from .env)
├── frontend/
│   ├── index.html    # Simple UI
│   ├── style.css
│   └── app.js
├── data/
│   ├── uploads/      # Uploaded docs stored here
│   └── chromadb/     # ChromaDB vector store (auto-created)
├── .env.example
├── requirements.txt
└── README.md
```

---

## Setup

1. **Clone and install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set your OpenAI API key**
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

3. **Run the server**
   ```bash
   uvicorn app.main:app --reload
   ```

4. **Open the app**
   - UI: http://localhost:8000
   - API docs: http://localhost:8000/docs

---

## How It Works

```
Upload doc
   ↓
Load (PDF/DOCX/TXT) → Split into chunks → Embed via OpenAI → Store in ChromaDB
                                                                        ↓
Ask question → Embed question → Search ChromaDB (top 5 chunks) → Send to GPT → Answer
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload and ingest a document |
| POST | `/api/ask` | Ask a question |
| GET | `/api/docs-list` | List uploaded documents |
| DELETE | `/api/reset` | Wipe all documents and vector store |
