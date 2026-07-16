"""S21 비교군 구성·비교 (docs/skills.md S21, I8). 대상 기업과 KRX 업종·사업·재무
metadata가 유사한 peer universe를 구성하고 상대 지표 통계를 계산한다.

입력은 이미 S1(기업개황)·S3(재무 지표)·S13(시세)이 만든 정규화된 `CompanyProfile`
목록이다 — S21은 raw provider를 직접 호출하지 않는다(docs/skills.md S21 입력
계약 "가용 사업·재무 metadata", 공통 원칙 6 "정합성 우선"과 일치하도록 이미
정규화된 값만 결합·통계낸다). peer universe 구성·통계의 유일한 소유자이며
S5는 이 결과만 소비한다(docs/skills.md S5 제약).

업종 포함 규칙: OpenDART 기업개황의 `induty_code`(업종코드) 앞 2자리(KSIC 대분류)가
같은 기업만 후보로 포함한다. 4자리 전체 일치는 실제 데이터로 확인한 결과
(T09, 2026-07-15 라이브 캡처) 지나치게 좁아 동일 산업 대기업 사이에서도 거의
항상 peer 0건이 된다 — 예: 삼성전자(264)·SK하이닉스(2612)·DB하이텍(2611)·
삼성전기(2622)는 4자리 기준 전부 다르지만 2자리("26", 전자부품·컴퓨터·영상·
음향 및 통신장비 제조업)는 동일하다. **한계(문서화)**: 이 프로젝트는 KRX
자체의 공식 업종분류 API(data.go.kr/KRX, T03 C3 마지막 항목 BLOCKED)에 접근할
자격증명이 없어 OpenDART 기업개황의 업종코드를 대체 소스로 쓴다 — 완전히
동일한 것은 아니며, KRX 공식 API가 발급되면 교체한다.
"""

from __future__ import annotations

import statistics
import uuid
from dataclasses import dataclass, field
from datetime import date

PEER_UNIVERSE_VERSION = "s21-peer-universe-1.0.0"

# KSIC 대분류(2자리)까지만 일치를 요구한다 — 위 docstring 근거.
_INDUSTRY_MATCH_DIGITS = 2

# 표본 수 품질 기준 — 이 미만이면 비교 Claim을 UNVERIFIABLE로 처리한다
# (docs/skills.md S21 제약, docs/checklist.md C6 "peer 품질 기준 미달").
MIN_PEER_SAMPLE_SIZE = 3


@dataclass(frozen=True)
class CompanyProfile:
    """S1(기업개황)+S3(재무 지표)+S13(시세)이 이미 정규화한 대상·후보 기업의
    비교 가능 프로필. `per`/`pbr`/`roe`/`eps`/`bps`는 S3 `compute_ratios()`가
    계산한 값을 그대로 받는다(이 모듈이 재계산하지 않는다)."""

    corp_code: str
    corp_name: str
    stock_code: str
    industry_code: str
    eps: float | None
    bps: float | None
    per: float | None
    pbr: float | None
    roe: float | None
    price: float
    price_as_of: date
    financial_as_of: date
    # S15.POST_DERIVED를 통과한 S3 ratio evidence(metric -> numeric_evidence
    # dict, `ratios_to_numeric_evidence()`와 동일 shape). S5가 target.EPS/BPS/
    # ROE를 쓰는 evidence를 만들 때 이 provenance를 그대로 참조한다 — 필요한
    # metric이 없으면(과거 호출부·테스트처럼 비어 있으면) S5는 그 evidence를
    # 검증 실패로 처리한다(target 컴포넌트를 조용히 생략하지 않는다, GPT 리뷰
    # 2026-07-16 21:14 발견).
    ratio_evidence: dict[str, dict[str, object]] = field(default_factory=dict)
    # ratio_evidence의 모든 항목이 어떤 fiscal period(예: "2024-ANNUAL")로
    # 계산됐는지 — S5가 target component의 실제 target_period가 이 값과
    # 일치하는지 독립적으로 검증하는 기준이다(GPT 리뷰 2026-07-16 21:14 발견).
    financial_period: str = ""


@dataclass(frozen=True)
class Exclusion:
    corp_code: str
    corp_name: str
    reason_code: str
    detail: str


@dataclass(frozen=True)
class PeerStatistics:
    sample_size: int
    per_median: float | None
    per_p25: float | None
    per_p75: float | None
    pbr_median: float | None
    pbr_p25: float | None
    pbr_p75: float | None
    roe_median: float | None
    # metric별 유효 표본 수 — sample_size(PER 또는 PBR 중 하나만 있어도 카운트)와
    # 달리 각 지표를 실제로 뒷받침하는 peer 수다. S5가 metric별 최소 표본 수
    # 미달일 때 그 metric의 range를 만들지 않도록 하는 근거다(GPT 리뷰
    # 2026-07-16 11:00 발견 — sample_size만으로는 PER 표본 1개짜리 range도
    # "충분"으로 통과했다).
    per_sample_size: int = 0
    pbr_sample_size: int = 0
    roe_sample_size: int = 0
    # metric별로 실제 계산에 쓰인 peer의 corp_code — 전체 peer_universe와 다를 수
    # 있다(예: peer 4개 중 PER 유효는 3개). numeric evidence의 source_ids와
    # assumptions의 표본 수는 반드시 이 목록을 출처로 써야 한다(GPT 리뷰
    # 2026-07-16 11:30 발견 — 이전에는 전체 peer_universe를 그대로 source_ids로
    # 싣고 assumptions도 sample_size로 표시해, PER range가 실제로 3개 peer로
    # 계산됐는데도 provenance는 4개로 보였다).
    per_source_ids: tuple[str, ...] = ()
    pbr_source_ids: tuple[str, ...] = ()
    roe_source_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class PeerUniverseResult:
    target_corp_code: str
    peer_universe: tuple[CompanyProfile, ...]
    exclusions: tuple[Exclusion, ...]
    statistics: PeerStatistics
    numeric_evidence: tuple[dict[str, object], ...]
    quality_score: float  # 0.0(미달)~1.0(충분), 표본 수 기반
    as_of: date
    sufficient: bool  # False면 비교 Claim UNVERIFIABLE(호출자 책임)
    rule_version: str = PEER_UNIVERSE_VERSION


def _industry_matches(target_code: str, candidate_code: str) -> bool:
    if not target_code or not candidate_code:
        return False
    return target_code[:_INDUSTRY_MATCH_DIGITS] == candidate_code[:_INDUSTRY_MATCH_DIGITS]


def _valid_for_comparison(candidate: CompanyProfile) -> bool:
    # 음수·0 자기자본이나 순이익은 PER/PBR이 통상적 의미를 갖지 않는다(S3
    # classify_sign_transition과 동일 원칙 — 정의되지 않은 비교를 임의로
    # 만들지 않는다). PER/PBR 둘 다 없으면 비교에 쓸 수 없다.
    has_valid_per = candidate.per is not None and candidate.per > 0
    has_valid_pbr = candidate.pbr is not None and candidate.pbr > 0
    return has_valid_per or has_valid_pbr


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    # 선형 보간(nearest-rank 아님) — statistics.quantiles와 동일 결과가 되도록
    # n=100 방식(inclusive) 사용, 표본이 극소수라도 결정론적으로 재현 가능.
    k = (len(ordered) - 1) * pct
    lower = int(k)
    upper = min(lower + 1, len(ordered) - 1)
    if lower == upper:
        return ordered[lower]
    fraction = k - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _numeric_evidence(
    metric: str, value: float, corp_code: str, as_of: date, source_ids: list[str]
) -> dict[str, object]:
    return {
        "numeric_evidence_id": str(uuid.uuid4()),
        "evidence_domain": "peer",
        "corp_code": corp_code,
        "metric": metric,
        "value": value,
        "unit": "RATIO",
        "target_period": as_of.isoformat(),
        "as_of": as_of.isoformat(),
        "formula": f"{metric} over peer universe (n={len(source_ids)})",
        "source_ids": source_ids,
        "provenance": {"rule_version": PEER_UNIVERSE_VERSION},
        "integrity_status": "VERIFIED",
    }


def build_peer_universe(
    target: CompanyProfile,
    candidates: list[CompanyProfile],
    as_of: date,
) -> PeerUniverseResult:
    peers: list[CompanyProfile] = []
    exclusions: list[Exclusion] = []

    for candidate in candidates:
        if candidate.corp_code == target.corp_code:
            exclusions.append(
                Exclusion(candidate.corp_code, candidate.corp_name, "IS_TARGET", "대상 기업 자신")
            )
            continue
        if not _industry_matches(target.industry_code, candidate.industry_code):
            exclusions.append(
                Exclusion(
                    candidate.corp_code,
                    candidate.corp_name,
                    "INDUSTRY_MISMATCH",
                    f"업종코드 불일치({candidate.industry_code} vs {target.industry_code})",
                )
            )
            continue
        if candidate.price_as_of != as_of or candidate.financial_as_of > as_of:
            exclusions.append(
                Exclusion(
                    candidate.corp_code,
                    candidate.corp_name,
                    "AS_OF_MISMATCH",
                    "기준일 불일치 — 정합성 우선(CLAUDE.md 절대 원칙 6)",
                )
            )
            continue
        if not _valid_for_comparison(candidate):
            exclusions.append(
                Exclusion(
                    candidate.corp_code,
                    candidate.corp_name,
                    "INVALID_RATIO",
                    "PER/PBR 계산 불가(음수·0 자기자본 또는 순이익)",
                )
            )
            continue
        peers.append(candidate)

    per_pairs = [(p.corp_code, p.per) for p in peers if p.per is not None and p.per > 0]
    pbr_pairs = [(p.corp_code, p.pbr) for p in peers if p.pbr is not None and p.pbr > 0]
    roe_pairs = [(p.corp_code, p.roe) for p in peers if p.roe is not None]
    per_values = [v for _, v in per_pairs]
    pbr_values = [v for _, v in pbr_pairs]
    roe_values = [v for _, v in roe_pairs]
    per_source_ids = tuple(cid for cid, _ in per_pairs)
    pbr_source_ids = tuple(cid for cid, _ in pbr_pairs)
    roe_source_ids = tuple(cid for cid, _ in roe_pairs)

    stats = PeerStatistics(
        sample_size=len(peers),
        per_median=statistics.median(per_values) if per_values else None,
        per_p25=_percentile(per_values, 0.25),
        per_p75=_percentile(per_values, 0.75),
        pbr_median=statistics.median(pbr_values) if pbr_values else None,
        pbr_p25=_percentile(pbr_values, 0.25),
        pbr_p75=_percentile(pbr_values, 0.75),
        roe_median=statistics.median(roe_values) if roe_values else None,
        per_sample_size=len(per_values),
        pbr_sample_size=len(pbr_values),
        roe_sample_size=len(roe_values),
        per_source_ids=per_source_ids,
        pbr_source_ids=pbr_source_ids,
        roe_source_ids=roe_source_ids,
    )

    numeric_evidence: list[dict[str, object]] = []
    if stats.per_median is not None:
        numeric_evidence.append(
            _numeric_evidence(
                "PEER_PER_MEDIAN", stats.per_median, target.corp_code, as_of, list(per_source_ids)
            )
        )
    if stats.pbr_median is not None:
        numeric_evidence.append(
            _numeric_evidence(
                "PEER_PBR_MEDIAN", stats.pbr_median, target.corp_code, as_of, list(pbr_source_ids)
            )
        )

    sufficient = len(peers) >= MIN_PEER_SAMPLE_SIZE
    quality_score = min(1.0, len(peers) / MIN_PEER_SAMPLE_SIZE) if MIN_PEER_SAMPLE_SIZE else 0.0

    return PeerUniverseResult(
        target_corp_code=target.corp_code,
        peer_universe=tuple(peers),
        exclusions=tuple(exclusions),
        statistics=stats,
        numeric_evidence=tuple(numeric_evidence),
        quality_score=quality_score,
        as_of=as_of,
        sufficient=sufficient,
    )
