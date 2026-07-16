"""S5 가치 시나리오 계산 (docs/skills.md S5). 여러 가정에 따른 가치 범위와
민감도를 계산한다. peer universe의 유일한 구성·통계 소유자는 S21이며 이
모듈은 그 결과만 소비한다(재계산·재구성하지 않는다, docs/skills.md S5 제약).

단일 목표가를 만들지 않는다 — 모든 방법이 항상 저·중·고 3점 범위(peer
P25/중앙값/P75 기반 민감도 밴드)를 반환하고, 방법을 하나로 뭉개지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.peer_universe import (
    MIN_PEER_SAMPLE_SIZE,
    CompanyProfile,
    PeerStatistics,
    PeerUniverseResult,
)

VALUATION_SCENARIOS_VERSION = "s5-valuation-scenarios-1.0.0"

PER_RELATIVE = "PER_RELATIVE"
PBR_RELATIVE = "PBR_RELATIVE"
ROE_ADJUSTED_PBR_RELATIVE = "ROE_ADJUSTED_PBR_RELATIVE"


@dataclass(frozen=True)
class ValueRange:
    method: str
    formula: str
    formula_version: str
    low: float
    mid: float
    high: float
    assumptions: str
    sensitivity_note: str


@dataclass(frozen=True)
class ValuationResult:
    corp_code: str
    as_of: date
    value_ranges: tuple[ValueRange, ...]
    numeric_evidence: tuple[dict[str, object], ...]
    peer_comparison_ref: str  # S21 결과 추적용(peer_universe_ref)
    data_quality: str  # "SUFFICIENT" | "INSUFFICIENT_PEERS" | "INSUFFICIENT_TARGET_DATA"
    rule_version: str = VALUATION_SCENARIOS_VERSION


def _per_relative(target: CompanyProfile, peers: PeerUniverseResult) -> ValueRange | None:
    stats = peers.statistics
    if target.eps is None or target.eps <= 0:
        return None
    if stats.per_p25 is None or stats.per_median is None or stats.per_p75 is None:
        return None
    # peer_universe의 sufficient는 PER 또는 PBR 중 하나만 있는 peer도 카운트하므로
    # PER 표본이 이 method의 최소 기준에 못 미칠 수 있다 — 이때 percentile이 전부
    # 같은 단일값이 되어(_percentile 표본 1개 시 low==mid==high) 사실상 단일
    # 목표가가 3점 range로 위장된다(GPT 리뷰 2026-07-16 11:00 발견). metric별
    # 최소 표본 수를 여기서 별도로 강제한다.
    if stats.per_sample_size < MIN_PEER_SAMPLE_SIZE:
        return None
    return ValueRange(
        method=PER_RELATIVE,
        formula="target.EPS × peer PER(P25/중앙값/P75)",
        formula_version=VALUATION_SCENARIOS_VERSION,
        low=round(target.eps * stats.per_p25, 2),
        mid=round(target.eps * stats.per_median, 2),
        high=round(target.eps * stats.per_p75, 2),
        assumptions=f"peer PER 분포(n={stats.per_sample_size}) 기반, target EPS={target.eps}",
        sensitivity_note="peer PER가 P25→P75로 변할 때 가치 범위가 그대로 비례 변동",
    )


def _pbr_relative(target: CompanyProfile, peers: PeerUniverseResult) -> ValueRange | None:
    stats = peers.statistics
    if target.bps is None or target.bps <= 0:
        return None
    if stats.pbr_p25 is None or stats.pbr_median is None or stats.pbr_p75 is None:
        return None
    if stats.pbr_sample_size < MIN_PEER_SAMPLE_SIZE:
        return None
    return ValueRange(
        method=PBR_RELATIVE,
        formula="target.BPS × peer PBR(P25/중앙값/P75)",
        formula_version=VALUATION_SCENARIOS_VERSION,
        low=round(target.bps * stats.pbr_p25, 2),
        mid=round(target.bps * stats.pbr_median, 2),
        high=round(target.bps * stats.pbr_p75, 2),
        assumptions=f"peer PBR 분포(n={stats.pbr_sample_size}) 기반, target BPS={target.bps}",
        sensitivity_note="peer PBR이 P25→P75로 변할 때 가치 범위가 그대로 비례 변동",
    )


def _roe_adjusted_pbr_relative(
    target: CompanyProfile, peers: PeerUniverseResult
) -> ValueRange | None:
    """정당화 PBR(Justified P/B)의 단순화 버전 — 자기자본비용(COE) 추정 소스가
    없어(임의 추정 금지) 완전한 Justified P/B(ROE/COE) 대신, peer 대비 target의
    ROE 상대 수준으로 peer PBR을 조정한다: target 정당 PBR ≈ peer PBR × (target
    ROE / peer ROE 중앙값). ROE가 peer보다 높으면 같은 자산가치라도 더 높은
    PBR을 받는 것이 합리적이라는 원칙만 반영한 단순화이며, 완전한 자본비용 모델이
    아님을 assumptions에 명시한다."""
    stats = peers.statistics
    if target.bps is None or target.bps <= 0 or target.roe is None or target.roe <= 0:
        return None
    if stats.roe_median is None or stats.roe_median <= 0:
        return None
    if stats.pbr_p25 is None or stats.pbr_median is None or stats.pbr_p75 is None:
        return None
    if stats.pbr_sample_size < MIN_PEER_SAMPLE_SIZE or stats.roe_sample_size < MIN_PEER_SAMPLE_SIZE:
        return None
    roe_ratio = target.roe / stats.roe_median
    return ValueRange(
        method=ROE_ADJUSTED_PBR_RELATIVE,
        formula="target.BPS × peer PBR(P25/중앙값/P75) × (target ROE / peer ROE 중앙값)",
        formula_version=VALUATION_SCENARIOS_VERSION,
        low=round(target.bps * stats.pbr_p25 * roe_ratio, 2),
        mid=round(target.bps * stats.pbr_median * roe_ratio, 2),
        high=round(target.bps * stats.pbr_p75 * roe_ratio, 2),
        assumptions=(
            f"단순화된 ROE 조정(완전한 자기자본비용 모델 아님) — "
            f"peer PBR 분포(n={stats.pbr_sample_size})·"
            f"peer ROE 분포(n={stats.roe_sample_size}) 기반, "
            f"target ROE={target.roe:.4f}, peer ROE 중앙값={stats.roe_median:.4f}"
        ),
        sensitivity_note="peer PBR 분포와 target/peer ROE 비율 두 축으로 함께 민감",
    )


def _source_ids_for_method(method: str, stats: PeerStatistics) -> tuple[str, ...]:
    # numeric evidence의 source_ids는 그 method가 실제로 값을 읽은 peer만
    # 가리켜야 한다 — 전체 peer_universe를 그대로 쓰면 metric별 유효 표본이
    # 적을 때 provenance가 실제 계산 출처와 달라진다(GPT 리뷰 2026-07-16 11:30
    # 발견). ROE_ADJUSTED_PBR_RELATIVE는 PBR 분포와 ROE 중앙값을 모두 쓰므로 두
    # 표본 집합의 합집합이다.
    if method == PER_RELATIVE:
        return stats.per_source_ids
    if method == PBR_RELATIVE:
        return stats.pbr_source_ids
    if method == ROE_ADJUSTED_PBR_RELATIVE:
        return tuple(sorted(set(stats.pbr_source_ids) | set(stats.roe_source_ids)))
    raise ValueError(f"unknown valuation method: {method}")


def compute_valuation_scenarios(
    target: CompanyProfile,
    peers: PeerUniverseResult,
    as_of: date,
) -> ValuationResult:
    if not peers.sufficient:
        return ValuationResult(
            corp_code=target.corp_code,
            as_of=as_of,
            value_ranges=(),
            numeric_evidence=(),
            peer_comparison_ref=f"peer-universe:{target.corp_code}:{as_of.isoformat()}",
            data_quality="INSUFFICIENT_PEERS",
        )

    ranges = [
        r
        for r in (
            _per_relative(target, peers),
            _pbr_relative(target, peers),
            _roe_adjusted_pbr_relative(target, peers),
        )
        if r is not None
    ]

    if not ranges:
        return ValuationResult(
            corp_code=target.corp_code,
            as_of=as_of,
            value_ranges=(),
            numeric_evidence=(),
            peer_comparison_ref=f"peer-universe:{target.corp_code}:{as_of.isoformat()}",
            data_quality="INSUFFICIENT_TARGET_DATA",
        )

    stats = peers.statistics
    numeric_evidence = tuple(
        {
            "numeric_evidence_id": f"{target.corp_code}-{r.method}-{as_of.isoformat()}",
            "evidence_domain": "valuation",
            "corp_code": target.corp_code,
            "metric": r.method,
            "value": r.mid,
            "unit": "KRW",
            "target_period": as_of.isoformat(),
            "as_of": as_of.isoformat(),
            "formula": r.formula,
            "source_ids": list(_source_ids_for_method(r.method, stats)),
            "provenance": {"formula_version": r.formula_version, "low": r.low, "high": r.high},
            "integrity_status": "VERIFIED",
        }
        for r in ranges
    )

    return ValuationResult(
        corp_code=target.corp_code,
        as_of=as_of,
        value_ranges=tuple(ranges),
        numeric_evidence=numeric_evidence,
        peer_comparison_ref=f"peer-universe:{target.corp_code}:{as_of.isoformat()}",
        data_quality="SUFFICIENT",
    )
