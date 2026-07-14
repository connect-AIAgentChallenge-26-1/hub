from fastapi import APIRouter, Depends, Request

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.envelope import Envelope, Status, now_utc
from app.schemas.temporal_integrity import (
    PostDerivedCheckInput,
    PostDerivedPayload,
    PostDerivedRequest,
    PreNormalizeCandidateInput,
    PreNormalizePayload,
    PreNormalizeRequest,
    TemporalIntegrityRequest,
)
from app.services.temporal_integrity import (
    DerivedCheckInput,
    TemporalCandidate,
    post_derived,
    pre_normalize,
)

router = APIRouter(prefix="/api/v1/temporal-integrity", tags=["temporal-integrity"])


def _envelope[T](request: Request, data: T) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        source_ids=[],
        model_or_rule_version="s15-temporal-integrity-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


def _to_candidate(item: PreNormalizeCandidateInput) -> TemporalCandidate:
    return TemporalCandidate(
        record_id=item.record_id,
        effective_date=item.effective_date,
        source_type=item.source_type,
        is_correction=item.is_correction,
        is_provisional=item.is_provisional,
        corp_code=item.corp_code,
    )


def _to_derived_check(item: PostDerivedCheckInput) -> DerivedCheckInput:
    return DerivedCheckInput(
        record_id=item.record_id,
        corp_code=item.corp_code,
        source_ids=item.source_ids,
        source_corp_codes=item.source_corp_codes,
        unit=item.unit,
        source_units=item.source_units,
        as_of=item.as_of,
        source_as_of=item.source_as_of,
        formula_version=item.formula_version,
        target_period=item.target_period,
        source_periods=item.source_periods,
    )


@router.post("", response_model=Envelope[PreNormalizePayload | PostDerivedPayload])
def pre_normalize_or_post_derived(
    body: TemporalIntegrityRequest,
    request: Request,
    _current_user: User = Depends(get_current_user),
) -> Envelope[PreNormalizePayload | PostDerivedPayload]:
    if isinstance(body, PreNormalizeRequest):
        pre_result = pre_normalize([_to_candidate(c) for c in body.candidates], body.as_of)
        payload: PreNormalizePayload | PostDerivedPayload = PreNormalizePayload(
            eligible_record_ids=[c.record_id for c in pre_result.eligible],
            rejected_record_ids=[c.record_id for c in pre_result.rejected],
            normalization_policy=pre_result.normalization_policy,
            integrity_log=pre_result.integrity_log,
            temporal_warnings=pre_result.temporal_warnings,
        )
    else:
        assert isinstance(body, PostDerivedRequest)
        post_result = post_derived(
            [_to_derived_check(c) for c in body.derived_checks], body.as_of
        )
        payload = PostDerivedPayload(
            verified_record_ids=post_result.verified,
            rejected_record_ids=post_result.rejected,
            normalization_policy=post_result.normalization_policy,
            integrity_log=post_result.integrity_log,
        )
    return _envelope(request, payload)
