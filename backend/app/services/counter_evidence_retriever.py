"""S19 반증 근거 검색 (docs/skills.md S19, I6 확증편향 완화).

S18 지지 검색과 별도로 Claim **반대 방향** 근거를 검색한다. 방향 반전 규칙과
반대 키워드로 counter-query를 만들어 S18과 동일한 metadata filter로 재검색하고,
지지 근거와 반증 근거가 같은 Claim에 공존하면 상충(CONFLICTS)으로 표시한다.

relation 판정은 versioned **결정론 lexical 규칙**이다(방향 키워드 존재 여부).
서술형 근거의 의미 해석(LLM)은 S8이 S23 게이트를 거쳐 보강하며, 이 모듈은 그
전 단계의 결정론 baseline이다 — 규칙 버전(`RELATION_RULE_VERSION`)을 Evidence
`relation_rule_version`에 기록한다(docs/skills.md Evidence).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas.structured_claim import StructuredClaim
from app.services.evidence_retriever import (
    DEFAULT_SCORE_THRESHOLD,
    DEFAULT_TOP_K,
    EvidenceRetriever,
    RetrievedEvidence,
    build_query,
)

COUNTER_EVIDENCE_RETRIEVER_VERSION = "s19-counter-evidence-retriever-1.0.0"
RELATION_RULE_VERSION = "s19-relation-rule-1.0.0"

# 방향 lexicon — 상승/증가 계열과 하락/감소 계열. 결정론 규칙이므로 열거된
# 키워드만 본다(임의 의미 추론 금지, CLAUDE.md 절대 원칙 2).
_UP_KEYWORDS: frozenset[str] = frozenset(
    {"증가", "상승", "성장", "개선", "확대", "늘", "흑자전환", "최대", "증대"}
)
_DOWN_KEYWORDS: frozenset[str] = frozenset(
    {"감소", "하락", "축소", "악화", "부진", "줄", "적자", "둔화", "감액"}
)

# comparator.op → 주장하는 방향(up/down). MULTIPLE/INCREASE는 증가, DECREASE는
# 감소를 주장한다. RATIO/THRESHOLD/CONTINUITY는 방향이 op만으로 확정되지 않아
# claim.direction 문자열의 키워드에 의존한다.
_OP_ASSERTED_DIRECTION: dict[str, str] = {
    "INCREASE": "up",
    "MULTIPLE": "up",
    "DECREASE": "down",
}


def asserted_direction(claim: StructuredClaim) -> str | None:
    """Claim이 주장하는 방향("up"/"down") 또는 방향이 없으면 None."""
    op_dir = _OP_ASSERTED_DIRECTION.get(claim.comparator.op)
    if op_dir:
        return op_dir
    text = f"{claim.direction} {claim.original_span}"
    up = any(k in text for k in _UP_KEYWORDS)
    down = any(k in text for k in _DOWN_KEYWORDS)
    if up and not down:
        return "up"
    if down and not up:
        return "down"
    return None


def _opposite_keywords(direction: str) -> frozenset[str]:
    return _DOWN_KEYWORDS if direction == "up" else _UP_KEYWORDS


def _direction_of_text(text: str) -> str | None:
    up = any(k in text for k in _UP_KEYWORDS)
    down = any(k in text for k in _DOWN_KEYWORDS)
    if up and not down:
        return "up"
    if down and not up:
        return "down"
    return None


def classify_relation(claim: StructuredClaim, evidence_text: str) -> tuple[str, str]:
    """근거 텍스트가 Claim에 대해 갖는 relation과 그 사유를 결정론으로 판정한다.

    반환: (relation, relation_reason). relation ∈ SUPPORTS/REFUTES/NEUTRAL.
    (CONFLICTS는 개별 근거가 아니라 지지·반증 공존을 나타내는 집계 상태다.)
    """
    claim_dir = asserted_direction(claim)
    text_dir = _direction_of_text(evidence_text)
    if claim_dir is None or text_dir is None:
        return "NEUTRAL", "방향 키워드 없음 또는 Claim 방향 미확정"
    if text_dir == claim_dir:
        return "SUPPORTS", f"근거가 Claim과 같은 방향({claim_dir})을 서술"
    return "REFUTES", f"근거가 Claim과 반대 방향({text_dir} vs {claim_dir})을 서술"


@dataclass(frozen=True)
class ConflictPair:
    claim_id: str
    supporting_chunk_id: str
    refuting_chunk_id: str
    reason: str


@dataclass(frozen=True)
class CounterEvidenceResult:
    counter_evidence: tuple[RetrievedEvidence, ...] = field(default_factory=tuple)
    conflicts: tuple[ConflictPair, ...] = field(default_factory=tuple)
    search_trace: tuple[str, ...] = field(default_factory=tuple)
    # A/B: 기본 검색(S18) 대비 반증 검색이 실제로 무엇을 더/덜 찾았는지.
    noise: tuple[str, ...] = field(default_factory=tuple)


def build_counter_query(claim: StructuredClaim) -> str:
    """방향 반전 규칙으로 counter-query를 만든다. 방향이 없으면 기본 query에
    상충 탐색용 반대 키워드를 붙이지 않고 원 query를 그대로 쓴다."""
    base = build_query(claim)
    direction = asserted_direction(claim)
    if direction is None:
        return base
    opposite = " ".join(sorted(_opposite_keywords(direction)))
    return f"{base} {opposite}".strip()


class CounterEvidenceRetriever:
    def __init__(self, retriever: EvidenceRetriever) -> None:
        # S18과 동일 index를 공유한다 — 반증도 같은 코퍼스에서 반대 방향으로 찾는다.
        self._retriever = retriever

    def retrieve(
        self,
        claim: StructuredClaim,
        supporting: tuple[RetrievedEvidence, ...],
        *,
        top_k: int = DEFAULT_TOP_K,
        score_threshold: float = DEFAULT_SCORE_THRESHOLD,
    ) -> CounterEvidenceResult:
        counter_query = build_counter_query(claim)
        trace: list[str] = [
            f"counter_retriever={COUNTER_EVIDENCE_RETRIEVER_VERSION}",
            f"counter_query={counter_query!r}",
            f"asserted_direction={asserted_direction(claim)}",
        ]
        result = self._retriever.retrieve(
            claim, query_text=counter_query, top_k=top_k, score_threshold=score_threshold
        )
        trace.extend(result.retrieval_trace)

        # 반증 검색 결과 중 실제로 Claim을 반박(REFUTES)하는 것만 counter_evidence로,
        # 나머지(NEUTRAL/SUPPORTS)는 노이즈로 기록한다(숨기지 않는다).
        counter: list[RetrievedEvidence] = []
        noise: list[str] = []
        refuting_by_chunk: dict[str, RetrievedEvidence] = {}
        for ev in result.ranked_evidence:
            relation, _reason = classify_relation(claim, ev.document.text)
            if relation == "REFUTES":
                counter.append(ev)
                refuting_by_chunk[ev.chunk_id] = ev
            else:
                noise.append(f"{ev.chunk_id}:{relation}")

        # 상충 감지: 같은 Claim에 SUPPORTS 근거와 REFUTES 근거가 공존하면 CONFLICTS.
        supporting_supports = [
            ev
            for ev in supporting
            if classify_relation(claim, ev.document.text)[0] == "SUPPORTS"
        ]
        conflicts: list[ConflictPair] = []
        for sup in supporting_supports:
            for ref in counter:
                conflicts.append(
                    ConflictPair(
                        claim_id=claim.claim_id,
                        supporting_chunk_id=sup.chunk_id,
                        refuting_chunk_id=ref.chunk_id,
                        reason="같은 Claim에 지지·반증 근거가 공존",
                    )
                )
        trace.append(f"refuting={len(counter)} conflicts={len(conflicts)} noise={len(noise)}")
        return CounterEvidenceResult(
            counter_evidence=tuple(counter),
            conflicts=tuple(conflicts),
            search_trace=tuple(trace),
            noise=tuple(noise),
        )
