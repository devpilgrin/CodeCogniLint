from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from services.workspace_service import get_workspace
from services.audit_agent import run_audit
from services.report_service import generate_audit_html

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/run")
async def audit_run(verify: bool = Query(False, description="LLM-верификация находок до аудита")):
    """
    Мульти-агентный аудит: детерминированный скан → группировка находок по
    доменам → специализированные суб-агенты (инъекции/аутентификация/крипто/
    конфигурация/зависимости) → синтезатор → матрица рисков.
    Без находок LLM не вызывается.
    """
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    return await run_audit(ws["current"]["path"], verify=verify)


@router.post("/html", responses={
    200: {"content": {"text/html": {}}, "description": "HTML-отчёт аудита"},
})
def audit_html(report: dict):
    """Детерминированный рендер готового JSON-отчёта аудита в HTML."""
    return Response(
        content=generate_audit_html(report),
        media_type="text/html",
        headers={"Content-Disposition": 'attachment; filename="audit-report.html"'},
    )
