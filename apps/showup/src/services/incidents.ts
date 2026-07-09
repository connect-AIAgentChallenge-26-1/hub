import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Incident } from '../types/schema';

const incidentsRef = (storeId: string, customerId: string) =>
  collection(db, 'stores', storeId, 'customers', customerId, 'incidents');
const incidentRef = (storeId: string, customerId: string, incidentId: string) =>
  doc(db, 'stores', storeId, 'customers', customerId, 'incidents', incidentId);

interface IncidentCreateInput {
  type: Incident['type'];
  memo: string;
  occurredAt: Date;
}

export async function getIncident(
  storeId: string,
  customerId: string,
  incidentId: string,
): Promise<Incident | null> {
  const snap = await getDoc(incidentRef(storeId, customerId, incidentId));
  if (!snap.exists()) return null;
  return snap.data() as Incident;
}

export async function listIncidents(storeId: string, customerId: string): Promise<Incident[]> {
  const q = query(incidentsRef(storeId, customerId), orderBy('occurredAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Incident);
}

export async function createIncident(
  storeId: string,
  customerId: string,
  incidentId: string,
  input: IncidentCreateInput,
): Promise<Incident> {
  const data: Incident = {
    type: input.type,
    memo: input.memo,
    occurredAt: input.occurredAt as unknown as import('firebase/firestore').Timestamp,
    createdAt: serverTimestamp(),
  };
  await setDoc(incidentRef(storeId, customerId, incidentId), data);
  return data;
}

export async function updateIncident(
  storeId: string,
  customerId: string,
  incidentId: string,
  input: Partial<IncidentCreateInput>,
): Promise<void> {
  const updates: Partial<Incident> = {};
  if (input.type !== undefined) updates.type = input.type;
  if (input.memo !== undefined) updates.memo = input.memo;
  if (input.occurredAt !== undefined) {
    updates.occurredAt = input.occurredAt as unknown as import('firebase/firestore').Timestamp;
  }
  await updateDoc(incidentRef(storeId, customerId, incidentId), updates);
}

export async function deleteIncident(
  storeId: string,
  customerId: string,
  incidentId: string,
): Promise<void> {
  await deleteDoc(incidentRef(storeId, customerId, incidentId));
}
