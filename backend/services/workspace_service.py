import json
import os
import string
from datetime import datetime
from pathlib import Path
from typing import Optional

import git

WORKSPACE_FILE = Path(__file__).parent.parent / ".hybrid-workspace.json"
PROJECTS_DIR = Path(__file__).parent.parent / "projects"

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".next", ".nuxt", "target", ".idea", ".vscode",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", "coverage",
    ".turbo", ".cache", ".parcel-cache",
}

EXT_TO_LANG = {
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".pyi": "python",
    ".java": "java", ".kt": "kotlin", ".scala": "scala",
    ".go": "go", ".rs": "rust",
    ".cs": "csharp", ".vb": "vb",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp",
    ".c": "c", ".h": "c",
    ".rb": "ruby", ".php": "php", ".swift": "swift",
    ".html": "html", ".htm": "html", ".xml": "xml", ".svg": "xml",
    ".css": "css", ".scss": "scss", ".sass": "scss", ".less": "less",
    ".json": "json", ".jsonc": "json",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml", ".ini": "ini",
    ".md": "markdown", ".mdx": "markdown",
    ".sql": "sql", ".graphql": "graphql", ".gql": "graphql",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".dockerfile": "dockerfile",
    ".vue": "html", ".svelte": "html",
    ".lua": "lua", ".r": "r",
}

MAX_TREE_ENTRIES = 5000
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def _load_state() -> dict:
    if not WORKSPACE_FILE.exists():
        return {"current": None, "recent": []}
    try:
        return json.loads(WORKSPACE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"current": None, "recent": []}


def _save_state(state: dict) -> None:
    WORKSPACE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _info_for(path: str) -> dict:
    p = Path(path)
    return {"path": str(p), "name": p.name}


def get_workspace() -> dict:
    state = _load_state()
    current = state.get("current")
    info = None
    if current and Path(current).is_dir():
        info = _info_for(current)
    # Filter recent to existing directories
    recent = [r for r in state.get("recent", []) if Path(r).is_dir()]
    return {"current": info, "recent": recent}


def set_workspace(path: str) -> dict:
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise ValueError(f"Путь не существует: {p}")
    if not p.is_dir():
        raise ValueError(f"Это не папка: {p}")
    state = _load_state()
    state["current"] = str(p)
    recent = [r for r in state.get("recent", []) if r != str(p)]
    recent.insert(0, str(p))
    state["recent"] = recent[:8]
    _save_state(state)
    return get_workspace()


def close_workspace() -> dict:
    state = _load_state()
    state["current"] = None
    _save_state(state)
    return get_workspace()


def clone_repo(url: str, target_name: Optional[str] = None) -> str:
    url = url.strip()
    if not url:
        raise ValueError("URL пустой")
    if not (url.startswith("http://") or url.startswith("https://") or url.startswith("git@")):
        raise ValueError("Поддерживаются только http(s):// и git@ URL")

    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

    if target_name and target_name.strip():
        name = target_name.strip()
    else:
        name = url.rstrip("/").split("/")[-1]
        if name.endswith(".git"):
            name = name[:-4]
    if not name:
        raise ValueError("Не удалось определить имя папки")

    # Sanitize
    name = "".join(c for c in name if c.isalnum() or c in "-_.")
    target = PROJECTS_DIR / name
    if target.exists():
        raise ValueError(f"Папка уже существует: {target}")

    try:
        git.Repo.clone_from(url, str(target), depth=1)
    except git.GitCommandError as e:
        raise ValueError(f"Git clone не удался: {e.stderr.strip() or str(e)}")

    return str(target)


def _is_binary(raw: bytes) -> bool:
    return b"\x00" in raw[:8192]


def build_tree(root: str) -> dict:
    root_path = Path(root).expanduser().resolve()
    if not root_path.is_dir():
        raise ValueError("Workspace not found")

    counter = [0]
    truncated = [False]

    def walk(p: Path, is_root: bool = False) -> Optional[dict]:
        if counter[0] >= MAX_TREE_ENTRIES:
            truncated[0] = True
            return None
        counter[0] += 1

        rel = "" if is_root else str(p.relative_to(root_path)).replace("\\", "/")
        node = {
            "name": root_path.name if is_root else p.name,
            "path": rel,
            "type": "directory" if p.is_dir() else "file",
        }

        if p.is_file():
            ext = p.suffix.lower()
            node["language"] = EXT_TO_LANG.get(ext, "plaintext")
            return node

        children = []
        try:
            entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
        except PermissionError:
            return node

        for entry in entries:
            if entry.name in SKIP_DIRS:
                continue
            if entry.name.startswith(".") and entry.name not in (".env.example", ".gitignore", ".dockerignore"):
                continue
            child = walk(entry)
            if child:
                children.append(child)

        node["children"] = children
        return node

    tree = walk(root_path, is_root=True) or {"name": root_path.name, "path": "", "type": "directory", "children": []}
    tree["truncated"] = truncated[0]
    return tree


def write_file(workspace: str, rel_path: str, content: str) -> dict:
    """
    Save text content to a file inside the workspace.
    Only allows overwriting existing files (no new file creation through this API).
    """
    root = Path(workspace).expanduser().resolve()
    target = (root / rel_path).resolve()

    # Security: must stay inside workspace
    try:
        target.relative_to(root)
    except ValueError:
        raise ValueError("Файл за пределами проекта")

    if not target.exists():
        raise ValueError(f"Файл не существует: {rel_path}")
    if target.is_dir():
        raise ValueError("Указан путь к директории, а не к файлу")

    encoded = content.encode("utf-8")
    if len(encoded) > MAX_FILE_SIZE:
        raise ValueError(
            f"Слишком большое содержимое ({len(encoded) // 1024} КБ). "
            f"Лимит: {MAX_FILE_SIZE // 1024 // 1024} МБ."
        )

    # Atomic-ish write: write to .tmp then replace
    tmp = target.with_suffix(target.suffix + ".hybridtmp")
    try:
        tmp.write_bytes(encoded)
        tmp.replace(target)
    except OSError as e:
        if tmp.exists():
            try: tmp.unlink()
            except OSError: pass
        raise ValueError(f"Ошибка записи: {e}")

    return {
        "path": rel_path,
        "name": target.name,
        "size": target.stat().st_size,
        "saved_at": datetime.now().isoformat(),
    }


def read_file(workspace: str, rel_path: str) -> dict:
    root = Path(workspace).expanduser().resolve()
    # Normalize and verify path stays inside workspace
    target = (root / rel_path).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        raise ValueError("Файл за пределами проекта")

    if not target.is_file():
        raise ValueError(f"Файл не найден: {rel_path}")

    size = target.stat().st_size
    if size > MAX_FILE_SIZE:
        raise ValueError(f"Файл слишком большой ({size // 1024} КБ). Лимит: {MAX_FILE_SIZE // 1024 // 1024} МБ.")

    raw = target.read_bytes()
    if _is_binary(raw):
        raise ValueError("Это бинарный файл — открывать нельзя.")

    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("utf-8", errors="replace")

    ext = target.suffix.lower()
    return {
        "path": rel_path,
        "name": target.name,
        "content": content,
        "language": EXT_TO_LANG.get(ext, "plaintext"),
        "size": size,
    }


MAX_REPO_FILES = 200
MAX_REPO_FILE_SIZE = 256 * 1024  # 256 KB per file for repo scan


def iter_workspace_files(root_path: str, max_files: int = MAX_REPO_FILES):
    """
    Yield (relative_path, content, language) for analyzable text files in workspace.
    Skips SKIP_DIRS, dot-files (except whitelisted), non-code extensions, binaries,
    empty files, and files larger than MAX_REPO_FILE_SIZE.
    """
    root = Path(root_path).expanduser().resolve()
    if not root.is_dir():
        return
    code_exts = set(EXT_TO_LANG.keys())
    count = 0

    for current_dir, dirnames, filenames in os.walk(root):
        # Prune in-place so os.walk doesn't descend into excluded dirs
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIRS and not d.startswith(".")
        ]

        for fname in sorted(filenames):
            if count >= max_files:
                return
            if fname.startswith(".") and fname not in (".env.example", ".gitignore", ".dockerignore"):
                continue

            ext = Path(fname).suffix.lower()
            if ext not in code_exts:
                continue

            full = Path(current_dir) / fname
            try:
                size = full.stat().st_size
                if size == 0 or size > MAX_REPO_FILE_SIZE:
                    continue
                raw = full.read_bytes()
                if _is_binary(raw):
                    continue
                content = raw.decode("utf-8", errors="replace")
            except (OSError, PermissionError):
                continue

            rel = str(full.relative_to(root)).replace("\\", "/")
            yield rel, content, EXT_TO_LANG[ext]
            count += 1


def browse_dir(path: Optional[str]) -> dict:
    """List directories for a native-like folder picker (server-side)."""
    if not path:
        if os.name == "nt":
            drives = []
            for letter in string.ascii_uppercase:
                drive_path = f"{letter}:\\"
                if Path(drive_path).exists():
                    drives.append({"name": drive_path, "path": drive_path, "type": "directory"})
            home = str(Path.home())
            return {
                "current": None,
                "parent": None,
                "entries": drives,
                "home": home,
            }
        home = str(Path.home())
        path = home

    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise ValueError(f"Путь не найден: {p}")
    if not p.is_dir():
        raise ValueError(f"Это не папка: {p}")

    entries = []
    try:
        for entry in sorted(p.iterdir(), key=lambda e: e.name.lower()):
            if entry.is_dir() and not entry.name.startswith("."):
                entries.append({
                    "name": entry.name,
                    "path": str(entry),
                    "type": "directory",
                })
    except PermissionError:
        pass

    parent = str(p.parent) if p.parent != p else None
    return {
        "current": str(p),
        "parent": parent,
        "entries": entries,
        "home": str(Path.home()),
    }
