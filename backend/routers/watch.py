from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from services.workspace_service import get_workspace
from services.watch_service import watch_events

router = APIRouter(prefix="/watch", tags=["watch"])


@router.get("/stream", responses={
    200: {"content": {"text/event-stream": {}},
          "description": "SSE-поток: watch (старт), rescan (дельта+отчёт), error"},
})
async def watch_stream():
    """Watch-режим: SSE-поток авто-пересканов workspace при изменении файлов."""
    ws = get_workspace()
    if not ws["current"]:
        raise HTTPException(status_code=404, detail="Проект не открыт")
    return StreamingResponse(
        watch_events(ws["current"]["path"]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
