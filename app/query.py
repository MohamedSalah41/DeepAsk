"""
Query pipeline.
Takes a user question, retrieves relevant chunks from FAISS,
and generates an answer using the LLM.
"""

from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

from app.ingest import get_vector_store
from app.config import TOP_K_RESULTS, RELEVANCE_SCORE_THRESHOLD
from app import providers


PROMPT_TEMPLATE = """You are a helpful assistant that answers questions strictly based on the provided documents.
- If the answer is found in the documents, answer clearly and concisely.
- If the question is too vague, a typo, or not a real question (e.g. "ih", "ok", "test"), politely ask the user to clarify or ask a proper question.
- If the topic exists in the documents but the specific detail is not there, say what you DO know about the topic from the documents.
- If the topic is completely absent from the documents (e.g. rating a resume, opinions, general knowledge), say: "I couldn't find that in the uploaded documents. This system only answers based on your uploaded files."

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

    # Use similarity_score_threshold to filter out irrelevant chunks.
    # This prevents the LLM from receiving unrelated content when no good
    # match exists (e.g. asking about a resume pulls HTML/CSS chunks).
    retriever = vector_store.as_retriever(
        search_type="similarity_score_threshold",
        search_kwargs={
            "k": TOP_K_RESULTS,
            "score_threshold": RELEVANCE_SCORE_THRESHOLD,
        },
    )

    llm = providers.get_llm()

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
