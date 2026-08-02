import type { OnboardingProfile } from '@hub/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubsidyRow } from './mappers.js'

// 이슈 #109: loadAll()에 TTL 캐시가 생겨 모듈 스코프에 결과가 남는다.
// 테스트마다 state.rows를 바꿔가며 match()를 호출하므로, 매 테스트 전 캐시를 비워
// 이전 테스트의 mock 응답이 재사용되지 않도록 한다.

const state = vi.hoisted(() => ({ rows: [] as SubsidyRow[], single: null as SubsidyRow | null }))

vi.mock('./supabase.js', () => ({
  SUBSIDIES_TABLE: 'subsidies',
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: state.rows, error: null }),
        }),
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: state.single, error: null }),
        }),
      }),
    }),
  },
}))

import { __resetFindByIdCacheForTests, __resetLoadAllCacheForTests, findAll, findById, match } from './subsidies-repo.js'

beforeEach(() => {
  __resetLoadAllCacheForTests()
  __resetFindByIdCacheForTests()
})

function makeRow(overrides: Partial<SubsidyRow>): SubsidyRow {
  return {
    id: '1',
    name: '테스트 지원금',
    org: '테스트기관',
    amount: '최대 100만원',
    dday: 10,
    match_score: 50,
    deadline: '2026. 8. 1',
    method: '온라인',
    qualifications: [],
    documents: [],
    how: '온라인 접수',
    apply_where: '테스트기관',
    where_url: null,
    contact: '000-0000',
    region: [],
    industry: [],
    employees: null,
    employees_max_count: null,
    revenue: null,
    revenue_max_krw: null,
    business_years: null,
    business_years_max: null,
    atch_file_id: null,
    support_realm: '경영', // profile 기본값(supportRealm: ['경영'])과 맞춰 hard filter에 안 걸리게 함
    support_realm_detail: null,
    ...overrides,
  }
}

const profile: OnboardingProfile = {
  supportRealm: ['경영'],
  region: '서울',
  district: '마포구',
  employees: '1~4명',
  revenue: '5천만원 미만',
}

describe('match', () => {
  beforeEach(() => {
    state.rows = []
  })

  it('subsidy.region에 profile.region이 포함되면 가점을 받는다', async () => {
    state.rows = [makeRow({ id: '1', region: ['서울', '경기'] })]
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(70) // 50 + 20
  })

  it('subsidy.region이 있지만 profile.region과 다르면 결과에서 제외된다 (이슈 #62)', async () => {
    state.rows = [makeRow({ id: '1', region: ['부산'] })]
    const { items, total } = await match(profile)
    expect(items).toHaveLength(0)
    expect(total).toBe(0)
  })

  it('subsidy.region이 비어있으면(지역 정보 없음) 점수를 그대로 유지한다', async () => {
    state.rows = [makeRow({ id: '1', region: [], match_score: 50 })]
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(50)
  })

  it('가점은 100을 넘지 않는다', async () => {
    state.rows = [makeRow({ id: '1', region: ['서울'], match_score: 95 })]
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(100)
  })

  it('region이 다른 여러 건을 넣으면 불일치 항목은 제외되고 나머지만 정렬된다 (이슈 #62)', async () => {
    state.rows = [
      makeRow({ id: 'busan', region: ['부산'], match_score: 50 }),
      makeRow({ id: 'seoul', region: ['서울'], match_score: 50 }),
      makeRow({ id: 'nationwide', region: ['서울', '부산', '경기'], match_score: 50 }),
    ]
    const result = await match(profile, 'match')
    // busan은 region 불일치로 제외, seoul/nationwide는 둘 다 70으로 동점 — id 오름차순 2차 정렬(#48)
    expect(result.items.map((r) => r.id)).toEqual(['nationwide', 'seoul'])
    expect(result.total).toBe(2)
  })
})

describe('match — supportRealm hard filter (이슈 #92)', () => {
  beforeEach(() => {
    state.rows = []
  })

  it('subsidy.supportRealm이 profile.supportRealm에 포함되면 결과에 남는다', async () => {
    state.rows = [makeRow({ id: '1', support_realm: '경영' })]
    const { items, total } = await match(profile) // profile.supportRealm = ['경영']
    expect(items).toHaveLength(1)
    expect(total).toBe(1)
  })

  it('subsidy.supportRealm이 profile.supportRealm에 없으면 결과에서 제외된다', async () => {
    state.rows = [makeRow({ id: '1', support_realm: '금융' })]
    const { items, total } = await match(profile)
    expect(items).toHaveLength(0)
    expect(total).toBe(0)
  })

  it('복수선택된 값 중 하나만 일치해도 결과에 남는다', async () => {
    const multiProfile = { ...profile, supportRealm: ['금융', '경영'] }
    state.rows = [makeRow({ id: '1', support_realm: '경영' })]
    const { items } = await match(multiProfile)
    expect(items).toHaveLength(1)
  })

  it('profile.supportRealm이 비어있으면(방어적 기본값) 필터링하지 않는다', async () => {
    const emptyProfile = { ...profile, supportRealm: [] }
    state.rows = [makeRow({ id: '1', support_realm: '금융' })]
    const { items } = await match(emptyProfile)
    expect(items).toHaveLength(1)
  })

  it('region 필터와 supportRealm 필터가 함께 적용된다', async () => {
    state.rows = [
      makeRow({ id: 'match', region: ['서울'], support_realm: '경영' }),
      makeRow({ id: 'region-mismatch', region: ['부산'], support_realm: '경영' }),
      makeRow({ id: 'realm-mismatch', region: ['서울'], support_realm: '금융' }),
    ]
    const { items } = await match(profile)
    expect(items.map((r) => r.id)).toEqual(['match'])
  })
})

describe('match — employees/revenue/businessYears 가점 (이슈 #67)', () => {
  beforeEach(() => {
    state.rows = []
  })

  // profile: employees '1~4명'(최솟값 1), revenue '5천만원 미만'(최솟값 0)

  it('subsidy.employeesMaxCount가 profile 버킷의 최솟값 이상이면 가점을 받는다', async () => {
    state.rows = [makeRow({ id: '1', employees_max_count: 5 })] // "50인 미만" 같은 조건이라 가정
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(60) // 50 + 10
  })

  it('subsidy.employeesMaxCount가 profile 버킷의 최솟값보다 작으면 가점을 받지 않는다', async () => {
    const strictProfile = { ...profile, employees: '10명 이상' } // 최솟값 10
    state.rows = [makeRow({ id: '1', employees_max_count: 5 })] // 5인 미만 조건 — 10명 이상 사업자는 대상 아님
    const {
      items: [result],
    } = await match(strictProfile)
    expect(result.match).toBe(50)
  })

  it('subsidy.revenueMaxKrw가 profile 버킷의 최솟값 이상이면 가점을 받는다', async () => {
    state.rows = [makeRow({ id: '1', revenue_max_krw: 300_000_000 })]
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(60) // 50 + 10
  })

  it('subsidy.businessYearsMax가 profile 버킷의 최솟값 이상이면 가점을 받는다', async () => {
    const profileWithYears = { ...profile, businessYears: '3~5년' } // 최솟값 3
    state.rows = [makeRow({ id: '1', business_years_max: 7 })] // "7년 미만" 조건
    const {
      items: [result],
    } = await match(profileWithYears)
    expect(result.match).toBe(60) // 50 + 10
  })

  it('AI 추출 정보가 없으면(null) 가점 없이 중립 유지한다', async () => {
    state.rows = [makeRow({ id: '1' })] // employees_max_count/revenue_max_krw/business_years_max 전부 기본값 null
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(50)
  })

  it('여러 조건 가점이 동시에 적용되고 100을 넘지 않는다', async () => {
    state.rows = [
      makeRow({
        id: '1',
        region: ['서울'],
        industry: ['음식점'],
        employees_max_count: 5,
        revenue_max_krw: 300_000_000,
        match_score: 95,
      }),
    ]
    const {
      items: [result],
    } = await match(profile)
    expect(result.match).toBe(100)
  })
})

describe('match 페이지네이션 (이슈 #48)', () => {
  beforeEach(() => {
    state.rows = Array.from({ length: 25 }, (_, i) =>
      makeRow({ id: String(i + 1).padStart(2, '0'), match_score: 50 }),
    )
  })

  it('page/limit 없이 호출하면 기본값(1페이지, 20건)이 적용된다', async () => {
    const result = await match(profile)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.items).toHaveLength(20)
    expect(result.total).toBe(25)
    expect(result.hasMore).toBe(true)
  })

  it('마지막 페이지는 hasMore가 false다', async () => {
    const result = await match(profile, 'match', 2, 20)
    expect(result.items).toHaveLength(5)
    expect(result.hasMore).toBe(false)
  })

  it('limit을 지정하면 그만큼만 반환한다', async () => {
    const result = await match(profile, 'match', 1, 10)
    expect(result.items).toHaveLength(10)
    expect(result.hasMore).toBe(true)
  })
})

describe('findById — 프로필 기반 재계산 (이슈 #61)', () => {
  beforeEach(() => {
    state.single = null
  })

  it('profile 없이 호출하면 저장된 match_score를 그대로 반환한다', async () => {
    state.single = makeRow({ id: '1', region: ['서울'], match_score: 50 })
    const result = await findById('1')
    expect(result?.match).toBe(50)
  })

  it('profile을 넘기면 리스트(match())와 동일한 공식으로 매칭도를 재계산한다', async () => {
    state.single = makeRow({ id: '1', region: ['서울'], match_score: 50 })
    const result = await findById('1', { region: '서울', supportRealm: ['경영'] })
    expect(result?.match).toBe(70) // 50 + 20(region) — findById는 목록 hard filter를 적용하지 않고 scoreForProfile만 재계산
  })

  it('존재하지 않는 id는 null을 반환한다', async () => {
    state.single = null
    const result = await findById('no-such-id', { region: '서울', supportRealm: ['경영'] })
    expect(result).toBeNull()
  })

  it('같은 id를 다시 조회하면 캐시를 쓰고, 프로필별 매칭도는 매번 새로 계산한다 (이슈 #122)', async () => {
    state.single = makeRow({ id: '1', region: ['서울'], match_score: 50 })
    const first = await findById('1', { region: '서울', supportRealm: ['경영'] })
    expect(first?.match).toBe(70) // 50 + 20(region)

    // supabase mock을 바꿔도(캐시 히트라면 반영 안 됨) 캐시된 원본 데이터를 그대로 쓴다
    state.single = makeRow({ id: '1', region: [], match_score: 999 })
    const second = await findById('1', { region: '부산', supportRealm: ['금융'] })
    expect(second?.match).toBe(50) // 캐시된 원본(match_score 50) 기준, region 불일치라 가점 없음
  })
})

describe('findAll — sort: amount 금액 파싱 (콤마/단위 없는 금액)', () => {
  beforeEach(() => {
    state.rows = []
  })

  it('AI 추출로 콤마가 낀 "만원" 표기("6,000만원")도 콤마 없는 값과 동일하게 정렬한다', async () => {
    state.rows = [
      makeRow({ id: '1', amount: '최대 6,000만원' }),
      makeRow({ id: '2', amount: '최대 5000만원' }),
    ]
    const result = await findAll('amount')
    expect(result.items.map((item) => item.id)).toEqual(['1', '2']) // 6,000만원(6000) > 5000만원
  })

  it('억/천만/백만/만 단위 표기가 없는 원 단위 금액("60,000,000원")도 만원 단위로 환산해 정렬한다', async () => {
    state.rows = [
      makeRow({ id: '1', amount: '최대 5000만원' }), // 5000
      makeRow({ id: '2', amount: '최대 60,000,000원' }), // 6000만원 상당
    ]
    const result = await findAll('amount')
    expect(result.items.map((item) => item.id)).toEqual(['2', '1'])
  })
})
