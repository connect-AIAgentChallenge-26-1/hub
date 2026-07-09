// Mock reservation data for FE development

export interface Reservation {
  id: string
  customerId: string
  customerName: string
  date: string
  time: string
  status: 'pending' | 'confirmed' | 'visited' | 'noShow' | 'cancelled'
  cancelledSameDay?: boolean
  memo?: string
  createdAt: string
}

export const reservations: Reservation[] = [
  // 오늘 예약 예시 (실제 구현 시 BE 에서 조회)
]
