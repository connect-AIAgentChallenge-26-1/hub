"""S7·S16·S17 라우터 (docs/skills.md). S8(근거 검색·반증·재검색 루프)은
S18~S20이 없는 T07 이전 범위라, `/verify`는 호출자가 이미 확보한(S3/S13/S14
NORMALIZE + S15 POST_DERIVED를 통과한) `numeric_evidence`를 그대로 검산
입력으로 받는다 — RAG 없이 순수 결정론 검산만 수행한다."""

from typing import Any

from fastapi import APIRouter, Depends, Request

from app.dependencies import get_current_user, get_solar_provider
from app.models.user import User
from app.providers.solar import SolarProvider
from app.schemas.claim import (
    AtomicVerdictPayload,
    DisclosureItemPayload,
    ExtractClaimsPayload,
    ExtractClaimsRequest,
    VerifyClaimsPayload,
    VerifyClaimsRequest,
)
from app.schemas.envelope import Envelope, Status, now_utc
from app.services.claim_disclosure import classify_disclosure, resolved_claim_ids
from app.services.deterministic_verifier import (
    AtomicVerdictResult,
    verify_atomic,
    verify_group,
)
from app.services.structured_claim_extractor import claim_extraction_json_schema, extract
from app.services.verdict_aggregator import Verdict

router = APIRouter(prefix="/api/v1/claims", tags=["claims"])


def _envelope[T](
    request: Request, data: T, model_or_rule_version: str, warnings: list[str] | None = None
) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version=model_or_rule_version,
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


@router.post("/extract", response_model=Envelope[ExtractClaimsPayload])
def extract_claims(
    body: ExtractClaimsRequest,
    request: Request,
    _current_user: User = Depends(get_current_user),
    solar: SolarProvider = Depends(get_solar_provider),
) -> Envelope[ExtractClaimsPayload]:
    schema = claim_extraction_json_schema()

    def _complete(prompt: str) -> dict[str, Any]:
        # S23 sanitize_request()가 이미 system_instruction+untrusted block을
        # 하나로 렌더링했다(prompt) — Solar에는 이를 user 메시지로 보낸다.
        return solar.complete_structured_json(
            system_prompt="", user_prompt=prompt, json_schema=schema
        )

    result = extract(body.text, body.as_of, body.resolved_company, _complete)
    payload = ExtractClaimsPayload(
        claims=list(result.claims),
        warnings=list(result.warnings),
        extraction_trace=list(result.extraction_trace),
    )
    return _envelope(request, payload, "s7-structured-claim-extractor-1.0.0", list(result.warnings))


def _group_key(claim_id_to_group: dict[str, str | None], claim_id: str) -> str:
    return claim_id_to_group[claim_id] or claim_id


@router.post("/verify", response_model=Envelope[VerifyClaimsPayload])
def verify_claims(
    body: VerifyClaimsRequest,
    request: Request,
    _current_user: User = Depends(get_current_user),
) -> Envelope[VerifyClaimsPayload]:
    disclosure_items = classify_disclosure(body.claims)
    resolved_ids = resolved_claim_ids(body.claims, body.user_confirmation_answers)

    atomic_results: list[AtomicVerdictResult] = []
    for claim in body.claims:
        if claim.claim_id not in resolved_ids:
            # F9: 모호 항목에 대해 사용자가 답하지 않음 — S16을 거치지 않고
            # 곧장 UNVERIFIABLE(docs/skills.md S7 제약).
            atomic_results.append(
                AtomicVerdictResult(
                    claim_id=claim.claim_id,
                    verdict=Verdict.UNVERIFIABLE,
                    reason_code="AMBIGUITY_UNCONFIRMED",
                )
            )
            continue
        period_sequence = body.period_sequences.get(claim.claim_id)
        atomic_results.append(verify_atomic(claim, body.numeric_evidence, period_sequence))

    claim_id_to_group = {c.claim_id: c.claim_group_id for c in body.claims}
    grouped: dict[str, list[AtomicVerdictResult]] = {}
    for result in atomic_results:
        key = _group_key(claim_id_to_group, result.claim_id)
        grouped.setdefault(key, []).append(result)
    group_results = {key: verify_group(results).value for key, results in grouped.items()}

    payload = VerifyClaimsPayload(
        atomic_results=[
            AtomicVerdictPayload(
                claim_id=r.claim_id,
                verdict=r.verdict.value,
                reason_code=r.reason_code,
                calculation=(
                    {
                        "formula": r.calculation.formula,
                        "inputs": r.calculation.inputs,
                        "computed_value": r.calculation.computed_value,
                        "formula_version": r.calculation.formula_version,
                    }
                    if r.calculation
                    else None
                ),
                used_evidence_ids=list(r.used_evidence_ids),
                missing_fields=list(r.missing_fields),
            )
            for r in atomic_results
        ],
        group_results=group_results,
        disclosure=[
            DisclosureItemPayload(
                claim_id=d.claim_id, mode=d.mode.value, ambiguity_flags=list(d.ambiguity_flags)
            )
            for d in disclosure_items
        ],
    )
    return _envelope(request, payload, "s16-deterministic-verifier-1.0.0")
