"""Бенчмарк LLM на задаче верификации находок (P3).
# ccl:ignore-file bp-print-in-code

Прогоняет боевой промпт верификатора (VERIFY_SYSTEM из security_service)
по эталонному набору verification_set.json для каждой модели из models.yml
и считает метрики класса "confirmed": precision / recall / F1 / accuracy,
плюс латентность и долю ошибок разбора.

Запуск (из backend/):
    source ../.env  # KIMI_API_KEY и т.п.
    python benchmark/run_benchmark.py [--models kimi-k3 lmstudio-local]

Результат: таблица в stdout + benchmark/results/<timestamp>.json.
"""
import argparse
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml
from openai import AsyncOpenAI

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.security_service import VERIFY_SYSTEM  # noqa: E402
from services.analysis_service import _extract_json  # noqa: E402

BENCH_DIR = Path(__file__).parent


def load_cases() -> list[dict]:
    return json.loads((BENCH_DIR / "verification_set.json").read_text(encoding="utf-8"))


def load_models(only: list[str] | None) -> list[dict]:
    cfg = yaml.safe_load((BENCH_DIR / "models.yml").read_text(encoding="utf-8"))
    models = cfg.get("models", [])
    if only:
        models = [m for m in models if m["name"] in only]
    return models


async def model_available(m: dict) -> bool:
    """Быстрая проверка доступности эндпоинта (список моделей)."""
    try:
        client = AsyncOpenAI(base_url=m["base_url"],
                             api_key=os.environ.get(m.get("api_key_env") or "", "none"),
                             timeout=8)
        await client.models.list()
        return True
    except Exception:
        return False


async def verify_with_model(m: dict, cases: list[dict]) -> dict:
    """Один прогон верификации всего набора (батч, как в проде)."""
    api_key = os.environ.get(m.get("api_key_env") or "", "none")
    client = AsyncOpenAI(base_url=m["base_url"], api_key=api_key, timeout=120)
    items = [{
        "id": c["id"], "rule": c["rule"], "cwe": c["cwe"], "claim": c["claim"],
        "file": c["file"], "line": c["line"], "snippet": c["snippet"], "context": c["context"],
    } for c in cases]
    messages = [
        {"role": "system", "content": VERIFY_SYSTEM},
        {"role": "user", "content": (
            "Верифицируй находки статического анализа.\n\n"
            f"НАХОДКИ:\n{json.dumps(items, ensure_ascii=False, indent=1)[:12000]}\n\n"
            'Схема ответа (JSON): {"results":[{"id":"...","status":"confirmed|false_positive",'
            '"rationale":"одно предложение"}]}'
        )},
    ]
    t0 = time.monotonic()
    resp = await client.chat.completions.create(
        model=m["model"], messages=messages, temperature=m.get("temperature", 1.0))
    latency = time.monotonic() - t0
    raw = resp.choices[0].message.content or ""

    predictions: dict[str, str] = {}
    parse_error = None
    try:
        data = json.loads(_extract_json(raw))
        for r in data.get("results", []):
            if r.get("status") in ("confirmed", "false_positive"):
                predictions[r.get("id")] = r["status"]
    except Exception as e:
        parse_error = str(e)[:120]
    return {"predictions": predictions, "latency_s": round(latency, 1),
            "parse_error": parse_error}


def score(cases: list[dict], predictions: dict[str, str]) -> dict:
    """Метрики класса 'confirmed'. Нераспознанные — как противоположный класс."""
    tp = fp = fn = tn = missed = 0
    errors = []
    for c in cases:
        pred = predictions.get(c["id"])
        if pred is None:
            missed += 1
            errors.append({"id": c["id"], "expected": c["expected"], "pred": None})
            # нераспознанное считаем неверным ответом
            if c["expected"] == "confirmed":
                fn += 1
            else:
                fp += 1
            continue
        if c["expected"] == "confirmed" and pred == "confirmed":
            tp += 1
        elif c["expected"] == "false_positive" and pred == "false_positive":
            tn += 1
        elif pred == "confirmed":
            fp += 1
            errors.append({"id": c["id"], "expected": c["expected"], "pred": pred})
        else:
            fn += 1
            errors.append({"id": c["id"], "expected": c["expected"], "pred": pred})
    total = tp + tn + fp + fn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "accuracy": round((tp + tn) / total, 3) if total else 0.0,
            "precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(f1, 3), "unparsed": missed, "errors": errors}


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=None)
    args = ap.parse_args()

    cases = load_cases()
    models = load_models(args.models)
    print(f"Эталонный набор: {len(cases)} случаев "
          f"({sum(1 for c in cases if c['expected'] == 'confirmed')} TP / "
          f"{sum(1 for c in cases if c['expected'] == 'false_positive')} FP)")

    results = []
    for m in models:
        if not await model_available(m):
            print(f"- {m['name']}: недоступна, пропускаю")
            results.append({"model": m["name"], "available": False})
            continue
        run = await verify_with_model(m, cases)
        s = score(cases, run["predictions"])
        row = {"model": m["name"], "available": True, "latency_s": run["latency_s"],
               "parse_error": run["parse_error"], **{k: v for k, v in s.items() if k != "errors"},
               "errors": s["errors"]}
        results.append(row)
        print(f"- {m['name']}: acc={s['accuracy']} P={s['precision']} R={s['recall']} "
              f"F1={s['f1']} | {run['latency_s']}с | ошибок: {len(s['errors'])}"
              + (f" | parse: {run['parse_error']}" if run["parse_error"] else ""))
        for e in s["errors"]:
            print(f"    ✗ {e['id']}: ожидали {e['expected']}, получили {e['pred']}")

    out_dir = BENCH_DIR / "results"
    out_dir.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = out_dir / f"bench-{ts}.json"
    out.write_text(json.dumps({
        "timestamp": ts, "cases": len(cases),
        "results": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nОтчёт: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
