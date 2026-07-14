"""S15 시점·단위 정합성 계층 (docs/skills.md S15, I4). 모든 원천(S2/S13/S14)의
raw record는 계산 전에 `pre_normalize`를, 모든 파생 Fact/Evidence(S3/S5/S21)는
노출 전에 `post_derived`를 통과해야 한다.

T02·T03에서는 이 스킬이 아직 없어 `filed_at <= as_of`/`trade_date <= as_of` 같은
미래 데이터 차단만 각 collector 안에 임시로 심어 두었다(disclosure_collector.py·
market_collector.py 주석 "T04(S15) 선행 의존" 참고) — 이 모듈이 그 임시 규칙을
대체하는 중앙 구현이며, 두 collector는 이제 이 모듈을 호출한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

PRE_NORMALIZE_POLICY_VERSION = "s15-pre-normalize-1.0.0"
POST_DERIVED_POLICY_VERSION = "s15-post-derived-1.0.0"


@dataclass(frozen=True)
class TemporalCandidate:
    """S2/S13/S14가 자기 raw record에서 뽑아내는 최소 typed 요약 — S15는 provider별
    payload shape을 몰라도 되도록 이 공통 shape만 본다."""

    record_id: str
    effective_date: date
    source_type: str  # "disclosure" | "market" | "external"
    is_correction: bool = False
    is_provisional: bool = False
    corp_code: str | None = None


@dataclass(frozen=True)
class PreNormalizeResult:
    eligible: list[TemporalCandidate] = field(default_factory=list)
    rejected: list[TemporalCandidate] = field(default_factory=list)
    integrity_log: list[str] = field(default_factory=list)
    temporal_warnings: list[str] = field(default_factory=list)
    normalization_policy: str = PRE_NORMALIZE_POLICY_VERSION


def pre_normalize(candidates: list[TemporalCandidate], as_of: date) -> PreNormalizeResult:
    """미래 데이터 차단(I4) — `effective_date > as_of`인 candidate는 전부 제외한다.
    정정 chain 최신본 선택·CFS/OFS 선택 등 도메인별 정책은 이 함수가 아니라
    `resolve_provisional_confirmed`/`app/services/financial_calculator.py`가 맡는다
    (다른 도메인 payload shape을 이 함수가 알 필요가 없도록 관심사를 분리)."""
    eligible: list[TemporalCandidate] = []
    rejected: list[TemporalCandidate] = []
    log: list[str] = []
    for candidate in candidates:
        if candidate.effective_date > as_of:
            rejected.append(candidate)
            log.append(
                f"{candidate.record_id}: effective_date {candidate.effective_date} "
                f"> as_of {as_of}, excluded"
            )
        else:
            eligible.append(candidate)
            log.append(f"{candidate.record_id}: eligible")
    return PreNormalizeResult(eligible=eligible, rejected=rejected, integrity_log=log)


def resolve_provisional_confirmed(
    candidates_by_period: dict[str, list[TemporalCandidate]],
) -> list[str]:
    """잠정·확정 실적 구분·우선순위·충돌 표시(checklist C4). 같은 기간에 확정치가
    있으면 항상 확정이 우선이며, 잠정만 있으면 그대로 쓴다 — 어느 쪽이든 호출자가
    이 결과를 보고 실제 어떤 candidate를 쓸지 정하고, 이 함수는 충돌을 숨기지 않고
    warning으로 드러내기만 한다."""
    warnings: list[str] = []
    for period, group in candidates_by_period.items():
        has_provisional = any(c.is_provisional for c in group)
        has_confirmed = any(not c.is_provisional for c in group)
        if has_provisional and has_confirmed:
            warnings.append(f"{period}: 잠정·확정 실적 충돌 — 확정치를 우선 사용")
    return warnings


@dataclass(frozen=True)
class DerivedCheckInput:
    """S3/S5/S21이 만든 파생 Fact/NumericEvidence/Evidence 1건에 대해 S15가
    재검증할 수 있도록 호출자가 채워 넣는 typed 요약."""

    record_id: str
    corp_code: str
    source_ids: list[str]
    source_corp_codes: list[str]
    unit: str
    source_units: list[str]
    as_of: date
    source_as_of: list[date]
    formula_version: str
    target_period: str
    source_periods: list[str]


@dataclass(frozen=True)
class PostDerivedResult:
    verified: list[str] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)
    integrity_log: list[str] = field(default_factory=list)
    normalization_policy: str = POST_DERIVED_POLICY_VERSION


def post_derived(inputs: list[DerivedCheckInput], as_of: date) -> PostDerivedResult:
    """계산 입력 provenance·공식·기업·기간·단위·기준시점 일치와 원천 연결을
    재검증한다(docs/skills.md S15 처리). 같은 계산 안에서 서로 다른 기업·기간·단위가
    섞이거나 provenance가 비어 있으면 그 파생 레코드는 거부한다 — 숨기지 않는다."""
    verified: list[str] = []
    rejected: list[str] = []
    log: list[str] = []
    for item in inputs:
        problems: list[str] = []
        if not item.source_ids:
            problems.append("source_ids 비어 있음(provenance 없음)")
        if not item.formula_version:
            problems.append("formula_version 없음")
        # source_ids가 있어도 나머지 원천 메타데이터(기업·단위·기간)가 비어
        # 있거나 개수가 어긋나면 그 배열들이 무엇을 가리키는지 알 수 없다 —
        # 아래의 기업·기간·단위 검사는 "존재하는 원소끼리 서로 다른가"만 보므로,
        # 개수 자체가 안 맞는 경우는 이 검사가 없으면 조용히 통과한다. 단
        # source_as_of는 예외다 — financial_facts.py가 fact 기준일 외에 시세·
        # 발행주식 수처럼 자체 source_id가 없는 시장 데이터 기준일도 같은
        # 배열에 얹기 때문에(`source_as_of = fact_as_of + shares_as_of + ...`)
        # source_ids보다 원소가 더 많을 수 있다 — 그래서 "이상"만 요구한다.
        mismatched_lengths: list[str] = []
        if len(item.source_corp_codes) != len(item.source_ids):
            mismatched_lengths.append(f"source_corp_codes={len(item.source_corp_codes)}")
        if len(item.source_units) != len(item.source_ids):
            mismatched_lengths.append(f"source_units={len(item.source_units)}")
        if len(item.source_periods) != len(item.source_ids):
            mismatched_lengths.append(f"source_periods={len(item.source_periods)}")
        if len(item.source_as_of) < len(item.source_ids):
            mismatched_lengths.append(f"source_as_of={len(item.source_as_of)}")
        if mismatched_lengths:
            problems.append(
                f"source metadata 배열 개수가 source_ids({len(item.source_ids)})와 "
                "맞지 않음: " + ", ".join(mismatched_lengths)
            )
        mismatched_corp = sorted({c for c in item.source_corp_codes if c != item.corp_code})
        if mismatched_corp:
            problems.append(f"source corp_code 불일치: {mismatched_corp}")
        mismatched_period = sorted({p for p in item.source_periods if p != item.target_period})
        if mismatched_period:
            problems.append(
                f"source fiscal_period 불일치(target={item.target_period}): {mismatched_period}"
            )
        # 입력들끼리 서로 다른 단위를 섞어 계산했는지만 본다 — 파생 결과 자체의
        # 단위(예: RATIO)는 입력 단위(예: KRW)와 원래 다를 수 있으므로 비교 대상이
        # 아니다(예: ROE = 순이익(KRW) / 자본총계(KRW) → 결과는 RATIO).
        distinct_source_units = sorted(set(item.source_units))
        if len(distinct_source_units) > 1:
            problems.append(f"source unit 서로 불일치: {distinct_source_units}")
        future_sources = sorted({d for d in item.source_as_of if d > item.as_of})
        if future_sources:
            problems.append(f"source as_of가 record as_of보다 미래: {future_sources}")
        if item.as_of > as_of:
            problems.append(f"record as_of {item.as_of} > 요청 as_of {as_of}")
        if problems:
            rejected.append(item.record_id)
            log.append(f"{item.record_id}: REJECTED — {'; '.join(problems)}")
        else:
            verified.append(item.record_id)
            log.append(f"{item.record_id}: verified")
    return PostDerivedResult(verified=verified, rejected=rejected, integrity_log=log)
