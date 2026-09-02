import json
import threading
import uuid
from pathlib import Path
from datetime import datetime, timezone

RULES_FILE = Path(__file__).parent.parent / ".hybrid-rules.json"

# read-modify-write над файлом правил — под одной блокировкой (гонки запросов)
_LOCK = threading.Lock()


def load_rules() -> list[dict]:
    if not RULES_FILE.exists():
        return []
    return json.loads(RULES_FILE.read_text(encoding="utf-8"))


def save_rules(rules: list[dict]) -> None:
    RULES_FILE.write_text(json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")


def add_rule(category: str, description: str, pattern_description: str) -> dict:
    with _LOCK:
        rules = load_rules()
        rule = {
            "id": str(uuid.uuid4()),
            "category": category,
            "description": description,
            "pattern_description": pattern_description,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "enabled": True,
        }
        rules.append(rule)
        save_rules(rules)
    return rule


def update_rule(rule_id: str, updates: dict) -> dict | None:
    with _LOCK:
        rules = load_rules()
        for i, r in enumerate(rules):
            if r["id"] == rule_id:
                rules[i] = {**r, **updates}
                save_rules(rules)
                return rules[i]
    return None


def delete_rule(rule_id: str) -> bool:
    with _LOCK:
        rules = load_rules()
        new_rules = [r for r in rules if r["id"] != rule_id]
        if len(new_rules) == len(rules):
            return False
        save_rules(new_rules)
    return True
