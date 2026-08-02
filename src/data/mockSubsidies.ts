import { REGIONS, type OnboardingProfile, type SortOption, type Subsidy } from '@hub/shared'

/** 전국 대상 기관 — 크롤러가 hashtags 16개 전부를 담는 것과 동일한 규칙(이슈 #43) */
const NATIONWIDE = [...REGIONS]

/** src/prototype/gov_subsidy_home_wireframe.html subsidies 배열 (8건) */
export const MOCK_SUBSIDIES: Subsidy[] = [
  {
    id: '1',
    name: '청년 창업 임대료 지원',
    org: '서울시',
    amount: '최대 300만원',
    dday: 3,
    match: 92,
    deadline: '2026. 7. 11',
    method: '온라인',
    qualifications: [
      '만 39세 이하 대표자',
      '사업자등록 후 3년 이내',
      '서울시 소재 매장 운영 중',
      '연매출 3억원 이하',
    ],
    documents: [
      '사업자등록증 사본',
      '임대차계약서 사본',
      '신분증 사본',
      '매출 증빙 서류 (부가세 신고서 등)',
    ],
    how: '온라인 접수',
    where: '서울시 자영업지원센터',
    contact: '02-1234-5678',
    region: ['서울'],
    industry: [],
    supportRealm: '창업',
  },
  {
    id: '2',
    name: '소상공인 방역물품 지원',
    org: '마포구청',
    amount: '최대 50만원',
    dday: 7,
    match: 88,
    deadline: '2026. 7. 15',
    method: '온라인',
    qualifications: [
      '마포구 소재 소상공인',
      '종업원 5인 미만',
      '직전년도 매출 2억원 이하',
    ],
    documents: ['사업자등록증 사본', '방역물품 구매 영수증', '신분증 사본'],
    how: '온라인 접수',
    where: '마포구 소상공인지원센터',
    contact: '02-3153-0000',
    region: ['서울'],
    industry: [],
    supportRealm: '경영',
  },
  {
    id: '3',
    name: '소상공인 경영안정자금',
    org: '중소벤처기업부',
    amount: '최대 5천만원',
    dday: 11,
    match: 85,
    deadline: '2026. 7. 19',
    method: '온라인+방문',
    qualifications: [
      '사업자등록 후 6개월 이상',
      '상시근로자 5인 미만',
      '신용등급 제한 없음',
    ],
    documents: ['사업자등록증 사본', '소득금액증명원', '부채증명서', '신분증 사본'],
    how: '온라인 신청 후 방문 면담',
    where: '소상공인시장진흥공단',
    contact: '1357',
    region: NATIONWIDE,
    industry: [],
    supportRealm: '금융',
  },
  {
    id: '4',
    name: '스마트오더 시스템 지원',
    org: '중소벤처기업부',
    amount: '최대 200만원',
    dday: 15,
    match: 78,
    deadline: '2026. 7. 23',
    method: '온라인',
    qualifications: [
      '음식점·카페 업종',
      '스마트오더 미도입 사업장',
      '연매출 5억원 이하',
    ],
    documents: ['사업자등록증 사본', '사업장 사진', '스마트오더 도입 계획서'],
    how: '온라인 접수',
    where: '스마트상점 기술보급센터',
    contact: '1600-3737',
    region: NATIONWIDE,
    industry: ['음식점', '카페·베이커리'],
    supportRealm: '기술',
  },
  {
    id: '5',
    name: '에너지효율 설비 지원',
    org: '한국에너지공단',
    amount: '최대 150만원',
    dday: 21,
    match: 74,
    deadline: '2026. 7. 29',
    method: '온라인',
    qualifications: [
      '전 업종 소상공인',
      '고효율 설비 교체 예정',
      '동일 사업 미수혜자',
    ],
    documents: ['사업자등록증 사본', '설비 견적서', '기존 설비 사진', '신분증 사본'],
    how: '온라인 접수',
    where: '한국에너지공단',
    contact: '1551-0100',
    region: NATIONWIDE,
    industry: [],
    supportRealm: '경영',
  },
  {
    id: '6',
    name: '소상공인 저금리 대출',
    org: '소상공인시장진흥공단',
    amount: '최대 3천만원',
    dday: 30,
    match: 71,
    deadline: '2026. 8. 7',
    method: '온라인+방문',
    qualifications: [
      '사업자등록 후 6개월 이상',
      '상시근로자 5인 미만',
      '업력 제한 없음',
    ],
    documents: ['사업자등록증 사본', '소득금액증명원', '재무제표', '신분증 사본'],
    how: '온라인 신청 후 지점 방문',
    where: '소상공인시장진흥공단 지역센터',
    contact: '1357',
    region: NATIONWIDE,
    industry: [],
    supportRealm: '금융',
  },
  {
    id: '7',
    name: '디지털 전환 바우처',
    org: '중소벤처기업부',
    amount: '최대 400만원',
    dday: 35,
    match: 68,
    deadline: '2026. 8. 12',
    method: '온라인',
    qualifications: [
      '전 업종 소상공인',
      '디지털 전환 의지 보유',
      '동일 사업 미수혜자',
    ],
    documents: ['사업자등록증 사본', '디지털 전환 활용 계획서', '신분증 사본'],
    how: '온라인 접수',
    where: '소상공인 디지털전환 플랫폼',
    contact: '1800-2400',
    region: NATIONWIDE,
    industry: [],
    supportRealm: '기술',
  },
  {
    id: '8',
    name: '고용보험료 지원',
    org: '근로복지공단',
    amount: '최대 120만원/년',
    dday: 45,
    match: 65,
    deadline: '2026. 8. 22',
    method: '온라인',
    qualifications: [
      '근로자 10인 미만 사업장',
      '고용보험 가입 사업장',
      '월평균 보수 260만원 미만 근로자 대상',
    ],
    documents: ['사업자등록증 사본', '고용보험 가입 확인서', '근로계약서 사본'],
    how: '온라인 접수',
    where: '고용보험 홈페이지',
    contact: '1588-0075',
    region: NATIONWIDE,
    industry: [],
    supportRealm: '인력',
  },
]

/**
 * server/subsidies-repo.ts parseAmountForSort와 규칙 통일 — 억/천만/백만/만 단위, 소수점 인식.
 * 콤마 제거 + 단위 표기 없는 원 단위 금액 fallback도 서버와 동일하게 맞춘다.
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

/** 온보딩 지역 정보로 카드 기관명 일부 반영 (와이어프레임 buildHome) */
export function getDisplaySubsidies(profile: OnboardingProfile): Subsidy[] {
  return MOCK_SUBSIDIES.map((item, index) => {
    if (index === 0 && profile.region) {
      return {
        ...item,
        org: profile.region === '서울' ? '서울시' : profile.region,
      }
    }
    if (index === 1 && profile.district) {
      return { ...item, org: profile.district }
    }
    return item
  })
}

/** mock 리스트 정렬 */
export function sortSubsidies(items: Subsidy[], sort: SortOption): Subsidy[] {
  const copy = [...items]
  switch (sort) {
    case 'deadline':
      return copy.sort((a, b) => a.dday - b.dday)
    case 'amount':
      return copy.sort(
        (a, b) => parseAmountForSort(b.amount) - parseAmountForSort(a.amount),
      )
    case 'new':
      return copy
    case 'match':
    default:
      return copy.sort((a, b) => b.match - a.match)
  }
}

export const SORT_CHIPS: { label: string; sort: SortOption }[] = [
  { label: '전체', sort: 'match' },
  { label: '마감임박순', sort: 'deadline' },
  { label: '지원금액순', sort: 'amount' },
  { label: '신규', sort: 'new' },
]
