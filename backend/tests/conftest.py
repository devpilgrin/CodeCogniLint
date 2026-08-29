"""Общие фикстуры: TestClient и изолированный tmp-workspace."""
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_state(tmp_path_factory, monkeypatch):
    """Тесты не трогают реальные state-файлы backend'а (правила, baselines):
    RULES_FILE трекаемый в git — подменяем на tmp-копию."""
    import services.rules_service as rs
    import services.security_service as ss
    tmp = tmp_path_factory.mktemp("state")
    rules_copy = tmp / "rules.json"
    if rs.RULES_FILE.exists():
        rules_copy.write_text(rs.RULES_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    else:
        rules_copy.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(rs, "RULES_FILE", rules_copy)
    monkeypatch.setattr(ss, "BASELINES_FILE", tmp / "baselines.json")


@pytest.fixture()
def workspace(tmp_path):
    """Минимальный python-проект для сканов."""
    (tmp_path / "app.py").write_text(
        'import os\n'
        'def run(cmd):\n'
        '    os.system(cmd)  # semgrep поймает\n'
        '\n'
        'def long_fn():\n' + ''.join(f'    x = {i}\n' for i in range(70)) + '    return x\n',
        encoding="utf-8")
    (tmp_path / "notes.txt").write_text("просто текст\n", encoding="utf-8")
    return str(tmp_path)
