#!/usr/bin/env node
// Fails loudly (non-zero exit) if the running Node does not satisfy
// package.json's engines.node. Wired as `preverify` so it runs automatically
// before `npm run verify`, covering both `scripts/verify.sh` and CI's direct
// `npm run verify` step. Without this, an unsupported Node just prints an
// EBADENGINE warning and `npm run verify` still exits 0 — local pass would
// not actually guarantee CI pass (docs/harness.md 설계 원칙 2).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import semver from 'semver'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const requiredRange = pkg.engines?.node

if (!requiredRange) {
  console.error('package.json에 engines.node가 없습니다 — 검사를 건너뛸 수 없습니다.')
  process.exit(1)
}

if (!semver.satisfies(process.version, requiredRange)) {
  console.error(
    `지원하지 않는 Node 버전입니다: 현재 ${process.version}, 필요 ${requiredRange}.\n` +
      `.nvmrc가 가리키는 버전으로 전환하세요: nvm install && nvm use`,
  )
  process.exit(1)
}
