/**
 * 온보딩 스텝 메타 및 선택지.
 * 출처: src/prototype/gov_subsidy_home_wireframe.html
 */
import type { OnboardingField } from '../context/OnboardingContext'

export interface SelectOption {
  /** 컨텍스트에 저장되는 값 */
  value: string
  /** 화면에 표시되는 라벨 */
  label: string
  /** 이모지 아이콘 (없을 수 있음) */
  icon?: string
}

export interface StepMeta {
  /** 진행바/네비 표시용 스텝 번호 (1-based) */
  step: number
  /** 저장 대상 필드 (step3는 district, step4는 별도 처리) */
  field: OnboardingField
  /** 질문 — 줄바꿈은 \n */
  question: string
  hint: string
}

export const TOTAL_STEPS = 4

/**
 * 지원분야 복수선택 (step1, 이슈 #91/#92). 예전 업종(industry) 질문을 대체함 — bizinfo
 * `pldirSportRealmLclasCodeNm`/K-Startup `supt_biz_clsfc`가 공통으로 대응하는 8개 고정
 * 카테고리 중 "기타"를 제외한 7개(자유 텍스트 입력이 안 맞는 고정 분류라 커스텀 입력 없음).
 * `crawler/src/mapper.ts`/`kstartup-mapper.ts`의 `supportRealm` 값과 정확히 일치해야 매칭된다.
 */
export const SUPPORT_REALM_OPTIONS: SelectOption[] = [
  { value: '수출', label: '수출', icon: '🚢' },
  { value: '기술', label: '기술', icon: '🔬' },
  { value: '경영', label: '경영', icon: '📊' },
  { value: '내수', label: '내수', icon: '🏪' },
  { value: '창업', label: '창업', icon: '🚀' },
  { value: '인력', label: '인력', icon: '👥' },
  { value: '금융', label: '금융', icon: '💰' },
]

/** 직원 수 (step4) */
export const EMPLOYEE_OPTIONS: SelectOption[] = [
  { value: '없음 (1인)', label: '없음 (1인 사업자)', icon: '👤' },
  { value: '1~4명', label: '1~4명', icon: '👥' },
  { value: '5~9명', label: '5~9명', icon: '👥' },
  { value: '10명 이상', label: '10명 이상', icon: '👥' },
]

/** 연매출 구간 (step4 select) */
export const REVENUE_OPTIONS: string[] = [
  '5천만원 미만',
  '5천만원 ~ 1억원',
  '1억원 ~ 3억원',
  '3억원 ~ 5억원',
  '5억원 이상',
]

/**
 * 업력(연차) 구간 (step4 select, 이슈 #51).
 * 실 API 300건 표본(2026-07-25) 조사 결과 지원사업 자격 조건의 컷오프가 1/3/5/7/10년에
 * 몰려 있어 그 경계를 그대로 버킷 경계로 채택 — 추후 "업력 5년 이내" 같은 조건과 정밀 비교 가능.
 */
export const BUSINESS_YEARS_OPTIONS: string[] = [
  '예비창업자',
  '1년 미만',
  '1~3년',
  '3~5년',
  '5~7년',
  '7~10년',
  '10년 이상',
]

/** 스텝별 질문/힌트 (step3 질문은 지역명이 동적으로 앞에 붙음) */
export const STEP_META: Record<number, StepMeta> = {
  1: {
    step: 1,
    field: 'supportRealm',
    question: '어떤 분야의\n지원이 필요하세요?',
    hint: '여러 개 선택할 수 있어요',
  },
  2: {
    step: 2,
    field: 'region',
    question: '어디에서\n사업하고 계세요?',
    hint: '지역별 지원금을 찾아드려요',
  },
  3: {
    step: 3,
    field: 'district',
    question: '상세 지역을\n선택해주세요',
    hint: '더 정확한 지원금 매칭을 위해 필요해요',
  },
  4: {
    step: 4,
    field: 'employees',
    question: '사업 규모를\n알려주세요',
    hint: '마지막이에요! 거의 다 됐어요',
  },
}
