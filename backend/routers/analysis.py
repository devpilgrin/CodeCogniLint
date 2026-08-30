import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from services.analysis_service import analyze_code
from services.llm_adapter import chat_completion, LLMError
from services.workspace_service import get_workspace, iter_workspace_files
from services.git_service import GitError

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _normalize_for_llm(messages: list[dict]) -> list[dict]:
    """Strict template-friendly cleanup of chat history."""
    filtered = [
        {"role": m["role"], "content": m.get("content", "")}
        for m in messages
        if m.get("role") in ("user", "assistant")
    ]
    while filtered and filtered[0]["role"] == "assistant":
        filtered.pop(0)
    merged: list[dict] = []
    for m in filtered:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] = (merged[-1]["content"] + "\n\n" + m["content"]).strip()
        else:
            merged.append(m)
    return merged


class FileAnalysisRequest(BaseModel):
    file_path: str = Field(min_length=1)
    content: str = Field(min_length=1)


class ChatMessageIn(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = Field(min_length=1)
    timestamp: str | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn]
    context: str | None = None


@router.post("/file")
async def analyze_file(body: FileAnalysisRequest):
    return await analyze_code(body.file_path, body.content)


@router.get("/compare")
async def compare_refs(base: str = "main", head: str = "HEAD"):
    """Сравнение нарушений между ветками: semgrep-находки по изменённым файлам,
    diff по fingerprint. Детерминированно, без LLM."""
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    from services.compare_service import compare_branches
    try:
        return await compare_branches(ws["current"]["path"], base, head)
    except GitError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/repository/stream", responses={
    200: {"content": {"text/event-stream": {}}, "description": "SSE-поток результатов"},
})
async def stream_repository_analysis():
    """
    Server-Sent Events: scan all code files in current workspace, analyze each,
    stream per-file results as they're produced.

    Event types:
      - start:    {type, total}
      - file:     {type, index, total, path, result}
      - done:     {type, total}
      - error:    {type, error}
      - aborted:  {type, error}  (3+ consecutive LLM failures)
    """
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")

    workspace_path = ws["current"]["path"]

    async def event_stream():
        try:
            files = list(iter_workspace_files(workspace_path))
            total = len(files)
            yield f"data: {json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

            if total == 0:
                yield f"data: {json.dumps({'type': 'done', 'total': 0}, ensure_ascii=False)}\n\n"
                return

            consecutive_errors = 0
            for i, (path, content, _lang) in enumerate(files):
                try:
                    result = await analyze_code(path, content)
                except Exception as exc:
                    result = {
                        "file_path": path,
                        "violations": [],
                        "git_context": "",
                        "summary": f"⚠️ Ошибка анализа: {exc}",
                    }

                # Short-circuit if LLM is consistently failing
                summary = result.get("summary", "")
                if isinstance(summary, str) and summary.startswith("⚠️"):
                    consecutive_errors += 1
                    if consecutive_errors >= 3:
                        yield (
                            f"data: {json.dumps({'type': 'aborted', 'error': summary, 'index': i, 'total': total}, ensure_ascii=False)}\n\n"
                        )
                        return
                else:
                    consecutive_errors = 0

                payload = {
                    "type": "file",
                    "index": i,
                    "total": total,
                    "path": path,
                    "result": result,
                }
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'total': total}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # prevent proxy buffering
        },
    )


@router.post("/chat")
async def chat(body: ChatRequest):
    system = "Ты — ИИ-помощник по анализу кода. Отвечай кратко и по делу на русском языке."
    if body.context:
        system += f"\n\nКонтекст кода:\n{body.context}"

    history = _normalize_for_llm([m.model_dump() for m in body.messages])
    if not history:
        # Толерантность к пустой истории: честный ответ 200 вместо 400
        return {
            "role": "assistant",
            "content": "Сообщение пустое — сформулируйте вопрос о коде.",
            "timestamp": datetime.utcnow().isoformat(),
        }

    llm_messages = [{"role": "system", "content": system}] + history

    try:
        reply = await chat_completion(llm_messages)
    except LLMError as exc:
        reply = f"⚠️ {exc.friendly}"

    return {
        "role": "assistant",
        "content": reply,
        "timestamp": datetime.utcnow().isoformat(),
    }
