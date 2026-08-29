from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.workspace_service import get_workspace
from services.git_service import GitError
from services.review_agent import review_file, review_changes

router = APIRouter(prefix="/review", tags=["review"])


class FileReviewRequest(BaseModel):
    file_path: str = Field(min_length=1)
    content: str = Field(min_length=1)


@router.post("/file")
async def review_single_file(body: FileReviewRequest):
    """Ревью одного файла (контент присылает клиент — актуальный, с правками)."""
    return await review_file(body.file_path, body.content)


@router.post("/changes")
async def review_uncommitted_changes():
    """Ревью незакоммиченных изменений текущего workspace (git)."""
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    try:
        return await review_changes(ws["current"]["path"])
    except GitError as e:
        raise HTTPException(status_code=409, detail=str(e))
