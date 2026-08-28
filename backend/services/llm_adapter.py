from openai import AsyncOpenAI, APIConnectionError, BadRequestError, APIStatusError
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: str = "lmstudio"
    llm_base_url: str = "http://localhost:1234/v1"
    llm_model: str = "local-model"
    llm_api_key: str = "lm-studio"
    llm_temperature: float = 0.3
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()


def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
    )


def _friendly_error(exc: Exception) -> str:
    """Convert LLM SDK exceptions to Russian user-friendly messages."""
    msg = str(exc)
    if isinstance(exc, APIConnectionError):
        return (
            f"LLM недоступен по адресу {settings.llm_base_url}. "
            "Убедитесь, что LM Studio запущен."
        )
    if isinstance(exc, BadRequestError):
        if "No models loaded" in msg:
            return (
                "LM Studio запущен, но модель не загружена. "
                "Откройте LM Studio → вкладка Developer → выберите и загрузите модель."
            )
        return f"Ошибка запроса к LLM: {msg}"
    if isinstance(exc, APIStatusError):
        return f"Ошибка LLM API (код {exc.status_code}): {msg}"
    return f"Ошибка LLM: {msg}"


class LLMError(Exception):
    """Raised when LLM call fails; carries a user-friendly Russian message."""
    def __init__(self, friendly: str, original: Exception):
        super().__init__(friendly)
        self.friendly = friendly
        self.original = original


async def chat_completion(messages: list[dict], temperature: float | None = None) -> str:
    client = get_client()
    # temperature=None → из настроек (некоторые модели принимают только temperature=1)
    temp = settings.llm_temperature if temperature is None else temperature
    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=temp,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        raise LLMError(_friendly_error(exc), exc) from exc
