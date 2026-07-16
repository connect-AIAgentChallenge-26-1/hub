"""기능 B 오케스트레이션 — 가치 범위·가격 위치 리포트 (docs/skills.md 파이프라인
B: S1 → S2/S13.collect → S15.PRE_NORMALIZE → S2/S13.normalize → S3 →
S15.POST_DERIVED → S21 → S15.POST_DERIVED → S5 → S15.POST_DERIVED → S6 → S11).

이미 완성된 S1 확장(company_overview.py, T08)·S2(disclosure_collector.py)·
S3(financial_calculator.py)·S13(market_collector.py)를 그대로 재사용해 대상
기업과 후보 peer 각각의 `CompanyProfile`(업종코드·EPS·BPS·PER·PBR·ROE·가격)을
만들고, S21(peer_universe.py)·S5(valuation_scenarios.py)·S6(price_position.py)
로 넘긴다. peer 후보 목록은 호출자가 공급한다 — KRX·공공데이터포털 공식 벌크
업종 분류 provider가 없어(T03 C3 마지막 항목 BLOCKED) 전체 시장에서 자동으로
peer를 발견할 수 없기 때문이다(문서화된 범위, peer_universe.py 상단 참고).

**한계(문서화)**: KIS 현재가 조회(`FHKST01010100`)는 거래일자(trade_date) 필드를
제공하지 않는다(실 라이브 호출로 확인, `app/models/market.py` 모듈 docstring도
"latest-snapshot"으로 명시) — 그래서 이 endpoint가 반환하는 가격은 "지금 이
순간의 시세"일 뿐, 임의의 과거 `as_of`에 대한 시세라고 증명할 방법이 없다.
`as_of`가 리포트 생성 시점(오늘)이 아니면 `price_as_of=as_of`로 그대로 스탬프하지
않고 checkpoint로 안전 종료한다(GPT 리뷰 2026-07-16 11:00 발견 — 과거 `as_of`
요청에도 라이브 현재가가 그 과거 시점 가격처럼 통과하던 결함). "오늘"은
`today_provider`로 주입받아 테스트에서 결정론적으로 고정할 수 있다. 거래정지·
시장경고 신호(`temp_stop_yn`/`mrkt_warn_cls_code`)로도 별도 안전 종료 checkpoint를
만든다. 완전한 거래일 기준 staleness 검사는 기간별시세(S13 `collect_period_price`,
trade_date 보유)로 확장 가능하나 발행주식 수(`lstn_stcn`)는 현재가 endpoint에만
있어(market.py 참고) 그 경로로 완전히 대체할 수는 없다 — 후속 과제로 남긴다.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal
from typing import cast

from sqlalchemy.orm import Session

from app.models.disclosure import FinancialFactRow
from app.models.financial_fact import FinancialFact
from app.providers.base import ProviderError, map_provider_error
from app.providers.kis import KisProvider
from app.providers.opendart import OpenDartProvider
from app.repositories.financial_fact_repository import persist_facts_idempotently
from app.services.company_overview import CompanyOverviewCollector
from app.services.disclosure_collector import DisclosureCollector
from app.services.financial_calculator import (
    FinancialCalculator,
    RatioResult,
    assert_single_fs_div,
    compute_ratios,
    ratios_to_numeric_evidence,
    select_canonical_facts,
    select_fs_div,
)
from app.services.market_collector import MarketCollector
from app.services.peer_universe import CompanyProfile, PeerUniverseResult, build_peer_universe
from app.services.price_position import PricePosition, compute_price_position
from app.services.temporal_integrity import DerivedCheckInput, SourceComponent, post_derived
from app.services.valuation_scenarios import (
    PBR_RELATIVE,
    PER_RELATIVE,
    ROE_ADJUSTED_PBR_RELATIVE,
    ValuationResult,
    compute_valuation_scenarios,
)

VALUATION_REPORT_GENERATOR_VERSION = "b-valuation-report-generator-1.0.0"

# CompanyProfile로 넘어가 S21/S5 입력이자 API target_profile로 노출되는 5개
# 지표만 S15.POST_DERIVED로 검증한다(OPERATING_MARGIN 등 compute_ratios()의
# 나머지 산출물은 이 파이프라인이 쓰지 않아 검증 대상에서 제외). EPS/BPS/PER/
# PBR은 가격·발행주식 수(_collect_price_and_shares가 이미 as_of==오늘로 검증)를
# 쓰므로 그 기준일도 source_as_of에 더한다 — ROE는 재무제표 값만 쓴다.
_PROFILE_RATIO_METRICS = frozenset({"EPS", "BPS", "PER", "PBR", "ROE"})
_PRICE_AND_SHARES_RATIO_METRICS = frozenset({"EPS", "BPS", "PER", "PBR"})

# S5 valuation method가 실제로 쓰는 target CompanyProfile.ratio_evidence 키.
# S21의 PEER_PER_MEDIAN/PEER_PBR_MEDIAN은 target 값을 쓰지 않으므로 이 표에
# 없으면 target 컴포넌트를 붙이지 않는다(GPT 리뷰 2026-07-16 16:28 발견 —
# 이전에는 S5 evidence의 provenance가 peer corp_code만 가리키고 target.EPS/
# BPS/ROE가 실제로 그 계산에 쓰였다는 사실은 추적 불가능했다).
_TARGET_COMPONENT_METRICS: dict[str, tuple[str, ...]] = {
    PER_RELATIVE: ("EPS",),
    PBR_RELATIVE: ("BPS",),
    ROE_ADJUSTED_PBR_RELATIVE: ("BPS", "ROE"),
}

# target ratio metric별 "역할에 맞는" 단위 — S3 compute_ratios()가 실제로
# 부여하는 unit과 독립적인 domain 상수다. target component의 실제 unit이 이
# 값과 다르면(예: 엉뚱한 evidence가 잘못 연결됨) S15가 거부한다(GPT 리뷰
# 2026-07-16 21:14 발견 — 이전에는 component의 unit을 전혀 검사하지 않았다).
_TARGET_METRIC_EXPECTED_UNIT: dict[str, str] = {
    "EPS": "KRW_PER_SHARE",
    "BPS": "KRW_PER_SHARE",
    "ROE": "RATIO",
}

# ratio_evidence에 필요한 target metric이 없을 때(누락·미검증) 붙이는
# sentinel 값 — allowed_source_corp_codes 어디에도 속하지 않도록 만들어
# 항상 거부되게 한다(missing != silent skip, 아래 참고).
_MISSING_TARGET_CORP_CODE_PREFIX = "__MISSING_TARGET_"


@dataclass(frozen=True)
class CompanySpec:
    corp_code: str
    stock_code: str


@dataclass(frozen=True)
class Checkpoint:
    code: str
    message: str
    severity: str  # "INFO" | "WARNING" | "ERROR"


@dataclass(frozen=True)
class ValuationReport:
    target_corp_code: str
    as_of: date
    target_profile: CompanyProfile | None
    peer_result: PeerUniverseResult | None
    valuation: ValuationResult | None
    price_position: PricePosition | None
    checkpoints: tuple[Checkpoint, ...]
    generator_version: str = VALUATION_REPORT_GENERATOR_VERSION


def _derived_check_input(
    ev: dict[str, object],
    target_profile: CompanyProfile,
    allowed_corp_codes: list[str],
    as_of: date,
) -> DerivedCheckInput:
    # S21/S5 numeric evidence의 source_ids는 peer corp_code 그 자체다(개별 Fact
    # record가 아니라 "이 peer의 PER/PBR/ROE 값이 계산에 쓰였다"는 참조). S5는
    # 여기에 더해 target 자신의 EPS/BPS/ROE(이미 S15를 통과한 값,
    # `CompanyProfile.ratio_evidence`)도 실제 계산 입력이므로 함께 검증한다 —
    # target은 KRW_PER_SHARE, peer는 RATIO로 단위가 달라 하나의 동질 배열에
    # 못 넣으므로 `source_components`로 컴포넌트별 독립 검증한다(GPT 리뷰
    # 2026-07-16 16:28 발견 — 이전에는 S5 evidence의 provenance가 peer
    # corp_code만 가리키고 target.EPS/BPS/ROE가 실제로 그 계산에 쓰였다는
    # 사실은 추적할 방법이 없었다).
    peer_source_ids = cast(list[str], ev["source_ids"])
    provenance = cast(dict[str, object], ev["provenance"])
    formula_version = str(provenance.get("formula_version") or provenance.get("rule_version") or "")
    metric = str(ev["metric"])

    components = [
        SourceComponent(
            source_id=peer_id,
            corp_code=peer_id,
            unit="RATIO",
            as_of=as_of,
            period=as_of.isoformat(),
            expected_unit="RATIO",
            expected_period=as_of.isoformat(),
        )
        for peer_id in peer_source_ids
    ]
    for target_metric in _TARGET_COMPONENT_METRICS.get(metric, ()):
        target_ev = target_profile.ratio_evidence.get(target_metric)
        if target_ev is None:
            # 필수 target component가 없다(S3 게이트가 거부했거나 애초에
            # ratio_evidence가 비어 있음) — 조용히 생략하면 S5 evidence가 peer
            # 컴포넌트만으로 검증을 통과해버려 target provenance를 강제하려는
            # 목적이 무력화된다(GPT 리뷰 2026-07-16 21:14 발견). corp_code를
            # 허용 목록 밖 sentinel로 만들어 기존 검증 경로가 반드시 거부하게
            # 한다.
            components.append(
                SourceComponent(
                    source_id=f"{_MISSING_TARGET_CORP_CODE_PREFIX}{target_metric}",
                    corp_code=f"{_MISSING_TARGET_CORP_CODE_PREFIX}{target_metric}",
                    unit="",
                    as_of=as_of,
                    period="",
                )
            )
            continue
        components.append(
            SourceComponent(
                source_id=str(target_ev["numeric_evidence_id"]),
                corp_code=target_profile.corp_code,
                unit=str(target_ev["unit"]),
                as_of=date.fromisoformat(str(target_ev["as_of"])),
                period=str(target_ev["target_period"]),
                expected_unit=_TARGET_METRIC_EXPECTED_UNIT.get(target_metric),
                expected_period=target_profile.financial_period or None,
            )
        )

    return DerivedCheckInput(
        record_id=str(ev["numeric_evidence_id"]),
        corp_code=target_profile.corp_code,
        source_ids=[c.source_id for c in components],
        source_corp_codes=[c.corp_code for c in components],
        unit=str(ev["unit"]),
        source_units=[c.unit for c in components],
        as_of=as_of,
        source_as_of=[c.as_of for c in components],
        formula_version=formula_version,
        # peer 비교는 fiscal period가 아니라 as_of 시점 단면 비교다 — target_period는
        # as_of 자체를 쓴다(peer_universe.py `_numeric_evidence`의 target_period와 동일).
        target_period=as_of.isoformat(),
        source_periods=[c.period for c in components],
        allowed_source_corp_codes=allowed_corp_codes,
        source_components=components,
    )


def _apply_post_derived_gate(
    numeric_evidence: tuple[dict[str, object], ...],
    target_profile: CompanyProfile,
    allowed_corp_codes: list[str],
    as_of: date,
    checkpoints: list[Checkpoint],
    checkpoint_code: str,
) -> tuple[dict[str, object], ...]:
    if not numeric_evidence:
        return numeric_evidence
    checks = [
        _derived_check_input(ev, target_profile, allowed_corp_codes, as_of)
        for ev in numeric_evidence
    ]
    result = post_derived(checks, as_of)
    if result.rejected:
        checkpoints.append(
            Checkpoint(
                checkpoint_code,
                f"S15 사후 검증 실패로 근거 {len(result.rejected)}건 제외: "
                f"{', '.join(result.rejected)}",
                "WARNING",
            )
        )
    verified_ids = set(result.verified)
    return tuple(ev for ev in numeric_evidence if str(ev["numeric_evidence_id"]) in verified_ids)


def _gate_ratio_evidence(
    ratios: list[RatioResult],
    facts: list[FinancialFact],
    corp_code: str,
    target_period: str,
    as_of: date,
    checkpoints: list[Checkpoint],
) -> dict[str, dict[str, object]]:
    """S3 `compute_ratios()` 산출값(target/peer EPS/BPS/PER/PBR/ROE)을
    `financial_facts.py` 공유 라우터와 동일한 provenance 구성으로
    S15.POST_DERIVED에 통과시킨다 — 거부된 metric은 반환 dict에서 빠지므로
    호출자가 그 metric을 `CompanyProfile`/API에 노출하지 않는다(GPT 리뷰
    2026-07-16 14:36 발견). metric별 numeric evidence(값뿐 아니라
    numeric_evidence_id/unit/as_of/target_period)를 그대로 돌려줘 S5가 target
    컴포넌트의 provenance로 재사용할 수 있게 한다(GPT 리뷰 2026-07-16 16:28
    발견)."""
    relevant_ratios = [r for r in ratios if r.metric in _PROFILE_RATIO_METRICS]
    source_ids = [str(f.id) for f in facts]
    raw_evidence = ratios_to_numeric_evidence(
        relevant_ratios, corp_code, target_period, as_of, source_ids
    )
    fact_as_of = [f.filed_at for f in facts]
    checks = [
        DerivedCheckInput(
            record_id=str(evidence["numeric_evidence_id"]),
            corp_code=corp_code,
            source_ids=source_ids,
            source_corp_codes=[f.corp_code for f in facts],
            unit=str(evidence["unit"]),
            source_units=[f.normalized_unit for f in facts],
            as_of=as_of,
            # EPS/BPS/PER/PBR은 가격·발행주식 수도 입력이다 — 그 기준일(as_of,
            # _collect_price_and_shares가 이미 as_of==오늘로 검증)도 더한다.
            source_as_of=(
                fact_as_of + [as_of]
                if evidence["metric"] in _PRICE_AND_SHARES_RATIO_METRICS
                else fact_as_of
            ),
            formula_version=str(
                cast(dict[str, object], evidence["provenance"])["formula_version"]
            ),
            target_period=target_period,
            source_periods=[f.fiscal_period for f in facts],
        )
        for evidence in raw_evidence
    ]
    post_result = post_derived(checks, as_of)
    if post_result.rejected:
        checkpoints.append(
            Checkpoint(
                f"RATIO_POST_DERIVED_REJECTED_{corp_code}",
                f"{corp_code} 재무비율 중 S15 사후 검증 실패로 제외됨: "
                f"{', '.join(post_result.rejected)}",
                "WARNING",
            )
        )
    verified_ids = set(post_result.verified)
    return {
        str(ev["metric"]): ev
        for ev in raw_evidence
        if str(ev["numeric_evidence_id"]) in verified_ids
    }


class ValuationReportGenerator:
    def __init__(
        self,
        db: Session,
        opendart: OpenDartProvider,
        kis: KisProvider,
        *,
        today_provider: Callable[[], date] = date.today,
    ):
        self._db = db
        self._overview_collector = CompanyOverviewCollector(db, opendart)
        self._disclosure_collector = DisclosureCollector(db, opendart)
        self._market_collector = MarketCollector(db, kis)
        # KIS 현재가 endpoint는 거래일자를 제공하지 않는 "지금 이 순간" 스냅샷이라
        # as_of가 오늘이 아니면 그 가격을 as_of의 가격이라 증명할 수 없다(모듈
        # docstring 한계 참고) — "오늘"을 주입 가능하게 해 결정론 테스트를 유지한다.
        self._today = today_provider

    def generate(
        self,
        target: CompanySpec,
        candidates: list[CompanySpec],
        as_of: date,
        bsns_year: str,
        reprt_code: str,
        fs_div: str = "CFS",
    ) -> ValuationReport:
        checkpoints: list[Checkpoint] = []

        target_profile = self._build_profile(
            target, as_of, bsns_year, reprt_code, fs_div, checkpoints
        )
        candidate_profiles = [
            p
            for spec in candidates
            if (
                p := self._build_profile(
                    spec, as_of, bsns_year, reprt_code, fs_div, checkpoints
                )
            )
            is not None
        ]

        if target_profile is None:
            checkpoints.append(
                Checkpoint(
                    "TARGET_DATA_UNAVAILABLE",
                    "대상 기업의 시세·재무 데이터를 확보하지 못해 가치 범위를 계산할 수 없습니다.",
                    "ERROR",
                )
            )
            return ValuationReport(
                target_corp_code=target.corp_code,
                as_of=as_of,
                target_profile=None,
                peer_result=None,
                valuation=None,
                price_position=None,
                checkpoints=tuple(checkpoints),
            )

        peer_result = build_peer_universe(target_profile, candidate_profiles, as_of)
        if not peer_result.sufficient:
            checkpoints.append(
                Checkpoint(
                    "INSUFFICIENT_PEERS",
                    f"비교 가능한 peer가 {len(peer_result.peer_universe)}개로 기준"
                    f"({peer_result.quality_score:.0%})에 미달해 비교 Claim은 검증 불가입니다.",
                    "WARNING",
                )
            )

        # docs/skills.md 파이프라인 B는 S21·S5 산출 파생 Evidence도 노출 전에
        # S15.POST_DERIVED를 통과해야 한다고 명시한다(temporal_integrity.py
        # 모듈 docstring) — peer 상대가치는 여러 기업을 의도적으로 섞으므로
        # allowed_source_corp_codes(target+실제 peer universe)로 검사한다.
        allowed_corp_codes = [
            target_profile.corp_code,
            *(p.corp_code for p in peer_result.peer_universe),
        ]
        peer_result = replace(
            peer_result,
            numeric_evidence=_apply_post_derived_gate(
                peer_result.numeric_evidence,
                target_profile,
                allowed_corp_codes,
                as_of,
                checkpoints,
                "PEER_EVIDENCE_POST_DERIVED_REJECTED",
            ),
        )

        valuation = compute_valuation_scenarios(target_profile, peer_result, as_of)
        if valuation.data_quality != "SUFFICIENT":
            checkpoints.append(
                Checkpoint(
                    "VALUATION_INSUFFICIENT",
                    f"가치 범위를 계산할 수 없습니다({valuation.data_quality}).",
                    "WARNING",
                )
            )
        valuation = replace(
            valuation,
            numeric_evidence=_apply_post_derived_gate(
                valuation.numeric_evidence,
                target_profile,
                allowed_corp_codes,
                as_of,
                checkpoints,
                "VALUATION_EVIDENCE_POST_DERIVED_REJECTED",
            ),
        )

        price_position = compute_price_position(target_profile.price, valuation, as_of)

        return ValuationReport(
            target_corp_code=target.corp_code,
            as_of=as_of,
            target_profile=target_profile,
            peer_result=peer_result,
            valuation=valuation,
            price_position=price_position,
            checkpoints=tuple(checkpoints),
        )

    # ------------------------------------------------------------- profile

    def _build_profile(
        self,
        spec: CompanySpec,
        as_of: date,
        bsns_year: str,
        reprt_code: str,
        fs_div: str,
        checkpoints: list[Checkpoint],
    ) -> CompanyProfile | None:
        overview = self._collect_overview(spec, as_of, checkpoints)
        if overview is None:
            return None
        price, shares, price_ok = self._collect_price_and_shares(spec, as_of, checkpoints)
        if not price_ok or shares is None or price is None:
            return None
        ratios = self._collect_ratios(
            spec, as_of, bsns_year, reprt_code, fs_div, shares, price, checkpoints
        )
        if ratios is None:
            return None
        ratio_evidence, financial_as_of, financial_period = ratios

        def _val(metric: str) -> float | None:
            ev = ratio_evidence.get(metric)
            return float(cast(float, ev["value"])) if ev is not None else None

        return CompanyProfile(
            corp_code=spec.corp_code,
            corp_name=overview[0],
            stock_code=spec.stock_code,
            industry_code=overview[1],
            eps=_val("EPS"),
            bps=_val("BPS"),
            per=_val("PER"),
            pbr=_val("PBR"),
            roe=_val("ROE"),
            price=price,
            price_as_of=as_of,
            financial_as_of=financial_as_of,
            ratio_evidence=ratio_evidence,
            financial_period=financial_period,
        )

    def _collect_overview(
        self, spec: CompanySpec, as_of: date, checkpoints: list[Checkpoint]
    ) -> tuple[str, str] | None:
        try:
            record = self._overview_collector.collect(spec.corp_code)
        except ProviderError as exc:
            mapping = map_provider_error(exc)
            checkpoints.append(
                Checkpoint(
                    f"OVERVIEW_{mapping.reason_code}_{spec.corp_code}",
                    f"{spec.corp_code} 기업개요 조회 실패: {mapping.reason_code}",
                    "ERROR" if mapping.status.value == "EXTERNAL_ERROR" else "WARNING",
                )
            )
            return None
        overview = self._overview_collector.normalize(record, as_of)
        return overview.corp_name, overview.industry_code

    def _collect_price_and_shares(
        self, spec: CompanySpec, as_of: date, checkpoints: list[Checkpoint]
    ) -> tuple[float | None, Decimal | None, bool]:
        # 현재가 endpoint는 거래일자가 없는 "지금" 스냅샷이다 — as_of가 오늘이
        # 아니면 이 스냅샷을 as_of의 가격이라고 증명할 수 없으므로 호출조차 하지
        # 않고 안전 종료한다(모듈 docstring 한계, GPT 리뷰 2026-07-16 11:00 발견).
        today = self._today()
        if as_of != today:
            checkpoints.append(
                Checkpoint(
                    f"CURRENT_PRICE_AS_OF_MISMATCH_{spec.stock_code}",
                    f"{spec.stock_code} 시세는 거래일자를 제공하지 않는 현재가 조회로만 "
                    f"가능해 요청한 기준일({as_of.isoformat()})이 오늘({today.isoformat()})이 "
                    "아니면 그 시세를 검증할 수 없습니다.",
                    "WARNING",
                )
            )
            return None, None, False
        try:
            record = self._market_collector.collect_current_price(spec.stock_code)
        except ProviderError as exc:
            mapping = map_provider_error(exc)
            checkpoints.append(
                Checkpoint(
                    f"PRICE_{mapping.reason_code}_{spec.stock_code}",
                    f"{spec.stock_code} 시세 조회 실패: {mapping.reason_code}",
                    "ERROR" if mapping.status.value == "EXTERNAL_ERROR" else "WARNING",
                )
            )
            return None, None, False

        output = record.raw_payload.get("output") or {}
        # temp_stop_yn/mrkt_warn_cls_code — 거래정지·시장경고(관리종목 등) 신호를
        # 안전 종료 checkpoint로 표시한다(모듈 docstring 한계 참고, trade_date가
        # 없어 이 endpoint에서 얻을 수 있는 실제 staleness 신호).
        if output.get("temp_stop_yn") == "Y":
            checkpoints.append(
                Checkpoint(
                    f"TRADING_HALTED_{spec.stock_code}",
                    f"{spec.stock_code}는 현재 거래정지 상태입니다 — 가치 비교 제외 대상입니다.",
                    "WARNING",
                )
            )
            return None, None, False
        warn_code = output.get("mrkt_warn_cls_code")
        if warn_code and warn_code != "00":
            checkpoints.append(
                Checkpoint(
                    f"MARKET_WARNING_{spec.stock_code}",
                    f"{spec.stock_code}에 시장경고 코드({warn_code})가 있습니다.",
                    "WARNING",
                )
            )

        price_raw = output.get("stck_prpr")
        shares_raw = output.get("lstn_stcn")
        if not price_raw or not shares_raw or price_raw == "0" or shares_raw == "0":
            checkpoints.append(
                Checkpoint(
                    f"PRICE_NO_DATA_{spec.stock_code}",
                    f"{spec.stock_code} 시세·발행주식 수 데이터가 없습니다.",
                    "WARNING",
                )
            )
            return None, None, False
        return float(price_raw), Decimal(shares_raw), True

    def _collect_ratios(
        self,
        spec: CompanySpec,
        as_of: date,
        bsns_year: str,
        reprt_code: str,
        fs_div: str,
        shares: Decimal,
        price: float,
        checkpoints: list[Checkpoint],
    ) -> tuple[dict[str, dict[str, object]], date, str] | None:
        try:
            record = self._disclosure_collector.collect_financial_statements(
                spec.corp_code, bsns_year, reprt_code, fs_div
            )
        except ProviderError as exc:
            mapping = map_provider_error(exc)
            checkpoints.append(
                Checkpoint(
                    f"FINANCIALS_{mapping.reason_code}_{spec.corp_code}",
                    f"{spec.corp_code} 재무제표 조회 실패: {mapping.reason_code}",
                    "ERROR" if mapping.status.value == "EXTERNAL_ERROR" else "WARNING",
                )
            )
            return None

        norm = self._disclosure_collector.normalize([record], as_of=as_of)
        rows: list[FinancialFactRow] = norm.eligible_financial_rows
        if not rows:
            checkpoints.append(
                Checkpoint(
                    f"NO_FINANCIAL_DATA_{spec.corp_code}",
                    f"{spec.corp_code} 재무 데이터가 없습니다.",
                    "WARNING",
                )
            )
            return None

        calculator = FinancialCalculator()
        normalize_result = calculator.normalize(rows, stock_code=spec.stock_code)
        persisted = persist_facts_idempotently(self._db, normalize_result.facts)

        mapped = [f for f in persisted if f.metric_key is not None]
        if not mapped:
            checkpoints.append(
                Checkpoint(
                    f"NO_MAPPED_METRICS_{spec.corp_code}",
                    f"{spec.corp_code} 계정 매핑된 지표가 없습니다.",
                    "WARNING",
                )
            )
            return None

        facts_by_period: dict[str, list[FinancialFact]] = {}
        for fact in mapped:
            facts_by_period.setdefault(fact.fiscal_period, []).append(fact)
        selected_by_period, fs_div_warnings = select_fs_div(facts_by_period)
        for w in fs_div_warnings:
            checkpoints.append(Checkpoint(f"FS_DIV_WARNING_{spec.corp_code}", w, "WARNING"))

        if not selected_by_period:
            return None
        latest_period = sorted(selected_by_period)[-1]
        period_facts = selected_by_period[latest_period]
        best_by_metric = select_canonical_facts(period_facts)
        try:
            assert_single_fs_div(list(best_by_metric.values()))
        except ValueError as exc:
            checkpoints.append(
                Checkpoint(f"MIXED_FS_DIV_{spec.corp_code}", str(exc), "ERROR")
            )
            return None

        values = {k: Decimal(str(f.normalized_value)) for k, f in best_by_metric.items()}
        ratios = compute_ratios(values, shares, Decimal(str(price)))

        # target/peer EPS/BPS/PER/PBR/ROE는 downstream S21/S5 입력이자 API
        # target_profile로 그대로 노출되는 값이다 — 모듈 docstring의
        # "S3 -> S15.POST_DERIVED -> S21 -> ..." 순서대로 여기서도 검증 없이
        # 통과시키지 않는다(GPT 리뷰 2026-07-16 14:36 발견 — 이전에는
        # compute_ratios() 결과를 그대로 반환했다).
        verified_by_metric = _gate_ratio_evidence(
            ratios, list(best_by_metric.values()), spec.corp_code, latest_period, as_of, checkpoints
        )

        financial_as_of = max(f.filed_at for f in best_by_metric.values())
        return verified_by_metric, financial_as_of, latest_period
