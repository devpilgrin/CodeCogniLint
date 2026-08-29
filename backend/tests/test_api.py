"""Smoke-тесты эндпоинтов (TestClient). Тяжёлые LLM-слои не вызываются —
проверяем контракты, валидацию и устойчивость к мусорным данным."""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_openapi_documents_error_codes(client):
    schema = client.get("/openapi.json").json()
    op = schema["paths"]["/api/git/status"]["get"]
    for code in ("400", "404", "409", "503"):
        assert code in op["responses"], f"не задокументирован {code}"


def test_security_headers_and_allow(client):
    r = client.get("/api/health")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
    r = client.options("/api/rules")
    assert r.status_code == 405
    allow = {m.strip() for m in r.headers["allow"].split(",")}
    assert {"GET", "POST"} <= allow


# ------------------------------------------------------------------- workspace

def test_workspace_open_missing_is_404(client, tmp_path):
    r = client.post("/api/workspace/open", json={"path": str(tmp_path / "nope")})
    assert r.status_code == 404


def test_workspace_open_file_is_400(client, tmp_path):
    f = tmp_path / "f.txt"
    f.write_text("x")
    r = client.post("/api/workspace/open", json={"path": str(f)})
    assert r.status_code == 400


def test_workspace_open_and_file(client, workspace):
    r = client.post("/api/workspace/open", json={"path": workspace})
    assert r.status_code == 200
    r = client.get("/api/workspace/file", params={"path": "app.py"})
    assert r.status_code == 200 and "os.system" in r.json()["content"]
    r = client.get("/api/workspace/file", params={"path": "missing.py"})
    assert r.status_code == 404
    # выход за пределы workspace
    r = client.get("/api/workspace/file", params={"path": "../../etc/passwd"})
    assert r.status_code == 400


# --------------------------------------------------------------------- rules

def test_rules_crud(client):
    r = client.post("/api/rules", json={
        "name": "t-rule", "category": "syntax",
        "description": "тестовое правило", "pattern_description": "найти foo"})
    assert r.status_code == 200
    rid = r.json()["id"]
    r = client.patch(f"/api/rules/{rid}", json={"enabled": False})
    assert r.status_code == 200 and r.json()["enabled"] is False
    r = client.delete(f"/api/rules/{rid}")
    assert r.status_code == 200
    r = client.delete(f"/api/rules/{rid}")
    assert r.status_code == 404
    # PATCH с пустым телом — идемпотентный no-op (404 для несуществующего)
    r = client.patch(f"/api/rules/{rid}", json={})
    assert r.status_code == 404


def test_rules_wrong_method_on_generate(client):
    r = client.patch("/api/rules/generate", json={"code": "x", "category": "syntax"})
    assert r.status_code == 405
    assert "POST" in r.headers.get("allow", "")


# ------------------------------------------------------------------- settings

def test_settings_validation(client):
    cur = client.get("/api/settings").json()
    r = client.put("/api/settings", json={"provider": "evil", "baseUrl": "http://x", "model": "m"})
    assert r.status_code == 400
    r = client.put("/api/settings", json={"provider": "openai", "baseUrl": "не url", "model": "m"})
    assert r.status_code == 400
    # roundtrip теми же значениями — не ломаем окружение
    r = client.put("/api/settings", json=cur)
    assert r.status_code == 200


# --------------------------------------------------------------------- reports

def test_reports_survive_fuzz(client):
    payload = {"results": {"¡×\r": [[None], {}, {"7": True}],
                           "ok.py": {"violations": [{"line_start": 3, "severity": "critical",
                                                     "category": "security", "rule_description": "SQLi",
                                                     "explanation": "e", "code_snippet": "c", "suggestion": "s"}]}}}
    r = client.post("/api/reports/md", json=payload)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    r = client.post("/api/reports/xlsx", json=payload)
    assert r.status_code == 200 and r.content[:2] == b"PK"


# ------------------------------------------------------------------- security

def test_security_scan_clean_workspace(client, tmp_path):
    (tmp_path / "clean.py").write_text("print('ok')\n", encoding="utf-8")
    client.post("/api/workspace/open", json={"path": str(tmp_path)})
    r = client.post("/api/security/scan")
    assert r.status_code == 200
    d = r.json()
    assert "layers" in d and "coverage" in d and d["summary"]["total"] == 0


def test_security_scan_finds_os_system(client, workspace):
    client.post("/api/workspace/open", json={"path": workspace})
    r = client.post("/api/security/scan")
    assert r.status_code == 200
    d = r.json()
    if d["tools"]["semgrep"]:  # semgrep есть не везде (CI backend-джоба)
        assert any(f["rule_id"] == "py-os-system" for f in d["findings"])
        # suppression работает через API-уровень
        import pathlib
        p = pathlib.Path(workspace) / "app.py"
        p.write_text(p.read_text(encoding="utf-8").replace(
            "os.system(cmd)", "os.system(cmd)  # ccl:ignore py-os-system"), encoding="utf-8")
        d2 = client.post("/api/security/scan").json()
        os_findings = [f for f in d2["findings"] if f["rule_id"] == "py-os-system"]
        assert all(f.get("suppressed") for f in os_findings)


def test_sarif_export(client, workspace):
    client.post("/api/workspace/open", json={"path": workspace})
    r = client.post("/api/security/sarif")
    assert r.status_code == 200
    assert r.json()["version"] == "2.1.0"


# --------------------------------------------------------------------- quality

def test_quality_scan(client, workspace):
    client.post("/api/workspace/open", json={"path": workspace})
    r = client.post("/api/quality/scan")
    assert r.status_code == 200
    d = r.json()
    assert d["metrics"]["total_code_files"] == 1
    assert any("long_fn" in f["name"] for f in d["metrics"]["long_functions"])
    assert "hotspots" in d and "by_category" in d


# ----------------------------------------------------------------------- audit

def test_audit_html_render(client):
    r = client.post("/api/audit/html", json={"workspace": "/w", "scanned_at": "t",
                                             "tools": {}, "total_findings": 0,
                                             "domains": [], "matrix": [], "synthesis": None})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "Чисто" in r.text


# --------------------------------------------------------------------- pentest

def test_pentest_scan_bad_url(client):
    # мусорные URL — никогда не 500; либо валидация (400/422), либо reachable-находка
    for bad in ("http://x\x1dy", "]\xee\xbc\xd0", "http://"):
        r = client.post("/api/pentest/scan", json={
            "url": bad, "fuzz": False, "config_checks": True})
        assert r.status_code != 500, f"{bad!r} дал 500"
    # недостижимая цель — 200 с критичной находкой reachable
    r = client.post("/api/pentest/scan", json={"url": "http://127.0.0.1:1", "fuzz": False})
    d = r.json()
    assert any(f["check"] == "reachable" for f in d["findings"])


# ------------------------------------------------------------------------- git

def test_git_not_repo_is_409(client, tmp_path):
    client.post("/api/workspace/open", json={"path": str(tmp_path)})
    r = client.get("/api/git/status")
    assert r.status_code == 409


def test_pr_branch_equals_base(client):
    client.post("/api/workspace/open", json={"path": "/home/roman/workspace/CodeCogniLint"})
    r = client.post("/api/git/pr", json={"title": "t", "base": "main"})
    assert r.status_code == 409
