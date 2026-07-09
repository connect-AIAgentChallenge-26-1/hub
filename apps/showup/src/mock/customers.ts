// Mock customer data for FE development
// BE 세션의 schema.ts 기반 타입 사용

import type { Customer as SchemaCustomer } from '@/types/schema'

export interface Customer extends SchemaCustomer {
  id: string
  events: Array<{
    id: string
    date: string
    type: string
    icon: string
    memo?: string
  }>
}

export const customers: Customer[] = [
  {
    id: 'c1',
    name: '김철수',
    phone: '010-1234-1234', // 원본 (화면 노출 금지)
    phoneLast4: '1234',
    createdAt: null as any, // mock - BE 연동 시 Timestamp
    riskStats: {
      score: 48,
      totalVisits: 2,
      noShowCount: 6,
      lateCancelCount: 1,
      incidentCounts: { abuse: 1, dispute: 0, late: 0, unreasonable: 0 },
      lastNoShowAt: null as any,
      updatedAt: null as any,
    },
    events: [
      { id: 'e1', date: '7/05', type: '노쇼', icon: '❌' },
      { id: 'e2', date: '6/28', type: '폭언·무례', icon: '⚠️', memo: '환불 요구하며 고함' },
      { id: 'e3', date: '6/10', type: '방문', icon: '✅' },
    ],
  },
  {
    id: 'c2',
    name: '이영희',
    phone: '010-5678-5678',
    phoneLast4: '5678',
    createdAt: null as any,
    riskStats: {
      score: 24,
      totalVisits: 5,
      noShowCount: 3,
      lateCancelCount: 0,
      incidentCounts: { abuse: 0, dispute: 0, late: 0, unreasonable: 0 },
      lastNoShowAt: null as any,
      updatedAt: null as any,
    },
    events: [
      { id: 'e4', date: '7/01', type: '노쇼', icon: '❌' },
      { id: 'e5', date: '6/20', type: '방문', icon: '✅' },
      { id: 'e6', date: '6/05', type: '노쇼', icon: '❌' },
    ],
  },
  {
    id: 'c3',
    name: '박민수',
    phone: '010-9012-9012',
    phoneLast4: '9012',
    createdAt: null as any,
    riskStats: {
      score: 30,
      totalVisits: 8,
      noShowCount: 1,
      lateCancelCount: 1,
      incidentCounts: { abuse: 1, dispute: 0, late: 0, unreasonable: 0 },
      lastNoShowAt: null as any,
      updatedAt: null as any,
    },
    events: [
      { id: 'e7', date: '6/28', type: '폭언·무례', icon: '⚠️', memo: '무리한 요구 반복' },
      { id: 'e8', date: '6/15', type: '방문', icon: '✅' },
    ],
  },
  {
    id: 'c4',
    name: '김지영',
    phone: '010-3456-3456',
    phoneLast4: '3456',
    createdAt: null as any,
    riskStats: {
      score: 10,
      totalVisits: 10,
      noShowCount: 1,
      lateCancelCount: 0,
      incidentCounts: { abuse: 0, dispute: 0, late: 0, unreasonable: 0 },
      lastNoShowAt: null as any,
      updatedAt: null as any,
    },
    events: [
      { id: 'e9', date: '7/03', type: '방문', icon: '✅' },
      { id: 'e10', date: '6/20', type: '노쇼', icon: '❌' },
    ],
  },
  {
    id: 'c5',
    name: '정수호',
    phone: '010-7890-7890',
    phoneLast4: '7890',
    createdAt: null as any,
    riskStats: {
      score: 0,
      totalVisits: 15,
      noShowCount: 0,
      lateCancelCount: 0,
      incidentCounts: { abuse: 0, dispute: 0, late: 0, unreasonable: 0 },
      lastNoShowAt: null as any,
      updatedAt: null as any,
    },
    events: [
      { id: 'e11', date: '7/06', type: '방문', icon: '✅' },
      { id: 'e12', date: '6/25', type: '방문', icon: '✅' },
    ],
  },
]
