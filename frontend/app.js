const API = "/api";

async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const status = document.getElementById("uploadStatus");

  if (!fileInput.files.length) {
    status.textContent = "Please select a file first.";
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  status.textContent = "Uploading...";
  try {
    const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      status.textContent = `✅ ${data.message} (${data.chunks_stored} chunks stored)`;
      loadDocs();
    } else {
      status.textContent = `❌ ${data.detail}`;
    }
  } catch (e) {
    status.textContent = `❌ Upload failed: ${e.message}`;
  }
}

async function askQuestion() {
  const question = document.getElementById("questionInput").value.trim();
  const answerBox = document.getElementById("answerBox");
  const answerText = document.getElementById("answerText");
  const sourcesText = document.getElementById("sourcesText");

  if (!question) return;

  answerBox.classList.remove("hidden");
  answerText.textContent = "Thinking...";
  sourcesText.textContent = "";

  try {
    const res = await fetch(`${API}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (res.ok) {
      answerText.textContent = data.answer;
      sourcesText.textContent = data.sources.length
        ? `Sources: ${data.sources.join(", ")}`
        : "";
    } else {
      answerText.textContent = `❌ ${data.detail}`;
    }
  } catch (e) {
    answerText.textContent = `❌ Request failed: ${e.message}`;
  }
}

async function loadDocs() {
  const list = document.getElementById("docsList");
  try {
    const res = await fetch(`${API}/docs-list`);
    const data = await res.json();
    list.innerHTML = data.documents.length
      ? data.documents.map(d => `<li>${d}</li>`).join("")
      : "<li>No documents uploaded yet.</li>";
  } catch (e) {
    list.innerHTML = "<li>Could not load documents.</li>";
  }
}

// Load docs on page open
loadDocs();
