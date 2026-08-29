from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from services.workspace_service import get_workspace
from services.security_service import (
    tools_status, scan_workspace, get_baseline, save_baseline,
    delete_baseline, to_sarif,
)

router = APIRouter(prefix="/security", tags=["security"])


def _workspace_path() -> str:
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    return ws["current"]["path"]


@router.get("/tools")
def security_tools():
    """Доступность детерминированных движков на сервере."""
    return tools_status()


@router.post("/scan")
async def security_scan(verify: bool = Query(False, description="LLM-верификация топ-находок")):
    """
    Security-скан текущего workspace: SAST (semgrep), секреты (gitleaks/builtin),
    SCA (pip-audit/npm audit). С verify=true — второй проход LLM-верификатором.
    Учитывает suppression-комментарии `# ccl:ignore`, метрики покрытия
    и diff против baseline (если сохранён).
    """
    return await scan_workspace(_workspace_path(), verify=verify)


@router.post("/sarif", responses={
    200: {"content": {"application/sarif+json": {}}, "description": "SARIF 2.1.0 отчёт"},
})
async def security_sarif():
    """SARIF 2.1.0-экспорт свежего скана (GitHub Code Scanning / CI)."""
    ws_path = _workspace_path()
    report = await scan_workspace(ws_path, verify=False)
    name = ws_path.rstrip("/").split("/")[-1] or "workspace"
    return JSONResponse(
        content=to_sarif(report),
        media_type="application/sarif+json",
        headers={"Content-Disposition": f'attachment; filename="{name}.sarif"'},
    )


@router.get("/baseline")
def security_baseline_info():
    """Информация о сохранённом baseline текущего workspace."""
    return {"baseline": get_baseline(_workspace_path())}


@router.post("/baseline")
async def security_baseline_save():
    """Сохранить текущее состояние находок как baseline (скан без верификации)."""
    ws_path = _workspace_path()
    report = await scan_workspace(ws_path, verify=False)
    return save_baseline(ws_path, report)


@router.delete("/baseline")
def security_baseline_delete():
    return delete_baseline(_workspace_path())
