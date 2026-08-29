"""
Детерминированный security-слой (волна 1): SAST (Semgrep), поиск секретов
(gitleaks / встроенные regex), SCA (pip-audit / npm audit) + LLM-верификатор.

Философия: движки находят, LLM только верифицирует и объясняет.
Все слои деградируют независимо: если инструмента нет — слой возвращает
status "unavailable", отчёт собирается из доступных.
"""
import json
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Optional

from .llm_adapter import chat_completion, LLMError
from .workspace_service import SKIP_DIRS

BACKEND_DIR = Path(__file__).parent.parent
SEMGREP_RULES = BACKEND_DIR / "security" / "semgrep-rules.yml"

SCAN_TIMEOUT = 120          # секунд на один инструмент
MAX_FILES_FOR_SECRETS = 500
MAX_VERIFY = 10             # находок на LLM-верификацию за проход
VERIFY_CONTEXT_LINES = 25

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}

# Встроенные паттерны секретов (fallback, если gitleaks не установлен)
SECRET_PATTERNS: list[tuple[str, str, str]] = [
    # (rule_id, CWE, regex)
    ("aws-access-key", "CWE-798", r"\bAKIA[0-9A-Z]{16}\b"),
    ("github-token", "CWE-798", r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b"),
    ("openai-key", "CWE-798", r"\bsk-[A-Za-z0-9]{20,}\b"),
    ("slack-token", "CWE-798", r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    ("private-key", "CWE-321", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    ("jwt", "CWE-798", r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    ("generic-secret", "CWE-798",
     r"(?i)(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']"),
]


# ---------------------------------------------------------------- инструменты

def tools_status() -> dict:
    return {
        "semgrep": shutil.which("semgrep") is not None,
        "gitleaks": shutil.which("gitleaks") is not None,
        "pip_audit": shutil.which("pip-audit") is not None,
        "npm": shutil.which("npm") is not None,
        "rules_bundled": SEMGREP_RULES.exists(),
        "secrets_builtin": True,
    }


def _run(cmd: list[str], cwd: str, timeout: int = SCAN_TIMEOUT) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    return subprocess.run(
        cmd, cwd=cwd, env=env, timeout=timeout,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def _finding(tool: str, rule_id: str, severity: str, path: str, line: int,
             title: str, message: str, snippet: str = "",
             cwe: Optional[str] = None, owasp: Optional[str] = None,
             line_end: Optional[int] = None) -> dict:
    return {
        "id": uuid.uuid4().hex[:8],
        "tool": tool,
        "rule_id": rule_id,
        "severity": severity if severity in SEVERITY_ORDER else "info",
        "cwe": cwe,
        "owasp": owasp,
        "path": path.replace("\\", "/"),
        "line_start": max(1, int(line or 1)),
        "line_end": max(1, int(line_end or line or 1)),
        "title": title,
        "message": message,
        "snippet": snippet.strip()[:300],
        "verification": {"status": "unverified", "rationale": ""},
    }


# ------------------------------------------------------------------ Semgrep

def scan_semgrep(workspace: str) -> dict:
    if shutil.which("semgrep") is None:
        return {"status": "unavailable", "reason": "semgrep не установлен (pip install semgrep)", "findings": []}
    if not SEMGREP_RULES.exists():
        return {"status": "unavailable", "reason": "не найден набор правил security/semgrep-rules.yml", "findings": []}

    try:
        proc = _run(
            ["semgrep", "scan", "--config", str(SEMGREP_RULES), "--json",
             "--no-git-ignore", "--metrics", "off", "."],
            cwd=workspace,
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "reason": f"semgrep превысил таймаут {SCAN_TIMEOUT}с", "findings": []}

    # semgrep: exit 0 = чисто, 1 = находки; >1 = ошибка
    if proc.returncode not in (0, 1):
        return {"status": "error", "reason": (proc.stderr or proc.stdout).strip()[:300], "findings": []}

    sev_map = {"ERROR": "critical", "WARNING": "warning", "INFO": "info"}
    findings = []
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return {"status": "error", "reason": "semgrep вернул не-JSON", "findings": []}

    for r in data.get("results", []):
        extra = r.get("extra", {})
        meta = extra.get("metadata", {})
        findings.append(_finding(
            tool="semgrep",
            rule_id=r.get("check_id", "").split(".")[-1],
            severity=sev_map.get(extra.get("severity", "INFO"), "info"),
            path=r.get("path", ""),
            line=r.get("start", {}).get("line", 1),
            line_end=r.get("end", {}).get("line", 1),
            title=r.get("check_id", "").split(".")[-1],
            message=extra.get("message", ""),
            snippet=extra.get("lines", ""),
            cwe=meta.get("cwe"),
            owasp=meta.get("owasp"),
        ))
    return {"status": "ok", "findings": findings}


# ------------------------------------------------------------------ Секреты

def _iter_text_files(root: Path, limit: int = MAX_FILES_FOR_SECRETS):
    count = 0
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fname in sorted(filenames):
            if count >= limit:
                return
            full = Path(current) / fname
            try:
                if full.stat().st_size > 512 * 1024 or full.stat().st_size == 0:
                    continue
                raw = full.read_bytes()
                if b"\x00" in raw[:8192]:
                    continue
            except (OSError, PermissionError):
                continue
            yield full, raw.decode("utf-8", errors="replace")
            count += 1


def scan_secrets(workspace: str) -> dict:
    if shutil.which("gitleaks"):
        return _scan_secrets_gitleaks(workspace)
    return _scan_secrets_builtin(workspace)


def _scan_secrets_gitleaks(workspace: str) -> dict:
    try:
        proc = _run(
            ["gitleaks", "dir", "--no-banner", "--report-format", "json",
             "--report-path", "-", "--exit-code", "0", "."],
            cwd=workspace,
        )
        raw = proc.stdout.strip()
        data = json.loads(raw) if raw and raw != "null" else []
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        return {"status": "error", "reason": f"gitleaks: {e}", "findings": []}
    findings = [
        _finding(
            tool="gitleaks",
            rule_id=f.get("RuleID", "secret"),
            severity="critical",
            path=f.get("File", ""),
            line=f.get("StartLine", 1),
            title=f"Секрет: {f.get('RuleID', '?')}",
            message=f.get("Description", "Обнаружен секрет в коде"),
            snippet=f.get("Line", "")[:200],
            cwe="CWE-798",
        )
        for f in data
    ]
    return {"status": "ok", "findings": findings}


def _scan_secrets_builtin(workspace: str) -> dict:
    root = Path(workspace).expanduser().resolve()
    findings = []
    compiled = [(rid, cwe, re.compile(rx)) for rid, cwe, rx in SECRET_PATTERNS]
    for full, text in _iter_text_files(root):
        rel = str(full.relative_to(root))
        for lineno, line in enumerate(text.split("\n"), 1):
            for rid, cwe, rx in compiled:
                if rx.search(line):
                    findings.append(_finding(
                        tool="secrets",
                        rule_id=rid,
                        severity="critical",
                        path=rel,
                        line=lineno,
                        title=f"Секрет: {rid}",
                        message="Похоже на захардкоженный секрет/ключ в коде",
                        snippet=re.sub(rx, "***", line),
                        cwe=cwe,
                    ))
    return {"status": "ok", "note": "встроенный сканер (gitleaks не установлен)", "findings": findings}


# ---------------------------------------------------------------------- SCA

def scan_sca(workspace: str) -> dict:
    root = Path(workspace).expanduser().resolve()
    findings = []
    notes = []

    req_files = [f for f in root.glob("requirements*.txt")]
    if req_files:
        if shutil.which("pip-audit") is None:
            notes.append("pip-audit не установлен (pip install pip-audit)")
        else:
            for req in req_files:
                try:
                    proc = _run(["pip-audit", "-r", req.name, "--format", "json",
                                 "--progress-spinner", "off"], cwd=str(root))
                    data = json.loads(proc.stdout or "{}")
                except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
                    notes.append(f"pip-audit ({req.name}): {e}")
                    continue
                for dep in data.get("dependencies", []):
                    for vuln in dep.get("vulns", []):
                        findings.append(_finding(
                            tool="pip-audit",
                            rule_id=vuln.get("id", "?"),
                            severity="critical" if _is_high_sev(vuln) else "warning",
                            path=req.name,
                            line=1,
                            title=f"{dep.get('name')} {dep.get('version')}: {vuln.get('id')}",
                            message=(vuln.get("description") or "")[:300],
                            cwe=None,
                            snippet=f"fix: {', '.join(vuln.get('fix_versions', []) or ['—'])}",
                        ))

    if (root / "package-lock.json").exists():
        if shutil.which("npm") is None:
            notes.append("npm не найден")
        else:
            try:
                proc = _run(["npm", "audit", "--json", "--omit", "dev"], cwd=str(root))
                data = json.loads(proc.stdout or "{}")
                for name, v in (data.get("vulnerabilities") or {}).items():
                    sev = v.get("severity", "info")
                    findings.append(_finding(
                        tool="npm-audit",
                        rule_id=str((v.get("via") or [{}])[0].get("source", name))
                            if v.get("via") and isinstance(v["via"][0], dict) else name,
                        severity={"critical": "critical", "high": "critical",
                                  "moderate": "warning", "low": "info"}.get(sev, "info"),
                        path="package-lock.json",
                        line=1,
                        title=f"{name}: {sev}",
                        message=(v.get("via")[0].get("title", "") if v.get("via") and isinstance(v["via"][0], dict) else "")[:300],
                        snippet=f"fix: {'npm audit fix' if v.get('fixAvailable') else 'нет автопочинки'}",
                    ))
            except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
                notes.append(f"npm audit: {e}")

    status = "ok" if findings or not notes else "partial"
    out = {"status": status if (findings or req_files or (root / 'package-lock.json').exists()) else "ok",
           "findings": findings}
    if notes:
        out["note"] = "; ".join(notes)
    if not req_files and not (root / "package-lock.json").exists():
        out["note"] = (out.get("note", "") + "; " if out.get("note") else "") + \
            "манифесты зависимостей не найдены"
    return out


def _is_high_sev(vuln: dict) -> bool:
    # pip-audit не отдаёт severity напрямую в старых версиях; считаем любую уязвимость серьёзной
    return True


# --------------------------------------------------------- LLM-верификатор

VERIFY_SYSTEM = """Ты — верификатор находок статического анализа.
Для каждой находки реши: confirmed (реальная уязвимость в данном контексте)
или false_positive (безопасно здесь: тестовый код, нет недоверенного ввода и т.п.).
Отвечай строго JSON без markdown."""


def _code_context(workspace: str, path: str, line: int) -> str:
    root = Path(workspace).expanduser().resolve()
    target = (root / path).resolve()
    try:
        target.relative_to(root)
        lines = target.read_text(encoding="utf-8", errors="replace").split("\n")
    except (ValueError, OSError):
        return ""
    lo = max(0, line - VERIFY_CONTEXT_LINES // 2)
    hi = min(len(lines), line + VERIFY_CONTEXT_LINES // 2)
    return "\n".join(f"{i + 1} | {lines[i]}" for i in range(lo, hi))


async def verify_findings(workspace: str, findings: list[dict]) -> list[dict]:
    """Второй проход: LLM подтверждает/опровергает топ-находки."""
    candidates = sorted(
        [f for f in findings if f["tool"] != "semgrep" or f["severity"] != "info"],
        key=lambda f: SEVERITY_ORDER[f["severity"]],
    )[:MAX_VERIFY]
    if not candidates:
        return findings

    items = []
    for f in candidates:
        items.append({
            "id": f["id"],
            "rule": f["rule_id"],
            "cwe": f["cwe"],
            "claim": f["message"],
            "file": f["path"],
            "line": f["line_start"],
            "snippet": f["snippet"],
            "context": _code_context(workspace, f["path"], f["line_start"]),
        })

    messages = [
        {"role": "system", "content": VERIFY_SYSTEM},
        {"role": "user", "content": (
            "Верифицируй находки статического анализа.\n\n"
            f"НАХОДКИ:\n{json.dumps(items, ensure_ascii=False, indent=1)[:12000]}\n\n"
            'Схема ответа (JSON): {"results":[{"id":"...","status":"confirmed|false_positive",'
            '"rationale":"одно предложение"}]}'
        )},
    ]

    try:
        raw = await chat_completion(messages)
        from .analysis_service import _extract_json
        data = json.loads(_extract_json(raw))
        by_id = {r.get("id"): r for r in data.get("results", [])}
        for f in candidates:
            r = by_id.get(f["id"])
            if r and r.get("status") in ("confirmed", "false_positive"):
                f["verification"] = {
                    "status": r["status"],
                    "rationale": str(r.get("rationale", ""))[:300],
                }
    except (LLMError, json.JSONDecodeError):
        pass  # остаются unverified
    return findings


# -------------------------------------------------------------------- Отчёт

async def scan_workspace(workspace: str, verify: bool = False) -> dict:
    semgrep_res = scan_semgrep(workspace)
    secrets_res = scan_secrets(workspace)
    sca_res = scan_sca(workspace)

    all_findings = semgrep_res["findings"] + secrets_res["findings"] + sca_res["findings"]
    if verify and all_findings:
        all_findings = await verify_findings(workspace, all_findings)

    all_findings.sort(key=lambda f: (SEVERITY_ORDER[f["severity"]], f["path"], f["line_start"]))

    by_severity = {s: 0 for s in SEVERITY_ORDER}
    by_cwe: dict[str, int] = {}
    confirmed = 0
    for f in all_findings:
        by_severity[f["severity"]] += 1
        if f["cwe"]:
            by_cwe[f["cwe"]] = by_cwe.get(f["cwe"], 0) + 1
        if f["verification"]["status"] == "confirmed":
            confirmed += 1

    return {
        "tools": tools_status(),
        "layers": {
            "semgrep": {k: v for k, v in semgrep_res.items() if k != "findings"} | {"count": len(semgrep_res["findings"])},
            "secrets": {k: v for k, v in secrets_res.items() if k != "findings"} | {"count": len(secrets_res["findings"])},
            "sca": {k: v for k, v in sca_res.items() if k != "findings"} | {"count": len(sca_res["findings"])},
        },
        "summary": {
            "total": len(all_findings),
            "by_severity": by_severity,
            "by_cwe": dict(sorted(by_cwe.items(), key=lambda x: -x[1])),
            "confirmed": confirmed,
        },
        "findings": all_findings,
    }
