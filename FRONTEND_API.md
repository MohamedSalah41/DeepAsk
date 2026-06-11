# DeepAsk — Frontend Files & API Communication

Three files make up the entire frontend. No framework, no build step.

---

## Files at a Glance

| File | Role |
|---|---|
| `index.html` | Structure — defines all sections and UI elements |
| `style.css` | Visual styling — cards, buttons, layout |
| `app.js` | Logic — all API calls and DOM updates live here |

---

## `index.html`

Defines three sections, each mapped to one backend operation:

| Section | Element IDs involved | Triggered by |
|---|---|---|
| Upload a Document | `fileInput`, `uploadStatus` | `onclick="uploadFile()"` |
| Ask a Question | `questionInput`, `answerBox`, `answerText`, `sourcesText` | `onclick="askQuestion()"` |
| Uploaded Documents | `docsList` | `onclick="loadDocs()"` + auto on page load |

The script is loaded at the bottom of `<body>`:

```html
<script src="/static/app.js"></script>
```

FastAPI serves the frontend as static files mounted at `/static`, so the browser can reach `app.js` and `style.css` through that path.

---

## `app.js` — How It Talks to the Backend

All requests go through a single base URL constant:

```js
const API = "/api";
```

Everything hits the same origin (same host, same port), so no CORS issues in production.

---

### 1. `uploadFile()` → `POST /api/upload`

Triggered when the user clicks **Upload & Ingest**.

```
User picks a file
      │
      ▼
FormData built with the file
      │
      ▼
POST /api/upload   (multipart/form-data — no Content-Type header set manually)
      │
      ├── ✅ res.ok  → show "✅ {message} ({chunks_stored} chunks stored)"
      │              → call loadDocs() to refresh the list
      └── ❌ error   → show "❌ {detail}" from backend or network error
```

```js
const formData = new FormData();
formData.append("file", fileInput.files[0]);
const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
```

The browser automatically sets `Content-Type: multipart/form-data` with the correct boundary when `FormData` is passed as the body — you never set it manually.

Backend response shape expected:
```json
{ "message": "...", "chunks_stored": 42 }
```

---

### 2. `askQuestion()` → `POST /api/ask`

Triggered when the user clicks **Ask**.

```
User types a question
      │
      ▼
Reveal answerBox, show "Thinking..."
      │
      ▼
POST /api/ask   (application/json)
      body: { "question": "..." }
      │
      ├── ✅ res.ok  → fill answerText with data.answer
      │              → fill sourcesText with data.sources (filenames)
      └── ❌ error   → show error in answerText
```

```js
const res = await fetch(`${API}/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question }),
});
```

Backend response shape expected:
```json
{ "answer": "...", "sources": ["file1.pdf", "file2.txt"] }
```

---

### 3. `loadDocs()` → `GET /api/docs-list`

Called automatically on page load and after every successful upload.

```
GET /api/docs-list
      │
      ├── ✅ data.documents has items  → render <li> for each filename
      ├── ✅ empty array               → show "No documents uploaded yet."
      └── ❌ network error             → show "Could not load documents."
```

```js
const res = await fetch(`${API}/docs-list`);
const data = await res.json();
list.innerHTML = data.documents.length
  ? data.documents.map(d => `<li>${d}</li>`).join("")
  : "<li>No documents uploaded yet.</li>";
```

Backend response shape expected:
```json
{ "documents": ["file1.pdf", "file2.txt"] }
```

> There is no delete/reset button in the UI. The `DELETE /api/reset` endpoint exists on the backend but is only accessible via the API directly (e.g. curl or Swagger at `/docs`).

---

## Full Request Map

```
index.html (user interaction)
        │
        ▼
    app.js
        │
        ├── uploadFile()  ──►  POST   /api/upload     → ingest.py
        ├── askQuestion() ──►  POST   /api/ask        → query.py
        └── loadDocs()    ──►  GET    /api/docs-list  → reads uploads dir
```

---

## Error Handling Pattern

Every function follows the same pattern — no exceptions bubble to the user unhandled:

```js
try {
  const res = await fetch(...);
  const data = await res.json();
  if (res.ok) {
    // update DOM with success
  } else {
    // show data.detail from backend HTTP error
  }
} catch (e) {
  // show e.message for network-level failures
}
```

Two levels of errors are caught:
- **HTTP errors** (4xx / 5xx) — `res.ok` is false, backend sends `{ "detail": "..." }`
- **Network errors** — `fetch` throws, caught in `catch (e)`

---

## `style.css`

No API interaction. Pure presentation layer — cards, button hover states, the hidden/visible toggle for the answer box, and layout constraints. The `.hidden` class is the only CSS class toggled by `app.js`:

```js
answerBox.classList.remove("hidden"); // reveal answer section when a reply comes back
```
