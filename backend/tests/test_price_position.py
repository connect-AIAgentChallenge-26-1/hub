"""S6 가격 위치 설명 테스트 (docs/checklist.md C6): BELOW/WITHIN/ABOVE/INSUFFICIENT,
추천·단정 표현 0건, 실제 삼성전자·peer 데이터로 검증."""

from __future__ import annotations

from datetime import date

from app.services.peer_universe import CompanyProfile, build_peer_universe
from app.services.price_position import (
    ABOVE_MODEL_RANGE,
    BELOW_MODEL_RANGE,
    INSUFFICIENT,
    PRICE_POSITION_VERSION,
    WITHIN_MODEL_RANGE,
    compute_price_position,
)
from app.services.valuation_scenarios import compute_valuation_scenarios

AS_OF = date(2026, 7, 15)

_FORBIDDEN_PHRASES = ("매수 가능", "관망", "분할매수", "보류", "매수하세요", "매도하세요")


def _profile(
    corp_code: str,
    name: str,
    stock: str,
    industry: str,
    equity: float,
    net_income: float,
    shares: float,
    price: float,
) -> CompanyProfile:
    eps = net_income / shares
    bps = equity / shares
    per = price / eps if eps else None
    pbr = price / bps if bps else None
    roe = net_income / equity if equity else None
    return CompanyProfile(
        corp_code, name, stock, industry, eps, bps, per, pbr, roe, price, AS_OF, AS_OF
    )


def _peers() -> list[CompanyProfile]:
    return [
        _profile(
            "00164779", "SK하이닉스", "000660", "2612",
            73_915_704_000_000, 19_796_902_000_000, 712_702_365, 2_082_000,
        ),
        _profile(
            "00160843", "DB하이텍", "000990", "2611",
            2_000_688_804_317, 229_385_888_355, 43_504_588, 120_800,
        ),
        _profile(
            "00126371", "삼성전기", "009150", "2622",
            9_015_854_031_770, 703_215_637_082, 74_693_696, 1_413_000,
        ),
    ]


def _target(price: float) -> CompanyProfile:
    return _profile(
        "00126380", "삼성전자", "005930", "264",
        402_192_070_000_000, 34_451_351_000_000, 5_846_278_608, price,
    )


def test_real_samsung_price_is_below_peer_relative_range() -> None:
    # 실제 262,500원은 세 방법 모두에서 peer 대비 낮은 범위(BELOW)로 나온다
    # (2026-07-15 라이브 데이터, 반도체 peer가 고밸류에이션 구간).
    target = _target(262_500)
    peers = build_peer_universe(target, _peers(), AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(target.price, valuation, AS_OF)
    assert position.overall_position == BELOW_MODEL_RANGE
    assert all(mp.position == BELOW_MODEL_RANGE for mp in position.method_positions)
    assert position.rule_version == PRICE_POSITION_VERSION


def test_price_within_all_method_ranges() -> None:
    target = _target(600_000)  # PER/PBR/ROE조정PBR 범위 내부에 들어오는 값
    peers = build_peer_universe(target, _peers(), AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(target.price, valuation, AS_OF)
    assert position.overall_position == WITHIN_MODEL_RANGE


def test_price_above_all_method_ranges() -> None:
    target = _target(5_000_000)
    peers = build_peer_universe(target, _peers(), AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(target.price, valuation, AS_OF)
    assert position.overall_position == ABOVE_MODEL_RANGE
    assert all(mp.position == ABOVE_MODEL_RANGE for mp in position.method_positions)


def test_insufficient_peers_yields_insufficient_position() -> None:
    target = _target(262_500)
    peers = build_peer_universe(target, _peers()[:1], AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(target.price, valuation, AS_OF)
    assert position.overall_position == INSUFFICIENT
    assert position.method_positions == ()


def test_missing_price_yields_insufficient() -> None:
    target = _target(262_500)
    peers = build_peer_universe(target, _peers(), AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(None, valuation, AS_OF)
    assert position.overall_position == INSUFFICIENT


def test_no_forbidden_action_phrases_anywhere() -> None:
    target = _target(600_000)
    peers = build_peer_universe(target, _peers(), AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(target.price, valuation, AS_OF)
    text = position.overall_position + position.sensitivity + position.assumptions
    for mp in position.method_positions:
        text += mp.position
    for phrase in _FORBIDDEN_PHRASES:
        assert phrase not in text


def test_method_disagreement_is_not_hidden() -> None:
    # 방법 간 위치가 갈리면 결합 범위 설명에 그 사실을 남긴다(숨기지 않음).
    target = _target(700_000)  # PER 범위 상단 근처, PBR/ROE조정 범위와는 다를 수 있음
    peers = build_peer_universe(target, _peers(), AS_OF)
    valuation = compute_valuation_scenarios(target, peers, AS_OF)
    position = compute_price_position(target.price, valuation, AS_OF)
    positions = {mp.position for mp in position.method_positions}
    if len(positions) > 1:
        assert "다름" in position.sensitivity
