from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.rules_service import load_rules, add_rule, update_rule, delete_rule
from services.analysis_service import generate_rule_from_code
from services.llm_adapter import LLMError

router = APIRouter(prefix="/rules", tags=["rules"])


class CreateRuleRequest(BaseModel):
    category: str = Field(pattern="^(syntax|semantic|analysis)$")
    description: str = Field(min_length=3, max_length=500)
    pattern_description: str = Field(min_length=3, max_length=2000)
    enabled: bool = True


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


@router.patch("/{rule_id}")
def patch_rule(rule_id: str, body: UpdateRuleRequest):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    rule = update_rule(rule_id, updates)
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    return rule


@router.delete("/{rule_id}")
def remove_rule(rule_id: str):
    if not delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Правило не найдено")
    return {"ok": True}
