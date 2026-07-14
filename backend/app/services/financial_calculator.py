"""S3 재무 정규화·계산 (docs/skills.md S3, CLAUDE.md 절대 원칙 5 결정론 우선).
S2 `eligible_financial_rows`를 계정 매핑·단위 정규화해 `FinancialFact`로 만들고,
S13 시세·발행주식 수와 결합해 PER/PBR/ROE 등 지표를 계산한다. 계산은 전부 코드이며
LLM을 쓰지 않는다.

account_id → metric_key 매핑은 실제 OpenDART 응답(2026-07-14, 삼성전자 CFS 연간·
반기·1/3분기, backend/tests/fixtures/opendart/financial_calculator/)에서 확인된
IFRS/DART 표준계정코드만 등록한다 — 추정으로 채우지 않는다(CLAUDE.md 절대 원칙 2).
매핑에 없는 account_id는 metric_key=None으로 raw만 보존한다("매핑 후보가 복수면
임의 선택하지 않고 부족 상태를 반환한다", docs/skills.md S3 제약).

thstrm_add_amount 처리(실제 라이브 호출로 확인, 임의 추정 아님): 분기·반기 보고서의
IS/CIS 계정은 thstrm_amount가 이미 "해당 분기·반기 단일 기간" 실제값이고
thstrm_add_amount가 "연초부터 누적값"이다(Q1+Q2+Q3 단일값 합계가 Q3의
thstrm_add_amount와 정확히 일치함을 실제 수치로 검증). annual 보고서는
thstrm_add_amount가 항상 빈 문자열이다. CF 계정은 분기·반기 보고서에서
thstrm_add_amount 필드 자체가 없고 thstrm_amount가 처음부터 누적값이다(한국
중간기간 현금흐름표는 관행상 누적으로만 표시됨) — 이 경우 이전 분기 누적값과의
차감으로 단일분기를 파생한다(`derive_single_period_value`).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from app.models.disclosure import REPRT_CODE_TO_REPORT_TYPE, FinancialFactRow, ReportType
from app.models.financial_fact import FinancialFact, FsDiv

S3_FORMULA_VERSION = "s3-financial-calculator-1.0.0"

# 단위 배율 — DART 재무제표 API는 실제로 항상 원 단위 정수를 준다(raw_unit=KRW),
# 그러나 계약("raw 값·단위와 normalized 값·단위 동시 저장")과 "0.15/15%, 원/천원/
# 백만원 혼동 방지" 요구를 만족하려면 provider가 스케일된 단위를 줄 가능성을 대비한
# 변환 유틸이 존재하고 테스트로 검증돼야 한다.
UNIT_SCALE: dict[str, int] = {"원": 1, "KRW": 1, "천원": 1_000, "백만원": 1_000_000}


class UnitConfusionError(ValueError):
    """0.15(비율)과 15(퍼센트 포인트) 같이 서로 다른 표현 단위를 명시적 태그 없이
    섞어 쓰려는 시도를 막는다 — 절대 자동으로 어느 쪽인지 추측하지 않는다."""


def normalize_amount(raw_value: str, raw_unit: str) -> tuple[Decimal, str]:
    if raw_unit not in UNIT_SCALE:
        raise ValueError(f"unknown raw_unit: {raw_unit}")
    try:
        parsed = Decimal(raw_value)
    except InvalidOperation as exc:
        raise ValueError(f"raw_value is not numeric: {raw_value!r}") from exc
    return parsed * UNIT_SCALE[raw_unit], "KRW"


def parse_ratio(value: Decimal, source_unit: str) -> Decimal:
    """`source_unit`이 "RATIO"(0.15=15%)인지 "PERCENT"(15=15%)인지 호출자가
    명시해야만 변환한다 — 태그 없는 값을 추측해서 나누거나 곱하지 않는다."""
    if source_unit == "RATIO":
        return value
    if source_unit == "PERCENT":
        return value / Decimal(100)
    raise UnitConfusionError(f"unknown ratio source_unit: {source_unit!r}")


ACCOUNT_METRIC_MAP: dict[str, str] = {
    "ifrs-full_Revenue": "REVENUE",
    "ifrs-full_CostOfSales": "COST_OF_SALES",
    "ifrs-full_GrossProfit": "GROSS_PROFIT",
    "dart_OperatingIncomeLoss": "OPERATING_INCOME",
    "ifrs-full_ProfitLossBeforeTax": "PROFIT_BEFORE_TAX",
    "ifrs-full_ProfitLoss": "NET_INCOME",
    "ifrs-full_Assets": "TOTAL_ASSETS",
    "ifrs-full_Liabilities": "TOTAL_LIABILITIES",
    "ifrs-full_Equity": "TOTAL_EQUITY",
    "ifrs-full_CurrentAssets": "CURRENT_ASSETS",
    "ifrs-full_CashFlowsFromUsedInOperatingActivities": "OPERATING_CASH_FLOW",
    "ifrs-full_CashFlowsFromUsedInInvestingActivities": "INVESTING_CASH_FLOW",
    "ifrs-full_CashFlowsFromUsedInFinancingActivities": "FINANCING_CASH_FLOW",
    "ifrs-full_DividendsPaidClassifiedAsFinancingActivities": "DIVIDENDS_PAID",
    "ifrs-full_BasicEarningsLossPerShare": "EPS_BASIC",
    "ifrs-full_DilutedEarningsLossPerShare": "EPS_DILUTED",
}

# 실제 삼성전자 데이터로 확인: account_id "ifrs-full_ProfitLoss"(당기순이익)는
# IS·CIS·CF·SCE에 모두 나타나고, SCE는 같은 account_id를 자본 구성요소별로 여러
# 행(그중 다수가 0)으로 쪼개 낸다. metric_key가 같다고 아무 행이나 쓰면 안 되므로
# 지표별로 신뢰할 단일 sj_div를 명시적으로 고정한다 — 미지정 metric_key는 sj_div를
# 구분하지 않는다(현재 매핑된 metric 전부가 아래에 있음).
METRIC_CANONICAL_SJ_DIV: dict[str, str] = {
    "REVENUE": "IS",
    "COST_OF_SALES": "IS",
    "GROSS_PROFIT": "IS",
    "OPERATING_INCOME": "IS",
    "PROFIT_BEFORE_TAX": "IS",
    "NET_INCOME": "IS",
    "EPS_BASIC": "IS",
    "EPS_DILUTED": "IS",
    "TOTAL_ASSETS": "BS",
    "TOTAL_LIABILITIES": "BS",
    "TOTAL_EQUITY": "BS",
    "CURRENT_ASSETS": "BS",
    "OPERATING_CASH_FLOW": "CF",
    "INVESTING_CASH_FLOW": "CF",
    "FINANCING_CASH_FLOW": "CF",
    "DIVIDENDS_PAID": "CF",
}

# BS(재무상태표)는 시점 스냅샷이라 누적 개념이 없다. CF는 중간기간 보고서에서
# 처음부터 누적으로만 온다(add_amount 필드 자체가 없음). IS/CIS/SCE만 add_amount
# 유무로 단일/누적을 구분한다.
_SNAPSHOT_SJ_DIVS = frozenset({"BS"})
_ALWAYS_CUMULATIVE_INTERIM_SJ_DIVS = frozenset({"CF"})


@dataclass(frozen=True)
class FactCandidate:
    account_id: str
    account_name: str
    account_detail: str | None
    sj_div: str
    raw_value: str
    is_cumulative: bool
    fiscal_period: str


def _row_fact_candidates(row: FinancialFactRow, report_type: ReportType) -> list[FactCandidate]:
    candidates: list[FactCandidate] = []
    period_label = f"{row.bsns_year}-{report_type.value}"
    is_annual = report_type is ReportType.ANNUAL

    if row.sj_div in _SNAPSHOT_SJ_DIVS or is_annual:
        if row.thstrm_amount is not None:
            candidates.append(
                FactCandidate(
                    row.account_id, row.account_nm, row.account_detail, row.sj_div,
                    row.thstrm_amount, is_cumulative=False, fiscal_period=period_label,
                )
            )
        return candidates

    if row.sj_div in _ALWAYS_CUMULATIVE_INTERIM_SJ_DIVS:
        if row.thstrm_amount is not None:
            candidates.append(
                FactCandidate(
                    row.account_id, row.account_nm, row.account_detail, row.sj_div,
                    row.thstrm_amount, is_cumulative=True, fiscal_period=period_label,
                )
            )
        return candidates

    # IS/CIS/SCE on a quarterly/half report: DART gives both the single-period
    # actual (thstrm_amount) and the year-to-date cumulative (thstrm_add_amount)
    # directly — no subtraction needed, both are preserved as distinct facts.
    if row.thstrm_amount is not None:
        candidates.append(
            FactCandidate(
                row.account_id, row.account_nm, row.account_detail, row.sj_div,
                row.thstrm_amount, is_cumulative=False, fiscal_period=period_label,
            )
        )
    if row.thstrm_add_amount is not None:
        candidates.append(
            FactCandidate(
                row.account_id, row.account_nm, row.account_detail, row.sj_div,
                row.thstrm_add_amount, is_cumulative=True, fiscal_period=period_label,
            )
        )
    return candidates


@dataclass(frozen=True)
class FinancialNormalizeResult:
    facts: list[FinancialFact] = field(default_factory=list)
    numeric_evidence: list[dict[str, object]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)


class FinancialCalculator:
    def normalize(
        self, eligible_rows: list[FinancialFactRow], stock_code: str
    ) -> FinancialNormalizeResult:
        # eligible_rows는 이미 S2 NORMALIZE + S15 PRE_NORMALIZE를 통과한
        # FinancialFactRow다(docs/skills.md S3 입력 계약) — 여기서 as_of를 다시
        # 받지 않는 것은 실수가 아니라 시점 필터링 책임이 여기 없다는 뜻이다.
        facts: list[FinancialFact] = []
        warnings: list[str] = []
        trace: list[str] = []

        for row in eligible_rows:
            report_type = REPRT_CODE_TO_REPORT_TYPE.get(row.reprt_code, ReportType.OTHER)
            metric_key = ACCOUNT_METRIC_MAP.get(row.account_id)
            if metric_key is None:
                trace.append(f"{row.account_id}({row.account_nm}): no metric mapping, raw only")
            for candidate in _row_fact_candidates(row, report_type):
                try:
                    normalized_value, normalized_unit = normalize_amount(
                        candidate.raw_value, row.currency or "KRW"
                    )
                except ValueError as exc:
                    warnings.append(f"{row.rcept_no}/{row.account_id}: {exc}")
                    continue
                facts.append(
                    FinancialFact(
                        corp_code=row.corp_code,
                        stock_code=stock_code,
                        account_id=candidate.account_id,
                        account_name=candidate.account_name,
                        account_detail=candidate.account_detail,
                        metric_key=metric_key,
                        raw_value=candidate.raw_value,
                        raw_unit=row.currency or "KRW",
                        normalized_value=normalized_value,
                        normalized_unit=normalized_unit,
                        fiscal_period=candidate.fiscal_period,
                        reprt_code=row.reprt_code,
                        report_type=report_type.value,
                        sj_div=row.sj_div,
                        fs_div=FsDiv(row.fs_div),
                        is_cumulative=candidate.is_cumulative,
                        is_provisional=False,
                        rcept_no=row.rcept_no,
                        filed_at=row.filed_at,
                        source_url=(
                            f"https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
                            f"?rcept_no={row.rcept_no}"
                        ),
                    )
                )

        return FinancialNormalizeResult(facts=facts, warnings=warnings, trace=trace)


# --------------------------------------------------------------- CFS/OFS 선택


def select_fs_div(
    facts_by_period: dict[str, list[FinancialFact]],
) -> tuple[dict[str, list[FinancialFact]], list[str]]:
    """기간별로 CFS를 우선하고, 그 기간에 CFS가 없으면 OFS로 fallback한다
    (docs/checklist.md C4 "두 기간 CFS 우선, OFS 일관 fallback"). 기간마다 다른
    fs_div를 썼다면 그 사실을 경고로 남긴다 — 숨기지 않는다."""
    selected: dict[str, list[FinancialFact]] = {}
    warnings: list[str] = []
    used_fs_divs: set[FsDiv] = set()
    for period, facts in facts_by_period.items():
        cfs_facts = [f for f in facts if f.fs_div is FsDiv.CFS]
        ofs_facts = [f for f in facts if f.fs_div is FsDiv.OFS]
        if cfs_facts:
            selected[period] = cfs_facts
            used_fs_divs.add(FsDiv.CFS)
        elif ofs_facts:
            selected[period] = ofs_facts
            used_fs_divs.add(FsDiv.OFS)
            warnings.append(f"{period}: CFS 없음, OFS로 fallback")
        else:
            selected[period] = []
    if len(used_fs_divs) > 1:
        warnings.append(
            f"기간별로 서로 다른 fs_div가 선택됨({sorted(v.value for v in used_fs_divs)}) — "
            "시계열 일관성 주의"
        )
    return selected, warnings


def select_canonical_facts(facts: list[FinancialFact]) -> dict[str, FinancialFact]:
    """metric_key당 계산에 쓸 fact 하나를 고른다. 같은 metric_key가 여러 sj_div에
    걸쳐 나타나면(예: "당기순이익"이 IS·CIS·CF·SCE 전부에 있고 SCE는 자본 구성요소별
    0 값을 포함) `METRIC_CANONICAL_SJ_DIV`가 지정한 sj_div만 신뢰한다. 같은
    sj_div 안에서 단일기간/누적 두 버전이 있으면 단일기간(is_cumulative=False)을
    우선한다."""
    by_metric: dict[str, list[FinancialFact]] = {}
    for fact in facts:
        if fact.metric_key is None:
            continue
        by_metric.setdefault(fact.metric_key, []).append(fact)

    selected: dict[str, FinancialFact] = {}
    for metric_key, candidates in by_metric.items():
        canonical_sj_div = METRIC_CANONICAL_SJ_DIV.get(metric_key)
        pool = (
            [f for f in candidates if f.sj_div == canonical_sj_div]
            if canonical_sj_div is not None
            else candidates
        )
        if not pool:
            continue
        best = pool[0]
        for candidate in pool[1:]:
            if best.is_cumulative and not candidate.is_cumulative:
                best = candidate
        selected[metric_key] = best
    return selected


def assert_single_fs_div(facts: list[FinancialFact]) -> None:
    """CFS/OFS 혼합 금지(docs/checklist.md C4) — 같은 계산에 들어가는 fact들이
    서로 다른 fs_div면 계산을 중단한다. 다른 기업·기간·단위가 섞여도 마찬가지다."""
    fs_divs = {f.fs_div for f in facts}
    if len(fs_divs) > 1:
        raise ValueError(f"CFS/OFS mixed in one calculation: {sorted(v.value for v in fs_divs)}")
    corp_codes = {f.corp_code for f in facts}
    if len(corp_codes) > 1:
        raise ValueError(f"multiple corp_code mixed in one calculation: {sorted(corp_codes)}")
    fiscal_periods = {f.fiscal_period for f in facts}
    if len(fiscal_periods) > 1:
        raise ValueError(
            f"multiple fiscal_period mixed in one calculation: {sorted(fiscal_periods)}"
        )
    units = {f.normalized_unit for f in facts}
    if len(units) > 1:
        raise ValueError(f"multiple units mixed in one calculation: {sorted(units)}")


# ------------------------------------------------------ 누적값 → 단일분기 변환


def derive_single_period_value(
    cumulative_current: Decimal, cumulative_previous: Decimal
) -> Decimal:
    """반기·3분기 누적값에서 직전 누적값을 빼 단일분기 실제값을 구한다(예:
    2분기 단독 영업활동현금흐름 = 반기 누적 − 1분기 누적). CF처럼 provider가
    누적값만 주는 sj_div에 쓰인다 — IS/CIS는 provider가 이미 단일분기값
    (thstrm_amount)을 따로 주므로 이 함수가 필요 없다."""
    return cumulative_current - cumulative_previous


def derive_single_quarter_fact(
    current_cumulative: FinancialFact, previous_cumulative: FinancialFact
) -> FinancialFact:
    if current_cumulative.corp_code != previous_cumulative.corp_code:
        raise ValueError("cannot derive single-quarter value across different corp_code")
    if current_cumulative.account_id != previous_cumulative.account_id:
        raise ValueError("cannot derive single-quarter value across different account_id")
    if current_cumulative.fs_div is not previous_cumulative.fs_div:
        raise ValueError("cannot derive single-quarter value across different fs_div (CFS/OFS)")
    derived_value = derive_single_period_value(
        Decimal(str(current_cumulative.normalized_value)),
        Decimal(str(previous_cumulative.normalized_value)),
    )
    return FinancialFact(
        corp_code=current_cumulative.corp_code,
        stock_code=current_cumulative.stock_code,
        account_id=current_cumulative.account_id,
        account_name=current_cumulative.account_name,
        account_detail=current_cumulative.account_detail,
        metric_key=current_cumulative.metric_key,
        raw_value=str(derived_value),
        raw_unit=current_cumulative.raw_unit,
        normalized_value=derived_value,
        normalized_unit=current_cumulative.normalized_unit,
        fiscal_period=current_cumulative.fiscal_period,
        reprt_code=current_cumulative.reprt_code,
        report_type=current_cumulative.report_type,
        sj_div=current_cumulative.sj_div,
        fs_div=current_cumulative.fs_div,
        is_cumulative=False,
        is_provisional=current_cumulative.is_provisional,
        is_derived=True,
        derivation_note=(
            f"{current_cumulative.fiscal_period} 누적({current_cumulative.normalized_value}) − "
            f"{previous_cumulative.fiscal_period} 누적({previous_cumulative.normalized_value})"
        ),
        rcept_no=current_cumulative.rcept_no,
        filed_at=current_cumulative.filed_at,
        source_url=current_cumulative.source_url,
    )


# --------------------------------------------------------------------- 지표


SIGN_TRANSITION_VERSION = "s3-sign-transition-1.0.0"


def classify_sign_transition(previous: Decimal, current: Decimal) -> str:
    """흑자전환·적자지속은 verdict가 아니라 reason_code다(CLAUDE.md Verdict 계약).
    부호가 다른 두 기간의 증감률은 배수로 의미가 없으므로, YoY/QoQ 계산 전에 이
    reason_code로 분류해 호출자가 배율 계산을 생략하게 한다."""
    if previous < 0 and current > 0:
        return "PROFIT_TURNAROUND"
    if previous < 0 and current <= 0:
        return "CONTINUED_LOSS"
    if previous >= 0 and current < 0:
        return "PROFIT_TO_LOSS"
    return "CONTINUED_PROFIT"


@dataclass(frozen=True)
class RatioResult:
    metric: str
    value: Decimal | None
    unit: str
    formula: str
    formula_version: str
    warning: str | None = None


FORMULA_REGISTRY: dict[str, str] = {
    "OPERATING_MARGIN": "OPERATING_INCOME / REVENUE",
    "NET_MARGIN": "NET_INCOME / REVENUE",
    "DEBT_RATIO": "TOTAL_LIABILITIES / TOTAL_EQUITY",
    "PAYOUT_RATIO": "DIVIDENDS_PAID / NET_INCOME",
    "ROE": "NET_INCOME / TOTAL_EQUITY",
    "EPS": "NET_INCOME / SHARES_OUTSTANDING",
    "BPS": "TOTAL_EQUITY / SHARES_OUTSTANDING",
    "PER": "PRICE / EPS",
    "PBR": "PRICE / BPS",
}


def _safe_ratio(metric: str, numerator: Decimal, denominator: Decimal, unit: str) -> RatioResult:
    formula = FORMULA_REGISTRY[metric]
    if denominator == 0:
        return RatioResult(metric, None, unit, formula, S3_FORMULA_VERSION, warning="분모 0")
    return RatioResult(metric, numerator / denominator, unit, formula, S3_FORMULA_VERSION)


def compute_ratios(
    values: dict[str, Decimal], shares_outstanding: Decimal | None, price: Decimal | None
) -> list[RatioResult]:
    """`values`는 이미 CFS/OFS·기업·단위가 통일된 metric_key -> normalized_value
    dict다(호출자가 `assert_single_fs_div`를 먼저 통과한 facts에서 만든다).
    필요한 metric이 없으면 그 지표만 건너뛴다(전체를 실패시키지 않되, 조용히
    누락시키지도 않는다 — warning으로 드러남은 호출자 책임)."""
    results: list[RatioResult] = []

    revenue = values.get("REVENUE")
    operating_income = values.get("OPERATING_INCOME")
    net_income = values.get("NET_INCOME")
    liabilities = values.get("TOTAL_LIABILITIES")
    equity = values.get("TOTAL_EQUITY")
    dividends_paid = values.get("DIVIDENDS_PAID")

    if operating_income is not None and revenue is not None:
        results.append(_safe_ratio("OPERATING_MARGIN", operating_income, revenue, "RATIO"))
    if net_income is not None and revenue is not None:
        results.append(_safe_ratio("NET_MARGIN", net_income, revenue, "RATIO"))
    if liabilities is not None and equity is not None:
        results.append(_safe_ratio("DEBT_RATIO", liabilities, equity, "RATIO"))
    if dividends_paid is not None and net_income is not None:
        # 현금흐름표의 배당금 지급액은 양수 유출이 아니라 부호가 뒤집혀 올 수 있어
        # (실제 삼성전자 데이터에서 양수로 확인됨, 그러나 provider마다 다를 수 있어
        # 절댓값으로 방향을 통일한다) 배당성향은 항상 절댓값 비율로 계산한다.
        results.append(_safe_ratio("PAYOUT_RATIO", abs(dividends_paid), abs(net_income), "RATIO"))
    if net_income is not None and equity is not None:
        results.append(_safe_ratio("ROE", net_income, equity, "RATIO"))

    if net_income is not None and shares_outstanding:
        eps = _safe_ratio("EPS", net_income, shares_outstanding, "KRW_PER_SHARE")
        results.append(eps)
        if price is not None and eps.value is not None and eps.value != 0:
            results.append(_safe_ratio("PER", price, eps.value, "RATIO"))
        elif price is not None:
            results.append(
                RatioResult("PER", None, "RATIO", FORMULA_REGISTRY["PER"], S3_FORMULA_VERSION,
                             warning="EPS가 0이거나 계산 불가")
            )

    if equity is not None and shares_outstanding:
        bps = _safe_ratio("BPS", equity, shares_outstanding, "KRW_PER_SHARE")
        results.append(bps)
        if price is not None and bps.value is not None and bps.value != 0:
            results.append(_safe_ratio("PBR", price, bps.value, "RATIO"))
        elif price is not None:
            results.append(
                RatioResult("PBR", None, "RATIO", FORMULA_REGISTRY["PBR"], S3_FORMULA_VERSION,
                             warning="BPS가 0이거나 계산 불가")
            )

    return results


def ratios_to_numeric_evidence(
    ratios: list[RatioResult],
    corp_code: str,
    target_period: str,
    as_of: date,
    source_ids: list[str],
) -> list[dict[str, object]]:
    evidence: list[dict[str, object]] = []
    for ratio in ratios:
        if ratio.value is None:
            continue
        evidence.append(
            {
                "numeric_evidence_id": str(uuid.uuid4()),
                "evidence_domain": "financial",
                "corp_code": corp_code,
                "metric": ratio.metric,
                "value": float(ratio.value),
                "unit": ratio.unit,
                "target_period": target_period,
                "as_of": as_of.isoformat(),
                "formula": ratio.formula,
                "source_ids": source_ids,
                "provenance": {"formula_version": ratio.formula_version},
                "integrity_status": "VERIFIED",
            }
        )
    return evidence
