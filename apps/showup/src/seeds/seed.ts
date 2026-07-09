// ShowUp 데모/시드 데이터
// FE 개발용 mock 과 Firestore 시드 스크립트를 겸한다.
// 실제 Firestore 에 쓰려면 실제 Timestamp 객체로 변환 필요.

import type { Timestamp } from 'firebase/firestore';
import type { Customer, Incident, Reservation, Store } from '../types/schema';
import { maskPhone, parsePhone } from '../utils/phone';
import { calculateRiskStats, createRiskAlertPayload, resolveRiskLevel } from '../utils/risk';

function toTs(date: Date): Timestamp {
  return date as unknown as Timestamp;
}

export const DEMO_STORE_ID = 'demo-store-001';
export const DEMO_OWNER_UID = 'demo-owner-001';

export const demoStore: Store = {
  ownerUid: DEMO_OWNER_UID,
  name: '카페 마루',
  category: '카페',
  createdAt: toTs(new Date('2026-07-01')),
};

const customerInputs = [
  { name: '김철수', phone: '010-1234-5678' },
  { name: '이영희', phone: '010-2345-6789' },
  { name: '박준호', phone: '010-3456-7890' },
  { name: '최수진', phone: '010-4567-8901' },
  { name: '정민우', phone: '010-5678-9012' },
  { name: '한지은', phone: '010-6789-0123' },
  { name: '송태영', phone: '010-7890-1234' },
  { name: '오하늘', phone: '010-8901-2345' },
  { name: '임서연', phone: '010-9012-3456' },
  { name: '강동원', phone: '010-0123-4567' },
];

export const demoCustomers: Customer[] = customerInputs.map((input) => {
  const { phone, phoneLast4 } = parsePhone(input.phone);
  const now = toTs(new Date('2026-07-01'));
  return {
    name: input.name,
    phone,
    phoneLast4,
    createdAt: now,
    riskStats: {
      totalVisits: 0,
      noShowCount: 0,
      lateCancelCount: 0,
      incidentCounts: { abuse: 0, dispute: 0, late: 0, unreasonable: 0 },
      score: 0,
      lastNoShowAt: null,
      updatedAt: now,
    },
  };
});

export const customerIds = demoCustomers.map((_, i) => `customer-${String(i + 1).padStart(3, '0')}`);

const reservationInputs: {
  customerIndex: number;
  date: string;
  time: string;
  status: Reservation['status'];
  cancelledSameDay?: boolean;
}[] = [
  // 김철수: 노쇼 3회 + abuse 1회 (주의)
  { customerIndex: 0, date: '2026-06-01', time: '14:00', status: 'noShow' },
  { customerIndex: 0, date: '2026-06-15', time: '15:00', status: 'noShow' },
  { customerIndex: 0, date: '2026-07-01', time: '12:00', status: 'noShow' },
  { customerIndex: 0, date: '2026-06-20', time: '13:00', status: 'visited' },

  // 이영희: 노쇼 5회 (위험)
  { customerIndex: 1, date: '2026-05-01', time: '11:00', status: 'noShow' },
  { customerIndex: 1, date: '2026-05-15', time: '11:30', status: 'noShow' },
  { customerIndex: 1, date: '2026-06-01', time: '12:00', status: 'noShow' },
  { customerIndex: 1, date: '2026-06-10', time: '10:30', status: 'noShow' },
  { customerIndex: 1, date: '2026-06-25', time: '14:00', status: 'noShow' },
  { customerIndex: 1, date: '2026-07-02', time: '15:00', status: 'visited' },

  // 박준호: 당일 취소 2회
  { customerIndex: 2, date: '2026-06-05', time: '13:00', status: 'cancelled', cancelledSameDay: true },
  { customerIndex: 2, date: '2026-06-12', time: '13:30', status: 'cancelled', cancelledSameDay: true },
  { customerIndex: 2, date: '2026-06-30', time: '14:00', status: 'visited' },

  // 최수진: 방문 8회 (안심)
  ...Array.from({ length: 8 }, (_, index) => ({
    customerIndex: 3,
    date: `2026-06-${String(index + 1).padStart(2, '0')}`,
    time: '12:00',
    status: 'visited' as Reservation['status'],
  })),

  // 정민우: abuse 1회
  { customerIndex: 4, date: '2026-06-22', time: '18:00', status: 'visited' },

  // 한지은: 분쟁 2회
  { customerIndex: 5, date: '2026-06-08', time: '19:00', status: 'visited' },
  { customerIndex: 5, date: '2026-06-18', time: '19:30', status: 'visited' },

  // 송태영: 지각 사건 3회
  { customerIndex: 6, date: '2026-06-11', time: '20:00', status: 'visited' },
  { customerIndex: 6, date: '2026-06-19', time: '20:30', status: 'visited' },

  // 오하늘: 무리한 요구 2회
  { customerIndex: 7, date: '2026-06-25', time: '17:00', status: 'visited' },

  // 임서연: 노쇼 1회 (30일 이내)
  { customerIndex: 8, date: '2026-07-05', time: '11:00', status: 'noShow' },
  { customerIndex: 8, date: '2026-06-28', time: '11:30', status: 'visited' },

  // 강동원: pending 예약 (오늘)
  { customerIndex: 9, date: '2026-07-07', time: '10:00', status: 'pending' },
];

export const demoReservations: Reservation[] = reservationInputs.map((input) => ({
  customerId: customerIds[input.customerIndex],
  date: input.date,
  time: input.time,
  status: input.status,
  cancelledSameDay: input.cancelledSameDay ?? false,
  memo: '',
  createdAt: toTs(new Date(input.date)),
}));

export const reservationIds = demoReservations.map((_, index) => `reservation-${String(index + 1).padStart(3, '0')}`);

const incidentInputs: {
  customerIndex: number;
  type: Incident['type'];
  memo: string;
  occurredAt: string;
}[] = [
  { customerIndex: 0, type: 'abuse', memo: '직원에게 폭언', occurredAt: '2026-06-15' },
  { customerIndex: 4, type: 'abuse', memo: '환불 요구하며 위협 발언', occurredAt: '2026-06-22' },
  { customerIndex: 5, type: 'dispute', memo: '결제 분쟁', occurredAt: '2026-06-08' },
  { customerIndex: 5, type: 'dispute', memo: '영수증 관련 분쟁', occurredAt: '2026-06-18' },
  { customerIndex: 6, type: 'late', memo: '30분 이상 지각', occurredAt: '2026-06-11' },
  { customerIndex: 6, type: 'late', memo: '40분 지각', occurredAt: '2026-06-19' },
  { customerIndex: 7, type: 'unreasonable', memo: '무리한 메뉴 변경 요구', occurredAt: '2026-06-25' },
  { customerIndex: 8, type: 'late', memo: '20분 지각', occurredAt: '2026-06-28' },
];

export const demoIncidents: Incident[] = incidentInputs.map((input) => ({
  type: input.type,
  memo: input.memo,
  occurredAt: toTs(new Date(input.occurredAt)),
  createdAt: toTs(new Date(input.occurredAt)),
}));

export const incidentIds = demoIncidents.map((_, index) => `incident-${String(index + 1).padStart(3, '0')}`);

// 고객별 예약/사건 그룹핑 후 riskStats 계산
export const demoCustomersWithRisk: Customer[] = demoCustomers.map((customer, index) => {
  const customerReservations = demoReservations.filter(
    (r) => r.customerId === customerIds[index],
  );
  const customerIncidents = incidentInputs
    .filter((inc) => inc.customerIndex === index)
    .map(
      (input): Incident => ({
        type: input.type,
        memo: input.memo,
        occurredAt: toTs(new Date(input.occurredAt)),
        createdAt: toTs(new Date(input.occurredAt)),
      }),
    );

  const stats = calculateRiskStats(
    { reservations: customerReservations, incidents: customerIncidents },
    { updatedAt: customer.riskStats.updatedAt },
  );

  return {
    ...customer,
    riskStats: stats,
  };
});

export interface SeededCustomerPreview {
  id: string;
  name: string;
  phoneMasked: string;
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  alert: boolean;
  noShowCount: number;
  abuseCount: number;
}

export function previewSeedCustomers(): SeededCustomerPreview[] {
  return demoCustomersWithRisk.map((c, index) => {
    const alert = createRiskAlertPayload(c.riskStats);
    const riskLevel = resolveRiskLevel(c.riskStats.score, c.riskStats.incidentCounts);
    return {
      id: customerIds[index],
      name: c.name,
      phoneMasked: maskPhone(c.phone),
      riskLevel,
      score: c.riskStats.score,
      alert: alert.show,
      noShowCount: c.riskStats.noShowCount,
      abuseCount: c.riskStats.incidentCounts.abuse,
    };
  });
}
