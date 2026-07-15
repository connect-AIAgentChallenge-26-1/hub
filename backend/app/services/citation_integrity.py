"""S20 인용 무결성·Provenance (docs/skills.md S20, I7).

인용문이 실제 원문과 일치하고 사용자가 추적 가능한지 검사한다:
- exact / fuzzy / offset 3단계 인용 위치 검사,
- 문서 checksum 확인(색인 이후 원문 변조 감지),
- DART 공식 링크 또는 허용 provider canonical URL 검증.

검사에 실패한 인용으로는 `SUPPORTED`·`REFUTED`를 확정하지 않는다
(docs/skills.md S20 제약) — `verdict_gate_ok()`가 그 경계를 강제한다.
전부 결정론이라 LLM·외부 호출이 없다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Literal

CITATION_INTEGRITY_VERSION = "s20-citation-integrity-1.0.0"

CitationMethod = Literal["EXACT", "OFFSET", "FUZZY", "NONE"]

# fuzzy 매칭 최소 유사도 — 이 미만이면 인용 실패로 본다.
FUZZY_THRESHOLD = 0.85

_WS = re.compile(r"\s+")

# 허용 provider별 canonical URL 규칙(docs/skills.md S14 allowlist·S2 DART).
_DART_DOC_URL = "https://opendart.fss.or.kr/api/document.xml?rcept_no={rcept_no}"
_ALLOWED_URL_HOSTS = (
    "opendart.fss.or.kr",
    "openapi.naver.com",
    "naver.com",
    "data.go.kr",
    "krx.co.kr",
    "data.krx.co.kr",
)


def _normalize(text: str) -> str:
    return _WS.sub(" ", text).strip()


@dataclass(frozen=True)
class CitationInput:
    evidence_id: str
    quote: str
    source_text: str
    chunk_offset: int
    source: str  # "disclosure" | "external_news" 등
    source_url: str
    rcept_no: str = ""
    stored_checksum: str = ""
    recomputed_checksum: str = ""


@dataclass(frozen=True)
class CitationResult:
    evidence_id: str
    method: CitationMethod
    integrity_score: float
    checksum_ok: bool
    url_ok: bool
    canonical_url: str
    verified: bool
    reason: str


@dataclass(frozen=True)
class CitationIntegrityReport:
    verified_citations: tuple[CitationResult, ...] = field(default_factory=tuple)
    rejected_citations: tuple[CitationResult, ...] = field(default_factory=tuple)
    integrity_scores: dict[str, float] = field(default_factory=dict)
    rule_version: str = CITATION_INTEGRITY_VERSION


def _match_method(quote: str, source_text: str, offset: int) -> tuple[CitationMethod, float]:
    if not quote:
        return "NONE", 0.0
    # offset 검사: 주장된 위치에 정확히 있는가.
    if 0 <= offset <= len(source_text):
        window = source_text[offset : offset + len(quote)]
        if window == quote:
            return "OFFSET", 1.0
    # exact 검사: 원문 어딘가에 그대로 있는가.
    if quote in source_text:
        return "EXACT", 1.0
    # fuzzy 검사: 공백 정규화 후 포함 또는 최장 매칭 유사도.
    nq, ns = _normalize(quote), _normalize(source_text)
    if nq and nq in ns:
        return "FUZZY", 0.95
    ratio = SequenceMatcher(None, nq, ns).ratio() if nq else 0.0
    if ratio >= FUZZY_THRESHOLD:
        return "FUZZY", round(ratio, 4)
    return "NONE", round(ratio, 4)


def verify_source_url(source: str, source_url: str, rcept_no: str) -> tuple[bool, str]:
    """허용 provider의 canonical URL을 생성·검증한다. DART는 rcept_no로 정확한
    공식 링크를 만들고, 그 외 허용 host면 원 URL을 canonical로 인정한다."""
    if source == "disclosure":
        canonical = _DART_DOC_URL.format(rcept_no=rcept_no)
        # 공식 DART 문서 링크 형식과 정확히 일치해야 통과.
        return (source_url == canonical and bool(rcept_no)), canonical
    if not source_url.startswith(("http://", "https://")):
        return False, source_url
    host = source_url.split("/")[2].split(":")[0].lower() if "//" in source_url else ""
    ok = any(host == h or host.endswith("." + h) for h in _ALLOWED_URL_HOSTS)
    return ok, source_url


def check_citation(item: CitationInput) -> CitationResult:
    method, score = _match_method(item.quote, item.source_text, item.chunk_offset)
    # checksum: 둘 다 주어졌을 때만 대조하고, 없으면 검사 생략(True로 취급하되
    # url·method 게이트가 남는다). 값이 있는데 어긋나면 무결성 실패.
    if item.stored_checksum and item.recomputed_checksum:
        checksum_ok = item.stored_checksum == item.recomputed_checksum
    else:
        checksum_ok = True
    url_ok, canonical = verify_source_url(item.source, item.source_url, item.rcept_no)

    verified = method != "NONE" and checksum_ok and url_ok
    if method == "NONE":
        reason = "인용문이 원문과 일치하지 않음(환각 인용)"
    elif not checksum_ok:
        reason = "문서 checksum 불일치(색인 이후 원문 변조)"
    elif not url_ok:
        reason = "공식·허용 provider canonical URL 아님"
    else:
        reason = f"{method} 매칭, checksum·URL 검증 통과"
    return CitationResult(
        evidence_id=item.evidence_id,
        method=method,
        integrity_score=score,
        checksum_ok=checksum_ok,
        url_ok=url_ok,
        canonical_url=canonical,
        verified=verified,
        reason=reason,
    )


def check_citations(items: list[CitationInput]) -> CitationIntegrityReport:
    verified: list[CitationResult] = []
    rejected: list[CitationResult] = []
    scores: dict[str, float] = {}
    for item in items:
        result = check_citation(item)
        scores[item.evidence_id] = result.integrity_score
        (verified if result.verified else rejected).append(result)
    return CitationIntegrityReport(
        verified_citations=tuple(verified),
        rejected_citations=tuple(rejected),
        integrity_scores=scores,
    )


def verdict_gate_ok(report: CitationIntegrityReport, evidence_id: str) -> bool:
    """해당 근거의 인용이 검증됐을 때만 확정 verdict(SUPPORTED/REFUTED)에
    사용할 수 있다(docs/skills.md S20 제약). 검증 목록에 없으면 False."""
    return any(c.evidence_id == evidence_id for c in report.verified_citations)
