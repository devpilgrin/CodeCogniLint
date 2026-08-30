"""
Watch-режим: авто-перескан workspace при изменении файлов.

Без сторонних зависимостей: периодический снапшот mtime кодовых файлов
(детерминированный опрос), при изменении — полный security-скан, отчёт
уходит подписчику по SSE. LLM-верификация в watch не вызывается
(экономия токенов; детерминированные слои дают сигнал мгновенно).
"""
import asyncio
import json
import os
from pathlib import Path

from services.security_service import scan_workspace
from services.quality_service import _CODE_EXT, _SKIP_DIRS

POLL_INTERVAL = 3.0          # секунд между опросами FS
RESCAN_DEBOUNCE = 2.0        # тише после последнего изменения перед пересканом


def snapshot(root: Path) -> dict[str, float]:
    """{относительный путь: mtime} кодовых файлов."""
    out: dict[str, float] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix.lower() in _CODE_EXT:
                try:
                    out[str(p.relative_to(root))] = p.stat().st_mtime
                except OSError:
                    pass
    return out


def diff_snapshots(old: dict[str, float], new: dict[str, float]) -> dict:
    changed = [p for p in new if p not in old]
    changed += [p for p in new if p in old and new[p] != old[p]]
    deleted = [p for p in old if p not in new]
    return {"changed": sorted(set(changed)), "deleted": sorted(deleted)}


async def watch_events(workspace: str):
    """Async-генератор SSE-событий: приветствие, затем по изменению — rescan."""
    root = Path(workspace)
    prev = snapshot(root)
    yield _sse("watch", {"status": "started", "files": len(prev)})

    while True:
        await asyncio.sleep(POLL_INTERVAL)
        cur = snapshot(root)
        if cur == prev:
            continue
        delta = diff_snapshots(prev, cur)
        prev = cur
        await asyncio.sleep(RESCAN_DEBOUNCE)  # дожать серию сохранений
        # файлы могли измениться за время debounce
        cur = snapshot(root)
        prev = cur
        try:
            report = await scan_workspace(workspace, verify=False)
            yield _sse("rescan", {
                "delta": delta,
                "summary": report["summary"],
                "report": report,
            })
        except Exception as e:
            yield _sse("error", {"detail": str(e)[:200]})


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
