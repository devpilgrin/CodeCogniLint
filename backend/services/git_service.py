"""
Git-операции поверх GitPython: status / diff / commit / push / pull / log.

Аутентификация push:
- SSH remote (git@...) — работает нативно через ключи пользователя.
- HTTPS remote — токен подставляется в URL только на время вызова push
  (в конфиг репозитория не сохраняется). Источники токена по приоритету:
  1) параметр запроса, 2) env GIT_TOKEN, 3) env GITHUB_TOKEN,
  4) credential helper ОС (без токена — как настроен git).
"""
import os
import re
from pathlib import Path
from typing import Optional

import git
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DEFAULT_AUTHOR_NAME = "CodeCogniLint"
DEFAULT_AUTHOR_EMAIL = "codecognilint@localhost"


class GitError(ValueError):
    """Ошибка git-операции с человекочитаемым сообщением."""


def _repo(workspace: str) -> git.Repo:
    root = Path(workspace).expanduser().resolve()
    try:
        return git.Repo(str(root), search_parent_directories=False)
    except (git.InvalidGitRepositoryError, git.NoSuchPathError):
        raise GitError("Текущий проект не является git-репозиторием")


def _upstream(repo: git.Repo):
    try:
        branch = repo.active_branch
        return branch.tracking_branch()
    except TypeError:  # detached HEAD
        return None


def status(workspace: str) -> dict:
    repo = _repo(workspace)

    try:
        branch = repo.active_branch.name
    except TypeError:
        branch = None  # detached HEAD

    tracking = _upstream(repo)
    tracking_name = str(tracking) if tracking else None
    ahead = behind = 0
    if tracking:
        try:
            ahead = sum(1 for _ in repo.iter_commits(f"{tracking.name}..HEAD"))
            behind = sum(1 for _ in repo.iter_commits(f"HEAD..{tracking.name}"))
        except git.GitCommandError:
            pass

    changed = []
    # Staged (index vs HEAD). HEAD может отсутствовать в пустом репо.
    try:
        staged = repo.index.diff("HEAD")
    except git.BadName:
        staged = repo.index.diff(git.NULL_TREE)
    for d in staged:
        changed.append({"path": d.b_path or d.a_path, "status": _change_code(d), "staged": True})
    # Unstaged (worktree vs index)
    for d in repo.index.diff(None):
        changed.append({"path": d.b_path or d.a_path, "status": _change_code(d), "staged": False})
    # Untracked
    for p in repo.untracked_files:
        changed.append({"path": p, "status": "?", "staged": False})

    remotes = [{"name": r.name, "url": _sanitize_url(r.url)} for r in repo.remotes]

    return {
        "is_repo": True,
        "branch": branch,
        "head": repo.head.commit.hexsha[:7] if repo.head.is_valid() else None,
        "tracking": tracking_name,
        "ahead": ahead,
        "behind": behind,
        "changed": changed,
        "clean": len(changed) == 0,
        "remotes": remotes,
    }


def _change_code(d) -> str:
    if d.new_file:
        return "A"
    if d.deleted_file:
        return "D"
    if d.renamed_file:
        return "R"
    return "M"


def _sanitize_url(url: str) -> str:
    """Убрать возможные креды из URL remote для безопасного отображения."""
    return re.sub(r"(https?://)[^@/]+@", r"\1***@", url)


def diff(workspace: str, path: Optional[str] = None) -> dict:
    repo = _repo(workspace)
    paths = [path] if path else None
    text = repo.git.diff("HEAD", "--", *(paths or [])) if repo.head.is_valid() \
        else repo.git.diff("--", *(paths or []))
    if not text.strip():
        text = repo.git.diff("--cached", "--", *(paths or []))
    return {"path": path, "diff": text}


def _ensure_author(repo: git.Repo) -> Optional[str]:
    """Вернуть имя автора; если git user.name/email не настроены — задать repo-local fallback."""
    try:
        name = repo.config_reader().get_value("user", "name", None)
        email = repo.config_reader().get_value("user", "email", None)
        if name and email:
            return None
    except Exception:
        pass
    with repo.config_writer() as cw:
        cw.set_value("user", "name", DEFAULT_AUTHOR_NAME)
        cw.set_value("user", "email", DEFAULT_AUTHOR_EMAIL)
    return f"git user.name/email не были настроены — задан локальный fallback {DEFAULT_AUTHOR_NAME} <{DEFAULT_AUTHOR_EMAIL}>"


def commit(workspace: str, message: str, paths: Optional[list[str]] = None) -> dict:
    message = (message or "").strip()
    if not message:
        raise GitError("Сообщение коммита пустое")

    repo = _repo(workspace)
    note = _ensure_author(repo)

    try:
        if paths:
            repo.index.add(paths)
        else:
            repo.git.add("-A")
        if not repo.index.diff("HEAD") and repo.head.is_valid():
            raise GitError("Нет изменений для коммита")
        c = repo.index.commit(message)
    except GitError:
        raise
    except git.GitCommandError as e:
        raise GitError(f"Git commit не удался: {e.stderr.strip() or str(e)}")

    return {
        "hash": c.hexsha[:7],
        "message": message,
        "note": note,
    }


def _token(explicit: Optional[str]) -> Optional[str]:
    if explicit:
        return explicit.strip() or None
    return os.environ.get("GIT_TOKEN") or os.environ.get("GITHUB_TOKEN")


def _push_url(url: str, token: Optional[str]) -> str:
    """Подставить токен в https-URL (только в память вызова, не в конфиг)."""
    if not token or not url.startswith("https://"):
        return url
    if "@" in url.split("//", 1)[1].split("/", 1)[0]:
        return url  # креды уже есть
    return url.replace("https://", f"https://x-access-token:{token}@", 1)


def push(workspace: str, token: Optional[str] = None) -> dict:
    repo = _repo(workspace)
    if "origin" not in [r.name for r in repo.remotes]:
        raise GitError("У репозитория нет remote 'origin'")
    origin = repo.remote("origin")

    try:
        branch = repo.active_branch.name
    except TypeError:
        raise GitError("Detached HEAD — переключитесь на ветку перед push")

    url = _push_url(origin.url, _token(token))
    tracking = _upstream(repo)

    try:
        # Push по явному URL (токен не попадает в конфиг репозитория),
        # затем вручную обновляем remote-tracking ref и upstream-конфиг.
        repo.git.push(url, branch)
        repo.git.update_ref(f"refs/remotes/origin/{branch}", "HEAD")
        if not tracking:
            with repo.config_writer() as cw:
                cw.set_value(f'branch "{branch}"', "remote", "origin")
                cw.set_value(f'branch "{branch}"', "merge", f"refs/heads/{branch}")
    except git.GitCommandError as e:
        err = e.stderr.strip() or str(e)
        err = re.sub(r"https://[^@/]+@", "https://***@", err)  # не утекает токен
        raise GitError(f"Git push не удался: {err}")

    return {
        "branch": branch,
        "remote": _sanitize_url(origin.url),
        "set_upstream": tracking is None,
        "auth": "token" if (_token(token) and origin.url.startswith("https://")) else "default",
    }


def pull(workspace: str, token: Optional[str] = None) -> dict:
    repo = _repo(workspace)
    if "origin" not in [r.name for r in repo.remotes]:
        raise GitError("У репозитория нет remote 'origin'")
    origin = repo.remote("origin")
    url = _push_url(origin.url, _token(token))

    before = repo.head.commit.hexsha if repo.head.is_valid() else None
    try:
        repo.git.pull("--ff-only", url)
    except git.GitCommandError as e:
        err = e.stderr.strip() or str(e)
        err = re.sub(r"https://[^@/]+@", "https://***@", err)
        if "Not possible to fast-forward" in err or "non-fast-forward" in err.lower():
            raise GitError("Ветки разошлись — fast-forward невозможен. Разрешите конфликт вручную.")
        raise GitError(f"Git pull не удался: {err}")
    after = repo.head.commit.hexsha

    return {
        "updated": before != after,
        "head": after[:7],
    }


def log(workspace: str, limit: int = 10) -> dict:
    repo = _repo(workspace)
    if not repo.head.is_valid():
        return {"commits": []}
    limit = max(1, min(limit, 50))
    commits = []
    for c in repo.iter_commits(max_count=limit):
        commits.append({
            "hash": c.hexsha[:7],
            "message": c.message.strip().splitlines()[0] if c.message else "",
            "author": str(c.author),
            "date": c.committed_datetime.isoformat(),
        })
    return {"commits": commits}


# ---- PR/MR-интеграция ----

_GITHUB_URL_RE = re.compile(
    r"(?:https://github\.com/|git@github\.com:)(?P<owner>[^/]+)/(?P<repo>[^/.]+?)(?:\.git)?$")


def _github_slug(url: str) -> tuple[str, str]:
    m = _GITHUB_URL_RE.search(url.strip())
    if not m:
        raise GitError(
            "PR поддержан для remote github.com (https или ssh). "
            f"Текущий remote: {_sanitize_url(url)}")
    return m.group("owner"), m.group("repo")


def create_pr(workspace: str, title: str, body: str = "", base: str = "main",
              token: Optional[str] = None) -> dict:
    """Создать Pull Request на GitHub: push текущей ветки + API GitHub.

    Токен — из запроса / GIT_TOKEN / GITHUB_TOKEN (в конфиг не сохраняется)."""
    title = (title or "").strip()
    if not title:
        raise GitError("Заголовок PR пустой")

    repo = _repo(workspace)
    push_result = push(workspace, token=token)

    if "origin" not in [r.name for r in repo.remotes]:
        raise GitError("У репозитория нет remote 'origin'")
    owner, name = _github_slug(repo.remote("origin").url)
    branch = push_result["branch"]
    if branch == base:
        raise GitError(f"Текущая ветка совпадает с base ({base}) — PR не из чего создать")

    tk = _token(token)
    if not tk:
        raise GitError("Для создания PR нужен токен (GIT_TOKEN/GITHUB_TOKEN или параметр)")

    import requests
    api = f"https://api.github.com/repos/{owner}/{name}/pulls"
    headers = {"Authorization": f"Bearer {tk}", "Accept": "application/vnd.github+json"}
    payload = {"title": title, "head": branch, "base": base, "body": body}
    try:
        r = requests.post(api, json=payload, headers=headers, timeout=15)
    except requests.RequestException as e:
        raise GitError(f"GitHub API недоступен: {e}")

    if r.status_code == 201:
        pr = r.json()
        return {"url": pr["html_url"], "number": pr["number"], "branch": branch,
                "base": base, "created": True}
    if r.status_code == 422:
        # PR для этой ветки уже существует — возвращаем его
        lst = requests.get(api, params={"head": f"{owner}:{branch}", "state": "open"},
                           headers=headers, timeout=15)
        if lst.ok and lst.json():
            pr = lst.json()[0]
            return {"url": pr["html_url"], "number": pr["number"], "branch": branch,
                    "base": base, "created": False}
        raise GitError(f"GitHub отклонил PR: {r.json().get('message', r.status_code)}")
    raise GitError(f"GitHub API: {r.status_code} {r.json().get('message', '')[:200]}")


def pr_context(workspace: str, base: str = "main") -> dict:
    """Контекст для LLM-генерации описания PR: статистика diff + коммиты."""
    repo = _repo(workspace)
    try:
        branch = repo.active_branch.name
    except TypeError:
        raise GitError("Detached HEAD")
    try:
        stat = repo.git.diff(f"{base}...HEAD", "--stat")
    except git.GitCommandError:
        stat = repo.git.diff("--stat", "HEAD~5..HEAD") if repo.head.is_valid() else ""
    commits = [c.message.strip().splitlines()[0]
               for c in repo.iter_commits(f"{base}..HEAD", max_count=20)] \
        if repo.head.is_valid() else []
    return {"branch": branch, "base": base, "stat": stat[:4000], "commits": commits}
