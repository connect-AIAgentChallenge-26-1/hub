"""F9 progressive disclosure — docs/skills.md S7 제약 "ambiguity_flags가
progressive disclosure의 판정 근거다": 비어 있으면 요약 카드로 자동 진행,
있으면 해당 항목만 객관식 확인 질문으로 묻는다. 사용자가 답하지 않으면 그
Claim은 UNVERIFIABLE로 처리한다. 모호성을 임의 기준으로 숨기지 않는다."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.schemas.structured_claim import StructuredClaim

CLAIM_DISCLOSURE_VERSION = "f9-claim-disclosure-1.0.0"


class DisclosureMode(str, Enum):
    AUTO_SUMMARY = "AUTO_SUMMARY"
    CONFIRM_QUESTION = "CONFIRM_QUESTION"


@dataclass(frozen=True)
class DisclosureItem:
    claim_id: str
    mode: DisclosureMode
    ambiguity_flags: tuple[str, ...] = field(default_factory=tuple)


def classify_disclosure(claims: list[StructuredClaim]) -> list[DisclosureItem]:
    """Claim마다 편집기를 열지(CONFIRM_QUESTION) 요약 카드로 바로 갈지
    (AUTO_SUMMARY) 결정한다. 판정 기준은 `ambiguity_flags` 존재 여부뿐이다 —
    다른 임의 기준으로 모호성을 숨기지 않는다."""
    return [
        DisclosureItem(
            claim_id=c.claim_id,
            mode=(
                DisclosureMode.CONFIRM_QUESTION
                if c.ambiguity_flags
                else DisclosureMode.AUTO_SUMMARY
            ),
            ambiguity_flags=tuple(c.ambiguity_flags),
        )
        for c in claims
    ]


def resolved_claim_ids(claims: list[StructuredClaim], answers: dict[str, bool]) -> set[str]:
    """확인 질문이 필요 없었던(ambiguity_flags 없음) Claim과, 필요했고 사용자가
    실제로 답한(`answers[claim_id] is True`) Claim의 id 집합을 반환한다. 이
    집합 밖의 Claim(질문이 필요했는데 답하지 않음)은 호출자가 S16을 거치지
    않고 곧장 `UNVERIFIABLE`로 처리해야 한다(docs/skills.md S7 제약) — 이
    함수는 어떤 Claim이 그 대상인지만 판정하며, verdict 자체는 내지 않는다
    (관심사 분리, 최종 verdict는 S16이 낸다)."""
    resolved: set[str] = set()
    for claim in claims:
        if not claim.ambiguity_flags:
            resolved.add(claim.claim_id)
            continue
        if answers.get(claim.claim_id) is True:
            resolved.add(claim.claim_id)
    return resolved
