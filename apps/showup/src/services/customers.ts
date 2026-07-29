import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firestore';
import type { Customer, CustomerSearchResult, Incident, Reservation, RiskLevel } from '../types/schema';
import { calculateRiskStats, createRiskAlertPayload, resolveRiskLevel } from '../utils/risk';
import { maskPhone, parsePhone } from '../utils/phone';

const customersRef = (storeId: string) => collection(db, 'stores', storeId, 'customers');
const customerRef = (storeId: string, customerId: string) =>
  doc(db, 'stores', storeId, 'customers', customerId);

interface CustomerCreateInput {
  name: string;
  phone: string;
}

function enrichCustomer(id: string, storeId: string, data: Partial<Customer>): CustomerSearchResult {
  const phone = data.phone || ''
  const name = data.name || ''
  const riskStats = {
    totalVisits: data.riskStats?.totalVisits ?? 0,
    noShowCount: data.riskStats?.noShowCount ?? 0,
    lateCancelCount: data.riskStats?.lateCancelCount ?? 0,
    incidentCounts: {
      abuse: data.riskStats?.incidentCounts?.abuse ?? 0,
      dispute: data.riskStats?.incidentCounts?.dispute ?? 0,
      late: data.riskStats?.incidentCounts?.late ?? 0,
      unreasonable: data.riskStats?.incidentCounts?.unreasonable ?? 0,
    },
    score: data.riskStats?.score ?? 0,
    lastNoShowAt: data.riskStats?.lastNoShowAt ?? null,
    // Legacy documents may lack updatedAt. Keep returned shape type-safe.
    updatedAt: data.riskStats?.updatedAt ?? Timestamp.fromMillis(0),
  }
  const riskLevel: RiskLevel = resolveRiskLevel(riskStats.score, riskStats.incidentCounts);
  const alert = createRiskAlertPayload(riskStats);
  return {
    id,
    storeId,
    name,
    phoneMasked: phone ? maskPhone(phone) : '',
    riskStats,
    riskLevel,
    alert: alert.show,
  };
}

/**
 * 고객 조회. 화면 표시용이므로 phone 은 마스킹된 CustomerSearchResult 만 반환한다.
 */
export async function getCustomer(
  storeId: string,
  customerId: string,
): Promise<CustomerSearchResult | null> {
  const snap = await getDoc(customerRef(storeId, customerId));
  if (!snap.exists()) return null;
  return enrichCustomer(snap.id, storeId, snap.data() as Customer);
}

export async function searchCustomers(
  storeId: string,
  keyword: string,
): Promise<CustomerSearchResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const nameQuery = query(
    customersRef(storeId),
    where('name', '>=', trimmed),
    where('name', '<=', `${trimmed}\uf8ff`),
  );

  const last4Query = query(
    customersRef(storeId),
    where('phoneLast4', '==', trimmed.slice(-4)),
  );

  const [nameSnap, last4Snap] = await Promise.all([getDocs(nameQuery), getDocs(last4Query)]);

  const results = new Map<string, CustomerSearchResult>();

  for (const snap of [nameSnap, last4Snap]) {
    for (const d of snap.docs) {
      const data = d.data() as Customer;
      results.set(d.id, enrichCustomer(d.id, storeId, data));
    }
  }

  return Array.from(results.values()).sort((a, b) => b.riskStats.score - a.riskStats.score);
}

export async function findCustomerByPhone(
  storeId: string,
  rawPhone: string,
): Promise<CustomerSearchResult | null> {
  const { phone } = parsePhone(rawPhone);
  const snap = await getDocs(query(customersRef(storeId), where('phone', '==', phone)));
  const match = snap.docs[0];
  return match ? enrichCustomer(match.id, storeId, match.data() as Customer) : null;
}

export async function createCustomer(
  storeId: string,
  customerId: string,
  input: CustomerCreateInput,
): Promise<CustomerSearchResult> {
  const { phone, phoneLast4 } = parsePhone(input.phone);
  const now = serverTimestamp();
  const data: Customer = {
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
  await setDoc(customerRef(storeId, customerId), data);
  return enrichCustomer(customerId, storeId, data);
}

export async function updateCustomer(
  storeId: string,
  customerId: string,
  input: Partial<CustomerCreateInput>,
): Promise<void> {
  const updates: Partial<Customer> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.phone !== undefined) {
    const parsed = parsePhone(input.phone);
    updates.phone = parsed.phone;
    updates.phoneLast4 = parsed.phoneLast4;
  }
  await updateDoc(customerRef(storeId, customerId), updates);
}

export async function deleteCustomer(storeId: string, customerId: string): Promise<void> {
  const customer = customerRef(storeId, customerId);
  const [reservationSnap, incidentSnap] = await Promise.all([
    getDocs(query(collection(db, 'stores', storeId, 'reservations'), where('customerId', '==', customerId))),
    getDocs(collection(db, 'stores', storeId, 'customers', customerId, 'incidents')),
  ]);
  const refs = [
    ...reservationSnap.docs.map((snapshot) => snapshot.ref),
    ...incidentSnap.docs.map((snapshot) => snapshot.ref),
    customer,
  ];

  for (let index = 0; index < refs.length; index += 500) {
    const batch = writeBatch(db);
    refs.slice(index, index + 500).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * customer 의 riskStats 를 예약/사건 이력으로 갱신한다.
 * MVP에서는 클라이언트가 호출하며, Cloud Functions 배포 후 서버 트리거로 대체한다.
 */
export async function refreshCustomerRiskStats(
  storeId: string,
  customerId: string,
  reservations: Reservation[],
  incidents: Incident[],
): Promise<void> {
  const stats = calculateRiskStats({ reservations, incidents });

  await updateDoc(customerRef(storeId, customerId), {
    riskStats: { ...stats, updatedAt: serverTimestamp() },
  });
}
/**
 * 위험(high) 등급 고객 조회.
 * score 내림차순 상위 limit 명을 반환한다.
 */
export async function getTopRiskyCustomers(
  storeId: string,
  limit = 5,
): Promise<CustomerSearchResult[]> {
  const q = query(
    customersRef(storeId),
    orderBy('riskStats.score', 'desc'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => enrichCustomer(d.id, storeId, d.data() as Customer))
    .filter((customer) => customer.riskLevel === 'high')
    .slice(0, limit);
}
