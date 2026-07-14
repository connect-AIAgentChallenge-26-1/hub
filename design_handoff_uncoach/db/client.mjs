// 결(結) — Postgres 연결 (postgres.js)
//
// 표준 연결 문자열(DATABASE_URL)만 쓰므로 Neon / Supabase / Vercel Postgres 등
// 어느 호스팅에도 그대로 붙는다. 서버리스 환경이라 커넥션은 1개로 제한한다.
//
// 환경변수:
//   DATABASE_URL   postgres://user:pass@host/db   (필수)
//   DATABASE_SSL   'disable' 이면 SSL 끔(로컬 개발용). 기본은 require.

import postgres from 'postgres';

let sql = null;

export function db() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  sql = postgres(url, {
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
    max: 1,             // 서버리스: 인스턴스당 커넥션 1개
    idle_timeout: 20,   // 유휴 커넥션 정리(초)
  });
  return sql;
}
