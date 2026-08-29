from fastapi import APIRouter, HTTPException, Query
from services.workspace_service import get_workspace
from services.security_service import tools_status, scan_workspace

router = APIRouter(prefix="/security", tags=["security"])


@router.get("/tools")
def security_tools():
    """Доступность детерминированных движков на сервере."""
    return tools_status()


@router.post("/scan")
async def security_scan(verify: bool = Query(False, description="LLM-верификация топ-находок")):
    """
    Security-скан текущего workspace: SAST (semgrep), секреты (gitleaks/builtin),
    SCA (pip-audit/npm audit). С verify=true — второй проход LLM-верификатором.
    """
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    return await scan_workspace(ws["current"]["path"], verify=verify)
