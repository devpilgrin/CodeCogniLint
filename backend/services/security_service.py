"""
Детерминированный security-слой (волна 1): SAST (Semgrep), поиск секретов
(gitleaks / встроенные regex), SCA (pip-audit / npm audit) + LLM-верификатор.

Философия: движки находят, LLM только верифицирует и объясняет.
Все слои деградируют независимо: если инструмента нет — слой возвращает
status "unavailable", отчёт собирается из доступных.
"""
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from .llm_adapter import chat_completion, LLMError
from .workspace_service import SKIP_DIRS, EXT_TO_LANG

BACKEND_DIR = Path(__file__).parent.parent
SEMGREP_RULES = BACKEND_DIR / "security" / "semgrep-rules.yml"
BASELINES_FILE = BACKEND_DIR / ".hybrid-security-baselines.json"

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

# Suppression: строка с "# ccl:ignore" (опц. с rule_id или CWE) на строке находки
# или строкой выше. Пример: password = "x"  # ccl:ignore py-hardcoded-password
SUPPRESSION_RE = re.compile(r"ccl:ignore(?:[:\s]+([\w\-\./]+))?", re.IGNORECASE)


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
    return {"status": "ok", "findings": findings,
            "scanned": len(data.get("paths", {}).get("scanned", []))}


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

SCA_CACHE_FILE = BACKEND_DIR / ".hybrid-sca-cache.json"


def _load_sca_cache() -> dict:
    try:
        return json.loads(SCA_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_sca_cache(data: dict) -> None:
    try:
        SCA_CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _manifest_hash(paths: list[Path]) -> str:
    h = hashlib.sha256()
    for p in sorted(paths, key=str):
        h.update(p.name.encode())
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def _scan_pip_audit(root: Path, req_files: list[Path], findings: list, notes: list) -> None:
    if shutil.which("pip-audit") is None:
        notes.append("pip-audit не установлен (pip install pip-audit)")
        return
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


def _scan_npm_audit(root: Path, findings: list, notes: list) -> None:
    if shutil.which("npm") is None:
        notes.append("npm не найден")
        return
    try:
        proc = _run(["npm", "audit", "--json", "--omit", "dev"], cwd=str(root))
        data = json.loads(proc.stdout or "{}")
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        notes.append(f"npm audit: {e}")
        return
    for name, v in (data.get("vulnerabilities") or {}).items():
        sev = v.get("severity", "info")
        via0 = v.get("via")[0] if v.get("via") and isinstance(v["via"][0], dict) else {}
        findings.append(_finding(
            tool="npm-audit",
            rule_id=str(via0.get("source", name)) if via0 else name,
            severity={"critical": "critical", "high": "critical",
                      "moderate": "warning", "low": "info"}.get(sev, "info"),
            path="package-lock.json",
            line=1,
            title=f"{name}: {sev}",
            message=(via0.get("title", "") if via0 else "")[:300],
            snippet=f"fix: {'npm audit fix' if v.get('fixAvailable') else 'нет автопочинки'}",
        ))


def _find_manifests(root: Path) -> tuple[dict[Path, list[Path]], list[Path]]:
    """Манифесты зависимостей рекурсивно (без node_modules/.venv и т.п.):
    {директория: [requirements*.txt]}, [package-lock.json...]"""
    req_by_dir: dict[Path, list[Path]] = {}
    locks: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        d = Path(dirpath)
        reqs = [d / f for f in filenames if re.fullmatch(r"requirements.*\.txt", f)]
        if reqs:
            req_by_dir[d] = reqs
        if "package-lock.json" in filenames:
            locks.append(d / "package-lock.json")
    return req_by_dir, locks


def scan_sca(workspace: str) -> dict:
    """SCA-скан: уязвимости зависимостей (pip-audit + npm audit).

    Манифесты ищутся рекурсивно (backend/requirements.txt, frontend/
    package-lock.json и т.п.), каждый сканируется в своей директории.
    Кэш по хешу манифестов: неизменённые манифесты не перепроверяются
    (pip-audit/npm — самые медленные слои)."""
    root = Path(workspace).expanduser().resolve()
    findings: list = []
    notes: list = []

    cache = _load_sca_cache()
    new_cache: dict = {}
    cached_layers = 0

    req_by_dir, locks = _find_manifests(root)
    for d, req_files in req_by_dir.items():
        key = "pip:" + str(d) + ":" + ",".join(f.name for f in req_files)
        mh = _manifest_hash(req_files)
        hit = cache.get(key)
        if hit and hit.get("hash") == mh:
            findings.extend(hit.get("findings", []))
            notes.extend(hit.get("notes", []))
            cached_layers += 1
        else:
            f_new, n_new = [], []
            _scan_pip_audit(d, req_files, f_new, n_new)
            findings.extend(f_new)
            notes.extend(n_new)
            new_cache[key] = {"hash": mh, "findings": f_new, "notes": n_new}

    for lock in locks:
        d = lock.parent
        key = "npm:" + str(d)
        mh = _manifest_hash([lock])
        hit = cache.get(key)
        if hit and hit.get("hash") == mh:
            findings.extend(hit.get("findings", []))
            notes.extend(hit.get("notes", []))
            cached_layers += 1
        else:
            f_new, n_new = [], []
            _scan_npm_audit(d, f_new, n_new)
            findings.extend(f_new)
            notes.extend(n_new)
            new_cache[key] = {"hash": mh, "findings": f_new, "notes": n_new}

    has_manifests = bool(req_by_dir or locks)
    # кэш держим только для текущих ключей (устаревшие workspace вымываются)
    if new_cache or cached_layers:
        _save_sca_cache(new_cache)
    if cached_layers:
        notes.append(f"SCA-кэш: {cached_layers} слоёв без изменений (манифесты не менялись)")

    status = "ok" if findings or not notes else "partial"
    out = {"status": status if (findings or has_manifests) else "ok",
           "findings": findings}
    if notes:
        out["note"] = "; ".join(notes)
    if not has_manifests:
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

# -------------------------------------------------------------- Suppression

def _apply_suppression(workspace: str, findings: list[dict]) -> list[dict]:
    """Пометить finding['suppressed']=True, если на строке находки или строкой
    выше стоит комментарий `ccl:ignore` (с опциональным фильтром rule_id/CWE)."""
    root = Path(workspace).expanduser().resolve()
    cache: dict[str, list[str]] = {}

    def file_lines(rel: str) -> list[str]:
        if rel not in cache:
            target = (root / rel).resolve()
            try:
                target.relative_to(root)
                cache[rel] = target.read_text(encoding="utf-8", errors="replace").split("\n")
            except (ValueError, OSError):
                cache[rel] = []
        return cache[rel]

    for f in findings:
        f.setdefault("suppressed", False)
        lines = file_lines(f["path"])
        if not lines:
            continue
        idx = f["line_start"] - 1
        for i in (idx, idx - 1):  # строка находки и строка выше
            if 0 <= i < len(lines):
                m = SUPPRESSION_RE.search(lines[i])
                if m:
                    flt = m.group(1)
                    if not flt or flt in (f["rule_id"], f.get("cwe") or ""):
                        f["suppressed"] = True
                        break
    return findings


# ---------------------------------------------------------------- Coverage

def collect_coverage(workspace: str, sast_scanned: int) -> dict:
    """Метрики покрытия: сколько файлов реально дошло до анализа."""
    root = Path(workspace).expanduser().resolve()
    total = code = secrets_scanned = 0
    skipped = {"binary": 0, "too_large": 0, "non_code": 0}
    for full, _text in _iter_text_files(root):
        secrets_scanned += 1  # builtin-сканер; gitleaks покрывает не меньше
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fname in filenames:
            full = Path(current) / fname
            total += 1
            try:
                size = full.stat().st_size
                if size > 512 * 1024:
                    skipped["too_large"] += 1
                    continue
                if size == 0:
                    continue
                with open(full, "rb") as fh:
                    if b"\x00" in fh.read(8192):
                        skipped["binary"] += 1
                        continue
            except (OSError, PermissionError):
                continue
            if full.suffix.lower() in EXT_TO_LANG:
                code += 1
            else:
                skipped["non_code"] += 1
    return {
        "total_files": total,
        "code_files": code,
        "sast_scanned": sast_scanned,
        "secrets_scanned": secrets_scanned,
        "skipped": skipped,
    }


# ---------------------------------------------------------------- Baseline

def _fingerprint(f: dict) -> str:
    """Стабильный ID находки: правило + путь + заголовок (без номера строки —
    переживает сдвиг строк при правках). Не security-контекст — но sha256,
    чтобы не триггерить собственный гейт (поймано dogfooding'ом в CI)."""
    raw = f"{f['rule_id']}|{f['path']}|{f['title']}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _load_baselines() -> dict:
    if not BASELINES_FILE.exists():
        return {}
    try:
        return json.loads(BASELINES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_baselines(data: dict) -> None:
    BASELINES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _current_head(workspace: str) -> Optional[str]:
    try:
        from .git_service import _repo
        repo = _repo(workspace)
        return repo.head.commit.hexsha[:7] if repo.head.is_valid() else None
    except Exception:
        return None


def get_baseline(workspace: str) -> Optional[dict]:
    b = _load_baselines().get(str(Path(workspace).expanduser().resolve()))
    if not b:
        return None
    return {"head": b.get("head"), "created_at": b.get("created_at"), "findings": len(b.get("items", {}))}


def delete_baseline(workspace: str) -> dict:
    data = _load_baselines()
    removed = data.pop(str(Path(workspace).expanduser().resolve()), None)
    _save_baselines(data)
    return {"removed": removed is not None}


def save_baseline(workspace: str, report: dict) -> dict:
    key = str(Path(workspace).expanduser().resolve())
    items = {
        _fingerprint(f): {
            "rule_id": f["rule_id"], "path": f["path"], "title": f["title"],
            "severity": f["severity"], "line_start": f["line_start"],
        }
        for f in report["findings"] if not f.get("suppressed")
    }
    data = _load_baselines()
    data[key] = {
        "head": _current_head(workspace),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "items": items,
    }
    _save_baselines(data)
    return {"head": data[key]["head"], "created_at": data[key]["created_at"], "findings": len(items)}


def _apply_baseline_diff(workspace: str, report: dict) -> None:
    """Если есть baseline — пометить is_new у находок и посчитать исправленные."""
    key = str(Path(workspace).expanduser().resolve())
    base = _load_baselines().get(key)
    for f in report["findings"]:
        f["is_new"] = None
    if not base:
        report["baseline"] = None
        return
    base_items = base.get("items", {})
    current_fps = set()
    new_count = 0
    for f in report["findings"]:
        fp = _fingerprint(f)
        current_fps.add(fp)
        f["is_new"] = fp not in base_items
        if f["is_new"]:
            new_count += 1
    fixed = [v for k, v in base_items.items() if k not in current_fps]
    report["baseline"] = {
        "head": base.get("head"),
        "created_at": base.get("created_at"),
        "findings": len(base_items),
    }
    report["diff"] = {"new": new_count, "fixed": len(fixed), "fixed_list": fixed[:20]}


# ------------------------------------------------------------------- SARIF

def to_sarif(report: dict) -> dict:
    """SARIF 2.1.0 — совместимость с GitHub Code Scanning и CI-системами.
    security-severity — ЧИСЛОВАЯ строка (CVSS-подобная), иначе Code Scanning
    отклоняет файл."""
    level_map = {"critical": "error", "warning": "warning", "info": "note"}
    sec_sev = {"critical": "9.0", "warning": "5.0", "info": "2.0"}
    rules: dict[str, dict] = {}
    results = []
    for f in report["findings"]:
        if f.get("suppressed"):
            continue
        rid = f["rule_id"]
        if rid not in rules:
            tags = [t for t in (f.get("cwe"), f.get("owasp"), f["tool"]) if t]
            rules[rid] = {
                "id": rid,
                "name": rid,
                "shortDescription": {"text": f["title"]},
                "properties": {"tags": tags,
                               "security-severity": sec_sev.get(f["severity"], "2.0")},
            }
        results.append({
            "ruleId": rid,
            "level": level_map.get(f["severity"], "note"),
            "message": {"text": f"{f['title']}. {f['message']}".strip(". ")},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": f["path"]},
                    "region": {"startLine": f["line_start"], "endLine": f["line_end"]},
                },
            }],
            "partialFingerprints": {"ccl/v1": _fingerprint(f)},
        })
    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "CodeCogniLint",
                    "informationUri": "https://github.com/devpilgrin/CodeCogniLint",
                    "rules": list(rules.values()),
                },
            },
            "results": results,
        }],
    }


# -------------------------------------------------------------------- Отчёт

async def scan_workspace(workspace: str, verify: bool = False) -> dict:
    # Независимые инструменты — параллельно (subprocess освобождает GIL)
    semgrep_res, secrets_res, sca_res = await asyncio.gather(
        asyncio.to_thread(scan_semgrep, workspace),
        asyncio.to_thread(scan_secrets, workspace),
        asyncio.to_thread(scan_sca, workspace),
    )

    all_findings = semgrep_res["findings"] + secrets_res["findings"] + sca_res["findings"]
    all_findings = _apply_suppression(workspace, all_findings)

    active = [f for f in all_findings if not f.get("suppressed")]
    if verify and active:
        all_findings = await verify_findings(workspace, active)

    all_findings.sort(key=lambda f: (SEVERITY_ORDER[f["severity"]], f["path"], f["line_start"]))

    by_severity = {s: 0 for s in SEVERITY_ORDER}
    by_cwe: dict[str, int] = {}
    confirmed = suppressed_n = 0
    for f in all_findings:
        if f.get("suppressed"):
            suppressed_n += 1
            continue
        by_severity[f["severity"]] += 1
        if f["cwe"]:
            by_cwe[f["cwe"]] = by_cwe.get(f["cwe"], 0) + 1
        if f["verification"]["status"] == "confirmed":
            confirmed += 1

    report = {
        "tools": tools_status(),
        "layers": {
            "semgrep": {k: v for k, v in semgrep_res.items() if k not in ("findings", "scanned")} | {"count": len(semgrep_res["findings"])},
            "secrets": {k: v for k, v in secrets_res.items() if k != "findings"} | {"count": len(secrets_res["findings"])},
            "sca": {k: v for k, v in sca_res.items() if k != "findings"} | {"count": len(sca_res["findings"])},
        },
        "coverage": collect_coverage(workspace, semgrep_res.get("scanned", 0)),
        "summary": {
            "total": len(active),
            "suppressed": suppressed_n,
            "by_severity": by_severity,
            "by_cwe": dict(sorted(by_cwe.items(), key=lambda x: -x[1])),
            "confirmed": confirmed,
        },
        "findings": all_findings,
    }
    _apply_baseline_diff(workspace, report)
    return report
