from datetime import date

from pydantic import BaseModel

from app.schemas.structured_claim import StructuredClaim


class ExtractClaimsRequest(BaseModel):
    text: str
    as_of: date
    # S1이 이미 확정한 기업 — S7은 기업을 스스로 추론하지 않는다(파이프라인
    # S1 -> S7, docs/skills.md). None이면 모든 후보 Claim이 드롭된다.
    resolved_company: dict[str, str] | None = None


class ExtractClaimsPayload(BaseModel):
    claims: list[StructuredClaim]
    warnings: list[str]
    extraction_trace: list[str]


class VerifyClaimsRequest(BaseModel):
    claims: list[StructuredClaim]
    # S3/S13/S14 NORMALIZE + S15 POST_DERIVED를 이미 통과한 NumericEvidence다
    # (docs/skills.md S16 입력 계약) — 이 라우터는 재검증하지 않고 소비만 한다.
    numeric_evidence: list[dict[str, object]]
    # comparator.op=CONTINUITY인 Claim에만 필요 — claim_id -> 검사할 연속 기간
    # 순서 목록(docs/skills.md S16 "기간 산술은 호출자 책임").
    period_sequences: dict[str, list[str]] = {}
    # F9 확인 질문에 대한 사용자 응답 — claim_id -> 답했는지(True/False).
    user_confirmation_answers: dict[str, bool] = {}


class AtomicVerdictPayload(BaseModel):
    claim_id: str
    verdict: str
    reason_code: str
    calculation: dict[str, object] | None
    used_evidence_ids: list[str]
    missing_fields: list[str]


class DisclosureItemPayload(BaseModel):
    claim_id: str
    mode: str
    ambiguity_flags: list[str]


class VerifyClaimsPayload(BaseModel):
    atomic_results: list[AtomicVerdictPayload]
    # claim_group_id(없으면 claim_id 자신) -> 그룹 verdict.
    group_results: dict[str, str]
    disclosure: list[DisclosureItemPayload]
