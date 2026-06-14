# 🔥 Backend Interview Roast — RAG Document Q&A System

> **Interviewer role:** Senior Backend Engineer  
> **Stack under review:** FastAPI · LangChain · FAISS · Python · Sentence-Transformers / Groq / Ollama  
> **Format:** Question → Detailed Answer  
> Covering: app structure, routing, static file serving, upload pipeline, PDF-to-text extraction, chunking, embedding, vector storage, provider abstraction, and error handling.

---

## SECTION 1 — Application Bootstrap & Structure

---

### Q1. Walk me through `main.py`. What does it do, and why is it the entry point?

**Answer:**

`main.py` creates the single `FastAPI` application instance and wires everything together before the server starts accepting requests:

```python
app = FastAPI(
    title="Personal Docs Q&A — RAG System",
    description="Upload your documents and ask questions about them.",
    version="1.0.0",
)
```

It does four things in order:

1. **Attaches CORS middleware** — allows any origin (`*`), so the frontend can call the API from a browser during development without being blocked by the browser's same-origin policy.

2. **Mounts the frontend as static files** — `app.mount("/static", StaticFiles(directory="frontend"), name="static")`. This means every file inside `frontend/` is publicly accessible under the `/static/` URL prefix. So `frontend/style.css` is served at `http://localhost:8000/static/style.css`.

3. **Registers the API router** — `app.include_router(router, prefix="/api")`. All routes defined in `api.py` are prefixed with `/api`, giving clean separation between API and static content.

4. **Defines three page routes** — `/`, `/mindmap`, and `/chat` — each returning the corresponding HTML file using `FileResponse`. These are marked `include_in_schema=False` so they don't pollute the auto-generated OpenAPI docs.

`main.py` is the entry point because Uvicorn is pointed at it: `uvicorn app.main:app`. Uvicorn imports that module, finds the `app` object, and starts the ASGI server.

---

### Q2. You have both `app.mount("/static", ...)` and manual `@app.get("/")` routes returning HTML files. Why not just mount everything and serve HTML from `/static/index.html`?

**Answer:**

Good catch. The `/static` mount does serve files but only under that prefix. If you navigated to `http://localhost:8000/static/index.html` it would work — but that's an ugly URL.

The explicit routes `/`, `/chat`, and `/mindmap` give clean, semantic URLs that look like a real multi-page app. The user hits `http://localhost:8000/` and gets `index.html`, not `http://localhost:8000/static/index.html`.

The downside — and this is a real flaw in the current code — is duplication. If you add a fourth page you have to remember to add a route in `main.py`. A better pattern for a growing SPA would be a catch-all route or a proper reverse proxy (nginx) in front.

Also worth noting: `FileResponse` streams the file directly from disk. It sets the correct `Content-Type` header (`text/html`) automatically based on the file extension.

---

### Q3. The CORS config is `allow_origins=["*"]`. What's the security implication, and what would you change in production?

**Answer:**

`allow_origins=["*"]` means **any website on the internet** can send cross-origin requests to this API from a browser. In development that's fine — convenient, even. In production it's dangerous for two reasons:

1. **CSRF-like abuse** — a malicious site could trick a logged-in user's browser into uploading documents or wiping the vector store via the `/reset` endpoint.
2. **`allow_credentials=True` combined with `*`** — FastAPI/Starlette will actually raise an error if you try to use both in production because the CORS spec forbids it. You can't send cookies with a wildcard origin.

In production you'd set:

```python
allow_origins=["https://yourdomain.com", "https://www.yourdomain.com"]
```

And add authentication (API keys, OAuth, session tokens) before deploying any write endpoints like `/upload` and `/reset`.

---

## SECTION 2 — API Routes (`api.py`)

---

### Q4. Describe every API endpoint: method, path, input, output, and what it delegates to.

**Answer:**

| Method | Path | Input | Output | Delegates to |
|--------|------|-------|--------|--------------|
| `POST` | `/api/upload` | `multipart/form-data` with a `file` field | `{ message, chunks_stored }` | `ingest.ingest_file()` |
| `POST` | `/api/ask` | JSON `{ "question": "..." }` | `{ answer, sources: [...] }` | `query.answer_question()` |
| `GET` | `/api/docs-list` | — | `{ "documents": [...] }` | `os.listdir(UPLOAD_DIR)` |
| `DELETE` | `/api/reset` | — | `{ message }` | `shutil.rmtree` on uploads + FAISS dir |

The router is imported into `main.py` and mounted with the `/api` prefix, so the full URLs are `/api/upload`, etc.

---

### Q5. In the upload endpoint, how does FastAPI receive the file? What is `UploadFile` and how does `await file.read()` work?

**Answer:**

```python
@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
```

FastAPI uses Python type annotations as a contract. `UploadFile = File(...)` tells FastAPI to parse the request body as `multipart/form-data` and inject the uploaded file as an `UploadFile` object. The `...` means the field is required — if it's missing, FastAPI returns a 422 automatically.

`UploadFile` wraps the raw bytes of the upload and exposes:
- `file.filename` — original filename from the client
- `file.content_type` — MIME type declared by the browser
- `await file.read()` — asynchronously reads the entire file into memory as `bytes`
- `await file.seek(0)` — rewinds if you need to read again

`await file.read()` is async because FastAPI is built on Starlette which uses ASGI. The file bytes are buffered in a `SpooledTemporaryFile` — small files stay in memory, large files spill to disk. The `await` yields control back to the event loop while waiting for I/O, so the server doesn't block other requests during upload.

---

### Q6. You write the uploaded file to disk like this:

```python
save_path = os.path.join(UPLOAD_DIR, file.filename)
with open(save_path, "wb") as f:
    content = await file.read()
    f.write(content)
```

What are the problems with this approach?

**Answer:**

Several real-world problems here:

1. **Path traversal attack** — `file.filename` is user-controlled. If a client sends `filename = "../../app/config.py"`, `os.path.join` would construct a path outside `UPLOAD_DIR` and overwrite a system file. The fix: `Path(file.filename).name` strips all directory components and gives you only the bare filename.

2. **Filename collision** — Two users uploading `resume.pdf` would silently overwrite each other's file. Fix: prefix with a UUID (`uuid.uuid4().hex + "_" + filename`).

3. **No file size limit** — Someone can upload a 10 GB PDF and exhaust memory because `await file.read()` loads the entire thing into RAM. Fix: read in chunks, or check `Content-Length` header, or use a streaming approach.

4. **Blocking I/O in async context** — `open(...)` and `f.write(...)` are synchronous disk I/O inside an async function. This technically blocks the event loop. Fix: use `aiofiles` for true async file writing, or run the write in a thread pool with `asyncio.to_thread()`.

5. **No sanitization of filename characters** — spaces, unicode, special characters in filenames can cause issues on some OS/filesystems.

---

### Q7. The `/reset` endpoint wipes everything with `shutil.rmtree`. Walk me through exactly what that destroys and why that design is problematic.

**Answer:**

```python
@router.delete("/reset")
async def reset():
    from app.config import CHROMA_DB_PATH as VECTOR_DB_PATH

    if os.path.exists(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR)
        os.makedirs(UPLOAD_DIR)

    if os.path.exists(VECTOR_DB_PATH):
        shutil.rmtree(VECTOR_DB_PATH)

    return {"message": "All documents and vector store have been cleared."}
```

It destroys:
- **All uploaded files** in `./data/uploads/` — PDFs, DOCXs, everything.
- **The FAISS index** in `./data/chromadb/` — `index.faiss` and `index.pkl` — which contains every vector embedding ever computed.

Problems:

1. **Nuclear option** — the delete button on a single file (`app.js` calls `/reset`) wipes **all** documents, not just the selected one. There is no per-document delete. This is a UX disaster and a data loss risk.

2. **No authentication or confirmation** — any unauthenticated HTTP client can `curl -X DELETE http://localhost:8000/api/reset` and wipe the entire system.

3. **Not atomic** — if the process crashes between deleting uploads and deleting the FAISS index, the system ends up in a half-wiped inconsistent state.

4. **FAISS doesn't support per-document deletion** — this is actually a known limitation of FAISS. If you want per-document delete you'd need to track which vectors belong to which document and rebuild the index minus those vectors, which is expensive. Alternative: use a vector store that natively supports deletion by metadata filter (like ChromaDB or Qdrant).

---

### Q8. The Pydantic models in `api.py` — what is their purpose and how does FastAPI use them?

**Answer:**

```python
class QuestionRequest(BaseModel):
    question: str

class SourceChunk(BaseModel):
    filename: str
    chunk_index: int
    text: str

class AnswerResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
```

Pydantic models serve three purposes simultaneously:

1. **Request validation** — when `POST /ask` receives a JSON body, FastAPI deserializes it and validates it against `QuestionRequest`. If `question` is missing or is not a string, FastAPI returns a `422 Unprocessable Entity` with a descriptive error — without you writing a single line of validation code.

2. **Response serialization** — `response_model=AnswerResponse` on the route tells FastAPI to serialize the return value using that model, filter out any unexpected keys, and enforce the schema. It also powers the OpenAPI docs at `/docs`.

3. **Documentation** — the field names and types are reflected in the auto-generated Swagger UI. Developers consuming the API know exactly what to send and what they'll get back.

One gap: `question: str` doesn't enforce a minimum length or max length. A client can send an empty string `""` and it passes Pydantic. The code does check `body.question.strip()` manually, but that constraint should live on the model: `question: str = Field(..., min_length=1, max_length=2000)`.

---

## SECTION 3 — Configuration (`config.py`)

---

### Q9. Explain the configuration pattern in `config.py`. Why load everything at module import time?

**Answer:**

```python
load_dotenv()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./data/chromadb")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./data/uploads")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))
...
```

`load_dotenv()` reads the `.env` file and populates `os.environ`. All config values are then read once at module import time and stored as module-level constants.

**Why at import time?** Because Python modules are loaded once per process. Every other module that does `from app.config import CHUNK_SIZE` gets the same resolved value. It's fast, predictable, and easy to reason about.

**Downsides:**
- If `CHUNK_SIZE` is not a valid integer in the environment, `int(os.getenv(...))` raises a `ValueError` at startup — which is actually good (fail fast) but gives a cryptic traceback.
- Config is not hot-reloadable without restarting the process.
- There's no validation of ranges — nothing stops someone from setting `CHUNK_OVERLAP=9999` (larger than `CHUNK_SIZE`), which would break chunking.

A more production-hardened approach uses Pydantic's `BaseSettings`:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    chunk_size: int = 500
    chunk_overlap: int = 50

    class Config:
        env_file = ".env"
```

This gives you type coercion, validation, and auto-reads from `.env`.

---

## SECTION 4 — The Upload & Ingestion Pipeline (`ingest.py`)

---

### Q10. This is the most critical part. Walk me through the complete journey of a PDF file from the moment the user drops it on the browser to the moment it is stored as vectors in FAISS. Cover every function call, every transformation, and every piece of data at each stage.

**Answer:**

This is the full pipeline. Let's trace a PDF called `resume.pdf`:

---

#### Stage 1 — Browser (frontend/app.js)

The user drops `resume.pdf` on the drop zone. The browser:
1. Fires a `drop` event; JavaScript intercepts it and calls `uploadFile(file)`.
2. Builds a `FormData` object: `formData.append("file", file)`.
3. Makes a `POST` request to `http://localhost:8000/api/upload` with `Content-Type: multipart/form-data`.

At this point the file is raw bytes traveling over HTTP.

---

#### Stage 2 — FastAPI receives the request (`api.py`)

```python
async def upload_document(file: UploadFile = File(...)):
```

FastAPI parses the multipart body and gives us an `UploadFile` object. We check the extension:

```python
ext = Path(file.filename).suffix.lower()  # → ".pdf"
if ext not in {".pdf", ".docx", ".txt", ".md"}:
    raise HTTPException(status_code=400, ...)
```

Then we write the raw bytes to disk:

```python
save_path = os.path.join(UPLOAD_DIR, file.filename)
# → "./data/uploads/resume.pdf"
with open(save_path, "wb") as f:
    content = await file.read()  # read all bytes into memory
    f.write(content)             # write to disk
```

Now `./data/uploads/resume.pdf` exists on disk.

---

#### Stage 3 — `ingest_file(file_path)` is called

```python
chunks_stored = ingest_file(save_path)
```

This is the orchestrator function in `ingest.py`. It calls three sub-steps:

---

#### Stage 3a — `load_document(file_path)` — PDF → LangChain Documents

```python
def load_document(file_path: str) -> List[Document]:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
    ...
    return loader.load()
```

`PyPDFLoader` is a LangChain wrapper around the `pypdf` library. It:
1. Opens the PDF file.
2. Iterates over every **page** in the PDF.
3. Extracts the text from each page using `pypdf`'s text extraction engine.
4. Returns a `List[Document]` — one `Document` per page.

Each `Document` has:
- `page_content: str` — the raw text extracted from that page.
- `metadata: dict` — e.g., `{"source": "./data/uploads/resume.pdf", "page": 0}`.

**How does `pypdf` extract text from a PDF?**

PDFs are not plain text files. They're a binary format that contains content streams with drawing commands. Text in a PDF is encoded as glyph positioning instructions (`Tf`, `Tj`, `TJ` operators in PDF content streams). `pypdf` parses the content stream, maps glyph codes to Unicode characters using the font's `ToUnicode` CMap, and assembles the characters into strings.

This works well for text-based PDFs. It fails for **scanned PDFs** (which are images of pages with no text layer) — you'd need OCR (e.g., `pytesseract`) to handle those. The current system has no OCR fallback.

---

#### Stage 3b — `split_documents(documents)` — Pages → Chunks

```python
def split_documents(documents: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,       # default 500 characters
        chunk_overlap=CHUNK_OVERLAP, # default 50 characters
        separators=["\n\n", "\n", ".", " ", ""],
    )
    return splitter.split_documents(documents)
```

A single PDF page can have thousands of characters. LLMs have context window limits, and you want to retrieve only the most relevant passage — not entire pages. So we split.

`RecursiveCharacterTextSplitter` works like this:
1. It tries to split the text using the first separator (`"\n\n"` — paragraph breaks).
2. If any resulting piece is still larger than `CHUNK_SIZE` (500 chars), it tries the next separator (`"\n"` — line breaks).
3. It keeps going down the list (`"."`, `" "`, `""`) until all chunks are ≤ 500 characters.
4. `chunk_overlap=50` means the last 50 characters of chunk N are repeated as the first 50 characters of chunk N+1. This preserves context across chunk boundaries so a sentence that straddles a cut isn't lost.

**What does a chunk look like?**

Still a `Document` object:
```python
Document(
    page_content="Mohamed Salah is a professional footballer born in...",
    metadata={"source": "./data/uploads/resume.pdf", "page": 0}
)
```

---

#### Stage 3c — Tagging chunks with source filename

```python
source_name = Path(file_path).name  # → "resume.pdf"
for chunk in chunks:
    chunk.metadata["source"] = source_name
```

The `metadata["source"]` is overwritten with just the bare filename (stripping the full path). This is used later in `query.py` to tell the user which file a source chunk came from.

---

#### Stage 3d — Embedding + FAISS storage

```python
embeddings = providers.get_embeddings()
os.makedirs(FAISS_INDEX_PATH, exist_ok=True)

if os.path.exists(os.path.join(FAISS_INDEX_PATH, "index.faiss")):
    vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
    vector_store.add_documents(chunks)
else:
    vector_store = FAISS.from_documents(chunks, embeddings)

vector_store.save_local(FAISS_INDEX_PATH)
```

**What is an embedding?**

An embedding is a dense numerical vector (a list of floating-point numbers) that represents the semantic meaning of a piece of text. Semantically similar texts produce vectors that are close together in the high-dimensional vector space.

`providers.get_embeddings()` returns a `HuggingFaceEmbeddings` object using `all-MiniLM-L6-v2` (when Groq is active). This model produces **384-dimensional** vectors.

`FAISS.from_documents(chunks, embeddings)`:
1. Iterates over all chunks.
2. Calls the embedding model on each chunk's `page_content` — produces a `(384,)` float32 vector per chunk.
3. Stores all vectors in a FAISS `IndexFlatL2` (flat L2 distance index by default).
4. Stores the original `Document` objects in a separate in-memory dict keyed by integer ID.

`vector_store.save_local(FAISS_INDEX_PATH)` writes two files:
- `index.faiss` — the binary FAISS index (the vectors).
- `index.pkl` — a pickle of the docstore (the original `Document` objects).

If the index already exists, `add_documents` embeds the new chunks and appends them — the index grows incrementally without re-embedding old documents.

---

#### Stage 4 — Response to the browser

```python
return {
    "message": f"'{file.filename}' ingested successfully.",
    "chunks_stored": len(chunks),
}
```

The browser gets back the number of chunks, stores it in `localStorage` under `deepask_chunks`, and uses it in the mind map to render chunk nodes.

---

### Q11. What is `allow_dangerous_deserialization=True` in `FAISS.load_local()`? Why is it dangerous and why is it there?

**Answer:**

```python
FAISS.load_local(
    FAISS_INDEX_PATH,
    embeddings,
    allow_dangerous_deserialization=True,
)
```

The `index.pkl` file is a Python pickle. Pickle deserialization is inherently dangerous because a malicious pickle file can execute arbitrary Python code when loaded. An attacker who can write to `./data/chromadb/index.pkl` can get remote code execution.

LangChain added this flag as a warning mechanism — they force you to explicitly opt in to acknowledge the risk. Without `allow_dangerous_deserialization=True` the call raises an error with a security warning.

It's there because the current system saves and loads its own pickle file (self-generated). The assumption is that you trust your own file system. That assumption breaks if:
- The uploads directory or data directory is writable by untrusted users.
- The server is compromised and an attacker plants a malicious `index.pkl`.

For a production system, switch to a vector store that doesn't use pickle for persistence — ChromaDB, Qdrant, Pinecone, pgvector. They serialize vectors in safe formats.

---

### Q12. What happens if you upload the same PDF twice? Walk through the code path.

**Answer:**

1. **File on disk is overwritten** — `save_path = os.path.join(UPLOAD_DIR, file.filename)` uses the same path, so `open(save_path, "wb")` silently clobbers the existing file.

2. **FAISS index grows** — Because the index already exists, `ingest_file` takes the `add_documents` branch:
   ```python
   vector_store = FAISS.load_local(...)
   vector_store.add_documents(chunks)
   ```
   The old vectors from the first upload are still in the index. Now the same document's chunks are in there twice. Every query will potentially return duplicate results from the same document.

3. **No deduplication** — FAISS is a pure vector index, not a database. It has no concept of unique documents or update-by-key. There's no check like "has this file already been indexed?".

**How to fix:** Before ingesting, check if `file.filename` has already been indexed (e.g., track a set of ingested filenames in a JSON sidecar file or a small SQLite DB). If it has, either reject the upload or delete the old vectors first (requires rebuilding the index).

---

### Q13. The `RecursiveCharacterTextSplitter` uses `separators=["\n\n", "\n", ".", " ", ""]`. Explain what the empty string `""` does as the last separator.

**Answer:**

The empty string `""` is the absolute fallback. If a chunk of text has no paragraph breaks, no newlines, no periods, and no spaces — meaning it's one long unbreakable token string — the splitter will cut it at arbitrary character positions to enforce the `chunk_size` limit.

In practice this situation arises with:
- Long URLs: `https://www.verylongdomainname.com/path/to/resource?param=value...`
- Hashes or encoded strings: `SHA256:abc123def456...`
- Dense technical content with no whitespace.

Without `""` in the list, the splitter would fail to split such content and could produce chunks larger than `CHUNK_SIZE`. The empty string guarantees the constraint is always honored, at the cost of potentially splitting mid-word or mid-token.

---

### Q14. How would the ingestion pipeline handle a `.docx` and a `.txt` file differently from a PDF?

**Answer:**

All three hit the same `load_document()` function, which dispatches by extension:

```python
if ext == ".pdf":
    loader = PyPDFLoader(file_path)
elif ext == ".docx":
    loader = Docx2txtLoader(file_path)
elif ext in [".txt", ".md"]:
    loader = TextLoader(file_path, encoding="utf-8")
```

**DOCX (`Docx2txtLoader`):**
- Uses the `docx2txt` library under the hood.
- Reads the `word/document.xml` inside the `.docx` ZIP archive.
- Extracts all paragraph text, concatenates it.
- Returns a **single `Document`** with all text (no per-page splitting like PDF).
- Loses formatting: headers, tables, bullet points become plain text.

**TXT / MD (`TextLoader`):**
- Opens the file as plain text with the specified encoding.
- Returns a **single `Document`** with the entire file content as `page_content`.
- No extraction needed — it's already text.
- The `encoding="utf-8"` is important; without it, files with non-ASCII characters (Arabic, Chinese, etc.) would raise a `UnicodeDecodeError`.

After loading, all three file types go through the same `split_documents()` → embedding → FAISS pipeline identically.

---

## SECTION 5 — Provider Abstraction (`providers.py`)

---

### Q15. Explain the provider pattern in `providers.py`. Why is it designed this way and what problem does it solve?

**Answer:**

```python
def get_embeddings():
    if GROQ_API_KEY:
        from langchain_community.embeddings import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(model_name=SENTENCE_TRANSFORMER_MODEL)
    else:
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(base_url=OLLAMA_BASE_URL, model=OLLAMA_EMBED_MODEL)

def get_llm():
    if GROQ_API_KEY:
        from langchain_groq import ChatGroq
        return ChatGroq(api_key=GROQ_API_KEY, model_name=GROQ_MODEL, temperature=0)
    else:
        from langchain_ollama import ChatOllama
        return ChatOllama(base_url=OLLAMA_BASE_URL, model=OLLAMA_LLM_MODEL, temperature=0)
```

The problem it solves: **deployment flexibility**. This system needs to run in two very different environments:
- **Cloud/CI:** Has a Groq API key. Uses Groq's LLM (fast, cloud-hosted). Embeddings are local (`all-MiniLM-L6-v2`) because Groq doesn't offer an embeddings endpoint.
- **Local/offline:** No API key. Uses Ollama for both LLM and embeddings — runs entirely on the developer's machine with no internet dependency.

The provider functions abstract this decision behind a single call. Neither `ingest.py` nor `query.py` knows or cares which backend is active. They just call `providers.get_embeddings()` and get back a LangChain-compatible object.

**What's a notable design flaw here?**

The imports are inside the function bodies. This is intentional — lazy imports. If `HuggingFaceEmbeddings` is imported at module level but `sentence-transformers` isn't installed, the entire app crashes at startup. By moving the import inside the `if` branch, you only import what you actually use. This is a valid defensive pattern.

However, calling `get_embeddings()` creates a **new model instance every time it's called**. In `ingest.py` it's called once per upload (OK). But if you called it per-query in a high-traffic scenario, you'd reload the model from disk on every request — expensive. Better: cache the instance (`@lru_cache` or a module-level singleton).

---

### Q16. The Groq path uses `HuggingFaceEmbeddings` locally, not Groq's API, for embeddings. Why?

**Answer:**

Groq is an LLM inference provider. Their API offers fast text generation (LLaMA, Mixtral models) but **no embeddings endpoint**. They don't have an equivalent to OpenAI's `text-embedding-ada-002` or Cohere's embedding API.

So the design is a deliberate split:
- **Groq → LLM** (text generation, answering questions)
- **Sentence-Transformers (`all-MiniLM-L6-v2`) → Embeddings** (run locally on CPU, no API needed)

`all-MiniLM-L6-v2` is a small, fast model (22M parameters, 384-dimensional output). It runs on CPU in milliseconds per chunk. It's "good enough" for semantic similarity in a personal document context.

The important consistency requirement: **the same embedding model must be used for both ingestion and querying**. If you ingest with `all-MiniLM-L6-v2` and then switch to a different model for querying, the dot products between query vectors and stored vectors will be meaningless. The model choice is baked into the FAISS index.

---

## SECTION 6 — How the Backend Serves the Frontend Pages

---

### Q17. The frontend has three HTML pages. How does each one reach the user's browser? Trace the full HTTP flow.

**Answer:**

The three pages and their backend routes:

```python
@app.get("/", include_in_schema=False)
async def root():
    return FileResponse("frontend/index.html")

@app.get("/mindmap", include_in_schema=False)
async def mindmap():
    return FileResponse("frontend/mindmap.html")

@app.get("/chat", include_in_schema=False)
async def chat():
    return FileResponse("frontend/chat.html")
```

**Flow for `http://localhost:8000/`:**

1. Browser sends `GET / HTTP/1.1` to Uvicorn.
2. Uvicorn passes the ASGI scope to the FastAPI app.
3. FastAPI matches the path `/` to the `root()` route.
4. `FileResponse("frontend/index.html")` opens the file at `frontend/index.html` (relative to the working directory where you ran `uvicorn app.main:app`).
5. FastAPI sets `Content-Type: text/html; charset=utf-8` and streams the file bytes in the HTTP response body.
6. Browser receives the HTML and starts parsing it.

**Follow-up: the HTML file references JS/CSS files. How do they load?**

`index.html` has `<link rel="stylesheet" href="/static/style.css">` and `<script src="/static/app.js">`. These hit the static mount:

```python
app.mount("/static", StaticFiles(directory="frontend"), name="static")
```

The browser sends `GET /static/style.css`, which is served by `StaticFiles` directly from `frontend/style.css`. No Python function is called — Starlette handles static file serving efficiently.

---

### Q18. `app.js`, `chat.js`, and `mindmap.js` all hardcode `const API = "http://localhost:8000/api"`. What is wrong with this in production?

**Answer:**

Everything. Hardcoding `localhost:8000` means:
- If the backend is deployed to a different host (e.g., `api.myapp.com`), every frontend call fails.
- If the port changes, every frontend call fails.
- You can't test against a staging environment without editing the source code.

The correct approach depends on the deployment model:

**Option A — Same origin deployment (backend serves frontend):**
Since FastAPI is already serving the HTML, you can use a relative URL:
```javascript
const API = "/api";
```
The browser resolves `/api` relative to whatever host served the page. Works in dev (`localhost:8000/api`) and production (`myapp.com/api`) without any changes.

**Option B — Environment variable injection at build time:**
Use a bundler (Vite, Webpack) and reference `import.meta.env.VITE_API_URL`.

Since there's no bundler here and the frontend is plain HTML/JS served directly by FastAPI, Option A (relative URL `/api`) is the right fix with zero effort.

---

## SECTION 7 — Error Handling

---

### Q19. What happens if someone calls `POST /api/ask` before uploading any document?

**Answer:**

Trace the call:

1. `api.py` calls `answer_question(body.question)`.
2. `query.py` calls `get_qa_chain()`.
3. `get_qa_chain()` calls `get_vector_store()`.
4. `get_vector_store()` in `ingest.py` checks:
   ```python
   if not os.path.exists(os.path.join(FAISS_INDEX_PATH, "index.faiss")):
       raise FileNotFoundError("No documents have been ingested yet...")
   ```
5. `FileNotFoundError` is raised. Back in `get_qa_chain()`:
   ```python
   except FileNotFoundError as e:
       raise RuntimeError(str(e))
   ```
6. `RuntimeError` propagates up to `api.py`'s `ask_question`:
   ```python
   except Exception as e:
       raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
   ```
7. Client receives: `HTTP 500 { "detail": "Query failed: No documents have been ingested yet. Please upload a document first." }`

This works, but returning a `500` for a predictable user error (no documents uploaded) is semantically wrong. The correct status code is `400 Bad Request` or `422 Unprocessable Entity`. A `500` implies an unexpected server error, which could cause monitoring systems to fire false alerts.

Better: check upfront in the API layer before calling the chain:

```python
if not os.path.exists(os.path.join(FAISS_INDEX_PATH, "index.faiss")):
    raise HTTPException(status_code=400, detail="No documents uploaded yet.")
```

---

### Q20. The `ingest_file` call in the upload endpoint is wrapped in a try/except. What kinds of errors could it throw, and are they all handled well?

**Answer:**

```python
try:
    chunks_stored = ingest_file(save_path)
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")
```

Potential errors inside `ingest_file`:

| Error | Source | Handled? |
|-------|--------|----------|
| `ValueError: Unsupported file type` | `load_document()` for unknown extension | Yes (caught) — but this should never reach here because extension validation happens earlier in the upload route |
| `pypdf` extraction failure | Corrupted or encrypted PDF | Yes (caught) — returned as 500 |
| `HuggingFaceEmbeddings` model download failure | First-time run, no internet | Yes (caught) |
| `FileNotFoundError` | `save_path` doesn't exist (race condition) | Yes (caught) |
| `MemoryError` | Extremely large file exhausts RAM | Yes (caught) — but the process may be killed by the OS before Python catches it |
| FAISS `add_documents` failure | Corrupted index file | Yes (caught) |

The broad `except Exception` catch-all is intentional but hides the specific error type from the developer. In production you'd want structured logging: `logger.exception("Ingestion failed", exc_info=True)` alongside the HTTP error response, so you can debug without relying on the client to report error details.

Also: if `ingest_file` raises, the file was already written to disk. The error handler doesn't clean up the orphaned file in `UPLOAD_DIR`. The file sits there, appears in `GET /docs-list`, but has no corresponding vectors in FAISS. Future queries won't find it. You should delete the file on ingestion failure.

---

## SECTION 8 — Quick-Fire Roast Round

---

### Q21. The `chunk_index` in the source response — is it the actual chunk index from the FAISS index?

**Answer:**

No, and this is a subtle lie. In `query.py`:

```python
for i, doc in enumerate(result.get("source_documents", [])):
    chunk_index = i + 1  # 1-based position in THIS result list
```

`chunk_index` is just the position in the returned `source_documents` list — Chunk 1, Chunk 2, etc. It's not a stable ID tied to the document's position in the FAISS index. Upload a file, query it, get Chunk 3. Upload another file. Query again — the same text passage might now come back labeled Chunk 2 because the ranking changed. It's a display number, not a real identifier.

---

### Q22. `os.makedirs(UPLOAD_DIR, exist_ok=True)` is called at module import time in `api.py`. Is this a problem?

**Answer:**

Minor issue. Module-level side effects (creating directories, opening files, making network connections) during import are generally bad practice because:
- Unit tests that import `api.py` will create the directory on the test runner's filesystem.
- It makes the module harder to reuse in contexts where you don't want file system side effects.

Better: move directory creation into a FastAPI startup event:
```python
@app.on_event("startup")
async def startup():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
```

Or use FastAPI's newer lifespan context manager.

---

### Q23. The `docs-list` endpoint reads from the filesystem. What's the discrepancy between what it returns and what's actually queryable?

**Answer:**

`GET /docs-list` returns `os.listdir(UPLOAD_DIR)` — the files physically on disk. But the FAISS index may not contain all of them (e.g., if a file was uploaded but ingestion failed). Conversely, after `/reset` wipes the uploads directory, `docs-list` returns an empty list even though (if the FAISS index wasn't deleted) the vectors are still there.

The filesystem is being used as a makeshift database, and filesystem state and vector store state can drift apart. A proper solution tracks document metadata in a real database (even SQLite) with a row per document recording filename, ingestion status, chunk count, and ingestion timestamp.

---

### Q24. What does `temperature=0` mean in the LLM initialization, and why is it appropriate here?

**Answer:**

```python
ChatGroq(api_key=GROQ_API_KEY, model_name=GROQ_MODEL, temperature=0)
```

`temperature` controls the randomness of the LLM's output. At `temperature=0`, the model always picks the highest-probability next token — output is deterministic and focused. At `temperature=1.0`, it samples more creatively, producing varied but potentially incoherent answers.

For a RAG Q&A system over personal documents, `temperature=0` is exactly right. You want the model to answer factually based on the retrieved context, not get creative. You don't want it hallucinating variations. Determinism also makes the system easier to debug — the same question with the same retrieved chunks always produces the same answer.

---

*End of interview. You have been thoroughly roasted. Fix your path traversal bug, your duplicate-upload issue, your hardcoded localhost, your 500-for-user-errors, your pickle deserialization risk, and your nuclear reset button. Then come back and we'll talk about the RAG side.*
