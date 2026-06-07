"""
FastAPI routes.
- POST /upload  → ingest a document
- POST /ask     → ask a question
- GET  /docs-list → list uploaded documents
- DELETE /reset → wipe the vector store
"""

import os
import shutil
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import UPLOAD_DIR
from app.ingest import ingest_file
from app.query import answer_question

router = APIRouter()

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---------- schemas ----------

class QuestionRequest(BaseModel):
    question: str


class AnswerResponse(BaseModel):
    answer: str
    sources: list[str]


# ---------- endpoints ----------

@router.post("/upload", summary="Upload and ingest a document")
async def upload_document(file: UploadFile = File(...)):
    allowed_extensions = {".pdf", ".docx", ".txt", ".md"}
    ext = Path(file.filename).suffix.lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {allowed_extensions}",
        )

    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        chunks_stored = ingest_file(save_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return {
        "message": f"'{file.filename}' ingested successfully.",
        "chunks_stored": chunks_stored,
    }


@router.post("/ask", response_model=AnswerResponse, summary="Ask a question")
async def ask_question(body: QuestionRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        result = answer_question(body.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

    return result


@router.get("/docs-list", summary="List uploaded documents")
async def list_documents():
    files = [f for f in os.listdir(UPLOAD_DIR) if not f.startswith(".")]
    return {"documents": files}


@router.delete("/reset", summary="Wipe all uploaded documents and vector store")
async def reset():
    from app.config import CHROMA_DB_PATH as VECTOR_DB_PATH

    # Remove uploads
    if os.path.exists(UPLOAD_DIR):
        shutil.rmtree(UPLOAD_DIR)
        os.makedirs(UPLOAD_DIR)

    # Remove FAISS index
    if os.path.exists(VECTOR_DB_PATH):
        shutil.rmtree(VECTOR_DB_PATH)

    return {"message": "All documents and vector store have been cleared."}
