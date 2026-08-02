import type { OnboardingProfile, SortOption, Subsidy, SubsidyListItem } from '@hub/shared'
import { sampleSubsidies } from '../data/sample-subsidies.js'
import { rowToSubsidy, type SubsidyRow } from './mappers.js'
import { SUBSIDIES_TABLE, supabase } from './supabase.js'

/**
 * subsidies 조회 레포지토리.
 * "데이터를 어디서/어떻게 가져오는가"를 라우트에서 분리하기 위함.
 * 라우트는 이 레이어만 호출한다 — Supabase 접근·정렬·fallback을 여기 한곳에 모은다.
 * Supabase 조회가 실패하면 서버가 죽지 않도록 sample-subsidies.ts로 fallback한다.
 */

/**
 * loadAll()/findAll()/match() 내부 전용 타입 (이슈 #114) — 리스트 화면에 노출되는
 * `SubsidyListItem` 필드 + 매칭/정렬 로직(scoreForProfile/matchesRegion/matchesSupportRealm)이
 * 계산에 쓰는 필드만 담는다. 상세 전용 텍스트 필드(method/qualifications/documents/how/
 * where/whereUrl/contact 등)는 리스트 조회에서 아예 select하지 않으므로 여기에도 없다.
 * client에는 이 타입 그대로 내려주지 않고 `toListItem()`으로 `SubsidyListItem`으로 축소한 뒤 응답한다.
 */
type MatchCandidate = SubsidyListItem & {
  region: string[]
  supportRealm: string
  employeesMaxCount?: number
  revenueMaxKrw?: number
  businessYearsMax?: number
}

/** loadAll()이 Supabase에서 select하는 컬럼만 담은 row 형태 */
type MatchCandidateRow = Pick<
  SubsidyRow,
  | 'id'
  | 'name'
  | 'org'
  | 'amount'
  | 'dday'
  | 'match_score'
  | 'deadline'
  | 'region'
  | 'support_realm'
  | 'employees_max_count'
  | 'revenue_max_krw'
  | 'business_years_max'
>

/** 축소된 row → MatchCandidate 매핑 (findById용 rowToSubsidy와 별개, mappers.ts는 건드리지 않음) */
function rowToMatchCandidate(row: MatchCandidateRow): MatchCandidate {
  return {
    id: row.id,
    name: row.name,
    org: row.org,
    amount: row.amount,
    dday: row.dday,
    match: row.match_score,
    deadline: row.deadline,
    region: row.region,
    supportRealm: row.support_realm,
    employeesMaxCount: row.employees_max_count ?? undefined,
    revenueMaxKrw: row.revenue_max_krw ?? undefined,
    businessYearsMax: row.business_years_max ?? undefined,
  }
}

/** MatchCandidate → client 응답용 SubsidyListItem (region/supportRealm 등 매칭 내부 정보는 안 내려줌) */
function toListItem(candidate: MatchCandidate): SubsidyListItem {
  return {
    id: candidate.id,
    name: candidate.name,
    org: candidate.org,
    amount: candidate.amount,
    dday: candidate.dday,
    match: candidate.match,
    deadline: candidate.deadline,
  }
}

/**
 * 여전히 `Subsidy[]`로 둔다 — `findById()`가 그대로 이 배열에서 상세 fallback을 찾아 쓰고,
 * `Subsidy`는 `MatchCandidate`보다 필드가 많아 구조적으로 호환되므로 `loadAll()`이
 * `Promise<MatchCandidate[]>`를 반환하는 자리에 그대로 써도 타입 에러가 나지 않는다.
 */
const FALLBACK: Subsidy[] = sampleSubsidies as Subsidy[]

/**
 * '최대 5천만원' → 5000, '최대 300만원' → 300, '최대 40억원' → 400000 (정렬용 상대 크기, 만원 단위).
 * FE sortSubsidies와 규칙 통일. 크롤러 extractAmount(#44)가 백만/억/소수점 단위도 뽑아내므로
 * 이 네 단위를 모두 인식해야 금액순 정렬이 깨지지 않는다.
 * 콤마는 매칭 전에 제거한다 — AI 추출(#67)은 원문 표현을 그대로 보존하므로 '6,000만원'처럼
 * 콤마가 낀 값이 들어올 수 있고, 콤마를 두면 '000만'만 잡혀 0으로 계산돼 정렬이 깨진다.
 * 억/천만/백만/만 단위 표기가 전혀 없는 원 단위 금액('60,000,000원')에도 fallback으로 대응한다.
 */
function parseAmountForSort(amount: string): number {
  const normalized = amount.replace(/,/g, '')
  const eok = normalized.match(/(\d+(?:\.\d+)?)\s*억/)
  if (eok) return Number(eok[1]) * 10000
  const cheonMan = normalized.match(/(\d+(?:\.\d+)?)\s*천만/)
  if (cheonMan) return Number(cheonMan[1]) * 1000
  const baekMan = normalized.match(/(\d+(?:\.\d+)?)\s*백만/)
  if (baekMan) return Number(baekMan[1]) * 100
  const man = normalized.match(/(\d+(?:\.\d+)?)\s*만/)
  if (man) return Number(man[1])
  const won = normalized.match(/(\d+)\s*원/)
  if (won) return Number(won[1]) / 10000
  return 0
}

/**
 * 정렬 규칙: match(내림차순) · deadline(dday 오름차순) · amount(금액 내림차순) · new(원순서 유지).
 * match/deadline/amount는 동점일 때 id로 2차 정렬한다 — 이슈 #48 페이지네이션 도입 후 같은
 * 요청(같은 profile/sort)을 여러 페이지에 걸쳐 반복 호출해도 순서가 흔들리지 않게 하기 위함
 * (동점 항목이 많은 region 가중치 특성상 결정적 정렬이 아니면 항목 중복/누락이 생길 수 있음).
 */
function applySort(items: MatchCandidate[], sort: SortOption): MatchCandidate[] {
  const copy = [...items]
  switch (sort) {
    case 'deadline':
      return copy.sort((a, b) => a.dday - b.dday || a.id.localeCompare(b.id))
    case 'amount':
      return copy.sort(
        (a, b) => parseAmountForSort(b.amount) - parseAmountForSort(a.amount) || a.id.localeCompare(b.id),
      )
    case 'new':
      return copy
    case 'match':
    default:
      return copy.sort((a, b) => b.match - a.match || a.id.localeCompare(b.id))
  }
}

export interface PagedResult {
  items: SubsidyListItem[]
  /** 페이지네이션 이전 전체 건수 */
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export const DEFAULT_PAGE = 1
export const DEFAULT_LIMIT = 20

/**
 * 정렬된 배열을 page/limit 기준으로 자른다 (이슈 #48). 반환 직전 `MatchCandidate` →
 * `SubsidyListItem`으로 축소한다 — client에 region/supportRealm 등 매칭 내부 정보를
 * 내려줄 필요가 없어서다 (이슈 #114).
 */
function paginate(items: MatchCandidate[], page: number, limit: number): PagedResult {
  const total = items.length
  const start = (page - 1) * limit
  return {
    items: items.slice(start, start + limit).map(toListItem),
    total,
    page,
    limit,
    hasMore: start + limit < total,
  }
}

/** PostgREST가 .range() 없이는 최대 1000행까지만 반환하므로, 페이지 단위로 순회해 전부 가져온다 */
const PAGE_SIZE = 1000

/**
 * loadAll() 결과 캐시 (이슈 #109) — TTL 10분.
 * 크롤러는 하루 1회(`.github/workflows/crawler.yml`)만 테이블을 갱신하므로 훨씬 길게 잡아도
 * 무방하지만, 너무 길면 "방금 갱신된 데이터가 안 보인다"는 체감 지연이 생길 수 있어 10분으로
 * 절충했다(이슈 #113). `/api/match`·`/api/subsidies`가 loadAll()을 공유하므로 캐시도 여기 한 곳에만 둔다.
 * 캐시는 항상 원본 MatchCandidate[]만 보관하고, 필터링/정렬(match/findAll)은 매 호출마다 새로
 * 수행한다 — profile마다 결과가 달라지는 필터링된 결과는 절대 캐싱하지 않는다.
 * Supabase 에러로 FALLBACK을 반환한 경우는 캐싱하지 않는다 — 다음 요청에서 재시도할 수 있도록.
 * 여러 요청이 동시에 cold-cache 상태로 들어와 각자 Supabase를 중복 호출하는 케이스는 이번
 * 이슈 범위 밖 (단순 TTL 캐시로 충분, 동시 중복 조회 방지는 별도 이슈로 미룸).
 *
 * 이슈 #113: 실측 로그 기준 cache miss(전체 재조회) ~2.5초 vs cache hit ~1.4ms — 60초 TTL이라
 * cache miss를 겪는 요청 비율이 불필요하게 높았다. 크롤러가 하루 1회만 갱신하므로 TTL을 몇 분
 * 단위로 늘려도 "신선하지 않은 데이터"로 인한 체감 손실은 거의 없고, Render 재배포/재시작마다
 * 캐시가 초기화되므로 TTL은 사실상 "재시작 전까지 최대 이만큼 묵힌다"는 상한선일 뿐이다. 다만
 * 관리자가 데이터를 수동으로 고친 경우 하루 종일 반영이 안 되면 안 되므로, 5~15분 범위 안에서
 * "합리적으로 빠른 시간 안에" 반영되도록 10분으로 정했다.
 */
const CACHE_TTL_MS = 600_000
let cache: { data: MatchCandidate[]; fetchedAt: number } | null = null

/** 테스트 전용: 모듈 스코프 캐시를 초기화한다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetLoadAllCacheForTests(): void {
  cache = null
}

/**
 * findById() 결과 캐시 (이슈 #122) — loadAll()과 동일한 TTL 정책(10분, 이슈 #113 근거 참고).
 * id별로 원본 Subsidy(프로필 무관, DB 그대로의 값)만 캐싱한다 — `scoreForProfile`은 캐시
 * 히트/미스와 무관하게 항상 요청 시점에 재계산한다 (한 사용자의 프로필로 계산된 match 값이
 * 캐시에 박혀서 다른 프로필 요청에 잘못 나가면 안 되므로). Supabase 에러로 FALLBACK을 반환한
 * 경우는 loadAll()과 동일하게 캐싱하지 않는다 — 다음 요청에서 재시도할 수 있도록.
 */
const DETAIL_CACHE_TTL_MS = 600_000
const detailCache = new Map<string, { data: Subsidy; fetchedAt: number }>()

/** 테스트 전용: findById() 캐시를 초기화한다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetFindByIdCacheForTests(): void {
  detailCache.clear()
}

/**
 * 리스트/매칭에 필요한 컬럼만 select — 상세 전용 텍스트 필드(method/qualifications/documents/
 * how/apply_where/where_url/contact 등)는 리스트 조회에서 아예 가져오지 않는다 (이슈 #114).
 * `findById()`는 이 select를 쓰지 않고 그대로 `select('*')`를 유지한다.
 */
const LIST_SELECT_COLUMNS =
  'id, name, org, amount, dday, match_score, deadline, region, support_realm, employees_max_count, revenue_max_krw, business_years_max'

/** Supabase에서 리스트/매칭용 컬럼만 읽어 MatchCandidate[]로 변환. 실패 시 fallback 반환 */
async function loadAll(): Promise<MatchCandidate[]> {
  if (cache && performance.now() - cache.fetchedAt < CACHE_TTL_MS) {
    console.log(`[timing] loadAll: cache hit (age=${(performance.now() - cache.fetchedAt).toFixed(1)}ms), supabase 조회 생략`)
    return cache.data
  }
  console.log('[timing] loadAll: cache miss, supabase 조회 시작')

  const startedAt = performance.now()
  const rows: MatchCandidateRow[] = []
  let from = 0
  let roundTrips = 0

  for (;;) {
    const fetchStartedAt = performance.now()
    const { data, error } = await supabase
      .from(SUBSIDIES_TABLE)
      .select(LIST_SELECT_COLUMNS)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    roundTrips += 1
    console.log(
      `[timing] loadAll: supabase round trip #${roundTrips} (rows=${data?.length ?? 0}) took ${(performance.now() - fetchStartedAt).toFixed(1)}ms`,
    )

    if (error) {
      console.error('[subsidies-repo] Supabase 조회 실패, 샘플 데이터로 대체:', error.message)
      return FALLBACK
    }

    rows.push(...(data as unknown as MatchCandidateRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const mapStartedAt = performance.now()
  const mapped = rows.map(rowToMatchCandidate)
  console.log(
    `[timing] loadAll: rowToMatchCandidate mapping (${rows.length} rows) took ${(performance.now() - mapStartedAt).toFixed(1)}ms`,
  )
  console.log(`[timing] loadAll: total (${roundTrips} round trip(s)) took ${(performance.now() - startedAt).toFixed(1)}ms`)

  cache = { data: mapped, fetchedAt: performance.now() }
  return mapped
}

/** 전체 목록 (정렬 + 페이지네이션 적용) */
export async function findAll(
  sort: SortOption = 'match',
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_LIMIT,
): Promise<PagedResult> {
  const items = await loadAll()
  const sortStartedAt = performance.now()
  const sorted = applySort(items, sort)
  console.log(`[timing] findAll: applySort(${sort}, ${items.length} items) took ${(performance.now() - sortStartedAt).toFixed(1)}ms`)
  return paginate(sorted, page, limit)
}

/**
 * 단건 조회 — 없으면 null.
 * `profile`이 주어지면 `match()`와 동일한 `scoreForProfile()`로 매칭도를 재계산한다(이슈 #61) —
 * 리스트에서 이미 계산된 값을 캐시로 재사용하지 못하는 경우(직접 URL 접속·새로고침)에만
 * 호출되는 fallback 경로라, 리스트와 상세의 매칭도가 항상 같은 공식으로 나오게 보장한다.
 */
export async function findById(
  id: string,
  profile?: Pick<OnboardingProfile, 'region' | 'supportRealm'>,
): Promise<Subsidy | null> {
  const cached = detailCache.get(id)
  let item: Subsidy

  if (cached && performance.now() - cached.fetchedAt < DETAIL_CACHE_TTL_MS) {
    console.log(
      `[timing] findById: cache hit (id=${id}, age=${(performance.now() - cached.fetchedAt).toFixed(1)}ms), supabase 조회 생략`,
    )
    item = cached.data
  } else {
    console.log(`[timing] findById: cache miss (id=${id}), supabase 조회 시작`)
    const startedAt = performance.now()
    const { data, error } = await supabase
      .from(SUBSIDIES_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()
    console.log(`[timing] findById: supabase 조회 took ${(performance.now() - startedAt).toFixed(1)}ms`)

    if (error) {
      console.error('[subsidies-repo] 단건 조회 실패, 샘플 데이터로 대체:', error.message)
      const fallback = FALLBACK.find((item) => item.id === id)
      if (!fallback) return null
      return profile ? { ...fallback, match: scoreForProfile(fallback, profile) } : fallback
    }
    if (!data) return null

    item = rowToSubsidy(data as SubsidyRow)
    detailCache.set(id, { data: item, fetchedAt: performance.now() })
  }

  return profile ? { ...item, match: scoreForProfile(item, profile) } : item
}

/**
 * region 조건 가점 (이슈 #43, #62).
 * - subsidy.region이 비어있으면(hashtags에 지역 태그가 하나도 없던 경우) 지역 정보가 없다는
 *   뜻이라 그대로 둔다(필터링하지 않음 — "안 보이는 것보다 보이는 게 낫다"는 NEUTRAL_MATCH
 *   설계와 동일한 원칙).
 * - 전국 대상 공고는 크롤러가 hashtags 전체(15~16개)를 region에 담으므로 profile.region이
 *   항상 포함돼 있어 자연스럽게 가점을 받는다 — 별도 "전국" 처리 불필요.
 * - region 정보가 있는데 profile.region과 안 맞는 지원금은 감점이 아니라 `match()`에서
 *   완전히 필터링해서 제외한다(#62) — region 데이터 신뢰도가 ~98%로 높아 안전하다고 판단
 *   (#43 당시엔 "혼란 가능성"으로 감점만 택했으나 재평가, `docs/week4/issue-62-region-filter-plan.md` 참고).
 */
const REGION_MATCH_BONUS = 20

/**
 * 이슈 #91/#92: 온보딩 업종(industry) 질문을 지원분야(supportRealm) 복수선택으로 교체하며
 * industry 조건 가점(구 이슈 #52)을 제거했다. `Subsidy.industry`(크롤러 추출 업종, 이슈 #52)
 * 필드 자체는 그대로 남아있지만 더 이상 매칭에 쓰이지 않는 정보성 데이터다 — 전부 걷어낼지는
 * 후속 결정 필요(`docs/week4/issue-92-onboarding-support-realm-plan.md` 참고). 대신 아래
 * `matchesSupportRealm`이 hard filter로 새 지원분야 축을 반영한다.
 */

/**
 * 이슈 #67: employees/revenue/businessYears 조건 가점.
 * industry와 같은 패턴 — AI 추출 신뢰도가 region(hashtags 기반, ~98%)만큼 높지 않아 페널티 없이
 * 가점만 준다. 정보가 없으면(대다수, 신규 공고 중 AI 처리된 것만 값이 있음) 중립 유지.
 *
 * OnboardingProfile은 온보딩 UI에서 버킷(구간) 문자열로 저장된다(`src/data/onboardingSteps.ts`의
 * EMPLOYEE_OPTIONS/REVENUE_OPTIONS/BUSINESS_YEARS_OPTIONS와 반드시 동기화). AI가 추출한 조건은
 * "OO 이하/미만" 형태의 상한값이라, 버킷의 하한값이 그 상한 이하면 사용자가 조건을 충족할
 * 가능성이 있다고 보고 가점을 준다(정밀 비교가 아니라 "그럴듯함" 판단이라 필터링은 하지 않는다).
 */
const EMPLOYEES_MATCH_BONUS = 10
const REVENUE_MATCH_BONUS = 10
const BUSINESS_YEARS_MATCH_BONUS = 10

const EMPLOYEES_MIN: Record<string, number> = {
  '없음 (1인)': 1,
  '1~4명': 1,
  '5~9명': 5,
  '10명 이상': 10,
}

const REVENUE_MIN_KRW: Record<string, number> = {
  '5천만원 미만': 0,
  '5천만원 ~ 1억원': 50_000_000,
  '1억원 ~ 3억원': 100_000_000,
  '3억원 ~ 5억원': 300_000_000,
  '5억원 이상': 500_000_000,
}

const BUSINESS_YEARS_MIN: Record<string, number> = {
  '예비창업자': 0,
  '1년 미만': 0,
  '1~3년': 1,
  '3~5년': 3,
  '5~7년': 5,
  '7~10년': 7,
  '10년 이상': 10,
}

type ScoringProfile = Pick<OnboardingProfile, 'region' | 'supportRealm'> &
  Partial<Pick<OnboardingProfile, 'employees' | 'revenue' | 'businessYears'>>

/**
 * 이슈 #92: supportRealm은 여기서 가점이 아니라 아래 `matchesSupportRealm`으로 hard filter
 * 처리한다(region과 동일 방식, 사용자 결정) — 그래서 scoreForProfile 자체엔 supportRealm 가점
 * 로직이 없다.
 */
function scoreForProfile(subsidy: MatchCandidate, profile: ScoringProfile): number {
  let score = subsidy.match

  if (subsidy.region.length > 0 && subsidy.region.includes(profile.region)) {
    score = Math.min(100, score + REGION_MATCH_BONUS)
  }

  if (subsidy.employeesMaxCount != null && profile.employees) {
    const min = EMPLOYEES_MIN[profile.employees]
    if (min !== undefined && min <= subsidy.employeesMaxCount) {
      score = Math.min(100, score + EMPLOYEES_MATCH_BONUS)
    }
  }

  if (subsidy.revenueMaxKrw != null && profile.revenue) {
    const min = REVENUE_MIN_KRW[profile.revenue]
    if (min !== undefined && min <= subsidy.revenueMaxKrw) {
      score = Math.min(100, score + REVENUE_MATCH_BONUS)
    }
  }

  if (subsidy.businessYearsMax != null && profile.businessYears) {
    const min = BUSINESS_YEARS_MIN[profile.businessYears]
    if (min !== undefined && min <= subsidy.businessYearsMax) {
      score = Math.min(100, score + BUSINESS_YEARS_MATCH_BONUS)
    }
  }

  return score
}

/** region 정보가 있는데 profile.region과 안 맞으면 제외 (이슈 #62) — 정보 없음은 필터링 대상 아님 */
function matchesRegion(subsidy: MatchCandidate, profile: OnboardingProfile): boolean {
  return subsidy.region.length === 0 || subsidy.region.includes(profile.region)
}

/**
 * 이슈 #92: profile.supportRealm(복수선택)과 subsidy.supportRealm(단일값)을 hard filter로
 * 비교한다 — region과 달리 subsidy.supportRealm은 실측 결측 0%라 "정보 없음" 예외가 없다.
 * profile.supportRealm이 비어있으면(zod가 min(1)로 막아 실제로는 안 생기지만 방어적으로)
 * 필터링하지 않는다.
 */
function matchesSupportRealm(subsidy: MatchCandidate, profile: OnboardingProfile): boolean {
  return profile.supportRealm.length === 0 || profile.supportRealm.includes(subsidy.supportRealm)
}

/**
 * 프로필 조건 매칭 + 정렬.
 * region·supportRealm 불일치는 필터링(#62/#92), employees/revenue/businessYears는 가점만
 * scoreForProfile로 반영된다.
 */
export async function match(
  profile: OnboardingProfile,
  sort: SortOption = 'match',
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_LIMIT,
): Promise<PagedResult> {
  const totalStartedAt = performance.now()
  const items = await loadAll()

  const filterScoreStartedAt = performance.now()
  const filtered = items.filter(
    (item) => matchesRegion(item, profile) && matchesSupportRealm(item, profile),
  )
  const scored = filtered.map((item) => ({ ...item, match: scoreForProfile(item, profile) }))
  console.log(
    `[timing] match: filter+score (${items.length} → ${scored.length} items) took ${(performance.now() - filterScoreStartedAt).toFixed(1)}ms`,
  )

  const sortStartedAt = performance.now()
  const sorted = applySort(scored, sort)
  console.log(`[timing] match: applySort(${sort}) took ${(performance.now() - sortStartedAt).toFixed(1)}ms`)

  const result = paginate(sorted, page, limit)
  console.log(`[timing] match: total took ${(performance.now() - totalStartedAt).toFixed(1)}ms`)
  return result
}
