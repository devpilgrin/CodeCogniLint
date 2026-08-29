from fastapi import APIRouter, HTTPException, Path as PathParam
from pydantic import BaseModel, Field, StrictBool
from services.rules_service import load_rules, add_rule, update_rule, delete_rule
from services.analysis_service import generate_rule_from_code
from services.llm_adapter import LLMError

router = APIRouter(prefix="/rules", tags=["rules"])

# rule_id — uuid4; паттерн отсекает коллизии со статическими путями
# (PATCH /rules/generate не должен попадать в /rules/{rule_id} → 405 вместо 404)
RULE_ID_PATTERN = r"^[0-9a-fA-F-]{8,36}$"


class CreateRuleRequest(BaseModel):
    category: str = Field(pattern="^(syntax|semantic|analysis)$")
    description: str = Field(min_length=3, max_length=500)
    pattern_description: str = Field(min_length=3, max_length=2000)
    enabled: StrictBool = True


class GenerateRuleRequest(BaseModel):
    code: str
    category: str = Field(pattern="^(syntax|semantic|analysis)$")


class UpdateRuleRequest(BaseModel):
    category: str | None = None
    description: str | None = None
    pattern_description: str | None = None
    enabled: bool | None = None


@router.get("")
def get_rules():
    return load_rules()


@router.post("")
def create_rule(body: CreateRuleRequest):
    """Manual rule creation (no LLM)."""
    rule = add_rule(body.category, body.description, body.pattern_description)
    if not body.enabled:
        rule = update_rule(rule["id"], {"enabled": False})
    return rule


@router.post("/generate")
async def generate_rule(body: GenerateRuleRequest):
    """LLM-based rule generation from a code snippet."""
    try:
        return await generate_rule_from_code(body.code, body.category)
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=exc.friendly)


# Прочие методы на статическом пути /generate — 405 (иначе они попадают
# в /{rule_id} и дают некорректный 404/422 вместо Method Not Allowed)
@router.api_route("/generate", methods=["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
                  include_in_schema=False)
def generate_wrong_method():
    raise HTTPException(status_code=405, detail="Method Not Allowed",
                        headers={"Allow": "POST"})


@router.patch("/{rule_id}")
def patch_rule(body: UpdateRuleRequest, rule_id: str = PathParam(pattern=RULE_ID_PATTERN)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        # PATCH с пустым телом — идемпотентный no-op: возвращаем текущее правило
        rule = next((r for r in load_rules() if r["id"] == rule_id), None)
        if not rule:
            raise HTTPException(status_code=404, detail="Правило не найдено")
        return rule
    rule = update_rule(rule_id, updates)
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    return rule


@router.delete("/{rule_id}")
def remove_rule(rule_id: str = PathParam(pattern=RULE_ID_PATTERN)):
    if not delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Правило не найдено")
    return {"ok": True}
