/* ── Config ─────────────────────────────────────────────────────── */
const API = "/api";
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
async function loadDocs() {
  try {
    const res = await fetch(`${API}/docs-list`);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    return data.documents || [];
  } catch {
    return [];
  }
}

async function initGraph() {
  const docs = await loadDocs();

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
