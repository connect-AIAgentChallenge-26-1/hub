"""S11 리포트·Provenance UI 생성 — 기능 A 종목 공부 (docs/skills.md S11,
docs/checklist.md C5). 파이프라인 A(docs/skills.md "파이프라인"):

    S1 → S2.collect → S15.PRE_NORMALIZE → S2.normalize → S3 → S15.POST_DERIVED
    → S4/S20 → S11 → S10

이 모듈이 그 전체를 오케스트레이션한다 — 이미 완성된 S1 확장(company_overview),
S2(disclosure_collector), S3(financial_calculator), S4(term_explainer),
S20(citation_integrity)을 호출해 결합할 뿐 각 스킬의 계산·정합성 로직을
재구현하지 않는다. S10(복기 저장)은 T10 범위라 이 모듈은 호출하지 않는다.

제약(docs/skills.md S11): schema·출처·금지 문구 게이트를 통과하지 못한 문장을
제거한다. 숨겨진 근거나 생성된 출처를 표시하지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.disclosure import CorrectionChain, FinancialFactRow, RawDisclosureRecord
from app.models.financial_fact import FinancialFact
from app.providers.base import ProviderError, map_provider_error
from app.providers.opendart import OpenDartProvider
from app.repositories.financial_fact_repository import persist_facts_idempotently
from app.services import citation_integrity as s20
from app.services.company_overview import CompanyOverview, CompanyOverviewCollector
from app.services.disclosure_collector import DisclosureCollector
from app.services.financial_calculator import (
    FinancialCalculator,
    assert_single_fs_div,
    classify_sign_transition,
    compute_ratios,
    ratios_to_numeric_evidence,
    select_canonical_facts,
    select_fs_div,
)
from app.services.temporal_integrity import DerivedCheckInput, post_derived
from app.services.term_explainer import ExplainResult, explain

COMPANY_REPORT_GENERATOR_VERSION = "s11-company-report-generator-1.0.0"

# S11 제약 "금지 문구 게이트" — 리포트에 노출되는 모든 서술 문장에 공통 적용.
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


def contains_forbidden_phrase(text: str) -> bool:
    return any(phrase in text for phrase in _FORBIDDEN_PHRASES)


def _formula_version_from(evidence: dict[str, object]) -> str:
    provenance = evidence["provenance"]
    assert isinstance(provenance, dict)
    return str(provenance["formula_version"])


def _value_from(evidence: dict[str, object]) -> float:
    value = evidence["value"]
    assert isinstance(value, int | float)
    return float(value)


def _target_period_from(evidence: dict[str, object]) -> str | None:
    target_period = evidence.get("target_period")
    return target_period if isinstance(target_period, str) else None


def _dart_document_url(rcept_no: str) -> str:
    return f"https://opendart.fss.or.kr/api/document.xml?rcept_no={rcept_no}"


def _recompute_document_checksum(record: RawDisclosureRecord) -> str:
    """`collect_document()`가 `checksum_of(raw_zip_bytes)`(base64 인코딩 전
    원본 zip bytes)로 저장한 것과 정확히 같은 방식으로 지금 DB에 있는
    `raw_payload["zip_base64"]`를 다시 디코딩해 재계산한다 — payload dict를
    JSON 인코딩해 재계산하면(다른 함수) 애초에 저장 시점 값과 방식이 달라
    정상 상태에서도 항상 불일치가 나는 결함을 피한다."""
    import base64

    from app.providers.opendart import checksum_of

    zip_bytes = base64.b64decode(record.raw_payload["zip_base64"])
    return checksum_of(zip_bytes)


@dataclass(frozen=True)
class Checkpoint:
    code: str
    message: str
    severity: str  # "INFO" | "WARNING" | "ERROR"


@dataclass(frozen=True)
class DisclosureItem:
    rcept_no: str
    report_nm: str
    filed_at: date
    report_type: str
    is_correction: bool
    corrected_original_rcept_no: str | None
    corrected_by_rcept_no: str | None
    source_url: str


@dataclass(frozen=True)
class MetricPoint:
    fiscal_period: str
    value: float
    unit: str
    account_id: str
    account_name: str
    formula: str | None
    formula_version: str | None
    filed_at: date
    as_of: date


@dataclass(frozen=True)
class MetricTrend:
    metric: str
    points: tuple[MetricPoint, ...]
    # 두 기간 이상 있을 때만: 최신 대비 직전 기간 변화(부호 전환은 reason_code로
    # 만 표시하고 verdict를 내지 않는다, CLAUDE.md Verdict 계약).
    change_reason_code: str | None
    change_pct: float | None


@dataclass(frozen=True)
class CitationView:
    evidence_id: str
    quote: str
    source_url: str
    filed_at: str
    target_period: str | None
    method: str
    verified: bool


@dataclass(frozen=True)
class CompanyReport:
    corp_code: str
    as_of: date
    overview: CompanyOverview | None
    disclosures: tuple[DisclosureItem, ...]
    metric_trends: tuple[MetricTrend, ...]
    glossary: ExplainResult
    checkpoints: tuple[Checkpoint, ...]
    citations: tuple[CitationView, ...]
    generator_version: str = COMPANY_REPORT_GENERATOR_VERSION


class CompanyReportGenerator:
    def __init__(self, db: Session, provider: OpenDartProvider):
        self._db = db
        self._provider = provider
        self._disclosure_collector = DisclosureCollector(db, provider)
        self._overview_collector = CompanyOverviewCollector(db, provider)

    def generate(
        self,
        corp_code: str,
        stock_code: str,
        as_of: date,
        bgn_de: str,
        end_de: str,
        bsns_years: list[str],
        reprt_codes: list[str],
        fs_div: str = "CFS",
        llm_term_fallback: object | None = None,
    ) -> CompanyReport:
        checkpoints: list[Checkpoint] = []

        overview = self._collect_overview(corp_code, as_of, checkpoints)
        disclosures, _correction_chains = self._collect_disclosures(
            corp_code, as_of, bgn_de, end_de, checkpoints
        )
        metric_trends, used_metrics, document_evidence, doc_by_record = (
            self._collect_financial_metrics(
                corp_code, stock_code, as_of, bsns_years, reprt_codes, fs_div, checkpoints
            )
        )
        citations = self._verify_citations(document_evidence, doc_by_record, checkpoints)
        glossary = explain(used_metrics, report_context=corp_code, llm_fallback=llm_term_fallback)

        if not disclosures and not metric_trends:
            checkpoints.append(
                Checkpoint(
                    code="NO_DATA_AVAILABLE",
                    message="선택한 기간·보고서에서 표시할 공시·재무 데이터가 없습니다.",
                    severity="WARNING",
                )
            )
        pending_corrections = self._pending_corrections(disclosures)
        if pending_corrections:
            checkpoints.append(
                Checkpoint(
                    code="CORRECTION_PRESENT",
                    message=(
                        f"정정된 공시 {len(pending_corrections)}건이 있습니다 — "
                        "원문에서 최신 정정 내용을 확인하세요."
                    ),
                    severity="INFO",
                )
            )

        return CompanyReport(
            corp_code=corp_code,
            as_of=as_of,
            overview=overview,
            disclosures=disclosures,
            metric_trends=metric_trends,
            glossary=glossary,
            checkpoints=tuple(checkpoints),
            citations=citations,
        )

    # ------------------------------------------------------------ overview

    def _collect_overview(
        self, corp_code: str, as_of: date, checkpoints: list[Checkpoint]
    ) -> CompanyOverview | None:
        try:
            record = self._overview_collector.collect(corp_code)
        except ProviderError as exc:
            mapping = map_provider_error(exc)
            # 데이터 없음과 provider 장애를 구분해 표시한다(CLAUDE.md 절대 원칙 7).
            severity = "ERROR" if mapping.status.value == "EXTERNAL_ERROR" else "WARNING"
            checkpoints.append(
                Checkpoint(
                    code=f"OVERVIEW_{mapping.reason_code}",
                    message=f"기업개요 조회 실패: {mapping.reason_code}",
                    severity=severity,
                )
            )
            return None
        return self._overview_collector.normalize(record, as_of)

    # --------------------------------------------------------- disclosures

    def _collect_disclosures(
        self,
        corp_code: str,
        as_of: date,
        bgn_de: str,
        end_de: str,
        checkpoints: list[Checkpoint],
    ) -> tuple[tuple[DisclosureItem, ...], list[CorrectionChain]]:
        # 목록의 모든 공시를 문서 원문까지 내려받지 않는다 — 각 항목의 DART
        # 링크만으로 "공식 DART 원문 이동"은 이미 충족되고(docs/checklist.md
        # C5), 실제 원문 chunk·인용 검증은 재무 수치의 근거가 되는 공시로
        # 범위를 좁힌다(_collect_financial_provenance, "문장·수치별 provenance").
        try:
            list_record = self._disclosure_collector.collect_disclosure_list(
                corp_code, bgn_de, end_de
            )
        except ProviderError as exc:
            mapping = map_provider_error(exc)
            severity = "ERROR" if mapping.status.value == "EXTERNAL_ERROR" else "WARNING"
            checkpoints.append(
                Checkpoint(
                    code=f"DISCLOSURES_{mapping.reason_code}",
                    message=f"공시 목록 조회 실패: {mapping.reason_code}",
                    severity=severity,
                )
            )
            return (), []

        result = self._disclosure_collector.normalize([list_record], as_of=as_of)

        original_by_correction = {
            c.correction_rcept_no: c.original_rcept_no for c in result.correction_chains
        }
        correction_by_original = {
            c.original_rcept_no: c.correction_rcept_no for c in result.correction_chains
        }

        items = tuple(
            DisclosureItem(
                rcept_no=d.rcept_no,
                report_nm=d.report_nm,
                filed_at=d.filed_at,
                report_type=d.report_type.value,
                is_correction=d.is_correction,
                corrected_original_rcept_no=original_by_correction.get(d.rcept_no),
                corrected_by_rcept_no=correction_by_original.get(d.rcept_no),
                source_url=_dart_document_url(d.rcept_no),
            )
            for d in sorted(result.disclosures, key=lambda d: d.filed_at, reverse=True)
        )
        return items, result.correction_chains

    def _pending_corrections(self, disclosures: tuple[DisclosureItem, ...]) -> list[DisclosureItem]:
        return [d for d in disclosures if d.is_correction]

    # ---------------------------------------------------------- financials

    def _collect_financial_metrics(
        self,
        corp_code: str,
        stock_code: str,
        as_of: date,
        bsns_years: list[str],
        reprt_codes: list[str],
        fs_div: str,
        checkpoints: list[Checkpoint],
    ) -> tuple[
        tuple[MetricTrend, ...], list[str], list[dict[str, object]], dict[str, RawDisclosureRecord]
    ]:
        rows: list[FinancialFactRow] = []
        for bsns_year in bsns_years:
            for reprt_code in reprt_codes:
                try:
                    record = self._disclosure_collector.collect_financial_statements(
                        corp_code, bsns_year, reprt_code, fs_div
                    )
                except ProviderError as exc:
                    mapping = map_provider_error(exc)
                    severity = "ERROR" if mapping.status.value == "EXTERNAL_ERROR" else "WARNING"
                    checkpoints.append(
                        Checkpoint(
                            code=f"FINANCIALS_{mapping.reason_code}",
                            message=(
                                f"{bsns_year}년 {reprt_code} 재무제표 조회 실패: "
                                f"{mapping.reason_code}"
                            ),
                            severity=severity,
                        )
                    )
                    continue
                norm = self._disclosure_collector.normalize([record], as_of=as_of)
                rows.extend(norm.eligible_financial_rows)

        if not rows:
            return (), [], [], {}

        calculator = FinancialCalculator()
        normalize_result = calculator.normalize(rows, stock_code=stock_code)
        for w in normalize_result.warnings:
            checkpoints.append(
                Checkpoint(code="FINANCIAL_NORMALIZE_WARNING", message=w, severity="WARNING")
            )

        persisted_facts = persist_facts_idempotently(self._db, normalize_result.facts)

        mapped_facts = [f for f in persisted_facts if f.metric_key is not None]
        facts_by_period: dict[str, list[FinancialFact]] = {}
        for fact in mapped_facts:
            facts_by_period.setdefault(fact.fiscal_period, []).append(fact)

        selected_by_period, fs_div_warnings = select_fs_div(facts_by_period)
        for w in fs_div_warnings:
            checkpoints.append(Checkpoint(code="FS_DIV_WARNING", message=w, severity="WARNING"))

        points_by_metric: dict[str, list[MetricPoint]] = {}
        for period in sorted(selected_by_period):
            period_facts = selected_by_period[period]
            if not period_facts:
                continue
            best_by_metric = select_canonical_facts(period_facts)
            try:
                assert_single_fs_div(list(best_by_metric.values()))
            except ValueError as exc:
                checkpoints.append(
                    Checkpoint(
                        code="MIXED_FS_DIV",
                        message=f"{period} 지표 계산 중단: {exc}",
                        severity="ERROR",
                    )
                )
                continue

            values = {k: Decimal(str(f.normalized_value)) for k, f in best_by_metric.items()}
            ratios = compute_ratios(values, None, None)
            source_ids = [str(f.id) for f in best_by_metric.values()]
            raw_evidence = ratios_to_numeric_evidence(ratios, corp_code, period, as_of, source_ids)
            checks = [
                DerivedCheckInput(
                    record_id=str(ev["numeric_evidence_id"]),
                    corp_code=corp_code,
                    source_ids=source_ids,
                    source_corp_codes=[f.corp_code for f in best_by_metric.values()],
                    unit=str(ev["unit"]),
                    source_units=[f.normalized_unit for f in best_by_metric.values()],
                    as_of=as_of,
                    source_as_of=[f.filed_at for f in best_by_metric.values()],
                    formula_version=_formula_version_from(ev),
                    target_period=period,
                    source_periods=[f.fiscal_period for f in best_by_metric.values()],
                )
                for ev in raw_evidence
            ]
            verified_ids = set(post_derived(checks, as_of).verified)

            for metric_key, fact in best_by_metric.items():
                points_by_metric.setdefault(metric_key, []).append(
                    MetricPoint(
                        fiscal_period=period,
                        value=float(fact.normalized_value),
                        unit=fact.normalized_unit,
                        account_id=fact.account_id,
                        account_name=fact.account_name,
                        formula=None,
                        formula_version=None,
                        filed_at=fact.filed_at,
                        as_of=as_of,
                    )
                )
            for ev in raw_evidence:
                if ev["numeric_evidence_id"] not in verified_ids:
                    continue
                metric = str(ev["metric"])
                formula = str(ev["formula"])
                formula_version = _formula_version_from(ev)
                points_by_metric.setdefault(metric, []).append(
                    MetricPoint(
                        fiscal_period=period,
                        value=_value_from(ev),
                        unit=str(ev["unit"]),
                        account_id="(계산됨)",
                        account_name=metric,
                        formula=formula,
                        formula_version=formula_version,
                        filed_at=max(f.filed_at for f in best_by_metric.values()),
                        as_of=as_of,
                    )
                )

        trends: list[MetricTrend] = []
        for metric, points in points_by_metric.items():
            ordered = tuple(sorted(points, key=lambda p: p.fiscal_period))
            change_reason: str | None = None
            change_pct: float | None = None
            if len(ordered) >= 2:
                prev, cur = ordered[-2], ordered[-1]
                prev_v, cur_v = Decimal(str(prev.value)), Decimal(str(cur.value))
                change_reason = classify_sign_transition(prev_v, cur_v)
                if prev_v != 0 and (prev_v < 0) == (cur_v < 0):
                    change_pct = float((cur_v - prev_v) / abs(prev_v) * 100)
            trends.append(
                MetricTrend(
                    metric=metric,
                    points=ordered,
                    change_reason_code=change_reason,
                    change_pct=change_pct,
                )
            )

        source_rcept_nos = sorted({f.rcept_no for f in mapped_facts})
        document_evidence, doc_by_record = self._collect_financial_document_evidence(
            source_rcept_nos, corp_code, as_of, checkpoints
        )
        return tuple(trends), sorted(points_by_metric.keys()), document_evidence, doc_by_record

    def _collect_financial_document_evidence(
        self,
        rcept_nos: list[str],
        corp_code: str,
        as_of: date,
        checkpoints: list[Checkpoint],
    ) -> tuple[list[dict[str, object]], dict[str, RawDisclosureRecord]]:
        """재무 수치가 실제로 나온 공시 원문만 내려받아 chunk·인용 검증한다
        (docs/checklist.md C5 "재무지표 값... 원본 계정" provenance) — 목록의
        모든 공시가 아니라 지금 화면에 보여주는 수치의 근거로 범위를 좁힌다."""
        document_evidence: list[dict[str, object]] = []
        doc_by_record: dict[str, RawDisclosureRecord] = {}
        for rcept_no in rcept_nos:
            try:
                doc_record = self._disclosure_collector.collect_document(rcept_no, corp_code)
            except ProviderError as exc:
                mapping = map_provider_error(exc)
                checkpoints.append(
                    Checkpoint(
                        code=f"DOCUMENT_{mapping.reason_code}",
                        message=f"공시 원문({rcept_no}) 다운로드 실패: {mapping.reason_code}",
                        severity="WARNING",
                    )
                )
                continue
            doc_result = self._disclosure_collector.normalize([doc_record], as_of=as_of)
            document_evidence.extend(doc_result.document_evidence)
            doc_by_record[rcept_no] = doc_record
        return document_evidence, doc_by_record

    # ---------------------------------------------------------- provenance

    def _verify_citations(
        self,
        document_evidence: list[dict[str, object]],
        doc_by_record: dict[str, RawDisclosureRecord],
        checkpoints: list[Checkpoint],
    ) -> tuple[CitationView, ...]:
        if not document_evidence:
            return ()

        source_text_cache: dict[str, str] = {}
        items: list[s20.CitationInput] = []
        for ev in document_evidence:
            rcept_no = str(ev["document_id"])
            raw_record = doc_by_record.get(rcept_no)
            if raw_record is None:
                continue
            if rcept_no not in source_text_cache:
                source_text_cache[rcept_no] = self._disclosure_collector.reconstruct_document_text(
                    raw_record
                )

            items.append(
                s20.CitationInput(
                    evidence_id=str(ev["evidence_id"]),
                    quote=str(ev["quote"]),
                    source_text=source_text_cache[rcept_no],
                    chunk_offset=(
                        int(ev["chunk_offset"]) if isinstance(ev["chunk_offset"], int) else 0
                    ),
                    source="disclosure",
                    source_url=str(ev["source_url"]),
                    rcept_no=rcept_no,
                    stored_checksum=raw_record.checksum,
                    recomputed_checksum=_recompute_document_checksum(raw_record),
                )
            )

        report = s20.check_citations(items)
        verified_ids = {c.evidence_id for c in report.verified_citations}
        if report.rejected_citations:
            checkpoints.append(
                Checkpoint(
                    code="CITATION_REJECTED",
                    message=(
                        f"인용 검증 실패 근거 {len(report.rejected_citations)}건은 "
                        "화면에서 제외했습니다."
                    ),
                    severity="WARNING",
                )
            )

        views: list[CitationView] = []
        for ev in document_evidence:
            eid = str(ev["evidence_id"])
            if eid not in verified_ids:
                continue
            views.append(
                CitationView(
                    evidence_id=eid,
                    quote=str(ev["quote"]),
                    source_url=str(ev["source_url"]),
                    filed_at=str(ev["filed_at"]),
                    target_period=_target_period_from(ev),
                    method=next(
                        (c.method for c in report.verified_citations if c.evidence_id == eid), ""
                    ),
                    verified=True,
                )
            )
        return tuple(views)
