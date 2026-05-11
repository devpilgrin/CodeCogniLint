from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from services.workspace_service import (
    get_workspace, set_workspace, close_workspace,
    clone_repo, build_tree, read_file, browse_dir,
)

router = APIRouter(prefix="/workspace", tags=["workspace"])


class OpenRequest(BaseModel):
    path: str


class CloneRequest(BaseModel):
    url: str
    target: Optional[str] = None


@router.get("")
def current():
    return get_workspace()


@router.post("/open")
def open_local(body: OpenRequest):
    try:
        return set_workspace(body.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/close")
def close():
    return close_workspace()


@router.post("/clone")
def clone(body: CloneRequest):
    try:
        path = clone_repo(body.url, body.target)
        return set_workspace(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tree")
def tree():
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    try:
        return build_tree(ws["current"]["path"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/file")
def file(path: str = Query(...)):
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    try:
        return read_file(ws["current"]["path"], path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/browse")
def browse(path: Optional[str] = Query(None)):
    try:
        return browse_dir(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
