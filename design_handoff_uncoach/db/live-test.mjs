// 결(結) — 실 DB 통합 테스트 (repo 왕복)
//
// 실행:
//   1) npm install
//   2) DATABASE_URL 설정 (예: Neon/Supabase/Vercel Postgres 연결 문자열)
//        PS:  $env:DATABASE_URL = "postgres://user:pass@host/db?sslmode=require"
//   3) node db/migrate.mjs      (스키마 최초 적용)
//   4) node db/live-test.mjs    (프로필→세션→자산→상황 저장/조회/삭제 왕복)
//
// 테스트용 device_id로만 쓰고 끝에 cascade 삭제하므로 실제 데이터엔 영향 없다.

import { pathToFileURL } from 'node:url';
import { db } from './client.mjs';
import {
  getState, upsertProfile, addSession, addAsset, addSituation, removeSituation,
} from './repo.mjs';

export async function run() {
  const id = 'test-' + Date.now().toString(36);
  const log = (...a) => console.log(' ', ...a);
  console.log(`\n=== 실 DB 왕복 테스트 (device: ${id}) ===`);

  await upsertProfile(id, { role: '대학생', goal: '교수·조교 메일 격식' });
  log('✓ 프로필 저장');

  const sess = await addSession(id, {
    situationId: 'pq',
    scores: { context_intent: 4, relation_formality: 3, strategy_expression: 4 },
    total: 74,
  });
  log('✓ 세션 저장', sess);

  await addAsset(id, { text: '혹시 3번 문항만 다시 확인 부탁드려도 될까요?', situationId: 'pq' });
  log('✓ 자산 저장');

  const sit = await addSituation(id, {
    title: '테스트 상황', rel: '교수', goal: '문의',
    rubric: { context: ['위험', '무난', '적절'], register: ['a', 'b', 'c'], strategy: ['a', 'b', 'c'] },
  });
  log('✓ 커스텀 상황 저장', sit);

  const state = await getState(id);
  console.log('\n로드 결과:');
  console.log(JSON.stringify(state, null, 1));

  // 검증
  const okProfile = state.profile && state.profile.role === '대학생';
  const okHistory = state.history.length === 1 && state.history[0].scores.register === 3 && state.history[0].total === 74;
  const okAssets = state.assets.length === 1;
  const okSit = state.customSits.length === 1 && Array.isArray(state.customSits[0].rubric.context);
  console.log('\n검증:', { okProfile, okHistory, okAssets, okSit });

  await removeSituation(id, sit.id);
  const after = await getState(id);
  const okRemove = after.customSits.length === 0;
  console.log('상황 삭제 후 customSits:', after.customSits.length, okRemove ? '✓' : '✗');

  // 정리(cascade): 프로필 삭제 시 세션·자산·상황 모두 제거
  await db()`delete from profiles where device_id = ${id}`;
  const cleaned = await getState(id);
  const okClean = !cleaned.profile && cleaned.history.length === 0 && cleaned.assets.length === 0;
  console.log('cascade 정리 후 비었는지:', okClean ? '✓' : '✗');

  const allOk = okProfile && okHistory && okAssets && okSit && okRemove && okClean;
  console.log(allOk ? '\n✅ 전체 왕복 성공' : '\n❌ 일부 실패');
  return allOk;
}

// 직접 실행 시에만 동작(테스트 하네스가 import 할 땐 실행 안 됨)
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 환경변수가 없습니다.');
    process.exit(1);
  }
  try {
    const ok = await run();
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('❌ 실패:', e.message);
    process.exitCode = 1;
  } finally {
    await db().end();
  }
}
