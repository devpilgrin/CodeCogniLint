from fastapi import APIRouter, HTTPException, Query
from services.workspace_service import get_workspace
from services.quality_service import tools_status, scan_quality

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/tools")
def quality_tools():
    return tools_status()


@router.post("/scan")
async def quality_scan(review: bool = Query(default=False)):
    """
    Слой качества: производительность + размер кода + best practices.
    review=true — LLM-разбор топ-3 hotspot'ов.
    """
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    return await scan_quality(ws["current"]["path"], review=review)
