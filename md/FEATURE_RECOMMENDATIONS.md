# DeepAsk — Feature Recommendations
> Research-backed suggestions for the chat section before Groq + Railway deployment.
> Prioritized by impact vs implementation effort.

---

## Current State (What You Have)

| Component | Status |
|-----------|--------|
| RAG pipeline (FAISS + sentence-transformers + Groq) | ✅ Working |
| Chat UI with source map (SVG node graph) | ✅ Working |
| Chunk popup (click node → read raw chunk text) | ✅ Working |
| Mind map (doc → chunk expand/collapse) | ✅ Working |
| Per-question stateless Q&A | ✅ Working |
| **Conversation memory (multi-turn)** | ❌ Missing |
| **Persistent chat sessions** | ❌ Missing |
| **Chat bookmarks / breakpoints** | ❌ Missing |
| **Chunk context in mind map** | ❌ Missing |

---

## Recommendation 1 — Conversation Memory (Full Chat History Sent to LLM)

### The Problem
Right now every question is completely independent. The LLM sees only:
```
Context: [retrieved chunks]
Question: what are the cancellation terms?
```

If the user then asks "what about the refund window?" the LLM has no idea what "that" refers to.
Every turn is a fresh start — this breaks any back-and-forth conversation flow.

### What to Add
Send the last N message pairs (user + assistant) along with every new question so the LLM has context of the conversation so far.

**Backend change — `query.py`:**
Replace `RetrievalQA` with `ConversationalRetrievalChain` (already in LangChain). Accept a `chat_history` list in the `/ask` request body. The chain rewrites the follow-up question using history before searching FAISS — this is the key step that makes "what about that?" work.

```python
# New request shape
class QuestionRequest(BaseModel):
    question: str
    chat_history: list[tuple[str, str]] = []  # [(user_msg, ai_msg), ...]
```

```python
# In query.py — swap RetrievalQA for ConversationalRetrievalChain
from langchain.chains import ConversationalRetrievalChain

chain = ConversationalRetrievalChain.from_llm(
    llm=providers.get_llm(),
    retriever=retriever,
    return_source_documents=True,
    combine_docs_chain_kwargs={"prompt": prompt},
)
result = chain.invoke({"question": question, "chat_history": chat_history})
```

**Frontend change — `chat.js`:**
Keep a `chatHistory` array in state. Append each `[question, answer]` pair after every response. Send it along with every new request.

```js
let chatHistory = [];  // [[userMsg, assistantMsg], ...]

// In sendMessage(), before fetch:
body: JSON.stringify({ question, chat_history: chatHistory })

// After successful response:
chatHistory.push([question, data.answer]);
```

**Token window tip:** Cap `chat_history` at the last 6–8 pairs to avoid hitting Groq's token limit. Groq's `llama3-8b-8192` has an 8k context window — with chunks + system prompt + history, 6 pairs is a safe ceiling.

### Impact
This is the single highest-impact feature. Everything else in this list is optional quality-of-life. This one changes the nature of the tool from a search bar into an actual conversation partner.

---

## Recommendation 2 — Persistent Chat Sessions (Named Conversations)

### The Problem
Every page refresh wipes the entire conversation. There's no way to come back to a session you started an hour ago, or compare two separate research threads.

### What to Add
Store conversations in `localStorage` on the client side (no backend change needed until you want cross-device sync). Each session gets an ID, a name, a timestamp, and the message array.

**Data shape (localStorage key: `deepask_sessions`):**
```json
[
  {
    "id": "abc123",
    "name": "HTML/CSS Review",
    "createdAt": "2025-06-21T10:00:00Z",
    "updatedAt": "2025-06-21T10:42:00Z",
    "messages": [
      { "role": "user", "content": "What is the box model?" },
      { "role": "assistant", "content": "..." }
    ],
    "chatHistory": [["What is the box model?", "..."]]
  }
]
```

**Auto-save:** Save to `localStorage` after every assistant response.
**Auto-name:** Default name = first 40 characters of the first user message. User can rename it.

---

## Recommendation 3 — Chat Sidebar with Breakpoints (The Ribbon You Described)

### What to Build
A collapsible left-side ribbon panel that lists all saved sessions. Each session entry shows:
- Session name (editable inline on double-click)
- Timestamp of last message
- A "jump to" button

Inside each session in the sidebar, you can optionally show **breakpoints** — named anchors the user pins to specific messages in the conversation. Think of it like Git tags on commits.

**Sidebar layout:**
```
┌─────────────────────────────────────────┐
│ [+] New Session                         │
│ ─────────────────────────────────────── │
│ 📁 HTML/CSS Review          2 hours ago │
│    📍 "Where flexbox starts"            │
│    📍 "Grid layout notes"               │
│ ─────────────────────────────────────── │
│ 📁 Resume Analysis          yesterday   │
│ ─────────────────────────────────────── │
│ 📁 Lab 2 Questions          3 days ago  │
└─────────────────────────────────────────┘
```

**Breakpoint interaction:**
- Each assistant message gets a "📍 Pin" button that appears on hover
- Clicking it opens a small input: "Name this breakpoint" (e.g. "Where flexbox starts")
- The breakpoint is stored in the session data under the message index
- Clicking a breakpoint in the sidebar scrolls that message into view in the chat panel (using `element.scrollIntoView()`)
- The mind map integration (see Rec 5 below) makes these even more useful

**Data shape:**
```json
{
  "breakpoints": [
    { "label": "Where flexbox starts", "messageIndex": 4 }
  ]
}
```

**Toggling the sidebar:**
Add a `<button class="sidebar-toggle">` to the chat header. Clicking it adds/removes a `.sidebar-open` class on the `chat-layout`, which shifts the layout via CSS `grid-template-columns`.

---

## Recommendation 4 — Continue From Any Point in the Session

### What to Add
A "Continue from here" button on each message. When clicked it:
1. Truncates `chatHistory` to all pairs up to and including that message
2. Clears the visible messages below that point
3. Puts the cursor in the input so the user can branch the conversation from there

This is the "branch off" feature — you asked 10 questions, want to explore an alternative path from question 6 without losing the original thread.

**Implementation:** Keep a snapshot of the full message array in the session. When branching, create a new session forked from that point, then switch to it. The original session is preserved.

---

## Recommendation 5 — Mind Map Breakpoint Navigation

### The Problem
Right now the mind map and chat are completely disconnected views. You switch between them manually.

### What to Add
When the user sets a breakpoint in chat (Rec 3), optionally show it as a labeled node on the mind map. This gives a spatial view of "what did I learn from which document, and when."

**Data flow:**
```
Chat breakpoint "Where flexbox starts" (linked to CST-Day2-HTML-CSS.pdf)
        ↓
Mind map shows a 3rd node type: "📍 Breakpoint"
Connected to: the doc node (CST-Day2-HTML-CSS.pdf)
Label: "Where flexbox starts"
Click → switches to Chat view, scrolls to that message
```

This creates a genuine knowledge map, not just a file visualizer. The mind map becomes an annotated view of the user's entire learning journey across their documents.

---

## Recommendation 6 — Chunk Relevance Scoring in the Source Map

### The Problem
You already show chunks in the source map but all nodes look identical. The user can't tell which chunk was more relevant to the answer than the others.

### What to Add
Return the similarity score alongside each chunk from the backend. Use it to visually differentiate the nodes.

**Backend change — `query.py`:**
```python
# Switch from similarity_score_threshold retriever to a direct similarity search
# to get scores back
docs_and_scores = vector_store.similarity_search_with_score(question, k=TOP_K_RESULTS)

# Filter by threshold manually
sources = []
for doc, score in docs_and_scores:
    if score >= RELEVANCE_SCORE_THRESHOLD:
        sources.append({
            "filename": doc.metadata.get("source"),
            "chunk_index": ...,
            "text": doc.page_content,
            "score": round(float(score), 3),  # ← new field
        })
```

**Frontend change — `chat.js` source map:**
- Scale the circle `r` by score: higher score = bigger node
- Or use opacity: most-relevant chunk is fully opaque, least-relevant is faint
- Show score in the sublabel: `"Chunk 2 · 0.84"`

This turns the source map from a decorative visualization into an actually informative one. The user immediately sees which chunks drove the answer.

---

## Recommendation 7 — Per-File Chunk Explorer in the Mind Map

### The Problem
The mind map expands doc nodes to show "Chunk 1, Chunk 2, Chunk 3..." but these are just labels — they don't tell you anything about the content.

### What to Add
Two things:
1. Store chunk texts keyed by filename in `localStorage` when a file is uploaded (from the `/upload` response which already returns `chunks_stored`)
2. Add a `GET /api/chunks/{filename}` endpoint that returns all chunk texts for a file

**Benefit:** Clicking a chunk in the mind map shows its actual content in a side panel — you can browse the full decomposition of a document before even asking a question. This helps the user understand why certain questions get good or bad answers (their chunks are too fragmented, or the document wasn't split well at a section boundary).

**Backend (`api.py`):**
```python
@router.get("/chunks/{filename}")
async def get_chunks(filename: str):
    vector_store = get_vector_store()
    # Filter by metadata source
    all_docs = vector_store.docstore._dict.values()
    chunks = [
        {"index": i+1, "text": doc.page_content}
        for i, doc in enumerate(all_docs)
        if doc.metadata.get("source") == filename
    ]
    return {"filename": filename, "chunks": chunks}
```

---

## Summary — Priority Order

| # | Feature | Impact | Effort | Do Before Deploy? |
|---|---------|--------|--------|-------------------|
| 1 | Conversation memory (multi-turn) | 🔴 Critical | Low | **Yes** |
| 2 | Persistent sessions (localStorage) | 🟠 High | Low–Medium | **Yes** |
| 3 | Chat sidebar with breakpoints + rename | 🟠 High | Medium | Yes |
| 4 | Continue/branch from any message | 🟡 Medium | Low | Optional |
| 5 | Breakpoints appear on mind map | 🟡 Medium | Medium | Optional |
| 6 | Chunk relevance score in source map | 🟢 Nice-to-have | Low | Optional |
| 7 | Per-file chunk explorer in mind map | 🟢 Nice-to-have | Medium | Optional |

**Minimum for a good pre-deployment experience:** Items 1, 2, and 3.
Item 1 alone takes the app from "search box" to "actual AI assistant." Items 2+3 make it feel like a real product (ChatGPT-style session management) rather than a prototype.

---

## What NOT to Do Before Deployment

- Don't add a database (PostgreSQL, SQLite) just for sessions — `localStorage` is enough for v1 and adds zero infrastructure complexity for Railway
- Don't add user auth yet — it's a big scope increase and sessions per-browser is fine for a personal tool
- Don't switch embedding models right before deployment — `all-MiniLM-L6-v2` is stable and fast; re-embedding all existing docs is a risk

---

*Sources consulted: [RAG memory patterns](https://ragaboutit.com/how-to-build-memory-enabled-rag-systems-with-microsofts-mem0-the-complete-persistent-context-guide-for-enterprise-applications/), [AI chat UI design](https://www.setproduct.com/blog/ai-chat-interface-ui-design), [Conversation memory in LangChain RAG](https://engineersofai.substack.com/p/ai-letters-22-conversation-memory)*

---

---

# Response Quality Fixes
> Why the LLM misses answers that are clearly in your PDF, and how to fix each root cause.
> All diagnostics are based on reading the actual values in `config.py`, `ingest.py`, and `query.py`.

---

## Diagnosed Problems

You reported two symptoms:
1. The LLM fails to answer something that is **clearly written in the PDF**
2. When switching between documents in a session, answers **mix up content** from different files

Both have concrete, fixable causes in the current code.

---

## Fix 1 — Chunk Size Is Too Small (Answers Are Getting Cut in Half)

### Root cause — `config.py`
```python
CHUNK_SIZE = 500      # ← 500 characters
CHUNK_OVERLAP = 50    # ← only 50 chars of overlap
```

500 characters is roughly 80–100 words — about one short paragraph. The problem:
- A concept explained across two paragraphs gets **split into two separate chunks**
- FAISS retrieves the chunk that matches your query's keywords, but the actual answer is in the *adjacent* chunk that scores lower
- The LLM receives an incomplete fragment and either says it doesn't know or gives a partial answer

**Example:** A PDF explains "what is the CSS box model" across 3 sentences in one paragraph and 2 sentences in the next. At 500 chars, those sentences land in different chunks. You ask "what is the box model?" — FAISS returns chunk A (the definition) but not chunk B (the details). The LLM gives a shallow answer even though the full answer is in the file.

### The fix — raise chunk size, raise overlap

In your `.env` (or directly in `config.py` defaults):

```python
CHUNK_SIZE = 1000     # was 500 — fits a full concept in one chunk
CHUNK_OVERLAP = 150   # was 50  — bridges sentence boundaries between chunks
```

**Why 1000?** Groq's `llama3-8b-8192` has an 8192 token context window. With `TOP_K_RESULTS = 5` chunks at ~750 tokens each, you use ~3750 tokens for context — well within the window. You have room.

**Why 150 overlap?** Overlap is what catches the case where a sentence starts in chunk N and finishes in chunk N+1. 10% of chunk size is the standard minimum; 15% is safer for paragraph-heavy content like lecture notes.

**⚠️ Important:** After changing chunk size, you must **re-ingest all documents** — delete `data/chromadb/` and re-upload everything. The existing FAISS index was built with 500-char chunks and won't benefit from this change.

---

## Fix 2 — Score Threshold Is Too Permissive (Documents Are Bleeding Into Each Other)

### Root cause — `config.py` + `query.py`
```python
RELEVANCE_SCORE_THRESHOLD = 0.2   # ← nearly anything passes
TOP_K_RESULTS = 5                  # ← returns up to 5 chunks from ALL documents
```

Your retriever uses `search_type="similarity_score_threshold"` with a threshold of `0.2`. For cosine similarity (which FAISS + sentence-transformers uses), **0.2 is close to random**. A chunk from `CST-Day2-HTML-CSS.pdf` about CSS will score 0.3–0.4 against a question about your resume, and it passes the filter.

When you switch from asking about HTML/CSS to asking about the resume:
- The new question retrieves 5 chunks
- 2–3 of them are from the correct file
- 1–2 are leftover HTML/CSS chunks that are vaguely similar
- The LLM gets mixed context and either hedges ("based on the documents, I see references to both...") or confabulates

### The fix — raise the threshold, reduce k for unfocused queries

```python
RELEVANCE_SCORE_THRESHOLD = 0.45  # was 0.2 — much stricter, only genuinely relevant chunks pass
TOP_K_RESULTS = 4                 # was 5 — fewer but higher-quality chunks
```

**How to calibrate:** 0.45 is a good starting point for `all-MiniLM-L6-v2`. Values to understand:
- `< 0.3` — basically noise, semantically unrelated content
- `0.3–0.45` — loosely related, dangerous for multi-document setups
- `0.45–0.65` — genuinely topically similar
- `> 0.65` — very close match, almost certainly from the right section

**Optional — expose threshold in the UI:** Add a "strictness" slider to the source panel (0.3 → 0.7). Power users will find it useful to tune per-question.

---

## Fix 3 — The Prompt Doesn't Tell the LLM Which Document to Focus On

### Root cause — `query.py` `PROMPT_TEMPLATE`

The current prompt:
```
Context:
{context}

Question: {question}

Answer:
```

The `{context}` block contains chunks from **multiple documents concatenated together with no labels**. The LLM has no structural signal for which chunk came from which file. It treats the whole context as one blob.

### The fix — inject source labels into the context

Change how context is assembled in `query.py`. Instead of letting LangChain's default "stuff" chain concatenate chunks silently, build the context string manually with file labels:

```python
# In answer_question(), build a labeled context string
labeled_context = ""
for doc in source_docs:
    fname = doc.metadata.get("source", "unknown")
    labeled_context += f"\n\n[Source: {fname}]\n{doc.page_content.strip()}"
```

Then update the prompt template to reference the labels:

```python
PROMPT_TEMPLATE = """You are a helpful assistant that answers questions based strictly on the provided document excerpts.
Each excerpt is labeled with its source file in [Source: filename] tags.

Rules:
- Answer only from the provided excerpts. Do not use prior knowledge.
- If multiple sources are present, state which source your answer comes from.
- If the answer is in the excerpts but requires combining two passages, do so explicitly.
- If the answer is not in any excerpt, say: "I couldn't find that in the uploaded documents."
- If the question is vague or not a real question, ask for clarification.

Document excerpts:
{context}

Question: {question}

Answer (cite the source file):"""
```

This has two effects:
1. The LLM knows which file each chunk belongs to and will reference it in the answer (e.g. "According to CST-Day2-HTML-CSS.pdf...")
2. When context is mixed, the LLM can explicitly reason about which source is relevant rather than blending them

---

## Fix 4 — Upgrade the Groq Model (Free, Instant)

### Root cause — `config.py`
```python
GROQ_MODEL = "llama3-8b-8192"   # ← 8B parameter model
```

`llama3-8b-8192` is fast but it's a small model. It struggles with:
- Questions that require synthesizing information from multiple sentences
- Following complex system-prompt instructions accurately
- Knowing when to say "I don't know" vs making something up

Groq offers larger models at the same free tier:

| Model | Params | Context | Groq free? | Recommendation |
|-------|--------|---------|------------|----------------|
| `llama3-8b-8192` | 8B | 8k | ✅ | Current (baseline) |
| `llama3-70b-8192` | 70B | 8k | ✅ | **Best quality upgrade** |
| `mixtral-8x7b-32768` | ~47B | 32k | ✅ | Best for long documents |
| `gemma2-9b-it` | 9B | 8k | ✅ | Good alternative to llama 8b |

**Recommended swap** — change one line in `.env`:
```
GROQ_MODEL=llama3-70b-8192
```

`llama3-70b` is dramatically better at instruction following, handles ambiguous questions more gracefully, and knows when to say it doesn't know. It's ~2–3x slower on Groq but still fast enough for interactive use (3–5 seconds vs 1–2 seconds).

If your documents are long and chunking alone doesn't solve the context issue, `mixtral-8x7b-32768` gives you a 32k context window — you could theoretically raise `TOP_K_RESULTS` to 10–15 and dump more of the document into context.

---

## Fix 5 — Embedding Model Mismatch for Technical Content

### Root cause — `config.py`
```python
SENTENCE_TRANSFORMER_MODEL = "all-MiniLM-L6-v2"
```

`all-MiniLM-L6-v2` is a general-purpose model trained on web text. It's fine for everyday English questions but underperforms on:
- Technical/educational content (HTML tags, CSS properties, code-adjacent terms)
- Short keyword-style queries ("box model", "flex container")
- Multi-language content

### Better alternatives (same zero-install sentence-transformers library)

| Model | Size | Strength | Drop-in? |
|-------|------|----------|----------|
| `all-MiniLM-L6-v2` | 80MB | Current baseline | — |
| `all-mpnet-base-v2` | 420MB | **Best general quality** | ✅ Yes |
| `multi-qa-mpnet-base-dot-v1` | 420MB | Tuned for Q&A retrieval | ✅ Yes |
| `all-MiniLM-L12-v2` | 120MB | Slight upgrade, same speed | ✅ Yes |

**Recommended swap for your use case:**
```
SENTENCE_TRANSFORMER_MODEL=multi-qa-mpnet-base-dot-v1
```

This model was specifically fine-tuned for question-answering retrieval tasks (finding the passage that answers a question) — which is exactly what your FAISS search does. It will score the correct chunks higher relative to noise chunks.

**⚠️ Same caveat as Fix 1:** After changing the embedding model you must re-ingest all documents. The vectors in FAISS were computed with the old model and are incompatible with the new one.

---

## Fix 6 — Store Page Numbers in Chunk Metadata

### Root cause — `ingest.py`

`PyPDFLoader` already extracts page numbers per chunk (it stores them in `doc.metadata["page"]`), but your current code only passes the `source` filename through. This metadata is thrown away at storage time.

```python
# Current code in ingest_file() — page number is silently ignored
for chunk in chunks:
    chunk.metadata["source"] = source_name  # ← only filename, page is already there but unused
```

### The fix — pass page through, surface it in answers

```python
# In ingest.py — preserve what PyPDFLoader already gives you
for chunk in chunks:
    chunk.metadata["source"] = source_name
    # page is already set by PyPDFLoader, no need to set it
    # just don't overwrite it
```

Then in `query.py`, include the page number in the source object:
```python
sources.append({
    "filename": filename,
    "chunk_index": chunk_index,
    "page": doc.metadata.get("page", None),   # ← add this
    "text": text,
})
```

And in the source map popup (`chat.js`), display it:
```
CST-Day2-HTML-CSS.pdf  ·  Chunk 3  ·  Page 7
```

Now the user can **open the original PDF to the exact page** to verify or read more context. This alone makes the tool dramatically more trustworthy — it's not a black box anymore.

---

## Summary — Quality Fixes Priority

| Fix | Root Cause | Effort | Impact | Re-ingest needed? |
|-----|-----------|--------|--------|-------------------|
| 1 | Chunk size too small (500 chars) → answers split | Edit `.env`, re-ingest | 🔴 High | **Yes** |
| 2 | Score threshold too low (0.2) → doc bleeding | Edit `.env` | 🔴 High | No |
| 3 | No source labels in prompt → LLM blends docs | Edit `query.py` | 🟠 High | No |
| 4 | Small LLM (8B) → weak instruction following | Edit `.env` | 🟠 High | No |
| 5 | Wrong embedding model for Q&A → wrong chunks retrieved | Edit `.env`, re-ingest | 🟡 Medium | **Yes** |
| 6 | Page numbers discarded → no "go to source" | Edit `ingest.py` + `query.py` | 🟢 Low | No |

**Fastest wins with no re-ingest:** Fix 2 (raise threshold), Fix 3 (label the prompt), Fix 4 (upgrade model). Do these three first — they require only config/code changes and take effect immediately.

**Biggest structural improvements:** Fix 1 (chunk size) and Fix 5 (embedding model) together, done as one re-ingest pass.

### Recommended `.env` after all fixes
```env
CHUNK_SIZE=1000
CHUNK_OVERLAP=150
TOP_K_RESULTS=4
RELEVANCE_SCORE_THRESHOLD=0.45
GROQ_MODEL=llama3-70b-8192
SENTENCE_TRANSFORMER_MODEL=multi-qa-mpnet-base-dot-v1
```
