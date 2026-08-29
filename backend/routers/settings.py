import re
import os
from pathlib import Path
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_adapter import settings, get_client

router = APIRouter(prefix="/settings", tags=["settings"])

ENV_FILE = Path(__file__).parent.parent / ".env"

VALID_PROVIDERS = ("lmstudio", "openai", "anthropic")
# Недопустимые в .env символы: управляющие и суррогаты (фаззер-стойкость)
_BAD_CHARS_RE = re.compile(r"[\x00-\x1f\x7f\ud800-\udfff]")


class LLMSettings(BaseModel):
    provider: str
    baseUrl: str
    model: str
    apiKey: str | None = None


def _validate(body: LLMSettings) -> None:
    """Валидация ДО любой записи: либо всё применяется, либо ничего."""
    if body.provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400,
                            detail=f"Неизвестный провайдер '{body.provider}'. Допустимые: {', '.join(VALID_PROVIDERS)}")
    u = urlparse(body.baseUrl)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise HTTPException(status_code=400,
                            detail="baseUrl должен быть корректным http(s) URL")
    if not body.model.strip():
        raise HTTPException(status_code=400, detail="Модель не должна быть пустой")
    for field, value in (("provider", body.provider), ("baseUrl", body.baseUrl),
                         ("model", body.model), ("apiKey", body.apiKey or "")):
        if _BAD_CHARS_RE.search(value):
            raise HTTPException(status_code=400,
                                detail=f"Недопустимые символы в поле {field}")


def _render_env(text: str, updates: dict[str, str]) -> str:
    """Применить updates к содержимому .env (в памяти)."""
    for key, value in updates.items():
        pattern = re.compile(rf"^{key}=.*$", re.MULTILINE)
        line = f"{key}={value}"
        if pattern.search(text):
            text = pattern.sub(line, text)
        else:
            text = text.rstrip("\n") + ("\n" if text.strip() else "") + line + "\n"
    return text


def _write_env_atomic(updates: dict[str, str]) -> None:
    """Атомарная запись .env: готовим целиком в памяти, пишем во временный
    файл и переименовываем — при сбое старый .env остаётся нетронутым."""
    old = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    new = _render_env(old, updates)
    tmp = ENV_FILE.with_suffix(".env.tmp")
    tmp.write_text(new, encoding="utf-8")
    os.replace(tmp, ENV_FILE)


@router.get("")
def get_settings():
    return {
        "provider": settings.llm_provider,
        "baseUrl": settings.llm_base_url,
        "model": settings.llm_model,
    }


@router.put("")
def update_settings(body: LLMSettings):
    # 1) Валидация всего набора до любых побочных эффектов
    _validate(body)

    # 2) Атомарная персистентность
    updates = {
        "LLM_PROVIDER": body.provider,
        "LLM_BASE_URL": body.baseUrl,
        "LLM_MODEL": body.model,
    }
    if body.apiKey:
        updates["LLM_API_KEY"] = body.apiKey
    try:
        _write_env_atomic(updates)
    except (OSError, UnicodeError) as e:
        raise HTTPException(status_code=400, detail=f"Не удалось записать .env: {e}")

    # 3) In-memory — только после успешной записи (иначе риск рассинхрона)
    settings.llm_provider = body.provider
    settings.llm_base_url = body.baseUrl
    settings.llm_model = body.model
    if body.apiKey:
        settings.llm_api_key = body.apiKey

    return get_settings()
