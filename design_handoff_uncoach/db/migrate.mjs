// 결(結) — 스키마 적용(마이그레이션)
//
// 실행: DATABASE_URL 설정 후  node db/migrate.mjs
//   (schema.sql 은 create table if not exists 라서 여러 번 실행해도 안전)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './client.mjs';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경변수가 없습니다.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const ddl = readFileSync(join(here, 'schema.sql'), 'utf8');
const sql = db();

try {
  await sql.unsafe(ddl);
  console.log('✅ 스키마 적용 완료 (profiles / sessions / assets / custom_situations)');
} catch (e) {
  console.error('❌ 마이그레이션 실패:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
