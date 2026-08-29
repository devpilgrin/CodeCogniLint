from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from services.report_service import generate_xlsx, generate_md

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportRequest(BaseModel):
    results: dict


@router.post("/xlsx", responses={
    200: {"content": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}},
          "description": "XLSX-файл отчёта"},
})
def report_xlsx(body: ReportRequest):
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
    md = generate_md(body.results)
    return Response(
        content=md.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="hybrid-report.md"'},
    )
