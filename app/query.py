"""
Query pipeline.
Takes a user question, retrieves relevant chunks from FAISS,
and generates an answer using the LLM.
"""

from langchain.prompts import PromptTemplate

from app.ingest import get_vector_store
from app.config import TOP_K_RESULTS, RELEVANCE_SCORE_THRESHOLD
from app import providers


PROMPT_TEMPLATE = """You are a helpful assistant that answers questions based strictly on the provided document excerpts.
Each excerpt is labeled with its source file in [Source: filename] tags.

Rules:
- Answer only from the provided excerpts. Do not use prior knowledge.
- If multiple sources are present, state which source your answer comes from.
- If the answer requires combining two passages, do so explicitly and cite both.
- If the topic exists in the documents but the specific detail is not there, say what you DO know from the excerpts.
- If the question is too vague, a typo, or not a real question (e.g. "ih", "ok", "test"), politely ask the user to clarify.
- If the answer is not in any excerpt, say: "I couldn't find that in the uploaded documents."

Document excerpts:
{context}

Question: {question}

Answer (cite the source file):"""


def answer_question(question: str) -> dict:
    """
    Run a question through the RAG pipeline.
    Returns the answer and rich source objects (filename, chunk_index, text).
    """
    try:
        vector_store = get_vector_store()
    except FileNotFoundError as e:
        raise RuntimeError(str(e))

    retriever = vector_store.as_retriever(
        search_type="similarity_score_threshold",
        search_kwargs={
            "k": TOP_K_RESULTS,
            "score_threshold": RELEVANCE_SCORE_THRESHOLD,
        },
    )

    source_docs = retriever.invoke(question)

    # Build labeled context so the LLM knows which file each chunk came from
    labeled_context = ""
    for doc in source_docs:
        fname = doc.metadata.get("source", "unknown")
        labeled_context += f"\n\n[Source: {fname}]\n{doc.page_content.strip()}"

    llm = providers.get_llm()
    prompt = PromptTemplate(
        template=PROMPT_TEMPLATE,
        input_variables=["context", "question"],
    )

    formatted_prompt = prompt.format(
        context=labeled_context.strip() if labeled_context else "No relevant excerpts found.",
        question=question,
    )

    answer = llm.invoke(formatted_prompt)
    # Handle both string and AIMessage responses
    answer_text = answer.content if hasattr(answer, "content") else str(answer)

    seen = set()
    sources = []
    for i, doc in enumerate(source_docs):
        filename = doc.metadata.get("source", "unknown")
        text = doc.page_content.strip()
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
        "answer": answer_text,
        "sources": sources,
    }
