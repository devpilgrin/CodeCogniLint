from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from services.workspace_service import get_workspace
from services.git_service import GitError, status, diff, commit, push, pull, log

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


@router.get("/log")
def git_log(limit: int = Query(10, ge=1, le=50)):
    try:
        return log(_workspace_path(), limit)
    except GitError as e:
        raise _git_error(e)
