// ShowUp Firestore 스키마 타입
// BE/FE/SECURITY 세션이 공유하는 인터페이스.
// Firestore Timestamp 는 서버 시간 기준으로 생성/갱신되며,
// 클라이언트에서 Date 로 입출력할 때는 변환 레이어를 거친다.

import type { Timestamp } from 'firebase/firestore';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'visited'
  | 'noShow'
  | 'cancelled';

export type IncidentType = 'abuse' | 'dispute' | 'late' | 'unreasonable';

export interface Store {
  ownerUid: string;
  name: string;
  category: string;
  createdAt: Timestamp;
}

export interface IncidentCounts {
  abuse: number;
  dispute: number;
  late: number;
  unreasonable: number;
}

export interface RiskStats {
  totalVisits: number;
  noShowCount: number;
  lateCancelCount: number;
  incidentCounts: IncidentCounts;
  score: number;
  lastNoShowAt: Timestamp | null;
  updatedAt: Timestamp;
}

export interface Customer {
  name: string;
  // 원본 전화번호. 화면 표시 금지. Firestore Security Rules + FE 마스킹 이중 보호.
  phone: string;
  // 검색용 식별자. 항상 마지막 4자리 숫자.
  phoneLast4: string;
  createdAt: Timestamp;
  riskStats: RiskStats;
}

export interface Reservation {
  customerId: string;
  // YYYY-MM-DD
  date: string;
  // HH:mm
  time: string;
  status: ReservationStatus;
  // status === 'cancelled' 일 때만 의미 있음. 당일 취소면 true.
  cancelledSameDay: boolean;
  memo: string;
  createdAt: Timestamp;
}

export interface Incident {
  // 사전 정의 카테고리 선택식. 자유 메모는 지양.
  type: IncidentType;
  // 사실 기록용 짧은 메모
  memo: string;
  occurredAt: Timestamp;
  createdAt: Timestamp;
}

// 파생 타입 — FE 에서 화면 표시용으로 계산
export type RiskLevel = 'low' | 'medium' | 'high';

export interface CustomerSearchResult {
  id: string;
  storeId: string;
  name: string;
  phoneMasked: string; // 예: 010-****-1234
  riskStats: RiskStats;
  riskLevel: RiskLevel;
  // 경고 배너 발동 조건
  alert: boolean;
}

export interface RiskAlertPayload {
  show: boolean;
  noShowCount: number;
  abuseCount: number;
  message: string;
}
