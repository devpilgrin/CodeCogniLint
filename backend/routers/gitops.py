import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, StrictBool
from services.workspace_service import get_workspace
from services.git_service import GitError, status, diff, commit, push, pull, log, create_pr, pr_context
from services.llm_adapter import chat_completion, LLMError

router = APIRouter(prefix="/git", tags=["git"])


def _git_error(e: GitError) -> HTTPException:
    """Git-сбои (не репозиторий, push/pull не удался) — конфликт состояния."""
    return HTTPException(status_code=409, detail=str(e))


class CommitRequest(BaseModel):
    message: str = Field(min_length=1)
    paths: Optional[list[str]] = None  # None = все изменения


class PushRequest(BaseModel):
    token: Optional[str] = None  # разовый токен; иначе GIT_TOKEN/GITHUB_TOKEN из .env


class PullRequest(BaseModel):
    token: Optional[str] = None


def _workspace_path() -> str:
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    return ws["current"]["path"]


@router.get("/status")
def git_status():
    try:
        return status(_workspace_path())
    except GitError as e:
        raise _git_error(e)


@router.get("/diff")
def git_diff(path: Optional[str] = Query(None)):
    try:
        return diff(_workspace_path(), path)
    except GitError as e:
        raise _git_error(e)


@router.post("/commit")
def git_commit(body: CommitRequest):
    try:
        return commit(_workspace_path(), body.message, body.paths)
    except GitError as e:
        raise _git_error(e)


@router.post("/push")
def git_push(body: PushRequest):
    try:
        return push(_workspace_path(), body.token)
    except GitError as e:
        raise _git_error(e)


@router.post("/pull")
def git_pull(body: PullRequest):
    try:
        return pull(_workspace_path(), body.token)
    except GitError as e:
        raise _git_error(e)


@router.get("/branches")
def git_branches():
    """Локальные ветки workspace (для сравнения)."""
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    from services.git_service import branches
    try:
        return branches(ws["current"]["path"])
    except GitError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/log")
def git_log(limit: int = Query(10, ge=1, le=50)):
    try:
        return log(_workspace_path(), limit)
    except GitError as e:
        raise _git_error(e)


class PrRequest(BaseModel):
    title: str = ""
    body: str = ""
    base: str = Field(default="main", min_length=1)
    token: Optional[str] = None
    with_llm: StrictBool = False  # сгенерировать title/body из diff через LLM


_PR_SYSTEM = """Ты — помощник по оформлению Pull Request. По статистике diff и списку
коммитов составь заголовок и описание PR. Ответь строго валидным JSON:
{"title": "...", "body": "..."}. title — одна строка до 72 символов, body —
2-4 пункта markdown (что сделано и зачем), без лишнего."""


@router.post("/pr")
async def git_create_pr(body: PrRequest):
    """Создать GitHub PR: push ветки + API. with_llm — генерация title/body."""
    ws_path = _workspace_path()
    title, text = body.title.strip(), body.body.strip()
    if body.with_llm:
        try:
            # блокирующие git-вызовы — в thread, чтобы не вешать event loop
            ctx = await asyncio.to_thread(pr_context, ws_path, base=body.base)
        except GitError as e:
            raise _git_error(e)
        user = (f"Ветка: {ctx['branch']} → {ctx['base']}\n\n"
                f"Коммиты:\n" + "\n".join(f"- {c}" for c in ctx["commits"] or ["—"]) +
                f"\n\nDiff --stat:\n{ctx['stat'] or '—'}")
        try:
            raw = await chat_completion([
                {"role": "system", "content": _PR_SYSTEM},
                {"role": "user", "content": user},
            ])
            import json as _json
            start, end = raw.find("{"), raw.rfind("}")
            if start != -1 and end > start:
                data = _json.loads(raw[start:end + 1])
                title = title or str(data.get("title", "")).strip()
                text = text or str(data.get("body", "")).strip()
        except (LLMError, ValueError):
            if not title:
                raise HTTPException(status_code=503,
                                    detail="LLM недоступна — задайте заголовок PR вручную")
    try:
        return await asyncio.to_thread(
            create_pr, ws_path, title=title, body=text, base=body.base, token=body.token)
    except GitError as e:
        raise _git_error(e)
