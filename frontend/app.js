/* ── Config ─────────────────────────────────────────────────────── */
const API = "http://localhost:8000/api";

/* Allowed file types (client-side guard) */
const ALLOWED_TYPES = {
  "application/pdf":                                          "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain":                                               "txt",
};
const ALLOWED_EXTS = [".pdf", ".docx", ".txt"];

/* ── Helpers ────────────────────────────────────────────────────── */

/** Format a date as "Jun 11, 2026" */
function formatDate(d) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(d);
}

/** Return today's date string (used as placeholder since backend doesn't track dates) */
function today() { return formatDate(new Date()); }

/** Return the extension of a filename (lowercase, with dot) */
function ext(filename) {
  const m = filename.match(/(\.[^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}

/** Return display label + CSS class for a file's extension */
function docIconMeta(filename) {
  const e = ext(filename);
  if (e === ".pdf")  return { label: "PDF",  cls: "doc-icon-pdf"  };
  if (e === ".docx") return { label: "DOC",  cls: "doc-icon-docx" };
  if (e === ".txt")  return { label: "TXT",  cls: "doc-icon-txt"  };
  return { label: "FILE", cls: "doc-icon-default" };
}

/* ── Upload Feedback ────────────────────────────────────────────── */
const feedbackEl = document.getElementById("uploadFeedback");

function showFeedback(type, message) {
  let inner = "";
  if (type === "loading") {
    inner = `<div class="feedback-loading"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
  } else if (type === "success") {
    inner = `<div class="feedback-success">${iconCheck()} <span>${message}</span></div>`;
  } else if (type === "error") {
    inner = `<div class="feedback-error">${iconX()} <span>${message}</span></div>`;
  } else if (type === "warn") {
    inner = `<div class="feedback-warn">${iconWarn()} <span>${message}</span></div>`;
  }
  feedbackEl.innerHTML = inner;
}

function clearFeedback() { feedbackEl.innerHTML = ""; }

/* ── Inline SVG icons ───────────────────────────────────────────── */
const iconCheck = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const iconX     = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const iconWarn  = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const iconTrash = () => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const iconDoc   = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const iconWifi  = () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;

/* ── File Validation ────────────────────────────────────────────── */
function validateFile(file) {
  const fileExt = ext(file.name);
  const isMimeOk = ALLOWED_TYPES[file.type] !== undefined;
  const isExtOk  = ALLOWED_EXTS.includes(fileExt);
  if (!isMimeOk && !isExtOk) {
    return `"${file.name}" isn't a supported format. Please upload a PDF, DOCX, or TXT file.`;
  }
  return null; // valid
}

/* ── Upload Logic ───────────────────────────────────────────────── */
async function uploadFile(file) {
  const error = validateFile(file);
  if (error) {
    showFeedback("warn", error);
    return;
  }

  showFeedback("loading", `Uploading "${file.name}"…`);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res  = await fetch(`${API}/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      showFeedback("success", `"${file.name}" uploaded — ${data.chunks_stored} chunks indexed.`);
      
      // Store chunk count for mind map
      const STORAGE_KEY = "docmind_chunks";
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      stored[file.name] = data.chunks_stored;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      
      loadDocs(); // refresh list
    } else {
      showFeedback("error", data.detail ?? "Upload failed. Please try again.");
    }
  } catch {
    showFeedback("error", "Couldn't reach the server. Check your connection and try again.");
  }
}

/* ── Drop Zone ──────────────────────────────────────────────────── */
const dropZone  = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

// Click → trigger file input (the hidden input already covers the zone,
// but this handles the Enter/Space keyboard trigger)
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    uploadFile(fileInput.files[0]);
    fileInput.value = ""; // reset so the same file can be re-uploaded
  }
});

// Drag & drop
dropZone.addEventListener("dragenter", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove("drag-over");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

/* ── Documents List ─────────────────────────────────────────────── */
const docsListEl = document.getElementById("docsList");
const docsCountEl = document.getElementById("docsCount");
const stickyCta   = document.getElementById("stickyCta");

function showDocsLoading() {
  docsListEl.innerHTML = `
    <div class="skeleton-row"></div>
    <div class="skeleton-row" style="opacity:.6"></div>
    <div class="skeleton-row" style="opacity:.35"></div>
  `;
}

function renderDocs(docs) {
  if (docs.length === 0) {
    docsCountEl.textContent = "";
    stickyCta.classList.remove("visible");
    stickyCta.setAttribute("aria-hidden", "true");
    docsListEl.innerHTML = `
      <div class="docs-empty" role="status">
        <div class="docs-empty-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <p class="docs-empty-title">No documents yet</p>
        <p>Upload your first PDF, DOCX, or TXT above to get started.</p>
      </div>
    `;
    return;
  }

  docsCountEl.textContent = `${docs.length} file${docs.length === 1 ? "" : "s"}`;
  stickyCta.classList.add("visible");
  stickyCta.setAttribute("aria-hidden", "false");

  docsListEl.innerHTML = docs.map((name) => {
    const { label, cls } = docIconMeta(name);
    const safeName = name.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return `
      <div class="doc-item" data-name="${safeName}">
        <div class="doc-icon ${cls}" aria-hidden="true">${label}</div>
        <div class="doc-info">
          <div class="doc-name" title="${safeName}">${safeName}</div>
          <div class="doc-meta">Added ${today()}</div>
        </div>
        <button
          class="btn-delete"
          aria-label="Delete ${safeName}"
          onclick="deleteDoc(this)"
          title="Delete"
        >${iconTrash()}</button>
      </div>
    `;
  }).join("");
}

function renderDocsError() {
  docsCountEl.textContent = "";
  stickyCta.classList.remove("visible");
  stickyCta.setAttribute("aria-hidden", "true");
  docsListEl.innerHTML = `
    <div class="docs-error" role="alert">
      ${iconWifi()}
      <span>Couldn't load your documents — the server may be unreachable. Try refreshing the page.</span>
    </div>
  `;
}

async function loadDocs() {
  showDocsLoading();
  try {
    const res  = await fetch(`${API}/docs-list`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    renderDocs(data.documents ?? []);
  } catch {
    renderDocsError();
  }
}

/* ── Delete ─────────────────────────────────────────────────────── */
async function deleteDoc(btn) {
  const item = btn.closest(".doc-item");
  const name = item.dataset.name;

  // Optimistic: dim the row while the request is in-flight
  item.style.opacity = "0.4";
  item.style.pointerEvents = "none";

  try {
    const res = await fetch(`${API}/reset`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete failed");
    // Backend wipes everything — clear localStorage too
    localStorage.removeItem("docmind_chunks");
    loadDocs();
  } catch {
    // Restore row on failure
    item.style.opacity = "";
    item.style.pointerEvents = "";
    showFeedback("error", `Couldn't delete "${name}". Please try again.`);
  }
}

/* ── Init ───────────────────────────────────────────────────────── */
loadDocs();

/* ── Mobile Nav Toggle ───────────────────────────────────────────── */
const navHamburger = document.getElementById("navHamburger");
const navLinks = document.getElementById("navLinks");
if (navHamburger && navLinks) {
  navHamburger.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navHamburger.setAttribute("aria-expanded", isOpen);
  });
  // Close on link click
  navLinks.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navHamburger.setAttribute("aria-expanded", "false");
    });
  });
}
