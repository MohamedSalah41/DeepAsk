"""
Entry point for the FastAPI application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import router

app = FastAPI(
    title="Personal Docs Q&A — RAG System",
    description="Upload your documents and ask questions about them.",
    version="1.0.0",
)

# Allow all origins during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the simple HTML frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Register API routes under /api prefix
app.include_router(router, prefix="/api")


@app.get("/", include_in_schema=False)
async def root():
    from fastapi.responses import FileResponse
    return FileResponse("frontend/index.html")
