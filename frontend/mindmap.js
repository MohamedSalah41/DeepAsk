/* ── Config ─────────────────────────────────────────────────────── */
const API = "http://localhost:8000/api";
const STORAGE_KEY = "docmind_chunks";

/* ── State ───────────────────────────────────────────────────────── */
let graphData = { nodes: [], links: [] };
let transform = { x: 0, y: 0, scale: 1 };
let expandedDocs = new Set(); // track which doc nodes are expanded
let simulation = null;

/* ── DOM ─────────────────────────────────────────────────────────── */
const emptyEl = document.getElementById("mindmapEmpty");
const canvasWrapperEl = document.getElementById("mindmapCanvasWrapper");
const svg = document.getElementById("mindmapCanvas");

/* ── Helpers ────────────────────────────────────────────────────── */

/** Get stored chunk counts from localStorage */
function getChunkCounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Store chunk counts in localStorage */
function setChunkCounts(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Calculate canvas center */
function getCenter() {
  return { x: svg.clientWidth / 2, y: svg.clientHeight / 2 };
}

/** Simple force simulation tick */
function applyForces() {
  const { nodes, links } = graphData;
  if (nodes.length === 0) return;

  const center = getCenter();
  const iterations = 120;
  const linkStrength = 0.5;
  const repulsion = 3000;
  const centerStrength = 0.05;

  for (let i = 0; i < iterations; i++) {
    // Link forces (springs)
    links.forEach((link) => {
      const source = nodes.find((n) => n.id === link.source);
      const target = nodes.find((n) => n.id === link.target);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetDist = link.distance || 120;
      const force = (distance - targetDist) * linkStrength;

      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      if (!source.fixed) { source.x += fx; source.y += fy; }
      if (!target.fixed) { target.x -= fx; target.y -= fy; }
    });

    // Repulsion between nodes
    for (let j = 0; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const a = nodes[j];
        const b = nodes[k];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy || 1;
        const force = repulsion / distSq;

        const fx = (dx / Math.sqrt(distSq)) * force;
        const fy = (dy / Math.sqrt(distSq)) * force;

        if (!a.fixed) { a.x -= fx; a.y -= fy; }
        if (!b.fixed) { b.x += fx; b.y += fy; }
      }
    }

    // Center gravity
    nodes.forEach((n) => {
      if (!n.fixed) {
        n.x += (center.x - n.x) * centerStrength;
        n.y += (center.y - n.y) * centerStrength;
      }
    });
  }
}

/** Build graph data from document list */
function buildGraph(docs) {
  const chunkCounts = getChunkCounts();
  const center = getCenter();

  const nodes = [{ id: "root", label: "My Documents", type: "root", x: center.x, y: center.y, fixed: false }];
  const links = [];

  docs.forEach((docName, i) => {
    const angle = (i / docs.length) * 2 * Math.PI;
    const radius = 200;
    nodes.push({
      id: `doc-${docName}`,
      label: docName,
      type: "doc",
      docName,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      fixed: false,
    });
    links.push({ source: "root", target: `doc-${docName}`, distance: 180 });

    // If doc is expanded, add chunk nodes
    if (expandedDocs.has(docName)) {
      const chunkCount = chunkCounts[docName] || 5; // default 5 if unknown
      for (let c = 0; c < chunkCount; c++) {
        const chunkAngle = (c / chunkCount) * 2 * Math.PI;
        const chunkRadius = 120;
        nodes.push({
          id: `chunk-${docName}-${c}`,
          label: `Chunk ${c + 1}`,
          type: "chunk",
          parentDoc: docName,
          x: nodes[nodes.length - 1].x + Math.cos(chunkAngle) * chunkRadius,
          y: nodes[nodes.length - 1].y + Math.sin(chunkAngle) * chunkRadius,
          fixed: false,
        });
        links.push({ source: `doc-${docName}`, target: `chunk-${docName}-${c}`, distance: 90 });
      }
    }
  });

  return { nodes, links };
}

/** Render the SVG graph */
function render() {
  svg.innerHTML = "";

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", `translate(${transform.x}, ${transform.y}) scale(${transform.scale})`);
  svg.appendChild(g);

  // Draw links
  graphData.links.forEach((link) => {
    const source = graphData.nodes.find((n) => n.id === link.source);
    const target = graphData.nodes.find((n) => n.id === link.target);
    if (!source || !target) return;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", target.type === "chunk" ? "link chunk-link" : "link");
    line.setAttribute("x1", source.x);
    line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x);
    line.setAttribute("y2", target.y);
    g.appendChild(line);
  });

  // Draw nodes
  graphData.nodes.forEach((node) => {
    const nodeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodeG.setAttribute("class", "node-group");
    nodeG.setAttribute("data-id", node.id);
    nodeG.setAttribute("transform", `translate(${node.x}, ${node.y})`);

    const radius = node.type === "root" ? 50 : node.type === "doc" ? 35 : 24;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", `node-circle ${node.type}`);
    circle.setAttribute("r", radius);
    nodeG.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", `node-label ${node.type}`);
    text.setAttribute("dy", ".35em");
    text.textContent = truncate(node.label, node.type === "root" ? 18 : node.type === "doc" ? 14 : 10);
    nodeG.appendChild(text);

    // Click handler
    nodeG.addEventListener("click", () => handleNodeClick(node));

    // Drag handlers
    let dragStart = null;
    nodeG.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      dragStart = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y };
      nodeG.classList.add("dragging");
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragStart) return;
      const dx = (e.clientX - dragStart.x) / transform.scale;
      const dy = (e.clientY - dragStart.y) / transform.scale;
      node.x = dragStart.nodeX + dx;
      node.y = dragStart.nodeY + dy;
      render();
    });
    window.addEventListener("mouseup", () => {
      if (dragStart) {
        dragStart = null;
        nodeG.classList.remove("dragging");
      }
    });

    g.appendChild(nodeG);
  });
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

/** Handle node click (toggle expand for doc nodes) */
function handleNodeClick(node) {
  if (node.type !== "doc") return;

  if (expandedDocs.has(node.docName)) {
    expandedDocs.delete(node.docName);
  } else {
    expandedDocs.add(node.docName);
  }
  initGraph(); // rebuild
}

/** Pan/Zoom controls */
function resetView() {
  transform = { x: 0, y: 0, scale: 1 };
  render();
}

function zoomIn() {
  transform.scale = Math.min(transform.scale * 1.2, 3);
  render();
}

function zoomOut() {
  transform.scale = Math.max(transform.scale / 1.2, 0.3);
  render();
}

// Pan with mouse drag
let panStart = null;
svg.addEventListener("mousedown", (e) => {
  if (e.target === svg || e.target.tagName === "g") {
    panStart = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    svg.classList.add("dragging");
  }
});
window.addEventListener("mousemove", (e) => {
  if (!panStart) return;
  transform.x = panStart.tx + (e.clientX - panStart.x);
  transform.y = panStart.ty + (e.clientY - panStart.y);
  render();
});
window.addEventListener("mouseup", () => {
  if (panStart) {
    panStart = null;
    svg.classList.remove("dragging");
  }
});

// Zoom with mouse wheel
svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  transform.scale = Math.max(0.3, Math.min(3, transform.scale * delta));
  render();
});

document.getElementById("btnResetView").addEventListener("click", resetView);
document.getElementById("btnZoomIn").addEventListener("click", zoomIn);
document.getElementById("btnZoomOut").addEventListener("click", zoomOut);

/* ── Load & Init ─────────────────────────────────────────────────── */

async function initGraph() {
  let docs;
  let fetchFailed = false;

  try {
    const res = await fetch(`${API}/docs-list`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    docs = data.documents || [];
  } catch {
    fetchFailed = true;
    docs = [];
  }

  if (fetchFailed) {
    emptyEl.style.display = "flex";
    canvasWrapperEl.style.display = "none";
    // Replace empty state content with an error message
    emptyEl.innerHTML = `
      <div class="mindmap-empty-icon" style="background: linear-gradient(135deg,#fef2f2,#fee2e2);" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
      </div>
      <h1 class="mindmap-empty-title" style="color:#dc2626">Server unreachable</h1>
      <p class="mindmap-empty-subtitle">Couldn't load your documents. Make sure the backend is running, then refresh the page.</p>
      <button class="btn btn-primary" onclick="location.reload()">Retry</button>
    `;
    return;
  }

  if (docs.length === 0) {
    emptyEl.style.display = "flex";
    canvasWrapperEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  canvasWrapperEl.style.display = "block";

  graphData = buildGraph(docs);
  applyForces();
  render();
}

// Resize handler
window.addEventListener("resize", () => {
  if (graphData.nodes.length > 0) {
    const oldCenter = { x: svg.clientWidth / 2, y: svg.clientHeight / 2 };
    const newCenter = getCenter();
    const dx = newCenter.x - oldCenter.x;
    const dy = newCenter.y - oldCenter.y;
    graphData.nodes.forEach((n) => { n.x += dx; n.y += dy; });
    render();
  }
});

initGraph();

/* ── Mobile Nav Toggle ───────────────────────────────────────────── */
const navHamburger = document.getElementById("navHamburger");
const navLinks = document.getElementById("navLinks");
if (navHamburger && navLinks) {
  navHamburger.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navHamburger.setAttribute("aria-expanded", isOpen);
  });
  navLinks.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navHamburger.setAttribute("aria-expanded", "false");
    });
  });
}
