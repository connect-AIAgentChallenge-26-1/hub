import {
  calculateRiskLevel,
  calculateRiskStats,
  createRiskAlertPayload,
  resolveRiskLevel,
  shouldAlert,
} from './risk';
import type { Incident, IncidentCounts, Reservation } from '../types/schema';

const now = new Date('2026-07-07T12:00:00+09:00');

function makeReservation(
  status: Reservation['status'],
  dayOffset: number,
  cancelledSameDay: boolean = false,
): Reservation {
  const createdAt = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
  return {
    customerId: 'c1',
    date: '2026-07-01',
    time: '12:00',
    status,
    cancelledSameDay,
    memo: '',
    createdAt: createdAt as unknown as import('firebase/firestore').Timestamp,
  };
}

function makeIncident(type: Incident['type']): Incident {
  return {
    type,
    memo: 'test',
    occurredAt: now as unknown as import('firebase/firestore').Timestamp,
    createdAt: now as unknown as import('firebase/firestore').Timestamp,
  };
}

const cases = [
  {
    name: '노쇼 3회 (24 + 5 = 29점 → medium)',
    reservations: [
      makeReservation('noShow', 5),
      makeReservation('noShow', 10),
      makeReservation('noShow', 20),
    ],
    incidents: [] as Incident[],
    expectedScore: 29,
    expectedLevel: 'medium',
    expectedAlert: true,
  },
  {
    name: '노쇼 5회 (40 + 5 = 45점 → high)',
    reservations: [
      makeReservation('noShow', 5),
      makeReservation('noShow', 10),
      makeReservation('noShow', 20),
      makeReservation('noShow', 30),
      makeReservation('noShow', 40),
    ],
    incidents: [] as Incident[],
    expectedScore: 45,
    expectedLevel: 'high',
    expectedAlert: true,
  },
  {
    name: 'abuse 1회 (score 10이지만 최소 medium, alert true)',
    reservations: [] as Reservation[],
    incidents: [makeIncident('abuse')],
    expectedScore: 10,
    expectedLevel: 'medium',
    expectedAlert: true,
  },
  {
    name: '방문 10회 (score 0 → low, 최소값 보장)',
    reservations: Array.from({ length: 10 }, (_, i) =>
      makeReservation('visited', i + 1),
    ),
    incidents: [] as Incident[],
    expectedScore: 0,
    expectedLevel: 'low',
    expectedAlert: false,
  },
  {
    name: '노쇼 2회 + 방문 2회 (16 - 2 + 5 = 19점 → low)',
    reservations: [
      makeReservation('noShow', 5),
      makeReservation('noShow', 10),
      makeReservation('visited', 15),
      makeReservation('visited', 20),
    ],
    incidents: [] as Incident[],
    expectedScore: 19,
    expectedLevel: 'low',
    expectedAlert: false,
  },
  {
    name: '노쇼 1회 (30일 이내, 8 + 5 = 13점 → low)',
    reservations: [makeReservation('noShow', 3)],
    incidents: [] as Incident[],
    expectedScore: 13,
    expectedLevel: 'low',
    expectedAlert: false,
  },
  {
    name: '당일 취소 2회 (8점 → low)',
    reservations: [
      makeReservation('cancelled', 5, true),
      makeReservation('cancelled', 10, true),
    ],
    incidents: [] as Incident[],
    expectedScore: 8,
    expectedLevel: 'low',
    expectedAlert: false,
  },
  {
    name: '노쇼 3회 + abuse 1회 (24 + 5 + 10 = 39점, medium, alert true)',
    reservations: [
      makeReservation('noShow', 5),
      makeReservation('noShow', 10),
      makeReservation('noShow', 20),
    ],
    incidents: [makeIncident('abuse')],
    expectedScore: 39,
    expectedLevel: 'medium',
    expectedAlert: true,
  },
];

let failed = 0;
for (const c of cases) {
  const stats = calculateRiskStats(
    { reservations: c.reservations, incidents: c.incidents, now },
    { updatedAt: now as unknown as import('firebase/firestore').Timestamp },
  );
  const level = resolveRiskLevel(stats.score, stats.incidentCounts);
  const alert = createRiskAlertPayload(stats);

  const ok =
    stats.score === c.expectedScore &&
    level === c.expectedLevel &&
    alert.show === c.expectedAlert;

  if (!ok) {
    failed += 1;
    console.error(`❌ ${c.name}`);
    console.error(`   score: ${stats.score} (expected ${c.expectedScore})`);
    console.error(`   level: ${level} (expected ${c.expectedLevel})`);
    console.error(`   alert: ${alert.show} (expected ${c.expectedAlert})`);
  } else {
    console.log(`✅ ${c.name}`);
  }
}

// 개별 헬퍼 함수 추가 검증
const zeroCounts: IncidentCounts = { abuse: 0, dispute: 0, late: 0, unreasonable: 0 };
console.log('---');
console.log('calculateRiskLevel(0):', calculateRiskLevel(0), calculateRiskLevel(0) === 'low' ? '✅' : '❌');
console.log('calculateRiskLevel(23):', calculateRiskLevel(23), calculateRiskLevel(23) === 'low' ? '✅' : '❌');
console.log('calculateRiskLevel(24):', calculateRiskLevel(24), calculateRiskLevel(24) === 'medium' ? '✅' : '❌');
console.log('calculateRiskLevel(39):', calculateRiskLevel(39), calculateRiskLevel(39) === 'medium' ? '✅' : '❌');
console.log('calculateRiskLevel(40):', calculateRiskLevel(40), calculateRiskLevel(40) === 'high' ? '✅' : '❌');
console.log('shouldAlert(noShow=2, abuse=0):', shouldAlert({ noShowCount: 2, incidentCounts: zeroCounts }), !shouldAlert({ noShowCount: 2, incidentCounts: zeroCounts }) ? '✅' : '❌');
console.log('shouldAlert(noShow=3, abuse=0):', shouldAlert({ noShowCount: 3, incidentCounts: zeroCounts }), shouldAlert({ noShowCount: 3, incidentCounts: zeroCounts }) ? '✅' : '❌');
console.log('shouldAlert(noShow=0, abuse=1):', shouldAlert({ noShowCount: 0, incidentCounts: { ...zeroCounts, abuse: 1 } }), shouldAlert({ noShowCount: 0, incidentCounts: { ...zeroCounts, abuse: 1 } }) ? '✅' : '❌');

if (failed > 0) {
  process.exit(1);
}
console.log('모든 risk.ts 검증 통과');
