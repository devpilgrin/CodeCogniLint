"""
Специализированный агент код-ревью.

Отличие от rules-based анализа (analysis_service): ревьюер работает как
человек-ревьюер на pull request — целостно оценивает изменение, выносит
вердикт (approve / comment / request_changes), отмечает не только проблемы,
но и сильные стороны кода.
"""
import json
from pathlib import Path
from typing import Optional

from .llm_adapter import chat_completion, LLMError
from .analysis_service import _extract_json, _with_line_numbers, _correct_violation_lines
from .git_service import status as git_status, diff as git_diff, GitError

REVIEWER_SYSTEM_PROMPT = """Ты — старший инженер, проводящий код-ревью (code review).
Твой стиль — как у внимательного ревьюера на pull request:
- Сначала понимаешь намерение кода, потом оцениваешь реализацию.
- Ищешь: ошибки логики и граничных случаев, уязвимости, проблемы
  производительности, нарушения читаемости и поддерживаемости.
- Не придираешься к мелочам: каждый issue должен быть обоснован.
- Отмечаешь и сильные стороны — это часть хорошего ревью.
- Всегда отвечаешь строго в формате JSON без markdown-блоков."""

VERDICTS = ("approve", "comment", "request_changes")
ISSUE_CATEGORIES = ("bug", "security", "performance", "style", "maintainability")

MAX_CHANGES_FILES = 10

_SCHEMA_HINT = (
    "Схема ответа (JSON, без markdown):\n"
    '{"verdict":"approve|comment|request_changes",'
    '"summary":"2-3 предложения: общая оценка",'
    '"issues":[{"severity":"critical|warning|info",'
    '"category":"bug|security|performance|style|maintainability",'
    '"line_start":1,"line_end":5,"code_snippet":"первая строка проблемного кода дословно",'
    '"title":"краткий заголовок","description":"в чём проблема и почему это важно",'
    '"suggestion":"как исправить"}],'
    '"positives":["что сделано хорошо"]}\n'
    "Правила вердикта: request_changes — есть critical-проблемы; "
    "comment — есть warning без critical; approve — замечаний нет или только info."
)


def _normalize_review(result: dict, file_path: str, content: str) -> dict:
    """Привести ответ LLM к канонической схеме + скорректировать строки."""
    verdict = str(result.get("verdict", "comment")).lower()
    if verdict not in VERDICTS:
        verdict = "comment"

    issues = result.get("issues") or []
    normalized = []
    for i in issues:
        sev = str(i.get("severity", "info")).lower()
        cat = str(i.get("category", "maintainability")).lower()
        normalized.append({
            "severity": sev if sev in ("critical", "warning", "info") else "info",
            "category": cat if cat in ISSUE_CATEGORIES else "maintainability",
            "line_start": i.get("line_start", 1),
            "line_end": i.get("line_end", i.get("line_start", 1)),
            "code_snippet": i.get("code_snippet", ""),
            "title": str(i.get("title", "Замечание")),
            "description": str(i.get("description", "")),
            "suggestion": str(i.get("suggestion", "")),
        })
    normalized = _correct_violation_lines(normalized, content)

    return {
        "file_path": file_path,
        "verdict": verdict,
        "summary": str(result.get("summary", "")),
        "issues": normalized,
        "positives": [str(p) for p in (result.get("positives") or [])][:5],
    }


def _error_review(file_path: str, text: str) -> dict:
    return {
        "file_path": file_path,
        "verdict": "comment",
        "summary": f"⚠️ {text}",
        "issues": [],
        "positives": [],
    }


async def review_file(file_path: str, content: str, change_context: Optional[str] = None) -> dict:
    """
    Ревью одного файла. Если задан change_context (unified diff) —
    фокус на изменённых строках с полным контекстом файла.
    """
    numbered = _with_line_numbers(content)

    focus = ""
    if change_context:
        focus = (
            "ФОКУС РЕВЬЮ: ниже diff незакоммиченных изменений этого файла. "
            "Оценивай в первую очередь изменённые строки, но учитывай контекст всего файла.\n"
            f"```diff\n{change_context[:8000]}\n```\n\n"
        )

    messages = [
        {"role": "system", "content": REVIEWER_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Проведи код-ревью файла {file_path}.\n\n"
                f"{focus}"
                f"КОД (формат каждой строки: 'НОМЕР | содержимое'):\n```\n{numbered}\n```\n\n"
                "ВАЖНО:\n"
                "1. line_start и line_end — ТОЧНЫЕ номера слева от '|' в коде выше.\n"
                "2. code_snippet — первая строка проблемного фрагмента дословно, БЕЗ номера и ' | '.\n"
                "3. Если проблем нет — пустой массив issues и verdict approve.\n\n"
                + _SCHEMA_HINT
            ),
        },
    ]

    try:
        raw = await chat_completion(messages)
        result = json.loads(_extract_json(raw))
        return _normalize_review(result, file_path, content)
    except LLMError as exc:
        return _error_review(file_path, exc.friendly)
    except json.JSONDecodeError:
        return _error_review(file_path, "LLM вернул некорректный JSON. Попробуйте другую модель.")


def _read_changed_file(workspace: str, rel_path: str, max_size: int = 256 * 1024) -> Optional[str]:
    root = Path(workspace).expanduser().resolve()
    target = (root / rel_path).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        return None
    if not target.is_file() or target.stat().st_size > max_size:
        return None
    raw = target.read_bytes()
    if b"\x00" in raw[:8192]:
        return None
    return raw.decode("utf-8", errors="replace")


async def review_changes(workspace: str) -> dict:
    """
    Ревью незакоммиченных изменений: per-file ревью изменённых/новых файлов
    с diff-контекстом + сводный вердикт.
    """
    try:
        st = git_status(workspace)
    except GitError as e:
        raise GitError(str(e))

    # Ревьюим изменённые и новые файлы (удалённые пропускаем)
    candidates = [f["path"] for f in st["changed"] if f["status"] in ("M", "A", "?")]
    # Дедупликация с сохранением порядка
    seen: set[str] = set()
    files = []
    for p in candidates:
        if p not in seen:
            seen.add(p)
            files.append(p)

    if not files:
        return {
            "overall_verdict": "approve",
            "summary": "Нет незакоммиченных изменений — ревью не требуется.",
            "files": [],
        }

    if len(files) > MAX_CHANGES_FILES:
        files = files[:MAX_CHANGES_FILES]

    reviews = []
    for path in files:
        content = _read_changed_file(workspace, path)
        if content is None:
            continue
        try:
            file_diff = git_diff(workspace, path).get("diff", "")
        except GitError:
            file_diff = ""
        reviews.append(await review_file(path, content, change_context=file_diff or None))

    if not reviews:
        return {
            "overall_verdict": "comment",
            "summary": "Изменённые файлы не удалось прочитать (бинарные или слишком большие).",
            "files": [],
        }

    rank = {"request_changes": 2, "comment": 1, "approve": 0}
    overall = max((r["verdict"] for r in reviews), key=lambda v: rank[v])
    total_issues = sum(len(r["issues"]) for r in reviews)
    critical = sum(1 for r in reviews for i in r["issues"] if i["severity"] == "critical")

    return {
        "overall_verdict": overall,
        "summary": (
            f"Ревью {len(reviews)} файлов: замечаний {total_issues}"
            + (f", из них критичных {critical}." if critical else ".")
        ),
        "files": reviews,
    }


async def review_commit(workspace: str, sha: str) -> dict:
    """
    Ревью конкретного коммита: per-file ревью с diff-контекстом коммита.
    Контент файлов — версия на этом коммите; фокус — изменённые строки.
    """
    from .git_service import commit_show, file_at

    meta = commit_show(workspace, sha)
    files = meta["files"][:MAX_CHANGES_FILES]

    if not files:
        return {
            "overall_verdict": "approve",
            "summary": f"Коммит {meta['short']}: «{meta['subject']}» — кодовых файлов нет, ревью не требуется.",
            "commit": {k: meta[k] for k in ("sha", "short", "author", "subject", "date")},
            "files": [],
        }

    reviews = []
    for path in files:
        content = file_at(workspace, meta["sha"], path)
        if content is None:
            continue
        # per-file diff коммита как фокус ревью
        try:
            from .git_service import _repo
            file_diff = _repo(workspace).git.show(meta["sha"], "--format=", f"--", path)
        except GitError:
            file_diff = ""
        reviews.append(await review_file(path, content, change_context=file_diff or None))

    if not reviews:
        return {
            "overall_verdict": "comment",
            "summary": f"Коммит {meta['short']}: файлы не удалось прочитать (бинарные или слишком большие).",
            "commit": {k: meta[k] for k in ("sha", "short", "author", "subject", "date")},
            "files": [],
        }

    rank = {"request_changes": 2, "comment": 1, "approve": 0}
    overall = max((r["verdict"] for r in reviews), key=lambda v: rank[v])
    total_issues = sum(len(r["issues"]) for r in reviews)
    critical = sum(1 for r in reviews for i in r["issues"] if i["severity"] == "critical")

    return {
        "overall_verdict": overall,
        "summary": (
            f"Коммит {meta['short']} «{meta['subject']}» ({meta['author']}): "
            f"ревью {len(reviews)} файлов, замечаний {total_issues}"
            + (f", из них критичных {critical}." if critical else ".")
        ),
        "commit": {k: meta[k] for k in ("sha", "short", "author", "subject", "date")},
        "files": reviews,
    }
