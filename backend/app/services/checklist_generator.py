"""S9 확인 체크리스트 생성 (docs/skills.md S9).

S8 결과의 부족·반박·충돌·검증불가를 사용자가 확인할 질문으로 변환한다.
결정론이며 LLM을 쓰지 않는다. 주문·매수 행동을 유도하지 않고(CLAUDE.md 절대
원칙 1·9), 이미 충족된 항목을 미충족으로 표시하지 않는다(docs/skills.md S9 제약).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.evidence_orchestrator import ClaimResult
from app.services.verdict_aggregator import Verdict

CHECKLIST_GENERATOR_VERSION = "s9-checklist-generator-1.0.0"

# 확인이 필요한 verdict만 체크리스트 항목이 된다. SUPPORTED는 확정이므로
# (상충이 없으면) 항목을 만들지 않는다 — 충족을 미충족으로 표시하지 않는다.
_NEEDS_REVIEW: frozenset[Verdict] = frozenset(
    {
        Verdict.REFUTED,
        Verdict.PARTIALLY_SUPPORTED,
        Verdict.INSUFFICIENT_EVIDENCE,
        Verdict.UNVERIFIABLE,
    }
)

_STATUS_BY_VERDICT: dict[Verdict, str] = {
    Verdict.REFUTED: "REVIEW_REFUTED",
    Verdict.PARTIALLY_SUPPORTED: "REVIEW_PARTIAL",
    Verdict.INSUFFICIENT_EVIDENCE: "NEEDS_MORE_EVIDENCE",
    Verdict.UNVERIFIABLE: "CANNOT_VERIFY",
}


@dataclass(frozen=True)
class ChecklistItem:
    item: str
    related_claim_ids: tuple[str, ...]
    status: str
    source_links: tuple[str, ...] = field(default_factory=tuple)
    generator_version: str = CHECKLIST_GENERATOR_VERSION


def _missing_text(result: ClaimResult) -> str | None:
    if not result.missing_fields:
        return None
    return "부족한 근거: " + ", ".join(result.missing_fields)


def generate_checklist(
    claim_results: list[ClaimResult],
    citation_urls: dict[str, str] | None = None,
) -> list[ChecklistItem]:
    """`citation_urls`는 evidence_id -> canonical URL(원문 이동 링크)."""
    citation_urls = citation_urls or {}
    items: list[ChecklistItem] = []
    for result in claim_results:
        verdict = Verdict(result.verdict)
        links = tuple(
            citation_urls[eid] for eid in result.verified_citation_ids if eid in citation_urls
        )

        # 상충 근거는 verdict와 무관하게 항상 확인 항목으로 만든다.
        if result.conflicts:
            items.append(
                ChecklistItem(
                    item="지지 근거와 반증 근거가 함께 발견됨 — 원문을 직접 확인하세요",
                    related_claim_ids=(result.claim_id,),
                    status="REVIEW_CONFLICT",
                    source_links=links,
                )
            )

        if verdict not in _NEEDS_REVIEW:
            continue

        parts: list[str] = [f"판정: {verdict.value}"]
        if result.reason_code and result.reason_code not in ("OK", ""):
            parts.append(f"사유: {result.reason_code}")
        missing = _missing_text(result)
        if missing:
            parts.append(missing)
        items.append(
            ChecklistItem(
                item=" / ".join(parts),
                related_claim_ids=(result.claim_id,),
                status=_STATUS_BY_VERDICT[verdict],
                source_links=links,
            )
        )
    return items
