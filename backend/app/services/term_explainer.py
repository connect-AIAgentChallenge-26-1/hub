"""S4 전문용어 설명 (docs/skills.md S4). 승인된 정의 사전을 우선 사용하고,
사전에 없는 용어만 S23 게이트를 거친 콜백으로 문맥 설명을 생성한다(S7의
`run_structured`/주입 가능한 `complete_structured` 콜백과 동일 패턴 — provider를
이 모듈이 직접 호출하지 않는다, docs/skills.md 공통 원칙 11).

제약: 특정 종목의 매수·매도·고평가 판단을 설명에 섞지 않는다 — 사전 항목은
집필 시점에 이미 검사하지만, LLM 경로는 출력을 신뢰할 수 없으므로 반환 직전
`_FORBIDDEN_PHRASES`로 다시 필터링한다(S11 "금지 문구 게이트" 제약과 동일 검사를
근원 스킬 단계에서도 적용 — 이중 방어).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.services.llm_security_gateway import UntrustedBlock, run_structured

TERM_EXPLAINER_VERSION = "s4-term-explainer-1.0.0"
GLOSSARY_VERSION = "s4-glossary-1.0.0"

# 추천·단정 표현 — 용어 정의에 섞이면 즉시 드롭한다(docs/skills.md S4 제약,
# CLAUDE.md 절대 원칙 1). S4는 특히 "고평가/저평가" 판단까지 명시적으로 금지한다.
_FORBIDDEN_PHRASES: tuple[str, ...] = (
    "매수",
    "매도",
    "관망",
    "분할매수",
    "보류",
    "목표가",
    "고평가",
    "저평가",
)


def _contains_forbidden_phrase(text: str) -> bool:
    return any(phrase in text for phrase in _FORBIDDEN_PHRASES)


@dataclass(frozen=True)
class TermDefinition:
    term: str
    definition: str
    source: str  # "approved_dictionary" | "llm_contextual"
    glossary_version: str = GLOSSARY_VERSION


@dataclass(frozen=True)
class ExplainResult:
    definitions: tuple[TermDefinition, ...]
    # 사전에 없고 llm_fallback도 없거나(또는 결과가 금지 문구로 드롭됐거나)
    # schema 위반이었던 용어 — 임의로 지어내지 않고 목록만 남긴다(환각 금지).
    unexplained_terms: tuple[str, ...]


# 초보자 눈높이 승인된 정의 사전. 값 자체는 사실 서술이며 매수/매도/고평가
# 판단을 포함하지 않는다(집필 시 확인).
APPROVED_GLOSSARY: dict[str, str] = {
    "매출액": "일정 기간 동안 상품이나 서비스를 판매해 벌어들인 총 금액입니다.",
    "영업이익": "매출에서 매출원가와 판매관리비 등 영업활동에 쓰인 비용을 뺀 금액입니다.",
    "당기순이익": (
        "영업이익에 영업 외 손익과 법인세 등을 모두 반영한, 한 회계기간의 최종 이익입니다."
    ),
    "부채비율": (
        "자기자본 대비 부채(빌린 돈)의 비율로, 회사가 자산을 얼마나 빌린 돈으로 "
        "운영하는지 보여줍니다."
    ),
    "ROE": (
        "자기자본이익률(Return on Equity)의 약자로, 회사가 주주의 자본을 이용해 "
        "얼마나 이익을 냈는지 나타내는 비율입니다."
    ),
    "PER": (
        "주가수익비율(Price Earnings Ratio)의 약자로, 현재 주가를 주당순이익(EPS)으로 "
        "나눈 값입니다."
    ),
    "PBR": (
        "주가순자산비율(Price Book-value Ratio)의 약자로, 현재 주가를 주당순자산(BPS)으로 "
        "나눈 값입니다."
    ),
    "EPS": "주당순이익(Earnings Per Share)의 약자로, 당기순이익을 발행주식 수로 나눈 값입니다.",
    "BPS": "주당순자산(Book-value Per Share)의 약자로, 순자산을 발행주식 수로 나눈 값입니다.",
    "CFS": (
        "연결재무제표(Consolidated Financial Statements)의 약자로, 지배기업과 종속기업 "
        "실적을 합쳐 작성한 재무제표입니다."
    ),
    "OFS": (
        "별도재무제표(Separate Financial Statements)의 약자로, 지배기업 단독 실적만 "
        "담은 재무제표입니다."
    ),
    "영업활동현금흐름": "회사의 주된 영업활동에서 실제로 들어오고 나간 현금의 흐름입니다.",
    "배당성향": "당기순이익 중 배당금으로 지급한 비율입니다.",
    "정정공시": "이전에 제출한 공시 내용 중 일부를 수정해 다시 제출하는 공시입니다.",
    "사업보고서": (
        "상장회사가 매 사업연도 종료 후 제출하는, 한 해 사업 전반을 다루는 정기 공시 서류입니다."
    ),
    "분기보고서": "1분기·3분기처럼 3개월 단위 실적을 담아 제출하는 정기 공시 서류입니다.",
    "반기보고서": "상반기(1~6월) 실적을 담아 제출하는 정기 공시 서류입니다.",
    "누적값": "회계연도 시작부터 해당 시점까지 합산된 값입니다(예: 3분기 누적값은 1~3분기 합).",
    "흑자전환": "직전 기간에는 손실이었다가 해당 기간에 이익으로 바뀐 상태를 나타내는 표시입니다.",
    "적자지속": "직전 기간에 이어 해당 기간에도 계속 손실을 낸 상태를 나타내는 표시입니다.",
}


class _LLMTermDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    definition: str


def explain(
    terms: list[str],
    report_context: str,
    llm_fallback: Any | None = None,
) -> ExplainResult:
    """`llm_fallback`은 S7과 동일한 `complete_structured(prompt: str) -> dict`
    콜백이다. 주입하지 않으면(기본값 None) 사전에 없는 용어는 지어내지 않고
    `unexplained_terms`에 남는다(docs/checklist.md C9 한계와 동일 패턴 —
    `UPSTAGE_API_KEY` 미발급이라 T08도 결정론 경로만 기본 검증)."""
    definitions: list[TermDefinition] = []
    unexplained: list[str] = []
    seen: set[str] = set()

    for term in terms:
        if term in seen:
            continue
        seen.add(term)

        approved = APPROVED_GLOSSARY.get(term)
        if approved is not None:
            definitions.append(
                TermDefinition(term=term, definition=approved, source="approved_dictionary")
            )
            continue

        if llm_fallback is None:
            unexplained.append(term)
            continue

        blocks = [
            UntrustedBlock(label="report_context", text=report_context),
            UntrustedBlock(label="term", text=term),
        ]
        system = (
            "다음 금융 용어를 초보자 눈높이로 한두 문장 사실 설명한다. "
            "매수·매도·고평가·저평가 등 투자 판단은 포함하지 않는다."
        )
        result = run_structured(llm_fallback, system, blocks, _LLMTermDefinition)
        if not result.ok:
            unexplained.append(term)
            continue
        assert isinstance(result.validated_output, _LLMTermDefinition)
        definition_text = result.validated_output.definition
        if _contains_forbidden_phrase(definition_text):
            # LLM이 금지 문구를 냈다면 조용히 통과시키지 않고 unexplained로
            # 되돌린다(S11 "금지 문구 게이트를 통과하지 못한 문장을 제거").
            unexplained.append(term)
            continue
        definitions.append(
            TermDefinition(term=term, definition=definition_text, source="llm_contextual")
        )

    return ExplainResult(definitions=tuple(definitions), unexplained_terms=tuple(unexplained))
