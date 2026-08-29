import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_adapter import settings, get_client

router = APIRouter(prefix="/settings", tags=["settings"])

ENV_FILE = Path(__file__).parent.parent / ".env"


def _write_env(key: str, value: str) -> None:
    """Update or append a key=value line in .env file."""
    if not ENV_FILE.exists():
        ENV_FILE.write_text(f"{key}={value}\n", encoding="utf-8")
        return
    text = ENV_FILE.read_text(encoding="utf-8")
    pattern = re.compile(rf"^{key}=.*$", re.MULTILINE)
    if pattern.search(text):
        text = pattern.sub(f"{key}={value}", text)
    else:
        text = text.rstrip("\n") + f"\n{key}={value}\n"
    ENV_FILE.write_text(text, encoding="utf-8")


class LLMSettings(BaseModel):
    provider: str
    baseUrl: str
    model: str
    apiKey: str | None = None


@router.get("")
def get_settings():
    return {
        "provider": settings.llm_provider,
        "baseUrl": settings.llm_base_url,
        "model": settings.llm_model,
    }


@router.put("")
def update_settings(body: LLMSettings):
    # Update in-memory singleton so new requests use updated values immediately
    settings.llm_provider = body.provider
    settings.llm_base_url = body.baseUrl
    settings.llm_model = body.model
    if body.apiKey:
        settings.llm_api_key = body.apiKey

    # Persist to .env so settings survive restart
    try:
        _write_env("LLM_PROVIDER", body.provider)
        _write_env("LLM_BASE_URL", body.baseUrl)
        _write_env("LLM_MODEL", body.model)
        if body.apiKey:
            _write_env("LLM_API_KEY", body.apiKey)
    except UnicodeError as e:
        raise HTTPException(status_code=400,
                            detail=f"Недопустимые символы в значении настройки: {e}")

    return get_settings()
