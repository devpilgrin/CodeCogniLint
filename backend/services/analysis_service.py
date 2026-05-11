import json
import re
from typing import Optional
from .llm_adapter import chat_completion, LLMError
from .rules_service import load_rules


SYSTEM_PROMPT = """Ты — эксперт по безопасности кода и архитектуре ПО.
Анализируй код согласно предоставленным правилам.
Всегда отвечай строго в формате JSON без markdown-блоков."""


def _extract_json(text: str) -> str:
    """Strip markdown code fences, return raw JSON string."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if match:
        return match.group(1).strip()
    start = min(
        (text.find(c) for c in ('{', '[') if text.find(c) != -1),
        default=0,
    )
    return text[start:]


def _with_line_numbers(content: str) -> str:
    """Prepend `   N | ` to each line so LLM can copy numbers directly."""
    lines = content.split('\n')
    width = max(3, len(str(len(lines))))
    return '\n'.join(f"{i + 1:>{width}} | {line}" for i, line in enumerate(lines))


def _find_snippet_line(content: str, snippet: str, hint_line: Optional[int] = None) -> Optional[int]:
    """
    Locate the 1-based line where `snippet`'s first meaningful line appears.
    If multiple matches exist, prefer the one closest to `hint_line` (LLM's claim).
    Returns None when snippet is too short or unmatched.
    """
    if not snippet:
        return None
    snippet_first = next((line.strip() for line in snippet.splitlines() if line.strip()), None)
    if not snippet_first or len(snippet_first) < 5:
        return None

    content_lines = content.split('\n')
    matches = [i + 1 for i, line in enumerate(content_lines) if snippet_first in line]
    if not matches:
        return None
    if len(matches) == 1 or hint_line is None:
        return matches[0]
    return min(matches, key=lambda m: abs(m - hint_line))


def _correct_violation_lines(violations: list[dict], content: str) -> list[dict]:
    """
    Adjust line_start/line_end of each violation using its code_snippet when possible.
    Preserves the line span (line_end - line_start). Clamps to file bounds.
    """
    total_lines = max(1, len(content.split('\n')))
    fixed: list[dict] = []
    for v in violations:
        try:
            ls = int(v.get("line_start") or 1)
            le = int(v.get("line_end") or ls)
        except (TypeError, ValueError):
            ls, le = 1, 1

        ls = max(1, min(ls, total_lines))
        le = max(ls, min(le, total_lines))
        span = le - ls

        snippet = v.get("code_snippet")
        if snippet:
            actual = _find_snippet_line(content, snippet, hint_line=ls)
            if actual is not None:
                ls = actual
                le = min(total_lines, actual + span)

        v["line_start"] = ls
        v["line_end"] = le
        fixed.append(v)
    return fixed


async def analyze_code(file_path: str, content: str) -> dict:
    rules = load_rules()
    enabled_rules = [r for r in rules if r.get("enabled", True)]

    rules_text = "\n".join(
        f"- [{r['category'].upper()}] {r['description']}" for r in enabled_rules
    ) or "Общий анализ безопасности и качества кода."

    numbered = _with_line_numbers(content)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Проанализируй файл {file_path} согласно правилам:\n\n"
                f"ПРАВИЛА:\n{rules_text}\n\n"
                f"КОД (формат каждой строки: 'НОМЕР | содержимое'):\n```\n{numbered}\n```\n\n"
                "ВАЖНО:\n"
                "1. line_start и line_end — это ТОЧНЫЕ номера, которые ты видишь слева от '|' в коде выше.\n"
                "2. В поле code_snippet вставь первую строку нарушения дословно, БЕЗ номера и без ' | '.\n"
                "3. Если нарушений нет — верни пустой массив violations.\n\n"
                "Схема ответа (JSON, без markdown):\n"
                f'{{"file_path":"{file_path}",'
                f'"violations":[{{"rule_id":"...","rule_description":"...",'
                f'"category":"syntax|semantic|analysis","severity":"critical|warning|info",'
                f'"line_start":1,"line_end":5,"code_snippet":"...",'
                f'"explanation":"...","suggestion":"..."}}],'
                f'"git_context":"...","summary":"..."}}'
            ),
        },
    ]

    try:
        raw = await chat_completion(messages)
        result = json.loads(_extract_json(raw))
        result["violations"] = _correct_violation_lines(result.get("violations", []), content)
        return result
    except LLMError as exc:
        return {
            "file_path": file_path,
            "violations": [],
            "git_context": "",
            "summary": f"⚠️ {exc.friendly}",
        }
    except json.JSONDecodeError:
        return {
            "file_path": file_path,
            "violations": [],
            "git_context": "",
            "summary": "⚠️ LLM вернул некорректный JSON. Попробуйте другую модель.",
        }


RULE_GEN_PROMPT = """Ты — генератор правил для системы анализа кода.
Проанализируй фрагмент кода и создай абстрактное правило.
Отвечай строго в формате JSON без markdown-блоков."""


async def generate_rule_from_code(code: str, category: str) -> dict:
    messages = [
        {"role": "system", "content": RULE_GEN_PROMPT},
        {
            "role": "user",
            "content": (
                f'Создай правило категории "{category}" для этого фрагмента кода:\n\n'
                f"```\n{code}\n```\n\n"
                f"Верни JSON строго по схеме:\n"
                f'{{"description":"Краткое описание правила","pattern_description":"Детальное описание паттерна"}}'
            ),
        },
    ]

    try:
        raw = await chat_completion(messages)
        data = json.loads(_extract_json(raw))
        from .rules_service import add_rule
        return add_rule(category, data["description"], data["pattern_description"])
    except LLMError:
        raise
    except Exception:
        from .rules_service import add_rule
        return add_rule(
            category,
            f"Правило [{category}]: проверить паттерн",
            code[:200],
        )
