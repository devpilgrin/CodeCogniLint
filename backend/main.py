from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from routers import rules, analysis, settings, workspace, reports, gitops, review, security, pentest, audit, quality, watch

app = FastAPI(title="CodeCogniLint API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _iter_routes(routes, prefix: str = ""):
    """Плоский обход маршрутов с учётом _IncludedRouter-обёрток FastAPI:
    маршруты лежат в .original_router.routes, префикс — в .include_context.prefix,
    а path_regex вложенных маршрутов префикс НЕ содержит."""
    for r in routes:
        if getattr(r, "methods", None):
            yield r, prefix
            continue
        orig = getattr(r, "original_router", None)
        if orig is not None and getattr(orig, "routes", None):
            ctx = getattr(r, "include_context", None)
            yield from _iter_routes(orig.routes, prefix + getattr(ctx, "prefix", ""))
        else:
            sub = getattr(r, "routes", None)
            if sub:
                yield from _iter_routes(sub, prefix)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Базовые security-заголовки + корректный Allow на 405.

    Starlette формирует 405 на уровне роутера БЕЗ исключения и с неполным
    Allow (ловится фаззером allow_header_conformance) — пересобираем здесь
    из всех маршрутов, совпавших по пути."""
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if resp.status_code == 405:
        allow: set[str] = set()
        path = request.scope.get("path", "")
        static_allow: set[str] = set()
        for route, prefix in _iter_routes(request.app.routes):
            # маршруты вне схемы (служебные 405-заглушки) в Allow не включаем —
            # заголовок обязан совпадать с документированными методами
            if getattr(route, "include_in_schema", True) is False:
                continue
            regex = getattr(route, "path_regex", None)
            if regex and regex.match(path[len(prefix):] if prefix and path.startswith(prefix) else path):
                if "{" in getattr(route, "path", ""):
                    allow |= route.methods          # параметризованный ({rule_id})
                else:
                    static_allow |= route.methods   # статический путь — приоритет
        # Если путь совпал со статическим маршрутом, Allow — только его методы
        # (иначе /rules/generate получает методы от /rules/{rule_id})
        allow = static_allow or allow
        if allow:
            resp.headers["Allow"] = ", ".join(sorted(allow))
    return resp


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code,
                        headers=dict(getattr(exc, "headers", None) or {}))


app.include_router(rules.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(gitops.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(security.router, prefix="/api")
app.include_router(pentest.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(quality.router, prefix="/api")
app.include_router(watch.router, prefix="/api")

# Коды ошибок, которые любой эндпоинт может вернуть — документируем глобально,
# чтобы OpenAPI-схема соответствовала реальности (status_code_conformance).
_ERROR_RESPONSES = {
    "400": {"description": "Доменная ошибка валидации (некорректное значение поля)"},
    "404": {"description": "Ресурс не найден (проект не открыт, файл/правило отсутствует)"},
    "409": {"description": "Конфликт состояния (не git-репозиторий, внешняя операция не удалась)"},
    "503": {"description": "Внешний сервис недоступен (LLM)"},
}


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title="CodeCogniLint API", version="1.0.0", routes=app.routes,
    )
    for path_item in schema.get("paths", {}).values():
        for op in path_item.values():
            if not isinstance(op, dict) or "responses" not in op:
                continue
            for code, resp in _ERROR_RESPONSES.items():
                op["responses"].setdefault(code, resp)
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# Раздача собранного frontend (docker/прод-режим): backend/static монтируется
# ПОСЛЕ api-роутеров — API-маршруты имеют приоритет над статикой.
from pathlib import Path as _Path
_STATIC_DIR = _Path(__file__).parent / "static"
if (_STATIC_DIR / "index.html").exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="static")
