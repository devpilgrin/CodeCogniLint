"""
Мульти-агентный аудит (волна 4).

Оркестратор: детерминированные находки волн 1-3 группируются по доменам,
каждый домен разбирает специализированный суб-агент (LLM с экспертным
промптом + контекст кода), синтезатор сводит домены в итоговый вердикт.
Без находок LLM не вызывается вовсе — детерминированный короткий путь.
"""
import asyncio
import json
from typing import Optional

from .llm_adapter import chat_completion, LLMError
from .analysis_service import _extract_json
from .security_service import scan_workspace, _code_context, SEVERITY_ORDER

# ------------------------------------------------------------------ Домены

DOMAINS: dict[str, dict] = {
    "injections": {
        "label": "Инъекции",
        "cwe": {"CWE-89", "CWE-78", "CWE-95", "CWE-79", "CWE-502", "CWE-20"},
        "persona": (
            "Ты — специалист по инъекциям (SQL, команды ОС, eval, XSS, десериализация). "
            "Оценивай реальную эксплуатируемость: есть ли путь от недоверенного ввода до стока."
        ),
    },
    "auth_secrets": {
        "label": "Аутентификация и секреты",
        "cwe": {"CWE-798", "CWE-321", "CWE-287", "CWE-522"},
        "persona": (
            "Ты — специалист по аутентификации и управлению секретами. "
            "Оценивай: реальный ли это секрет или плейсхолдер/пример, каков радиус компрометации."
        ),
    },
    "crypto": {
        "label": "Криптография",
        "cwe": {"CWE-327", "CWE-295", "CWE-319", "CWE-326"},
        "persona": (
            "Ты — специалист по прикладной криптографии. "
            "Оценивай: где используется слабый примитив (пароли, подписи, токены) и чем это грозит."
        ),
    },
    "config": {
        "label": "Конфигурация",
        "cwe": {"CWE-489", "CWE-693", "CWE-942", "CWE-200", "CWE-538", "CWE-749", "CWE-1021"},
        "persona": (
            "Ты — специалист по безопасной конфигурации (misconfiguration). "
            "Оценивай: prod-контекст vs dev-инструменты, поверхность разведки для атакующего."
        ),
    },
    "dependencies": {
        "label": "Зависимости (SCA)",
        "cwe": set(),
        "tools": {"pip-audit", "npm-audit"},
        "persona": (
            "Ты — специалист по безопасности цепочки поставок (supply chain). "
            "Оценивай: известные CVE в зависимостях, наличие фикс-версий, приоритет обновления."
        ),
    },
}

MAX_DOMAIN_FINDINGS = 12   # находок с контекстом на одного суб-агента
MAX_SYNTH_TOTAL = 40


def _domain_of(f: dict) -> str:
    for key, d in DOMAINS.items():
        if "tools" in d and f["tool"] in d["tools"]:
            return key
        if f.get("cwe") in d["cwe"]:
            return key
    return "config"  # fallback


def _finding_payload(workspace: str, f: dict, with_context: bool) -> dict:
    p = {
        "tool": f["tool"], "rule": f["rule_id"], "severity": f["severity"],
        "cwe": f.get("cwe"), "file": f["path"], "line": f["line_start"],
        "title": f["title"], "message": f["message"], "snippet": f.get("snippet", ""),
    }
    if with_context and f["tool"] in ("semgrep", "secrets", "gitleaks"):
        ctx = _code_context(workspace, f["path"], f["line_start"])
        if ctx:
            p["code_context"] = ctx
    return p


# -------------------------------------------------------------- Суб-агенты

def _domain_prompt(key: str) -> str:
    d = DOMAINS[key]
    return (
        f"{d['persona']}\n"
        "Тебе дают находки детерминированных сканеров с фрагментами кода. "
        "Оцени каждую: реальная угроза или ложное срабатывание в данном контексте, "
        "эксплуатируемость (high/medium/low) и почему. "
        "Отвечай строго JSON без markdown."
    )


async def _audit_domain(workspace: str, key: str, findings: list[dict]) -> dict:
    d = DOMAINS[key]
    top = sorted(findings, key=lambda f: SEVERITY_ORDER[f["severity"]])[:MAX_DOMAIN_FINDINGS]
    items = [_finding_payload(workspace, f, with_context=True) for f in top]

    messages = [
        {"role": "system", "content": _domain_prompt(key)},
        {"role": "user", "content": (
            f"Домен: {d['label']}. Находок: {len(findings)} (с контекстом: {len(items)}).\n\n"
            f"НАХОДКИ:\n{json.dumps(items, ensure_ascii=False, indent=1)[:14000]}\n\n"
            'Схема ответа (JSON): {"risk":"low|medium|high|critical",'
            '"assessment":"3-4 предложения по домену",'
            '"findings":[{"rule":"...","file":"...","exploitability":"high|medium|low",'
            '"real":true|false,"note":"одно предложение"}],'
            '"recommendations":["приоритизированные шаги по домену"]}'
        )},
    ]

    try:
        raw = await chat_completion(messages)
        data = json.loads(_extract_json(raw))
        risk = str(data.get("risk", "medium")).lower()
        if risk not in ("low", "medium", "high", "critical"):
            risk = "medium"
        return {
            "domain": key,
            "label": d["label"],
            "findings_count": len(findings),
            "risk": risk,
            "assessment": str(data.get("assessment", "")),
            "findings": [
                {
                    "rule": str(x.get("rule", "")),
                    "file": str(x.get("file", "")),
                    "exploitability": x.get("exploitability") if x.get("exploitability") in ("high", "medium", "low") else "unknown",
                    "real": bool(x.get("real", True)),
                    "note": str(x.get("note", ""))[:300],
                }
                for x in (data.get("findings") or [])[:MAX_DOMAIN_FINDINGS]
            ],
            "recommendations": [str(r) for r in (data.get("recommendations") or [])][:6],
            "agent_error": None,
        }
    except (LLMError, json.JSONDecodeError) as e:
        return {
            "domain": key, "label": d["label"], "findings_count": len(findings),
            "risk": "unknown", "assessment": "", "findings": [], "recommendations": [],
            "agent_error": getattr(e, "friendly", str(e))[:200],
        }


# -------------------------------------------------------------- Синтезатор

SYNTH_SYSTEM = """Ты — ведущий аудита безопасности. Получаешь заключения
специализированных суб-агентов по доменам. Сведи их в итоговый вердикт:
совокупный риск, ключевые векторы атаки, приоритеты. Отвечай строго JSON."""


async def _synthesize(domains: list[dict], summary: dict) -> Optional[dict]:
    payload = {
        "total_findings": summary["total"],
        "by_severity": summary["by_severity"],
        "domains": [
            {
                "domain": d["label"], "risk": d["risk"], "findings": d["findings_count"],
                "assessment": d["assessment"][:400],
                "top": [f for f in d["findings"] if f.get("real")][:3],
            }
            for d in domains
        ],
    }
    messages = [
        {"role": "system", "content": SYNTH_SYSTEM},
        {"role": "user", "content": (
            f"ЗАКЛЮЧЕНИЯ СУБ-АГЕНТОВ:\n{json.dumps(payload, ensure_ascii=False, indent=1)[:10000]}\n\n"
            'Схема ответа (JSON): {"overall_risk":"low|medium|high|critical",'
            '"verdict":"4-5 предложений итоговой оценки",'
            '"attack_vectors":["ключевые векторы атаки"],'
            '"priorities":["топ-5 приоритетных действий"]}'
        )},
    ]
    try:
        raw = await chat_completion(messages)
        data = json.loads(_extract_json(raw))
        risk = str(data.get("overall_risk", "medium")).lower()
        if risk not in ("low", "medium", "high", "critical"):
            risk = "medium"
        return {
            "overall_risk": risk,
            "verdict": str(data.get("verdict", "")),
            "attack_vectors": [str(v) for v in (data.get("attack_vectors") or [])][:6],
            "priorities": [str(p) for p in (data.get("priorities") or [])][:6],
        }
    except (LLMError, json.JSONDecodeError):
        return None


# ----------------------------------------------------------------- Матрица

def _build_matrix(findings: list[dict], domains: list[dict]) -> list[dict]:
    """Матрица рисков: CWE × severity × эксплуатируемость (из суб-агентов)."""
    # exploitability по (rule, file) из заключений суб-агентов
    expl: dict[tuple[str, str], str] = {}
    for d in domains:
        for f in d["findings"]:
            expl[(f["rule"], f["file"])] = f["exploitability"]

    rows: dict[str, dict] = {}
    for f in findings:
        if f.get("suppressed"):
            continue
        cwe = f.get("cwe") or "—"
        row = rows.setdefault(cwe, {"cwe": cwe, "count": 0,
                                    "max_severity": "info", "exploitability": "unknown"})
        row["count"] += 1
        if SEVERITY_ORDER[f["severity"]] < SEVERITY_ORDER[row["max_severity"]]:
            row["max_severity"] = f["severity"]
        e = expl.get((f["rule_id"], f["path"]), "unknown")
        order = {"high": 0, "medium": 1, "low": 2, "unknown": 3}
        if order.get(e, 3) < order.get(row["exploitability"], 3):
            row["exploitability"] = e

    return sorted(rows.values(),
                  key=lambda r: (SEVERITY_ORDER[r["max_severity"]], -r["count"]))


# ------------------------------------------------------------------- Прогон

async def run_audit(workspace: str, verify: bool = False) -> dict:
    """Полный аудит: скан → группировка по доменам → суб-агенты → синтезатор."""
    scan = await scan_workspace(workspace, verify=verify)
    active = [f for f in scan["findings"] if not f.get("suppressed")]

    base = {
        "workspace": workspace,
        "tools": scan["tools"],
        "coverage": scan["coverage"],
        "summary": scan["summary"],
    }

    if not active:
        return {
            **base,
            "domains": [],
            "synthesis": None,
            "matrix": [],
            "note": "Находок нет — суб-агенты не вызывались (детерминированный короткий путь).",
        }

    # Группировка по доменам
    grouped: dict[str, list[dict]] = {}
    for f in active:
        grouped.setdefault(_domain_of(f), []).append(f)

    # Суб-агенты параллельно
    domains = await asyncio.gather(*(
        _audit_domain(workspace, key, flist) for key, flist in grouped.items()
    ))
    domains = sorted(domains, key=lambda d: -d["findings_count"])

    synthesis = await _synthesize(list(domains), scan["summary"])
    matrix = _build_matrix(active, list(domains))

    return {
        **base,
        "domains": domains,
        "synthesis": synthesis,
        "matrix": matrix,
        "note": None,
    }
