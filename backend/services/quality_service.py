"""
Слой качества кода: производительность, размер, best practices.

Детерминированные движки:
- semgrep с вендоренным rulesetом quality/quality-rules.yml (паттерны
  производительности и best practices, python + js/ts);
- radon (цикломатическая сложность python-функций) — feature-detect;
- универсальные метрики размера (LOC, длина функций, размер файлов).

LLM (опционально) — разбор топ-hotspot'ов: что именно тормозит/раздуто
и как упростить. Модель интерпретирует, не ищет.
"""
import asyncio
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from services.security_service import _run, _finding, _apply_suppression, _code_context
from services.llm_adapter import chat_completion, LLMError

QUALITY_RULES = Path(__file__).parent.parent / "quality" / "quality-rules.yml"

# Пороги размера/сложности по умолчанию (переопределяются .ccl-quality.yml
# в корне сканируемого проекта)
DEFAULT_THRESHOLDS = {"file_loc": 400, "func_loc": 60, "func_cc": 10}

GATE_CONFIG_FILE = ".ccl-quality.yml"


def load_gate_config(workspace: str) -> dict:
    """Конфиг гейта качества из корня проекта (все ключи опциональны).

    Пороги: file_loc, func_loc, func_cc — метрики-нарушения.
    Бюджеты (ratchet): max_findings_total, max_perf_findings,
    max_bp_findings, max_complex_functions, max_long_functions,
    max_big_files — текущие допустимые значения; превышение = регресс."""
    cfg = {
        "thresholds": dict(DEFAULT_THRESHOLDS),
        "budgets": {},  # пусто = гейт не проверяет
    }
    path = Path(workspace) / GATE_CONFIG_FILE
    if not path.exists():
        return cfg
    import yaml
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return cfg
    for k in DEFAULT_THRESHOLDS:
        if isinstance(raw.get(k), int):
            cfg["thresholds"][k] = raw[k]
    for k in ("max_findings_total", "max_perf_findings", "max_bp_findings",
              "max_complex_functions", "max_long_functions", "max_big_files"):
        if isinstance(raw.get(k), int):
            cfg["budgets"][k] = raw[k]
    return cfg


MAX_FILE_BYTES = 256 * 1024

_CODE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".java", ".rb", ".php",
             ".cs", ".cpp", ".c", ".rs", ".vue", ".svelte"}
_SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build",
              ".next", ".idea", "coverage", ".pytest_cache", "site-packages"}

_FUNC_RE_PY = re.compile(r"^(?:async\s+def|def)\s+\w+")
_FUNC_RE_JS = re.compile(r"(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(|=>)")


def tools_status() -> dict:
    return {
        "semgrep": shutil.which("semgrep") is not None,
        "radon": _radon_available(),
        "rules_bundled": QUALITY_RULES.exists(),
        "metrics_builtin": True,
    }


def _radon_available() -> bool:
    try:
        import radon  # noqa: F401
        return True
    except ImportError:
        return False


# ---------- Слой 1: semgrep-правила качества ----------

def scan_quality_rules(workspace: str) -> dict:
    if shutil.which("semgrep") is None or not QUALITY_RULES.exists():
        return {"status": "skipped", "findings": [], "scanned_files": 0}
    cmd = ["semgrep", "scan", "--config", str(QUALITY_RULES), "--json",
           "--metrics", "off", "--quiet", workspace]
    try:
        r = _run(cmd, cwd=workspace)
    except Exception as e:
        return {"status": "error", "error": str(e), "findings": [], "scanned_files": 0}
    findings = []
    scanned = 0
    try:
        data = json.loads(r.stdout)
        scanned = len(data.get("paths", {}).get("scanned", []))
        for f in data.get("results", []):
            meta = f.get("extra", {}).get("metadata", {}) or {}
            finding = _finding(
                tool="semgrep-quality",
                rule_id=f["check_id"].split(".")[-1],
                severity=f["extra"].get("severity", "INFO").lower(),
                path=f["path"], line=f["start"]["line"],
                title=f["extra"].get("message", ""),
                message=f["extra"].get("message", ""),
                snippet=f["extra"].get("lines", ""),
            )
            finding["category"] = meta.get("category", "best-practices")
            findings.append(finding)
    except (json.JSONDecodeError, KeyError) as e:
        return {"status": "error", "error": f"parse: {e}", "findings": [], "scanned_files": 0}
    return {"status": "ok", "findings": findings, "scanned_files": scanned}


# ---------- Слой 2: метрики размера ----------

def _iter_code_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix.lower() in _CODE_EXT:
                yield p


def _func_lengths_python(path: Path, lines: list[str]) -> list[dict]:
    """Длина функций по отступам (без AST-зависимостей)."""
    funcs = []
    current = None
    for i, line in enumerate(lines):
        if _FUNC_RE_PY.match(line.strip()) and not line.startswith((" ", "\t")):
            if current:
                current["loc"] = i - current["line"] + 1
                funcs.append(current)
            current = {"name": line.strip().split("(")[0].replace("def ", "").replace("async ", ""),
                       "line": i + 1, "loc": 1}
        elif current is not None and line.strip() and not line.startswith((" ", "\t")) \
                and not line.startswith(("#", "@")):
            current["loc"] = i - current["line"] + 1
            funcs.append(current)
            current = None
    if current:
        current["loc"] = len(lines) - current["line"] + 1
        funcs.append(current)
    return funcs


def collect_metrics(workspace: str, thresholds: Optional[dict] = None) -> dict:
    """Размер кода: LOC по файлам, длина функций, цикломатическая сложность (radon)."""
    thresholds = thresholds or DEFAULT_THRESHOLDS
    root = Path(workspace)
    files = []
    total_loc = total_code_files = 0
    long_functions = []
    complex_functions = []

    for p in _iter_code_files(root):
        try:
            if p.stat().st_size > MAX_FILE_BYTES:
                continue
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        lines = text.splitlines()
        loc = sum(1 for l in lines if l.strip() and not l.strip().startswith(("#", "//")))
        rel = str(p.relative_to(root))
        total_loc += loc
        total_code_files += 1
        files.append({"path": rel, "loc": loc, "bytes": p.stat().st_size})

        if p.suffix == ".py":
            for f in _func_lengths_python(p, lines):
                if f["loc"] > thresholds["func_loc"]:
                    long_functions.append({"file": rel, **f})
            if _radon_available():
                try:
                    from radon.complexity import cc_visit
                    for block in cc_visit(text):
                        if block.complexity > thresholds["func_cc"]:
                            complex_functions.append({
                                "file": rel, "name": block.name,
                                "line": block.lineno, "cc": block.complexity,
                            })
                except Exception:
                    pass  # битый файл — метрики не критичны

    files.sort(key=lambda x: -x["loc"])
    big_files = [f for f in files if f["loc"] > thresholds["file_loc"]]

    return {
        "total_code_files": total_code_files,
        "total_loc": total_loc,
        "big_files": big_files,                      # loc > порог file_loc
        "long_functions": sorted(long_functions, key=lambda x: -x["loc"])[:20],
        "complex_functions": sorted(complex_functions, key=lambda x: -x["cc"])[:20],
        "top_files": files[:10],
        "thresholds": dict(thresholds),
    }


# ---------- Hotspots + LLM-разбор ----------

def _rank_hotspots(metrics: dict, findings: list[dict]) -> list[dict]:
    """Сводный рейтинг проблемных мест: сложность + длина + плотность находок."""
    score: dict[str, dict] = {}

    def bump(path: str, points: int, reason: str):
        slot = score.setdefault(path, {"path": path, "score": 0, "reasons": []})
        slot["score"] += points
        if reason not in slot["reasons"]:
            slot["reasons"].append(reason)

    for f in metrics["complex_functions"]:
        bump(f["file"], min(f["cc"], 30), f"высокая сложность {f['name']} (CC={f['cc']})")
    for f in metrics["long_functions"]:
        bump(f["file"], min(f["loc"] // 10, 20), f"длинная функция {f['name']} ({f['loc']} строк)")
    for f in metrics["big_files"]:
        bump(f["path"], min(f["loc"] // 50, 15), f"большой файл ({f['loc']} LOC)")
    perf_findings = [f for f in findings if f.get("category") == "performance"]
    for f in perf_findings:
        bump(f["path"], 2, "находки производительности")

    return sorted(score.values(), key=lambda x: -x["score"])[:10]


_HOTSPOT_SYSTEM = """Ты — инженер по качеству кода. Дан файл-hotspot с метриками и фрагмент
кода. Оцени: что конкретно снижает производительность или читаемость, и дай
приоритизированные шаги упрощения. Ответь строго валидным JSON:
{"assessment": "...", "perf_risks": ["..."], "simplification_steps": ["..."]}"""


async def _review_hotspots(workspace: str, hotspots: list[dict], metrics: dict) -> list[dict]:
    async def one(h: dict) -> dict:
        ctx = _code_context(workspace, h["path"], 1)
        # для hotspot берём начало файла — контекст шире
        try:
            full = (Path(workspace) / h["path"]).read_text(encoding="utf-8", errors="ignore")[:3000]
        except OSError:
            full = ctx
        user = (f"Файл: {h['path']}\nПричины: {', '.join(h['reasons'])}\n"
                f"Метрики: {json.dumps([m for m in metrics['top_files'] if m['path'] == h['path']], ensure_ascii=False)}\n\n"
                f"Код:\n```\n{full}\n```")
        try:
            raw = await chat_completion([
                {"role": "system", "content": _HOTSPOT_SYSTEM},
                {"role": "user", "content": user},
            ])
            start, end = raw.find("{"), raw.rfind("}")
            if start != -1 and end > start:
                return {**h, "llm": json.loads(raw[start:end + 1])}
        except (LLMError, ValueError):
            pass
        return {**h, "llm": None}
    return await asyncio.gather(*[one(h) for h in hotspots[:3]])


# ---------- Точка входа ----------

async def scan_quality(workspace: str, review: bool = False) -> dict:
    gate_cfg = load_gate_config(workspace)
    rules = await asyncio.to_thread(scan_quality_rules, workspace)
    findings = rules["findings"]
    findings = _apply_suppression(workspace, findings)  # ccl:ignore работает и здесь
    metrics = await asyncio.to_thread(collect_metrics, workspace, gate_cfg["thresholds"])
    hotspots = _rank_hotspots(metrics, findings)
    reviewed = await _review_hotspots(workspace, hotspots, metrics) if review and hotspots else None

    return {
        "workspace": workspace,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "tools": tools_status(),
        "layers": {
            "quality_rules": {"status": rules["status"], "count": len(findings),
                              "scanned_files": rules.get("scanned_files", 0)},
            "metrics": {"status": "ok"},
        },
        "metrics": metrics,
        "hotspots": reviewed if reviewed is not None else hotspots,
        "total_findings": len(findings),
        "by_category": _by_category(findings),
        "by_severity": _by_severity(findings),
        "findings": findings,
    }


def _by_category(findings: list[dict]) -> dict:
    out: dict[str, int] = {}
    for f in findings:
        cat = f.get("category", "best-practices")
        out[cat] = out.get(cat, 0) + 1
    return out


def _by_severity(findings: list[dict]) -> dict:
    out: dict[str, int] = {}
    for f in findings:
        sev = f.get("severity", "info")
        out[sev] = out.get(sev, 0) + 1
    return out


# ---------- Гейт качества (CI): ratchet-бюджеты ----------

def evaluate_gate(report: dict, config: dict) -> list[str]:
    """Проверка бюджетов качества. Возвращает список нарушений (пусто = pass).

    Ratchet: бюджеты фиксируют текущее состояние; любой регресс (счётчик
    выше бюджета) роняет гейт. Подавленные находки (ccl:ignore) не считаются."""
    budgets = config.get("budgets") or {}
    if not budgets:
        return []
    violations: list[str] = []
    active = [f for f in report["findings"] if not f.get("suppressed")]
    m = report["metrics"]

    actuals = {
        "max_findings_total": len(active),
        "max_perf_findings": sum(1 for f in active if f.get("category") == "performance"),
        "max_bp_findings": sum(1 for f in active if f.get("category") == "best-practices"),
        "max_complex_functions": len(m["complex_functions"]),
        "max_long_functions": len(m["long_functions"]),
        "max_big_files": len(m["big_files"]),
    }
    labels = {
        "max_findings_total": "находок качества",
        "max_perf_findings": "находок производительности",
        "max_bp_findings": "находок best practices",
        "max_complex_functions": "сложных функций (CC)",
        "max_long_functions": "длинных функций",
        "max_big_files": "больших файлов",
    }
    for key, limit in budgets.items():
        actual = actuals.get(key)
        if actual is not None and actual > limit:
            violations.append(f"{labels[key]}: {actual} > бюджет {limit}")
    return violations
