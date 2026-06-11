"""
Query pipeline.
Takes a user question, retrieves relevant chunks from ChromaDB,
and generates an answer using the LLM.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

from app.ingest import get_vector_store
from app.config import LLM_MODEL, TOP_K_RESULTS, GOOGLE_API_KEY


PROMPT_TEMPLATE = """You are a helpful assistant that answers questions strictly based on the provided documents.
If the answer is not found in the documents, say "I couldn't find that information in the uploaded documents."

Context:
{context}

Question: {question}

Answer:"""


def get_qa_chain() -> RetrievalQA:
    """Build and return the RetrievalQA chain."""
    try:
        vector_store = get_vector_store()
    except FileNotFoundError as e:
        raise RuntimeError(str(e))

    retriever = vector_store.as_retriever(search_kwargs={"k": TOP_K_RESULTS})

    llm = ChatGoogleGenerativeAI(
        model=LLM_MODEL,
        temperature=0,
        google_api_key=GOOGLE_API_KEY,
    )

    prompt = PromptTemplate(
        template=PROMPT_TEMPLATE,
        input_variables=["context", "question"],
    )

    chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": prompt},
    )
    return chain


def answer_question(question: str) -> dict:
    """
    Run a question through the RAG pipeline.
    Returns the answer and rich source objects (filename, chunk_index, text).
    """
    chain = get_qa_chain()
    result = chain.invoke({"query": question})

    seen = set()
    sources = []
    for i, doc in enumerate(result.get("source_documents", [])):
        filename = doc.metadata.get("source", "unknown")
        text = doc.page_content.strip()
        # Use position in result list as chunk_index (1-based)
        chunk_index = i + 1
        dedup_key = (filename, text[:120])
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        sources.append({
            "filename": filename,
            "chunk_index": chunk_index,
            "text": text,
        })

    return {
        "answer": result["result"],
        "sources": sources,
    }
