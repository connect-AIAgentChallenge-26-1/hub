"""Python mirror of contracts/verdict.test.js — same cases, same module
contract (docs/skills.md "스키마 버전·migration 정책": 양쪽 미러가 같은
판정을 내야 한다)."""

import pytest

from app.services.verdict_aggregator import ATOMIC_VERDICTS, Verdict, group_verdict


def test_all_supported_is_supported() -> None:
    assert group_verdict([Verdict.SUPPORTED, Verdict.SUPPORTED]) is Verdict.SUPPORTED


def test_all_refuted_is_refuted() -> None:
    assert group_verdict([Verdict.REFUTED, Verdict.REFUTED]) is Verdict.REFUTED


def test_mixed_supported_and_refuted_is_partially_supported() -> None:
    assert group_verdict([Verdict.SUPPORTED, Verdict.REFUTED]) is Verdict.PARTIALLY_SUPPORTED
    assert (
        group_verdict([Verdict.SUPPORTED, Verdict.SUPPORTED, Verdict.REFUTED])
        is Verdict.PARTIALLY_SUPPORTED
    )


def test_insufficient_evidence_takes_priority_over_everything() -> None:
    assert (
        group_verdict([Verdict.SUPPORTED, Verdict.REFUTED, Verdict.INSUFFICIENT_EVIDENCE])
        is Verdict.INSUFFICIENT_EVIDENCE
    )
    assert (
        group_verdict([Verdict.UNVERIFIABLE, Verdict.INSUFFICIENT_EVIDENCE])
        is Verdict.INSUFFICIENT_EVIDENCE
    )


def test_unverifiable_wins_when_no_insufficient_evidence_present() -> None:
    assert group_verdict([Verdict.SUPPORTED, Verdict.UNVERIFIABLE]) is Verdict.UNVERIFIABLE
    assert group_verdict([Verdict.REFUTED, Verdict.UNVERIFIABLE]) is Verdict.UNVERIFIABLE


def test_single_refuted_atomic_result_stays_refuted_not_partially_supported() -> None:
    # docs/skills.md 예시: ">= 2배" 주장에 실제 1.38배는 "근접"이 아니라 단정
    # REFUTED다 — group_verdict는 원자 결과가 섞였을 때만 PARTIALLY_SUPPORTED를
    # 낸다, 단일 REFUTED를 "거의 맞음"으로 완화하지 않는다.
    assert group_verdict([Verdict.REFUTED]) is Verdict.REFUTED
    assert Verdict.PARTIALLY_SUPPORTED not in ATOMIC_VERDICTS


def test_empty_input_is_rejected_instead_of_silently_defaulting() -> None:
    with pytest.raises(ValueError):
        group_verdict([])


def test_atomic_verdict_set_excludes_partially_supported() -> None:
    assert ATOMIC_VERDICTS == {
        Verdict.SUPPORTED,
        Verdict.REFUTED,
        Verdict.INSUFFICIENT_EVIDENCE,
        Verdict.UNVERIFIABLE,
    }
