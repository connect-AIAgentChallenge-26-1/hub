"""S6 가격 위치 설명 (docs/skills.md S6). 현재가가 S5가 계산한 범위의 어느
위치인지 사실적으로만 설명한다 — `매수 가능`·`관망`·`분할매수`·`보류` 같은
행동 지시를 출력하지 않는다(docs/skills.md S6 제약, CLAUDE.md 절대 원칙 1).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.valuation_scenarios import ValuationResult, ValueRange

PRICE_POSITION_VERSION = "s6-price-position-1.0.0"

BELOW_MODEL_RANGE = "BELOW_MODEL_RANGE"
WITHIN_MODEL_RANGE = "WITHIN_MODEL_RANGE"
ABOVE_MODEL_RANGE = "ABOVE_MODEL_RANGE"
INSUFFICIENT = "INSUFFICIENT"


@dataclass(frozen=True)
class MethodPosition:
    method: str
    position: str
    distance_pct: float | None  # 범위 경계까지 거리(%, 범위 내부면 상/하단 중 가까운 쪽까지)


@dataclass(frozen=True)
class PricePosition:
    corp_code: str
    price: float
    as_of: date
    overall_position: str
    method_positions: tuple[MethodPosition, ...]
    sensitivity: str
    assumptions: str
    rule_version: str = PRICE_POSITION_VERSION


def _position_for_range(price: float, value_range: ValueRange) -> MethodPosition:
    if price < value_range.low:
        distance = (value_range.low - price) / value_range.low * 100 if value_range.low else None
        return MethodPosition(value_range.method, BELOW_MODEL_RANGE, distance)
    if price > value_range.high:
        distance = (
            (price - value_range.high) / value_range.high * 100 if value_range.high else None
        )
        return MethodPosition(value_range.method, ABOVE_MODEL_RANGE, distance)
    # 범위 내부 — 상/하단 중 더 가까운 쪽까지 거리.
    span = value_range.high - value_range.low
    if span == 0:
        distance = 0.0
    else:
        distance = min(price - value_range.low, value_range.high - price) / span * 100
    return MethodPosition(value_range.method, WITHIN_MODEL_RANGE, distance)


def compute_price_position(
    price: float | None,
    valuation: ValuationResult,
    as_of: date,
) -> PricePosition:
    if price is None or valuation.data_quality != "SUFFICIENT" or not valuation.value_ranges:
        return PricePosition(
            corp_code=valuation.corp_code,
            price=price or 0.0,
            as_of=as_of,
            overall_position=INSUFFICIENT,
            method_positions=(),
            sensitivity="",
            assumptions=f"data_quality={valuation.data_quality}",
        )

    method_positions = tuple(_position_for_range(price, r) for r in valuation.value_ranges)

    # 종합 위치 — 모든 방법의 범위를 합쳐(하단 최솟값~상단 최댓값) 보수적으로
    # 판단한다: 한 방법이라도 범위 안이면 WITHIN, 전부 아래면 BELOW, 전부
    # 위면 ABOVE(방법 간 불일치를 숨기지 않고 method_positions로 그대로 노출).
    overall_low = min(r.low for r in valuation.value_ranges)
    overall_high = max(r.high for r in valuation.value_ranges)
    if price < overall_low:
        overall = BELOW_MODEL_RANGE
    elif price > overall_high:
        overall = ABOVE_MODEL_RANGE
    else:
        overall = WITHIN_MODEL_RANGE

    disagreement = len({mp.position for mp in method_positions}) > 1
    sensitivity = (
        f"방법별 결합 범위 [{overall_low:.0f}, {overall_high:.0f}]"
        + (" — 방법 간 위치 판정이 다름(아래 방법별 결과 참고)" if disagreement else "")
    )

    return PricePosition(
        corp_code=valuation.corp_code,
        price=price,
        as_of=as_of,
        overall_position=overall,
        method_positions=method_positions,
        sensitivity=sensitivity,
        assumptions="종합 위치는 방법별 범위의 최솟값~최댓값을 합쳐 판단(보수적 결합)",
    )
