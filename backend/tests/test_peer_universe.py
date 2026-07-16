"""S21 비교군 구성·비교 테스트 (docs/checklist.md C6). 실제 삼성전자(target)·
SK하이닉스·DB하이텍·삼성전기(peer 후보) 2026-07-15 라이브 캡처 데이터로 검증."""

from __future__ import annotations

from datetime import date
from typing import cast

from app.services.peer_universe import (
    MIN_PEER_SAMPLE_SIZE,
    PEER_UNIVERSE_VERSION,
    CompanyProfile,
    build_peer_universe,
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
    as_of: date = AS_OF,
) -> CompanyProfile:
    eps = net_income / shares
    bps = equity / shares
    per = price / eps if eps else None
    pbr = price / bps if bps else None
    roe = net_income / equity if equity else None
    return CompanyProfile(
        corp_code, name, stock, industry, eps, bps, per, pbr, roe, price, as_of, as_of
    )


def _target() -> CompanyProfile:
    return _profile(
        "00126380", "삼성전자", "005930", "264",
        402_192_070_000_000, 34_451_351_000_000, 5_846_278_608, 262_500,
    )


def _real_peers() -> list[CompanyProfile]:
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


def test_real_peers_same_ksic_division_are_included() -> None:
    target = _target()
    result = build_peer_universe(target, _real_peers(), AS_OF)
    assert {p.corp_name for p in result.peer_universe} == {"SK하이닉스", "DB하이텍", "삼성전기"}
    assert result.exclusions == ()
    assert result.sufficient is True
    assert result.statistics.sample_size == 3
    assert result.rule_version == PEER_UNIVERSE_VERSION


def test_industry_mismatch_is_excluded_with_reason() -> None:
    target = _target()
    unrelated = _profile(
        "00999999", "무관회사", "999999", "701", 1_000_000_000, 100_000_000, 1_000_000, 10_000
    )
    result = build_peer_universe(target, [unrelated], AS_OF)
    assert result.peer_universe == ()
    assert result.exclusions[0].reason_code == "INDUSTRY_MISMATCH"


def test_target_itself_in_candidates_is_excluded_as_self() -> None:
    target = _target()
    result = build_peer_universe(target, [target], AS_OF)
    assert result.exclusions[0].reason_code == "IS_TARGET"


def test_negative_equity_candidate_excluded_as_invalid_ratio() -> None:
    target = _target()
    negative_equity_peer = _profile(
        "00888888", "적자회사", "888888", "264", -1_000_000_000, -500_000_000, 1_000_000, 5_000
    )
    result = build_peer_universe(target, [negative_equity_peer], AS_OF)
    assert result.exclusions[0].reason_code == "INVALID_RATIO"


def test_stale_as_of_candidate_excluded() -> None:
    target = _target()
    stale_peer = _profile(
        "00777777", "구데이터", "777777", "264", 1_000_000_000, 100_000_000, 1_000_000, 5_000,
        as_of=date(2020, 1, 1),
    )
    result = build_peer_universe(target, [stale_peer], AS_OF)
    assert result.exclusions[0].reason_code == "AS_OF_MISMATCH"


def test_below_min_sample_size_is_insufficient() -> None:
    target = _target()
    result = build_peer_universe(target, _real_peers()[:1], AS_OF)
    assert len(result.peer_universe) < MIN_PEER_SAMPLE_SIZE
    assert result.sufficient is False
    assert result.quality_score < 1.0


def test_per_pbr_sample_sizes_can_differ_from_overall_sample_size() -> None:
    # sample_size는 PER 또는 PBR 중 하나만 유효해도 카운트되므로, 특정 metric의
    # 실제 표본 수는 이보다 적을 수 있다(GPT 리뷰 2026-07-16 11:00 발견) — S5가
    # metric별 최소 표본 기준을 강제하려면 이 값이 정확해야 한다.
    target = _target()
    negative_income_peer = _profile(
        "00160843", "DB하이텍", "000990", "2611",
        2_000_688_804_317, -100_000_000_000, 43_504_588, 120_800,
    )
    peers = [_real_peers()[0], negative_income_peer, _real_peers()[2]]
    result = build_peer_universe(target, peers, AS_OF)
    assert result.statistics.sample_size == 3
    assert result.statistics.per_sample_size == 2
    assert result.statistics.pbr_sample_size == 3


def test_per_pbr_source_ids_only_include_peers_with_that_metric_valid() -> None:
    # PEER_PER_MEDIAN numeric evidence의 source_ids는 실제로 PER 계산에 쓰인
    # peer만 가리켜야 한다 — 전체 peer_universe를 그대로 실으면 provenance가
    # 실제 계산 출처와 달라진다(GPT 리뷰 2026-07-16 11:30 발견).
    target = _target()
    negative_income_peer = _profile(
        "00160843", "DB하이텍", "000990", "2611",
        2_000_688_804_317, -100_000_000_000, 43_504_588, 120_800,
    )
    peers = [_real_peers()[0], negative_income_peer, _real_peers()[2]]
    result = build_peer_universe(target, peers, AS_OF)
    stats = result.statistics
    assert negative_income_peer.corp_code not in stats.per_source_ids
    assert negative_income_peer.corp_code in stats.pbr_source_ids
    assert len(stats.per_source_ids) == stats.per_sample_size
    assert len(stats.pbr_source_ids) == stats.pbr_sample_size

    per_evidence = next(e for e in result.numeric_evidence if e["metric"] == "PEER_PER_MEDIAN")
    per_source_ids = cast(list[str], per_evidence["source_ids"])
    assert negative_income_peer.corp_code not in per_source_ids
    assert len(per_source_ids) == 2


def test_statistics_percentiles_are_deterministic_and_reproducible() -> None:
    target = _target()
    r1 = build_peer_universe(target, _real_peers(), AS_OF)
    r2 = build_peer_universe(target, _real_peers(), AS_OF)
    assert r1.statistics == r2.statistics


def test_peer_universe_disclosed_fully() -> None:
    # 비교군 구성 내역(포함·제외 둘 다)을 공개한다(docs/skills.md S21 제약).
    target = _target()
    peers = _real_peers()
    unrelated = _profile(
        "00999999", "무관회사", "999999", "701", 1_000_000_000, 100_000_000, 1_000_000, 10_000
    )
    result = build_peer_universe(target, [*peers, unrelated], AS_OF)
    assert len(result.peer_universe) == 3
    assert len(result.exclusions) == 1
    included_codes = {p.corp_code for p in result.peer_universe}
    excluded_codes = {e.corp_code for e in result.exclusions}
    assert included_codes.isdisjoint(excluded_codes)


def test_numeric_evidence_has_provenance() -> None:
    target = _target()
    result = build_peer_universe(target, _real_peers(), AS_OF)
    assert result.numeric_evidence
    for ev in result.numeric_evidence:
        assert ev["source_ids"]
        assert ev["as_of"] == AS_OF.isoformat()
        assert ev["corp_code"] == target.corp_code
