"""Unit-тесты сервисов: suppression, baseline, отчёты, настройки, качество."""
import json
from pathlib import Path

from services import security_service as sec
from services import report_service as rep
from services import quality_service as qs
from routers.settings import _render_env, LLMSettings, _validate
import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------- suppression

def test_suppression_inline(tmp_path):
    src = tmp_path / "a.py"
    src.write_text("import os\nos.system('x')  # ccl:ignore\n", encoding="utf-8")
    findings = [{"path": "a.py", "line_start": 2, "rule_id": "r1"}]
    out = sec._apply_suppression(str(tmp_path), findings)
    assert out[0]["suppressed"] is True


def test_suppression_line_above(tmp_path):
    src = tmp_path / "a.py"
    src.write_text("# ccl:ignore py-os-system\nos.system('x')\n", encoding="utf-8")
    findings = [{"path": "a.py", "line_start": 2, "rule_id": "py-os-system"}]
    out = sec._apply_suppression(str(tmp_path), findings)
    assert out[0]["suppressed"] is True


def test_suppression_rule_mismatch_not_suppressed(tmp_path):
    src = tmp_path / "a.py"
    src.write_text("# ccl:ignore other-rule\nos.system('x')\n", encoding="utf-8")
    findings = [{"path": "a.py", "line_start": 2, "rule_id": "py-os-system"}]
    out = sec._apply_suppression(str(tmp_path), findings)
    assert not out[0].get("suppressed")


# ------------------------------------------------------------------ fingerprint/baseline

def test_fingerprint_stable_and_line_independent():
    f1 = {"rule_id": "r", "path": "a.py", "title": "T", "line_start": 5}
    f2 = {"rule_id": "r", "path": "a.py", "title": "T", "line_start": 99}
    assert sec._fingerprint(f1) == sec._fingerprint(f2)
    f3 = {"rule_id": "r2", "path": "a.py", "title": "T", "line_start": 5}
    assert sec._fingerprint(f1) != sec._fingerprint(f3)


def test_baseline_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(sec, "BASELINES_FILE", tmp_path / "baselines.json")
    report = {"findings": [{"rule_id": "r", "path": "a.py", "title": "T",
                            "severity": "warning", "line_start": 1}]}
    sec.save_baseline(str(tmp_path), report)
    info = sec.get_baseline(str(tmp_path))
    assert info and info["findings"] == 1
    assert sec.delete_baseline(str(tmp_path))["removed"] is True
    assert sec.get_baseline(str(tmp_path)) is None


# ---------------------------------------------------------------------- отчёты

FUZZ_RESULTS = {"¡×\r": [[None], {}, {"7": True}],
                "ok.py": {"violations": [{"line_start": 3, "severity": "critical",
                                          "category": "security", "rule_description": "SQLi",
                                          "explanation": "e", "code_snippet": "c", "suggestion": "s"}]}}


def test_xlsx_survives_fuzz_payload():
    data = rep.generate_xlsx(FUZZ_RESULTS)
    assert data[:2] == b"PK"  # валидный zip/xlsx


def test_md_survives_fuzz_payload():
    md = rep.generate_md(FUZZ_RESULTS)
    assert "SQLi" in md


def test_audit_html_render_and_escaping():
    html = rep.generate_audit_html({
        "workspace": "<script>", "scanned_at": "t", "tools": {}, "total_findings": 1,
        "domains": [{"domain": "injections", "label": "Инъекции", "findings_count": 1,
                     "agent": {"risk_level": "high", "assessment": "<b>x</b>",
                               "exploitability": [], "recommendations": [], "false_positives": []}}],
        "matrix": [{"cwe": "CWE-89", "severity": "critical", "count": 1, "exploitability": "high"}],
        "synthesis": {"risk_level": "high", "verdict": "v", "attack_vectors": [], "top_actions": []}})
    assert "CWE-89" in html and "Высокий" in html
    assert "<script>" not in html  # экранирование


# --------------------------------------------------------------------- настройки

def test_env_render_update_and_append():
    text = _render_env("A=1\nB=2\n", {"A": "9", "C": "3"})
    assert "A=9" in text and "B=2" in text and "C=3" in text


def test_settings_validation():
    ok = LLMSettings(provider="openai", baseUrl="https://api.x/v1", model="m")
    _validate(ok)  # не падает
    with pytest.raises(HTTPException):
        _validate(LLMSettings(provider="evil", baseUrl="https://x", model="m"))
    with pytest.raises(HTTPException):
        _validate(LLMSettings(provider="openai", baseUrl="не url", model="m"))
    with pytest.raises(HTTPException):
        _validate(LLMSettings(provider="openai", baseUrl="https://x", model="m\x00"))


# ----------------------------------------------------------------------- качество

def test_func_length_detection(tmp_path):
    src = tmp_path / "m.py"
    src.write_text("def long_fn():\n" + "".join(f"    x = {i}\n" for i in range(70)) + "    return x\n",
                   encoding="utf-8")
    metrics = qs.collect_metrics(str(tmp_path))
    names = [f["name"] for f in metrics["long_functions"]]
    assert any("long_fn" in n for n in names)
    assert metrics["total_code_files"] == 1
    assert metrics["total_loc"] > 60


def test_hotspots_ranking():
    metrics = {"complex_functions": [{"file": "a.py", "name": "f", "line": 1, "cc": 20}],
               "long_functions": [], "big_files": [], "top_files": []}
    findings = [{"path": "a.py", "category": "performance", "rule_id": "r", "line_start": 1}]
    hs = qs._rank_hotspots(metrics, findings)
    assert hs and hs[0]["path"] == "a.py" and hs[0]["score"] > 0


# ----------------------------------------------------------------------- pentest

def test_pentest_headers_helper():
    from services.pentest_service import _check_headers
    findings = _check_headers({}, "http")
    rules = {f["check"] for f in findings}
    assert "header-xcto" in rules and "header-framing" in rules
    # с заголовками — чисто
    ok = _check_headers({"x-content-type-options": "nosniff", "x-frame-options": "DENY",
                         "content-security-policy": "default-src 'self'"}, "http")
    assert not ok


# ------------------------------------------------------------------ SCA-кэш

def test_sca_cache_hit_skips_scan(tmp_path, monkeypatch):
    monkeypatch.setattr(sec, "SCA_CACHE_FILE", tmp_path / "sca-cache.json")
    (tmp_path / "requirements.txt").write_text("flask==2.0.0\n", encoding="utf-8")

    calls = {"n": 0}
    def fake_pip(root, req_files, findings, notes):
        calls["n"] += 1
        findings.append({"rule_id": "CVE-X", "path": "requirements.txt", "severity": "critical"})
    monkeypatch.setattr(sec, "_scan_pip_audit", fake_pip)

    r1 = sec.scan_sca(str(tmp_path))
    assert calls["n"] == 1 and len(r1["findings"]) == 1
    r2 = sec.scan_sca(str(tmp_path))
    assert calls["n"] == 1, "повторный скан не должен вызывать pip-audit"
    assert len(r2["findings"]) == 1 and "кэш" in r2.get("note", "")
    # манифест изменился → кэш инвалидирован
    (tmp_path / "requirements.txt").write_text("flask==2.3.0\n", encoding="utf-8")
    sec.scan_sca(str(tmp_path))
    assert calls["n"] == 2


def test_sca_no_manifests_no_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(sec, "SCA_CACHE_FILE", tmp_path / "sca-cache.json")
    r = sec.scan_sca(str(tmp_path))
    assert "манифесты зависимостей не найдены" in r.get("note", "")
    assert not (tmp_path / "sca-cache.json").exists()


# ------------------------------------------------------------------ гейт качества

def test_remote_parsing():
    from services.git_service import _parse_remote, GitError
    assert _parse_remote("https://github.com/devpilgrin/CodeCogniLint.git") == \
        ("github", "github.com", "devpilgrin/CodeCogniLint")
    assert _parse_remote("git@github.com:devpilgrin/CodeCogniLint.git")[0] == "github"
    assert _parse_remote("https://gitlab.com/grp/proj.git") == ("gitlab", "gitlab.com", "grp/proj")
    assert _parse_remote("git@gitlab.local:team/tool.git") == ("gitlab", "gitlab.local", "team/tool")
    assert _parse_remote("https://gitlab.company.ru/a/b.git")[1] == "gitlab.company.ru"
    import pytest as _pt
    with _pt.raises(GitError):
        _parse_remote("https://bitbucket.org/a/b.git")

def test_gate_config_defaults_without_file(tmp_path):
    cfg = qs.load_gate_config(str(tmp_path))
    assert cfg["thresholds"]["func_cc"] == 10
    assert cfg["budgets"] == {}


def test_gate_config_reads_budgets(tmp_path):
    (tmp_path / ".ccl-quality.yml").write_text(
        "func_cc: 15\nmax_findings_total: 5\nmax_complex_functions: 2\n", encoding="utf-8")
    cfg = qs.load_gate_config(str(tmp_path))
    assert cfg["thresholds"]["func_cc"] == 15
    assert cfg["budgets"] == {"max_findings_total": 5, "max_complex_functions": 2}


def _gate_report(n_findings: int, complex_n: int) -> dict:
    return {
        "findings": [{"category": "performance", "severity": "warning"} for _ in range(n_findings)]
                    + [{"category": "x", "severity": "info", "suppressed": True}],  # не считается
        "metrics": {"complex_functions": [{}] * complex_n,
                    "long_functions": [], "big_files": []},
    }


def test_gate_ratchet():
    cfg = {"budgets": {"max_findings_total": 2, "max_complex_functions": 1}}
    assert qs.evaluate_gate(_gate_report(2, 1), cfg) == []          # ровно бюджет — pass
    v = qs.evaluate_gate(_gate_report(3, 1), cfg)
    assert len(v) == 1 and "находок качества" in v[0]              # регресс находок
    v = qs.evaluate_gate(_gate_report(2, 2), cfg)
    assert len(v) == 1 and "сложных функций" in v[0]               # регресс CC
    assert qs.evaluate_gate(_gate_report(99, 99), {"budgets": {}}) == []  # без бюджетов — pass
