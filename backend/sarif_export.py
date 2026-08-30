"""CLI экспорта SARIF для CI (GitHub Code Scanning):
# ccl:ignore-file bp-print-in-code
    python backend/sarif_export.py <workspace> [out.sarif]

Гоняет детерминированные слои security-скана (semgrep/secrets/SCA, без LLM)
и пишет SARIF 2.1.0. Exit 0 всегда (находки — не ошибка сканирования;
гейт решает отдельный шаг).
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.security_service import scan_workspace, to_sarif


async def main() -> int:
    workspace = sys.argv[1] if len(sys.argv) > 1 else "."
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("codecognilint.sarif")
    report = await scan_workspace(workspace, verify=False)
    sarif = to_sarif(report)
    out_path.write_text(json.dumps(sarif, ensure_ascii=False, indent=2), encoding="utf-8")
    total = report["summary"]["total"]
    print(f"SARIF: {len(sarif['runs'][0]['results'])} результатов "
          f"({total} активных находок) → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
