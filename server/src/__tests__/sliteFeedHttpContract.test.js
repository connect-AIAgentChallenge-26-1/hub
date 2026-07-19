import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp } from '../index.js'
import { ReferenceFeedGatewayError } from '../services/referenceFeedGateway.js'

const ADMIN_KEY = 'admin-key-with-at-least-thirty-two-bytes-1234'
const DATABASE_PATH = '/tmp/noticepilot-slite-contract.sqlite3'
const FEED_ID = `feed_${'a'.repeat(32)}`
const TOKEN = 'T'.repeat(43)
const NEW_TOKEN = 'N'.repeat(43)

async function startTestServer(app) {
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, '127.0.0.1')
    candidate.once('error', reject)
    candidate.once('listening', () => resolve(candidate))
  })
  const address = server.address()
  assert(address && typeof address !== 'string')
  let closed = false
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed) return
      closed = true
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await app.locals.closeApplication()
    },
  }
}

function issueDto(token = TOKEN) {
  return {
    schemaVersion: 'noticepilot.sliteSubscriptionFeed.v0.1',
    feedId: FEED_ID,
    calendarName: 'NoticePilot 학생 일정',
    eventCount: 601,
    status: 'active',
    tokenFingerprint: createHash('sha256').update(token).digest('hex').slice(0, 12),
    subscriptionPath: `/calendar/${token}.ics`,
    persistsAcrossRestart: true,
  }
}

function statusDto(status = 'active') {
  return {
    schemaVersion: 'noticepilot.sliteSubscriptionFeed.v0.1',
    feedId: FEED_ID,
    calendarName: 'NoticePilot 학생 일정',
    eventCount: 601,
    status,
    tokenFingerprint: createHash('sha256')
      .update(TOKEN)
      .digest('hex')
      .slice(0, 12),
    createdAt: '2026-07-19T00:00:00+00:00',
    updatedAt: '2026-07-19T00:00:00+00:00',
    subscriptionPathRecoverable: false,
  }
}

function sliteOptions(gateway) {
  return {
    sliteFeedEnabled: true,
    sliteFeedAdminKey: ADMIN_KEY,
    sliteFeedDatabasePath: DATABASE_PATH,
    sliteFeedGateway: gateway,
  }
}

function adminHeaders(extra = {}) {
  return { authorization: `Bearer ${ADMIN_KEY}`, ...extra }
}

function executeSql(databasePath, sql) {
  const result = spawnSync(
    process.env.NOTICEPILOT_PYTHON || 'python3',
    [
      '-B',
      '-c',
      'import sqlite3,sys; connection=sqlite3.connect(sys.argv[1]); connection.executescript(sys.argv[2]); connection.commit(); connection.close()',
      databasePath,
      sql,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
}

test('SL-00 S-Lite startup is explicit, complete, and mutually exclusive', () => {
  let factoryCalls = 0
  const factory = () => {
    factoryCalls += 1
    return {}
  }
  assert.throws(
    () =>
      createApp({
        sliteFeedEnabled: true,
        sliteFeedAdminKey: 'too-short',
        sliteFeedDatabasePath: DATABASE_PATH,
        sliteFeedGatewayFactory: factory,
      }),
    (error) => error.code === 'SLITE_ADMIN_KEY_REQUIRED',
  )
  assert.throws(
    () =>
      createApp({
        sliteFeedEnabled: true,
        sliteFeedAdminKey: ADMIN_KEY,
        sliteFeedDatabasePath: 'relative.sqlite3',
        sliteFeedGatewayFactory: factory,
      }),
    (error) => error.code === 'SLITE_DATABASE_PATH_REQUIRED',
  )
  assert.throws(
    () =>
      createApp({
        referenceFeedEnabled: true,
        sliteFeedEnabled: true,
        sliteFeedAdminKey: ADMIN_KEY,
        sliteFeedDatabasePath: DATABASE_PATH,
        sliteFeedGatewayFactory: factory,
      }),
    (error) => error.code === 'FEED_MODES_MUTUALLY_EXCLUSIVE',
  )
  assert.throws(
    () =>
      createApp({
        sliteFeedEnabled: true,
        sliteFeedAdminKey: '관리자비밀키관리자비밀키관리자비밀키관리자',
        sliteFeedDatabasePath: DATABASE_PATH,
        sliteFeedGatewayFactory: factory,
      }),
    (error) => error.code === 'SLITE_ADMIN_KEY_REQUIRED',
  )
  assert.equal(factoryCalls, 0)
})

test('SL-01 administrator auth precedes parsing and every response is non-cacheable', async (t) => {
  let calls = 0
  const gateway = {
    async getSliteFeedStatus() {
      calls += 1
      return statusDto()
    },
    async provisionSliteFeed() {
      calls += 1
      return issueDto()
    },
  }
  const app = createApp(sliteOptions(gateway))
  const server = await startTestServer(app)
  t.after(() => server.close())

  for (const authorization of [undefined, 'Bearer wrong-key']) {
    const response = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
      headers: authorization ? { authorization } : {},
    })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('www-authenticate'), 'Bearer')
    assert.deepEqual(await response.json(), {
      error: {
        type: 'unauthorized',
        message: 'A valid S-Lite administrator credential is required.',
      },
    })
  }

  const unauthenticatedMalformed = await fetch(
    `${server.baseUrl}/api/subscription-feeds/slite`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    },
  )
  assert.equal(unauthenticatedMalformed.status, 401)

  const authenticatedMalformed = await fetch(
    `${server.baseUrl}/api/subscription-feeds/slite`,
    {
      method: 'POST',
      headers: adminHeaders({ 'content-type': 'application/json' }),
      body: '{',
    },
  )
  assert.equal(authenticatedMalformed.status, 400)
  assert.equal(authenticatedMalformed.headers.get('cache-control'), 'no-store')

  for (const [contentType, body] of [
    ['application/json', '[]'],
    ['application/json', 'null'],
    ['application/json', '{"unexpected":true}'],
    ['text/plain', '{}'],
  ]) {
    const invalid = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
      method: 'POST',
      headers: adminHeaders({ 'content-type': contentType }),
      body,
    })
    assert.equal(invalid.status, 400)
    assert.equal(invalid.headers.get('cache-control'), 'no-store')
  }

  const oversized = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
    method: 'POST',
    headers: adminHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ padding: 'x'.repeat(5_000) }),
  })
  assert.equal(oversized.status, 413)
  assert.equal(oversized.headers.get('cache-control'), 'no-store')
  assert.equal(calls, 0)
})

test('SL-01A missing and duplicate lifecycle operations keep stable admin errors', async (t) => {
  let exists = false
  const gateway = {
    async getSliteFeedStatus() {
      if (!exists) throw new ReferenceFeedGatewayError('not_found')
      return statusDto()
    },
    async provisionSliteFeed() {
      if (exists) throw new ReferenceFeedGatewayError('conflict')
      exists = true
      return issueDto()
    },
    async rotateSliteFeed() {
      if (!exists) throw new ReferenceFeedGatewayError('not_found')
      return issueDto(NEW_TOKEN)
    },
    async revokeSliteFeed() {
      if (!exists) throw new ReferenceFeedGatewayError('not_found')
      return statusDto('revoked')
    },
  }
  const server = await startTestServer(createApp(sliteOptions(gateway)))
  t.after(() => server.close())

  const missingStatus = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
    headers: adminHeaders(),
  })
  assert.equal(missingStatus.status, 404)

  const missingRotate = await fetch(
    `${server.baseUrl}/api/subscription-feeds/slite/rotate`,
    {
      method: 'POST',
      headers: adminHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    },
  )
  assert.equal(missingRotate.status, 404)

  const missingDelete = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  assert.equal(missingDelete.status, 204)

  const create = () =>
    fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
      method: 'POST',
      headers: adminHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    })
  assert.equal((await create()).status, 201)
  assert.equal((await create()).status, 409)
})

test('SL-02 create, inspect, rotate, and revoke expose only approved DTOs', async (t) => {
  let closeCalls = 0
  const gateway = {
    async getSliteFeedStatus() {
      return statusDto()
    },
    async provisionSliteFeed() {
      return issueDto()
    },
    async rotateSliteFeed() {
      return issueDto(NEW_TOKEN)
    },
    async revokeSliteFeed() {
      return statusDto('revoked')
    },
    async close() {
      closeCalls += 1
    },
  }
  const app = createApp(sliteOptions(gateway))
  const server = await startTestServer(app)
  t.after(() => server.close())

  const created = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
    method: 'POST',
    headers: adminHeaders({ 'content-type': 'application/json' }),
    body: '{}',
  })
  assert.equal(created.status, 201)
  assert.deepEqual(await created.json(), issueDto())

  const inspected = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
    headers: adminHeaders(),
  })
  assert.equal(inspected.status, 200)
  const safeStatus = await inspected.json()
  assert.deepEqual(safeStatus, statusDto())
  assert.equal('subscriptionPath' in safeStatus, false)

  const rotated = await fetch(
    `${server.baseUrl}/api/subscription-feeds/slite/rotate`,
    {
      method: 'POST',
      headers: adminHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    },
  )
  assert.equal(rotated.status, 200)
  assert.deepEqual(await rotated.json(), issueDto(NEW_TOKEN))

  const revoked = await fetch(`${server.baseUrl}/api/subscription-feeds/slite`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  assert.equal(revoked.status, 204)
  assert.equal(revoked.headers.get('cache-control'), 'no-store')

  await server.close()
  assert.equal(closeCalls, 1)
})

test('SL-03 public GET, HEAD, 304, and failures keep capability responses generic', async (t) => {
  const seen = []
  const gateway = {
    async renderSliteFeed(input) {
      seen.push(input)
      if (input.token === 'X'.repeat(43)) {
        throw new ReferenceFeedGatewayError('not_found')
      }
      const headers = {
        'Cache-Control': 'private, max-age=300, must-revalidate',
        ETag: '"snapshot-hash"',
        'Last-Modified': 'Mon, 13 Jul 2026 11:30:00 GMT',
        'X-NoticePilot-Snapshot-ID': 'feedsnap_reference',
      }
      if (input.ifNoneMatch === '"snapshot-hash"') {
        return { statusCode: 304, headers, body: Buffer.alloc(0) }
      }
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `inline; filename="${FEED_ID}.ics"`,
          'Set-Cookie': 'must-not-pass=true',
        },
        body: Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'),
      }
    },
  }
  const app = createApp(sliteOptions(gateway))
  const server = await startTestServer(app)
  t.after(() => server.close())
  const path = `/calendar/${TOKEN}.ics`

  const rendered = await fetch(`${server.baseUrl}${path}`)
  assert.equal(rendered.status, 200)
  assert.match(rendered.headers.get('content-type') || '', /^text\/calendar/)
  assert.equal(rendered.headers.get('set-cookie'), null)
  assert.match(await rendered.text(), /^BEGIN:VCALENDAR/)

  const head = await fetch(`${server.baseUrl}${path}`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')

  const notModified = await fetch(`${server.baseUrl}${path}`, {
    headers: { 'if-none-match': '"snapshot-hash"' },
  })
  assert.equal(notModified.status, 304)
  assert.equal(await notModified.text(), '')

  for (const suffix of [`${'X'.repeat(43)}.ics`, 'bad.ics', `${TOKEN}.ics/extra`]) {
    const response = await fetch(`${server.baseUrl}/calendar/${suffix}`)
    const body = await response.text()
    assert.equal(response.status, 404)
    assert.equal(body, 'not found')
    assert.equal(body.includes(TOKEN), false)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  for (const malformedEncoding of ['%ZZ', '%E0%A4%A']) {
    const response = await fetch(`${server.baseUrl}/calendar/${malformedEncoding}`)
    assert.equal(response.status, 404)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(response.headers.get('content-type') || '', /^text\/plain/)
    assert.equal(await response.text(), 'not found')
  }
  assert.deepEqual(seen[0], { token: TOKEN, ifNoneMatch: null })
})

test(
  'SL-04 real S-Lite link survives restart, rotates, and remains revoked after restart',
  { timeout: 120_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'noticepilot-slite-'))
    const databasePath = join(directory, 'feed.sqlite3')
    t.after(() => rm(directory, { recursive: true, force: true }))
    const options = {
      sliteFeedEnabled: true,
      sliteFeedAdminKey: ADMIN_KEY,
      sliteFeedDatabasePath: databasePath,
    }

    const first = await startTestServer(createApp(options))
    const created = await fetch(`${first.baseUrl}/api/subscription-feeds/slite`, {
      method: 'POST',
      headers: adminHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    })
    assert.equal(created.status, 201)
    const initialDto = await created.json()
    assert.equal(initialDto.eventCount, 601)
    const duplicateCreate = await fetch(
      `${first.baseUrl}/api/subscription-feeds/slite`,
      {
        method: 'POST',
        headers: adminHeaders({ 'content-type': 'application/json' }),
        body: '{}',
      },
    )
    assert.equal(duplicateCreate.status, 409)
    const initialToken = initialDto.subscriptionPath.split('/').at(-1).slice(0, -4)
    const initialCalendar = await fetch(`${first.baseUrl}${initialDto.subscriptionPath}`)
    assert.equal(initialCalendar.status, 200)
    const initialEtag = initialCalendar.headers.get('etag')
    const initialBody = await initialCalendar.text()
    assert.equal((initialBody.match(/^BEGIN:VEVENT\r?$/gm) || []).length, 601)
    await first.close()

    assert.equal((await stat(databasePath)).mode & 0o077, 0)
    const databaseBytes = await readFile(databasePath)
    assert.equal(databaseBytes.includes(Buffer.from(initialToken)), false)
    assert.equal(databaseBytes.includes(Buffer.from(initialToken.slice(0, 12))), false)

    const second = await startTestServer(createApp(options))
    const restored = await fetch(`${second.baseUrl}${initialDto.subscriptionPath}`)
    assert.equal(restored.status, 200)
    assert.equal(restored.headers.get('etag'), initialEtag)
    const restored304 = await fetch(`${second.baseUrl}${initialDto.subscriptionPath}`, {
      headers: { 'if-none-match': initialEtag },
    })
    assert.equal(restored304.status, 304)

    executeSql(
      databasePath,
      "CREATE TRIGGER reject_slite_update BEFORE UPDATE ON slite_feed BEGIN SELECT RAISE(FAIL, 'injected write failure'); END;",
    )
    const failedRotate = await fetch(
      `${second.baseUrl}/api/subscription-feeds/slite/rotate`,
      {
        method: 'POST',
        headers: adminHeaders({ 'content-type': 'application/json' }),
        body: '{}',
      },
    )
    assert.equal(failedRotate.status, 503)
    assert.equal((await fetch(`${second.baseUrl}${initialDto.subscriptionPath}`)).status, 200)
    executeSql(databasePath, 'DROP TRIGGER reject_slite_update;')

    const rotated = await fetch(
      `${second.baseUrl}/api/subscription-feeds/slite/rotate`,
      {
        method: 'POST',
        headers: adminHeaders({ 'content-type': 'application/json' }),
        body: '{}',
      },
    )
    assert.equal(rotated.status, 200)
    const rotatedDto = await rotated.json()
    assert.equal(rotatedDto.feedId, initialDto.feedId)
    assert.notEqual(rotatedDto.subscriptionPath, initialDto.subscriptionPath)
    assert.equal((await fetch(`${second.baseUrl}${initialDto.subscriptionPath}`)).status, 404)
    assert.equal((await fetch(`${second.baseUrl}${rotatedDto.subscriptionPath}`)).status, 200)

    const revoked = await fetch(`${second.baseUrl}/api/subscription-feeds/slite`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    assert.equal(revoked.status, 204)
    await second.close()

    const third = await startTestServer(createApp(options))
    t.after(() => third.close())
    assert.equal((await fetch(`${third.baseUrl}${rotatedDto.subscriptionPath}`)).status, 404)
    const status = await fetch(`${third.baseUrl}/api/subscription-feeds/slite`, {
      headers: adminHeaders(),
    })
    assert.equal(status.status, 200)
    assert.equal((await status.json()).status, 'revoked')

    const reactivated = await fetch(
      `${third.baseUrl}/api/subscription-feeds/slite/rotate`,
      {
        method: 'POST',
        headers: adminHeaders({ 'content-type': 'application/json' }),
        body: '{}',
      },
    )
    assert.equal(reactivated.status, 200)
    const reactivatedDto = await reactivated.json()
    assert.equal(reactivatedDto.feedId, initialDto.feedId)
    assert.equal((await fetch(`${third.baseUrl}${reactivatedDto.subscriptionPath}`)).status, 200)
  },
)

test(
  'SL-05 semantically corrupted persisted rows fail closed',
  { timeout: 120_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'noticepilot-slite-corrupt-'))
    const databasePath = join(directory, 'feed.sqlite3')
    t.after(() => rm(directory, { recursive: true, force: true }))
    const options = {
      sliteFeedEnabled: true,
      sliteFeedAdminKey: ADMIN_KEY,
      sliteFeedDatabasePath: databasePath,
    }
    const first = await startTestServer(createApp(options))
    const created = await fetch(`${first.baseUrl}/api/subscription-feeds/slite`, {
      method: 'POST',
      headers: adminHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    })
    assert.equal(created.status, 201)
    const dto = await created.json()
    await first.close()

    executeSql(
      databasePath,
      "PRAGMA ignore_check_constraints=ON; UPDATE slite_feed SET token_fingerprint='000000000000';",
    )
    const corrupted = await startTestServer(createApp(options))
    t.after(() => corrupted.close())
    const status = await fetch(`${corrupted.baseUrl}/api/subscription-feeds/slite`, {
      headers: adminHeaders(),
    })
    assert.equal(status.status, 503)
    assert.equal((await fetch(`${corrupted.baseUrl}${dto.subscriptionPath}`)).status, 503)
  },
)
