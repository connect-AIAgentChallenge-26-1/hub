"""S5 가치 시나리오 계산 테스트 (docs/checklist.md C6). 실제 삼성전자·peer 3사
데이터로 3가지 방법(PER/PBR/ROE조정PBR)의 범위·민감도·rule version을 검증."""

from __future__ import annotations

from datetime import date
from typing import cast

from app.services.peer_universe import CompanyProfile, build_peer_universe
from app.services.valuation_scenarios import (
    PBR_RELATIVE,
    PER_RELATIVE,
    ROE_ADJUSTED_PBR_RELATIVE,
    VALUATION_SCENARIOS_VERSION,
    compute_valuation_scenarios,
)

AS_OF = date(2026, 7, 15)


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


def _target() -> CompanyProfile:
    return _profile(
        "00126380", "삼성전자", "005930", "264",
        402_192_070_000_000, 34_451_351_000_000, 5_846_278_608, 262_500,
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


def test_three_distinct_methods_with_explicit_formula_and_rule_version() -> None:
    target = _target()
    peer_result = build_peer_universe(target, _peers(), AS_OF)
    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    methods = {r.method for r in result.value_ranges}
    assert methods == {PER_RELATIVE, PBR_RELATIVE, ROE_ADJUSTED_PBR_RELATIVE}
    for r in result.value_ranges:
        assert r.formula
        assert r.formula_version == VALUATION_SCENARIOS_VERSION
        assert r.assumptions


def test_each_method_returns_a_range_not_a_single_price() -> None:
    target = _target()
    peer_result = build_peer_universe(target, _peers(), AS_OF)
    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    for r in result.value_ranges:
        assert r.low < r.mid < r.high, r.method


def test_sensitivity_band_uses_peer_percentiles() -> None:
    target = _target()
    peer_result = build_peer_universe(target, _peers(), AS_OF)
    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    per_range = next(r for r in result.value_ranges if r.method == PER_RELATIVE)
    stats = peer_result.statistics
    assert target.eps is not None
    assert stats.per_p25 is not None and stats.per_median is not None and stats.per_p75 is not None
    assert per_range.low == round(target.eps * stats.per_p25, 2)
    assert per_range.mid == round(target.eps * stats.per_median, 2)
    assert per_range.high == round(target.eps * stats.per_p75, 2)


def test_per_range_assumptions_and_evidence_source_ids_reflect_actual_per_sample() -> None:
    # peer 4개 중 PER 유효 3개/PBR 유효 4개인 입력에서 PER_RELATIVE의 assumptions와
    # numeric evidence source_ids는 전체 4개가 아니라 실제로 PER 계산에 쓰인 3개만
    # 반영해야 한다(GPT 리뷰 2026-07-16 11:30 발견 — 이전에는 stats.sample_size와
    # peers.peer_universe 전체를 그대로 써서 4로 보였다).
    target = _target()
    invalid_per_peer = _profile(
        "00999998", "무관회사PBR만", "999998", "264",
        1_000_000_000, -100_000_000, 1_000_000, 10_000,
    )
    peer_result = build_peer_universe(target, [*_peers(), invalid_per_peer], AS_OF)
    assert peer_result.statistics.sample_size == 4
    assert peer_result.statistics.per_sample_size == 3
    assert peer_result.statistics.pbr_sample_size == 4

    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    per_range = next(r for r in result.value_ranges if r.method == PER_RELATIVE)
    assert "n=3" in per_range.assumptions

    per_evidence = next(e for e in result.numeric_evidence if e["metric"] == PER_RELATIVE)
    per_source_ids = cast(list[str], per_evidence["source_ids"])
    assert len(per_source_ids) == 3
    assert invalid_per_peer.corp_code not in per_source_ids

    pbr_evidence = next(e for e in result.numeric_evidence if e["metric"] == PBR_RELATIVE)
    pbr_source_ids = cast(list[str], pbr_evidence["source_ids"])
    assert len(pbr_source_ids) == 4
    assert invalid_per_peer.corp_code in pbr_source_ids


def test_reproducible_same_input_same_output() -> None:
    target = _target()
    peer_result = build_peer_universe(target, _peers(), AS_OF)
    r1 = compute_valuation_scenarios(target, peer_result, AS_OF)
    r2 = compute_valuation_scenarios(target, peer_result, AS_OF)
    assert r1.value_ranges == r2.value_ranges


def test_per_range_not_produced_when_per_sample_size_is_below_minimum() -> None:
    # peer universe의 sufficient는 PER 또는 PBR 중 하나만 유효한 peer도 카운트해
    # peer 3개 중 PER 유효 표본이 1개뿐이어도 전체는 "충분"으로 판정될 수 있다.
    # 이때 PER_RELATIVE range를 만들면 _percentile(표본 1개)의 low==mid==high로
    # 사실상 단일 목표가가 3점 range로 위장된다(GPT 리뷰 2026-07-16 11:00 발견).
    target = _target()
    only_one_valid_per_peer = _profile(
        "00164779", "SK하이닉스", "000660", "2612",
        73_915_704_000_000, 19_796_902_000_000, 712_702_365, 2_082_000,
    )
    negative_income_peers = [
        _profile(
            "00160843", "DB하이텍", "000990", "2611",
            2_000_688_804_317, -100_000_000_000, 43_504_588, 120_800,
        ),
        _profile(
            "00126371", "삼성전기", "009150", "2622",
            9_015_854_031_770, -50_000_000_000, 74_693_696, 1_413_000,
        ),
    ]
    peer_result = build_peer_universe(
        target, [only_one_valid_per_peer, *negative_income_peers], AS_OF
    )
    assert peer_result.sufficient is True
    assert peer_result.statistics.per_sample_size == 1
    assert peer_result.statistics.pbr_sample_size == 3

    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    methods = {r.method for r in result.value_ranges}
    assert PER_RELATIVE not in methods
    assert PBR_RELATIVE in methods
    for r in result.value_ranges:
        assert r.low < r.mid < r.high, r.method


def test_insufficient_peers_yields_no_ranges_and_flags_insufficient() -> None:
    target = _target()
    peer_result = build_peer_universe(target, _peers()[:1], AS_OF)
    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    assert result.value_ranges == ()
    assert result.data_quality == "INSUFFICIENT_PEERS"


def test_target_with_no_positive_eps_bps_yields_insufficient_target_data() -> None:
    negative_target = _profile(
        "00126380", "삼성전자", "005930", "264", -1_000_000_000, -500_000_000, 1_000_000, 10_000
    )
    peer_result = build_peer_universe(negative_target, _peers(), AS_OF)
    result = compute_valuation_scenarios(negative_target, peer_result, AS_OF)
    assert result.value_ranges == ()
    assert result.data_quality == "INSUFFICIENT_TARGET_DATA"


def test_numeric_evidence_carries_source_ids_and_provenance() -> None:
    target = _target()
    peer_result = build_peer_universe(target, _peers(), AS_OF)
    result = compute_valuation_scenarios(target, peer_result, AS_OF)
    assert result.numeric_evidence
    for ev in result.numeric_evidence:
        assert ev["source_ids"]
        assert ev["formula"]
        provenance = ev["provenance"]
        assert isinstance(provenance, dict)
        assert provenance["formula_version"]


def test_peer_universe_is_only_consumed_not_reconstructed() -> None:
    # S5는 S21 결과만 소비한다 — peer_universe.py를 직접 재호출하지 않는다는
    # 정적 계약 검사(docs/skills.md S5 제약 "peer universe의 유일한 구성·통계
    # 소유자는 S21").
    import ast
    from pathlib import Path

    path = (
        Path(__file__).resolve().parent.parent
        / "app"
        / "services"
        / "valuation_scenarios.py"
    )
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    calls = [
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    ]
    assert "build_peer_universe" not in calls
