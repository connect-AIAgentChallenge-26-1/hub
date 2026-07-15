"""5-state Verdict — Python mirror of contracts/verdict.js and docs/skills.md
"Verdict". S16(결정론 검산)이 원자 verdict를 계산한 뒤 이 모듈로 그룹을
집계한다. PARTIALLY_SUPPORTED는 그룹 전용 값이다(CLAUDE.md 절대 원칙 5,
docs/skills.md "원자 수치 Claim은 ... PARTIALLY_SUPPORTED를 사용하지 않는다").
"""

from __future__ import annotations

from enum import Enum

VERDICT_SCHEMA_VERSION = "1.0.0"


class Verdict(str, Enum):
    SUPPORTED = "SUPPORTED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    REFUTED = "REFUTED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    UNVERIFIABLE = "UNVERIFIABLE"


ATOMIC_VERDICTS = frozenset(
    {Verdict.SUPPORTED, Verdict.REFUTED, Verdict.INSUFFICIENT_EVIDENCE, Verdict.UNVERIFIABLE}
)


def group_verdict(atomic_verdicts: list[Verdict]) -> Verdict:
    """docs/skills.md 그룹 집계 우선순위표를 그대로 구현한다:
    1. 하나 이상 INSUFFICIENT_EVIDENCE  -> INSUFFICIENT_EVIDENCE
    2. 부족은 없고 하나 이상 UNVERIFIABLE -> UNVERIFIABLE
    3. SUPPORTED와 REFUTED가 모두 존재   -> PARTIALLY_SUPPORTED
    4. 전부 SUPPORTED                   -> SUPPORTED
    5. 전부 REFUTED                     -> REFUTED

    결정론적 순수 함수(I2/I3, CLAUDE.md 절대 원칙 5) — 같은 입력은 항상 같은
    출력을 낸다. 빈 입력이나 원자 verdict가 아닌 값은 조용히 넘기지 않고
    예외로 거부한다(contracts/verdict.js groupVerdict와 동일 계약)."""
    if not atomic_verdicts:
        raise ValueError("group_verdict requires a non-empty list of atomic verdicts")

    for v in atomic_verdicts:
        if v not in ATOMIC_VERDICTS:
            raise ValueError(
                f"invalid atomic verdict {v!r}; must be one of "
                f"{sorted(x.value for x in ATOMIC_VERDICTS)}"
            )

    if Verdict.INSUFFICIENT_EVIDENCE in atomic_verdicts:
        return Verdict.INSUFFICIENT_EVIDENCE
    if Verdict.UNVERIFIABLE in atomic_verdicts:
        return Verdict.UNVERIFIABLE

    has_supported = Verdict.SUPPORTED in atomic_verdicts
    has_refuted = Verdict.REFUTED in atomic_verdicts

    if has_supported and has_refuted:
        return Verdict.PARTIALLY_SUPPORTED
    if has_supported:
        return Verdict.SUPPORTED
    return Verdict.REFUTED
