# DeepAsk — Backend Deployment Plan

> Local dev with Ollama → Railway production with Groq + sentence-transformers

---

## 1. Current Backend at a Glance

Before touching anything, here's what you already have and what's changing.

### Existing File Tree

```
deepask/
├── app/
│   ├── main.py        ← FastAPI app, CORS, static files, 3 page routes
│   ├── api.py         ← 4 endpoints: POST /upload, POST /ask, GET /docs-list, DELETE /reset
│   ├── ingest.py      ← load → split → embed (Gemini) → FAISS
│   ├── query.py       ← embed question (Gemini) → FAISS search → Gemini LLM → answer
│   └── config.py      ← all settings from .env (Gemini keys, model names, paths)
├── frontend/
│   ├── index.html     ← Upload page (drag-drop, docs list, sticky CTA)
│   ├── mindmap.html   ← Mind map visualisation page
│   ├── chat.html      ← Split-panel chat + source map
│   ├── app.js         ← Upload page logic, calls POST /api/upload + GET /api/docs-list
│   ├── chat.js        ← Chat logic, calls POST /api/ask, renders source map
│   ├── mindmap.js     ← Mind map rendering from localStorage chunk data
│   ├── style.css      ← Shared styles (nav, cards, upload zone)
│   ├── chat.css       ← Chat panel + source map styles
│   └── mindmap.css    ← Mind map canvas styles
├── data/
│   ├── uploads/       ← Saved PDF/DOCX/TXT files
│   └── chromadb/      ← FAISS index (index.faiss + index.pkl)
├── .env               ← GOOGLE_API_KEY + settings (never commit)
├── requirements.txt   ← Python deps (currently Gemini-only)
└── README.md
```

### What the three frontend pages need from the backend

| Page | API calls | What it does |
|------|-----------|-------------|
| `/` (index) | `POST /api/upload`, `GET /api/docs-list`, `DELETE /api/reset` | Upload files, list them, wipe everything |
| `/mindmap` | `GET /api/docs-list` + localStorage chunk counts | Visualise document structure |
| `/chat` | `POST /api/ask` | Chat with docs, render source-chunk map |

None of the frontend code changes — only the backend provider logic swaps.

---

## 2. What's Changing and Why

### Current stack → New stack

| Layer | Now | After update |
|-------|-----|-------------|
| Embeddings (local) | Gemini API (`gemini-embedding-001`) | Ollama `nomic-embed-text` |
| Embeddings (Railway) | Gemini API | `sentence-transformers` (CPU, free) |
| LLM (local) | Gemini API (`gemini-2.0-flash`) | Ollama (e.g. `mistral-nemo`) |
| LLM (Railway) | Gemini API | Groq `llama-3.3-70b` |
| Vector store | FAISS | FAISS (unchanged) |
| Cost | Gemini free tier | $0 both locally and on Railway |

### The critical constraint to keep in mind

Local Ollama embeddings and Railway sentence-transformers embeddings **are incompatible**. A FAISS index built with one model produces garbage results when queried with the other. Never copy a local index to Railway — each environment builds its own fresh index.

---

## 3. Target Architecture After the Update

```
deepask/
├── app/
│   ├── main.py            ← unchanged
│   ├── api.py             ← unchanged
│   ├── ingest.py          ← swap get_embeddings() to call providers.py
│   ├── query.py           ← swap embeddings + LLM to call providers.py
│   ├── config.py          ← add GROQ_API_KEY, OLLAMA_BASE_URL, updated model names
│   └── providers.py       ← NEW: returns correct embedder + LLM based on env
├── frontend/              ← completely unchanged
├── data/
│   ├── uploads/
│   └── faiss_index/       ← renamed from chromadb/ (clarity)
├── .env                   ← add GROQ_API_KEY for local testing (optional)
├── .env.example           ← updated template
├── requirements.txt       ← updated: drop google libs, add groq + sentence-transformers
├── railway.toml           ← NEW: Railway build/start config
└── README.md              ← updated run instructions
```

### What `providers.py` does

This is the only new file. It contains one function: check if `GROQ_API_KEY` is set in the environment. If yes → return Groq LLM + sentence-transformers embeddings. If no → return Ollama LLM + Ollama embeddings. All other files call this instead of hardcoding a provider.

```
Environment variable present?
        GROQ_API_KEY set
               │ yes                    │ no
               ▼                        ▼
  Groq llama-3.3-70b            Ollama (mistral-nemo)
  sentence-transformers         Ollama nomic-embed-text
  (Railway mode)                (local dev mode)
```

---

## 4. Feedback on the Plan

The plan is solid. A few things worth flagging before you start:

**What's good:**
- Single environment switch via one env var is the cleanest possible approach — no config files to manage, no flags to pass.
- Reusing FAISS for both environments keeps the query/ingest code nearly identical.
- Groq is genuinely fast and free at the scale of 50 users.

**Things to watch:**

1. **sentence-transformers first-run latency** — the model weights (~90 MB for `all-MiniLM-L6-v2`) download on first use after Railway deploy. The first upload will be slow. Not a bug, just expected. Log a startup message so you know when it's ready.

2. **Railway ephemeral filesystem** — Railway's free tier does not guarantee persistent disk. Uploaded files and the FAISS index live in `/data/` and will be wiped on redeploy or dyno restart. For 50 friends this is probably acceptable short-term, but know it's there. Fixing it means attaching a Railway volume (costs a few dollars) or using S3-compatible storage.

3. **`faiss-cpu` build size** — it's ~50 MB compiled. Combined with `sentence-transformers` and its torch dependency, your Railway build can exceed 1 GB of install size. If the build times out, switch the embedding model to `paraphrase-MiniLM-L3-v2` (smaller, still good) or use `onnxruntime`-based embeddings instead of full torch.

4. **Cold starts** — Railway free tier sleeps after ~15 min of inactivity. First request after sleep is slow (5–15 s). Nothing to fix now; just warn users in the UI or README.

5. **No per-user isolation** — all 50 friends share one FAISS index. Someone uploading their own docs adds to everyone else's index. If that's intentional (shared knowledge base), great. If not, you'll need per-session or per-user namespacing — that's a separate feature.

---

## 5. What to Do — Step by Step

### Step 1 — Refactor the backend provider logic

**Goal:** get local dev working with Ollama before touching deployment.

1. Install Ollama on your machine: https://ollama.com — then `ollama pull nomic-embed-text` and `ollama pull mistral-nemo` (or whichever LLM you prefer locally).
2. Create `app/providers.py` with two functions: `get_embeddings()` and `get_llm()`, each checking for `GROQ_API_KEY`.
3. Update `app/config.py` — add `GROQ_API_KEY`, `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`), `OLLAMA_LLM_MODEL`, `SENTENCE_TRANSFORMER_MODEL` (default `all-MiniLM-L6-v2`), `GROQ_MODEL`.
4. Update `app/ingest.py` — replace the `get_embeddings()` function to call `providers.get_embeddings()`.
5. Update `app/query.py` — replace both the embeddings call and the LLM instantiation to call `providers.get_embeddings()` and `providers.get_llm()`.
6. Delete the old Gemini imports from both files.
7. Test: start the server with no `GROQ_API_KEY` set, upload a PDF, ask a question — confirm Ollama handles both.

### Step 2 — Update requirements.txt

Remove:
```
langchain-google-genai
google-generativeai
```

Add:
```
langchain-ollama==0.1.3
langchain-groq==0.1.9
groq==0.9.0
sentence-transformers==3.0.1
torch==2.3.1+cpu          # CPU-only torch to keep size down
```

Verify locally: `pip install -r requirements.txt` in a fresh virtualenv.

### Step 3 — Verify the environment switch

Still locally, temporarily add `GROQ_API_KEY=fake-key` to `.env`, start the server, and confirm:
- The startup log prints "Using Groq + sentence-transformers" (you'll add this log in `providers.py`).
- The server starts without crashing (even though Groq calls will fail with a fake key — that's fine at this stage).

Remove the fake key after testing.

### Step 4 — Commit to GitHub

```bash
git add app/providers.py app/config.py app/ingest.py app/query.py requirements.txt .env.example
git commit -m "swap providers: Ollama local, Groq+sentence-transformers on Railway"
git push origin main
```

Check `.gitignore` before committing — confirm it includes:
```
.env
data/
__pycache__/
*.pyc
*.pyo
```

### Step 5 — Add `railway.toml`

Create this file at the project root:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
```

Railway uses `$PORT` automatically — don't hardcode 8000.

### Step 6 — Deploy to Railway

1. Go to railway.app → New Project → Deploy from GitHub repo.
2. Select your repo and let Railway detect the Python project.
3. Watch the build log — if it fails, check for missing packages or memory errors on `sentence-transformers` install.
4. Once green, go to Variables tab and add: `GROQ_API_KEY=your-real-groq-key`.
5. Railway will restart automatically.

Get a free Groq key at: https://console.groq.com

### Step 7 — Smoke test the deployed version

1. Open your Railway URL.
2. Upload a small PDF (the index will build using sentence-transformers — first upload is slow).
3. Ask a question about it.
4. Confirm the answer references content from the PDF.
5. Check Railway logs — you should see "Using Groq + sentence-transformers" on startup.

### Step 8 — Share the URL

Send the Railway URL to your friends. The app is ready.

---

## 6. Expected Tree After the Update

```
deepask/
│
├── app/
│   ├── __init__.py
│   ├── main.py                 ← unchanged
│   ├── api.py                  ← unchanged
│   ├── config.py               ← updated: GROQ_API_KEY, Ollama settings, ST model name
│   ├── providers.py            ← NEW: get_embeddings() + get_llm() with env switch
│   ├── ingest.py               ← updated: calls providers.get_embeddings()
│   └── query.py                ← updated: calls providers.get_embeddings() + providers.get_llm()
│
├── frontend/                   ← completely unchanged
│   ├── index.html
│   ├── mindmap.html
│   ├── chat.html
│   ├── app.js
│   ├── chat.js
│   ├── mindmap.js
│   ├── style.css
│   ├── chat.css
│   └── mindmap.css
│
├── data/
│   ├── uploads/                ← uploaded files (ephemeral on Railway)
│   └── faiss_index/            ← FAISS vectors (ephemeral on Railway)
│       ├── index.faiss
│       └── index.pkl
│
├── .env                        ← GROQ_API_KEY + OLLAMA settings (never commit)
├── .env.example                ← updated template
├── .gitignore                  ← includes .env, data/, __pycache__/
├── railway.toml                ← NEW: build + start config for Railway
├── requirements.txt            ← updated deps (no Gemini, adds Groq + ST + CPU torch)
├── README.md                   ← updated with new run instructions
└── SYSTEM_OVERVIEW.md
```

---

## 7. Summary of Risk Points

| Risk | Impact | How to catch it |
|------|--------|-----------------|
| Embedding mismatch between local and Railway | Silent bad answers | Never copy FAISS index between envs; always re-index |
| Missing package in requirements.txt | Railway build failure | Test `pip install -r requirements.txt` in a clean venv before pushing |
| `sentence-transformers` + torch build size | Railway build timeout | Use CPU-only torch; fall back to smaller ST model if needed |
| Railway ephemeral disk | Data loss on redeploy | Document this clearly; add Railway volume if it becomes a problem |
| Groq API key not set on Railway | Runtime 500 errors | Check Railway Variables tab; verify startup log shows correct mode |
| Cold starts after inactivity | Slow first request | Expected on free tier; nothing to fix until it's actually annoying |
