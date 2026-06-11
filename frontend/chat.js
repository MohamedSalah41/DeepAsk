/* ── Config ─────────────────────────────────────────────────────── */
const API = "/api";

/* ── State ───────────────────────────────────────────────────────── */
let isThinking = false;
let thinkingMsgEl = null;

// Source map state
let sourceTransform = { x: 0, y: 0, scale: 1 };
let sourceNodes = [];
let sourceLinks = [];
let sourcePanStart = null;
let sourceDragNode = null;

/* ── DOM refs ────────────────────────────────────────────────────── */
const messagesEl    = document.getElementById("chatMessages");
const inputEl       = document.getElementById("chatInput");
const sendBtn       = document.getElementById("chatSend");
const sourceSvg     = document.getElementById("sourceCanvas");
const placeholderEl = document.getElementById("sourcePlaceholder");
const sourceBadge   = document.getElementById("sourceBadge");
const chunkOverlay  = document.getElementById("chunkOverlay");
const popupLabel    = document.getElementById("popupLabel");
const popupTitle    = document.getElementById("popupTitle");
const popupText     = document.getElementById("popupText");
const closeBtn      = document.getElementById("chunkCloseBtn");

/* ── Helpers ────────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}

/* ── Chat Messages ──────────────────────────────────────────────── */
function appendMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg msg-${role}`;

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.innerHTML = role === "user"
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  // Render newlines as paragraphs
  bubble.innerHTML = content
    .split(/\n{2,}/)
    .map(p => `<p>${esc(p.trim())}</p>`)
    .join("");

  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function appendError(text) {
  const div = document.createElement("div");
  div.className = "msg msg-assistant msg-error";
  div.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    </div>
    <div class="msg-bubble"><p>${esc(text)}</p></div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function showThinking() {
  thinkingMsgEl = document.createElement("div");
  thinkingMsgEl.className = "msg msg-assistant msg-thinking";
  thinkingMsgEl.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
    </div>
    <div class="msg-bubble">
      <div class="thinking-dots" aria-label="Thinking">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesEl.appendChild(thinkingMsgEl);
  scrollToBottom();
}

function removeThinking() {
  if (thinkingMsgEl) {
    thinkingMsgEl.remove();
    thinkingMsgEl = null;
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

/* ── Send Logic ─────────────────────────────────────────────────── */
async function sendMessage() {
  const question = inputEl.value.trim();
  if (!question || isThinking) return;

  // Lock UI
  isThinking = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  inputEl.style.height = "auto";

  // Show user bubble
  appendMessage("user", question);
  showThinking();

  try {
    const res = await fetch(`${API}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const data = await res.json();
    removeThinking();

    if (res.ok) {
      appendMessage("assistant", data.answer);
      renderSourceMap(question, data.sources || []);
    } else {
      appendError(data.detail ?? "Something went wrong. Please try again.");
      showEmptyMap();
    }
  } catch {
    removeThinking();
    appendError("Couldn't reach the server. Check your connection and try again.");
    showEmptyMap();
  } finally {
    isThinking = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

/* ── Input Events ───────────────────────────────────────────────── */
inputEl.addEventListener("input", autoResize);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

/* ── Source Map ─────────────────────────────────────────────────── */
function getSourceCenter() {
  const rect = sourceSvg.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function buildSourceGraph(question, sources) {
  const center = getSourceCenter();
  const nodes = [];
  const links = [];

  // Root = the question
  nodes.push({
    id: "q",
    label: truncate(question, 22),
    type: "root",
    x: center.x,
    y: center.y,
    data: null,
  });

  if (sources.length === 0) {
    nodes.push({
      id: "empty",
      label: "No sources found",
      type: "empty",
      x: center.x + 140,
      y: center.y,
      data: null,
    });
    links.push({ source: "q", target: "empty", distance: 140 });
  } else {
    sources.forEach((src, i) => {
      const angle = (i / sources.length) * 2 * Math.PI - Math.PI / 2;
      const radius = Math.min(130, 80 + sources.length * 12);
      const id = `chunk-${i}`;
      nodes.push({
        id,
        label: truncate(src.filename, 14),
        sublabel: `Chunk ${src.chunk_index}`,
        type: "chunk",
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        data: src,
      });
      links.push({ source: "q", target: id, distance: radius });
    });
  }

  return { nodes, links };
}

function applySourceForces(nodes, links) {
  const iterations = 80;
  const linkK = 0.4;
  const repulsion = 2000;
  const center = getSourceCenter();
  const gravity = 0.03;

  for (let i = 0; i < iterations; i++) {
    // Spring
    links.forEach(({ source, target, distance }) => {
      const s = nodes.find(n => n.id === source);
      const t = nodes.find(n => n.id === target);
      if (!s || !t) return;
      const dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (dist - distance) * linkK;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      if (s.id !== "q") { s.x += fx; s.y += fy; }
      if (t.id !== "q") { t.x -= fx; t.y -= fy; }
    });

    // Repulsion
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const na = nodes[a], nb = nodes[b];
        const dx = nb.x - na.x, dy = nb.y - na.y;
        const dsq = dx * dx + dy * dy || 1;
        const f = repulsion / dsq;
        const d = Math.sqrt(dsq);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (na.id !== "q") { na.x -= fx; na.y -= fy; }
        if (nb.id !== "q") { nb.x += fx; nb.y += fy; }
      }
    }

    // Gravity toward center
    nodes.forEach(n => {
      if (n.id === "q") return;
      n.x += (center.x - n.x) * gravity;
      n.y += (center.y - n.y) * gravity;
    });
  }
}

function renderSourceSvg() {
  sourceSvg.innerHTML = "";

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform",
    `translate(${sourceTransform.x},${sourceTransform.y}) scale(${sourceTransform.scale})`);
  sourceSvg.appendChild(g);

  // Links
  sourceLinks.forEach(({ source, target }) => {
    const s = sourceNodes.find(n => n.id === source);
    const t = sourceNodes.find(n => n.id === target);
    if (!s || !t) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "s-link");
    line.setAttribute("x1", s.x); line.setAttribute("y1", s.y);
    line.setAttribute("x2", t.x); line.setAttribute("y2", t.y);
    g.appendChild(line);
  });

  // Nodes
  sourceNodes.forEach(node => {
    const nodeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodeG.setAttribute("class", "s-node");
    nodeG.setAttribute("transform", `translate(${node.x},${node.y})`);
    nodeG.setAttribute("tabindex", node.type === "chunk" ? "0" : "-1");
    nodeG.setAttribute("role", node.type === "chunk" ? "button" : "presentation");
    if (node.type === "chunk") {
      nodeG.setAttribute("aria-label", `${node.data.filename} chunk ${node.data.chunk_index} — click to view text`);
    }

    const r = node.type === "root" ? 44 : node.type === "empty" ? 36 : 32;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", `s-circle ${node.type === "root" ? "s-root" : node.type === "empty" ? "s-empty" : "s-chunk"}`);
    circle.setAttribute("r", r);
    nodeG.appendChild(circle);

    // Primary label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", `s-label ${node.type === "root" ? "s-root" : node.type === "empty" ? "s-empty" : ""}`);
    label.setAttribute("dy", node.sublabel ? "-7" : "0");
    label.textContent = node.label;
    nodeG.appendChild(label);

    // Sub-label (chunk number)
    if (node.sublabel) {
      const sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
      sub.setAttribute("class", "s-sublabel");
      sub.setAttribute("dy", "8");
      sub.textContent = node.sublabel;
      nodeG.appendChild(sub);
    }

    // Drag
    let dragStart = null;
    nodeG.addEventListener("mousedown", e => {
      e.stopPropagation();
      sourceDragNode = { node, startX: e.clientX, startY: e.clientY, ox: node.x, oy: node.y };
    });

    // Click → open popup for chunk nodes
    nodeG.addEventListener("click", e => {
      if (sourceDragNode && (
        Math.abs(e.clientX - sourceDragNode.startX) > 4 ||
        Math.abs(e.clientY - sourceDragNode.startY) > 4
      )) return; // was a drag, not a click
      if (node.type === "chunk" && node.data) openPopup(node.data);
    });
    nodeG.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && node.type === "chunk") {
        e.preventDefault();
        openPopup(node.data);
      }
    });

    g.appendChild(nodeG);
  });
}

function renderSourceMap(question, sources) {
  // Reset transform for each new map
  sourceTransform = { x: 0, y: 0, scale: 1 };

  const { nodes, links } = buildSourceGraph(question, sources);
  applySourceForces(nodes, links);
  sourceNodes = nodes;
  sourceLinks = links;

  // Show canvas, hide placeholder
  placeholderEl.style.display = "none";
  sourceSvg.style.display = "block";
  sourceSvg.className = "source-canvas";
  // Force reflow for animation
  void sourceSvg.offsetWidth;
  sourceSvg.classList.add("revealed");

  renderSourceSvg();

  // Update badge
  sourceBadge.textContent = sources.length > 0
    ? `${sources.length} source${sources.length === 1 ? "" : "s"}`
    : "";
}

function showEmptyMap() {
  placeholderEl.style.display = "flex";
  sourceSvg.style.display = "none";
  sourceBadge.textContent = "";
}

/* ── Source Map Pan/Zoom ─────────────────────────────────────────── */
sourceSvg.addEventListener("mousedown", e => {
  if (!sourceDragNode) {
    sourcePanStart = { x: e.clientX, y: e.clientY, tx: sourceTransform.x, ty: sourceTransform.y };
    sourceSvg.classList.add("dragging");
  }
});

window.addEventListener("mousemove", e => {
  // Node drag
  if (sourceDragNode) {
    const { node, startX, startY, ox, oy } = sourceDragNode;
    const dx = (e.clientX - startX) / sourceTransform.scale;
    const dy = (e.clientY - startY) / sourceTransform.scale;
    node.x = ox + dx;
    node.y = oy + dy;
    renderSourceSvg();
    return;
  }
  // Pan
  if (sourcePanStart) {
    sourceTransform.x = sourcePanStart.tx + (e.clientX - sourcePanStart.x);
    sourceTransform.y = sourcePanStart.ty + (e.clientY - sourcePanStart.y);
    renderSourceSvg();
  }
});

window.addEventListener("mouseup", () => {
  sourceDragNode = null;
  sourcePanStart = null;
  sourceSvg.classList.remove("dragging");
});

sourceSvg.addEventListener("wheel", e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  sourceTransform.scale = Math.max(0.3, Math.min(3, sourceTransform.scale * delta));
  renderSourceSvg();
}, { passive: false });

/* ── Chunk Popup ─────────────────────────────────────────────────── */
function openPopup(src) {
  popupLabel.textContent = `${src.filename}  ·  Chunk ${src.chunk_index}`;
  popupTitle.textContent = src.filename;
  popupText.textContent  = src.text;
  chunkOverlay.classList.add("open");
  chunkOverlay.setAttribute("aria-hidden", "false");
  closeBtn.focus();
}

function closePopup() {
  chunkOverlay.classList.remove("open");
  chunkOverlay.setAttribute("aria-hidden", "true");
}

closeBtn.addEventListener("click", closePopup);

chunkOverlay.addEventListener("click", e => {
  if (e.target === chunkOverlay) closePopup();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && chunkOverlay.classList.contains("open")) closePopup();
});

/* ── Init ───────────────────────────────────────────────────────── */
inputEl.focus();
