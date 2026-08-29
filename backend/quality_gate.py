"""CLI гейта качества для CI:

    python backend/quality_gate.py [path]

Читает .ccl-quality.yml в корне проекта (пороги + ratchet-бюджеты),
гоняет детерминированные слои качества и падает exit 1 при регрессе.
Без бюджетов в конфиге — только информирует (exit 0).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.quality_service import scan_quality, load_gate_config, evaluate_gate


async def main() -> int:
    workspace = sys.argv[1] if len(sys.argv) > 1 else "."
    cfg = load_gate_config(workspace)
    report = await scan_quality(workspace, review=False)

    print(f"Quality scan: {report['total_findings']} находок "
          f"(perf={report['by_category'].get('performance', 0)}, "
          f"bp={report['by_category'].get('best-practices', 0)}), "
          f"LOC={report['metrics']['total_loc']}, "
          f"complex={len(report['metrics']['complex_functions'])}, "
          f"long={len(report['metrics']['long_functions'])}, "
          f"big={len(report['metrics']['big_files'])}")

    violations = evaluate_gate(report, cfg)
    if not cfg["budgets"]:
        print("Quality gate: бюджеты не заданы (.ccl-quality.yml) — информативный режим, PASS")
        return 0
    if violations:
        print("Quality gate FAILED:")
        for v in violations:
            print(f"  ✗ {v}")
        return 1
    print("Quality gate: PASS (все бюджеты соблюдены)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
