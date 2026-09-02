import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services.report_service import generate_xlsx, generate_md

router = APIRouter(prefix="/reports", tags=["reports"])

# Лимит на произвольный dict-отчёт: без него гигантское тело — DoS по памяти
MAX_REPORT_BYTES = 8 * 1024 * 1024


def _check_size(data: dict) -> None:
    if len(json.dumps(data, ensure_ascii=False)) > MAX_REPORT_BYTES:
        raise HTTPException(status_code=413,
                            detail=f"Отчёт слишком большой (лимит {MAX_REPORT_BYTES // 1024 // 1024} МБ)")


class ReportRequest(BaseModel):
    results: dict


@router.post("/xlsx", responses={
    200: {"content": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}},
          "description": "XLSX-файл отчёта"},
})
def report_xlsx(body: ReportRequest):
    _check_size(body.results)
    data = generate_xlsx(body.results)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="hybrid-report.xlsx"'},
    )


@router.post("/md", responses={
    200: {"content": {"text/markdown": {}}, "description": "Markdown-отчёт"},
})
def report_md(body: ReportRequest):
    _check_size(body.results)
    md = generate_md(body.results)
    return Response(
        content=md.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="hybrid-report.md"'},
    )
