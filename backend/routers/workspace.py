from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from services.workspace_service import (
    get_workspace, set_workspace, close_workspace,
    clone_repo, build_tree, read_file, write_file, browse_dir,
    NotFoundError,
)

router = APIRouter(prefix="/workspace", tags=["workspace"])


def _http_error(e: ValueError) -> HTTPException:
    """Маппинг доменных ошибок на HTTP-коды: not-found → 404, прочее → 400."""
    if isinstance(e, NotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    return HTTPException(status_code=400, detail=str(e))


class OpenRequest(BaseModel):
    path: str = Field(min_length=1)


class CloneRequest(BaseModel):
    url: str = Field(min_length=1, pattern=r"^(https?://|git@)\S+$")
    target: Optional[str] = None


class SaveFileRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str


@router.get("")
def current():
    return get_workspace()


@router.post("/open")
def open_local(body: OpenRequest):
    try:
        return set_workspace(body.path)
    except ValueError as e:
        raise _http_error(e)


@router.post("/close")
def close():
    return close_workspace()


@router.post("/clone")
def clone(body: CloneRequest):
    try:
        path = clone_repo(body.url, body.target)
        return set_workspace(path)
    except ValueError as e:
        # Сбой внешней операции (сеть/доступ) и конфликты состояния → 409
        if "Git clone не удался" in str(e) or "уже существует" in str(e):
            raise HTTPException(status_code=409, detail=str(e))
        raise _http_error(e)


@router.get("/tree")
def tree():
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    try:
        return build_tree(ws["current"]["path"])
    except ValueError as e:
        raise _http_error(e)


@router.get("/file")
def file(path: str = Query(..., min_length=1)):
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    try:
        return read_file(ws["current"]["path"], path)
    except ValueError as e:
        raise _http_error(e)


@router.put("/file")
def save_file(body: SaveFileRequest):
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    try:
        return write_file(ws["current"]["path"], body.path, body.content)
    except ValueError as e:
        raise _http_error(e)


@router.get("/browse")
def browse(path: Optional[str] = Query(None)):
    try:
        return browse_dir(path)
    except ValueError as e:
        raise _http_error(e)
