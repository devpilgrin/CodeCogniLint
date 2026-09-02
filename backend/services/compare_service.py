"""
Сравнение нарушений между ветками/ref'ами.

Детерминированно: semgrep (security + quality rulesets) прогоняется на
worktree базовой ветки и на текущем workspace (или worktree head-ветки),
находки диффятся по fingerprint (rule+path+line) только по изменённым
файлам. LLM не используется — сравнение чисто механическое.
"""
import asyncio
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from .git_service import _repo, changed_files, validate_ref, GitError
from .security_service import scan_semgrep, _fingerprint
from .quality_service import scan_quality_rules


def _scan_ref(workspace: str, ref: str, workdir: Optional[str]) -> tuple[list[dict], str]:
    """Прогон semgrep по ref: workdir задан — сканируем его, иначе workspace."""
    target = workdir or workspace
    findings: list[dict] = []
    sec = scan_semgrep(target)
    findings.extend(sec.get("findings", []))
    q = scan_quality_rules(target)
    findings.extend(q.get("findings", []))
    return findings, target


def _relativize(findings: list[dict], root: str) -> list[dict]:
    """Пути semgrep — абсолютные/относительные к target; приводим к repo-relative."""
    out = []
    for f in findings:
        p = f["path"]
        if Path(p).is_absolute():
            try:
                p = str(Path(p).relative_to(root))
            except ValueError:
                pass
        out.append({**f, "path": p})
    return out


def _diff_findings(base_rel: list[dict], head_rel: list[dict], keep: set[str]) -> dict:
    """Diff по fingerprint (rule+path+line) только по изменённым файлам."""
    base_map = { _fingerprint(f): f for f in base_rel if f["path"] in keep }
    head_map = { _fingerprint(f): f for f in head_rel if f["path"] in keep }
    added = [head_map[k] for k in head_map.keys() - base_map.keys()]
    removed = [base_map[k] for k in base_map.keys() - head_map.keys()]
    return {"added": added, "removed": removed}


@contextmanager
def _worktrees(repo, refs: list[str]):
    """Временные worktree для ref'ов; гарантированная зачистка."""
    tmpdirs: list[str] = []
    paths: list[str] = []
    try:
        for ref in refs:
            tmp = tempfile.mkdtemp(prefix="ccl-wt-")
            tmpdirs.append(tmp)
            # ref валидируем: значение вида "--opt=..." не должно стать флагом
            repo.git.worktree("add", "--detach", tmp, validate_ref(ref))
            paths.append(tmp)
        yield paths
    finally:
        for tmp in tmpdirs:
            try:
                repo.git.worktree("remove", "--force", tmp)
            except Exception:
                pass
            shutil.rmtree(tmp, ignore_errors=True)


async def compare_branches(workspace: str, base: str, head: str = "HEAD") -> dict:
    """Diff находок между base и head по изменённым файлам."""
    repo = _repo(workspace)
    files = await asyncio.to_thread(changed_files, workspace, base, head)

    if not files:
        return {
            "base": base, "head": head,
            "changed_files": [],
            "added": [], "removed": [],
            "summary": {"added": 0, "removed": 0},
            "note": "Кодовых изменений между ветками нет",
        }

    st = await asyncio.to_thread(lambda: repo.git.status("--porcelain"))
    # head == workspace, только если ветка совпадает и дерево чисто;
    # иначе — отдельный worktree (детерминированно и безопасно)
    head_is_current = (head == "HEAD") and not st.strip()
    refs = [base] if head_is_current else [base, head]

    with _worktrees(repo, refs) as wt:
        base_dir = wt[0]
        head_dir = workspace if head_is_current else wt[1]

        base_findings, head_findings = await asyncio.gather(
            asyncio.to_thread(_scan_ref, workspace, base, base_dir),
            asyncio.to_thread(_scan_ref, workspace, head, head_dir),
        )
        base_rel = _relativize(base_findings[0], base_dir)
        head_rel = _relativize(head_findings[0], head_dir)

        d = _diff_findings(base_rel, head_rel, set(files))
        added, removed = d["added"], d["removed"]

        def _by_sev(items: list[dict]) -> dict:
            out: dict[str, int] = {}
            for f in items:
                s = f.get("severity", "info")
                out[s] = out.get(s, 0) + 1
            return out

        return {
            "base": base, "head": head,
            "changed_files": files,
            "added": sorted(added, key=lambda f: (f["path"], f.get("line_start") or f.get("line", 0))),
            "removed": sorted(removed, key=lambda f: (f["path"], f.get("line_start") or f.get("line", 0))),
            "summary": {
                "added": len(added), "removed": len(removed),
                "added_by_severity": _by_sev(added),
                "removed_by_severity": _by_sev(removed),
            },
            "note": None,
        }
