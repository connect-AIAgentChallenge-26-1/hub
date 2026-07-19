import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp, isReferenceFeedLoopbackHost } from '../index.js'
import {
  PythonReferenceFeedGateway,
  ReferenceFeedGatewayError,
} from '../services/referenceFeedGateway.js'

const FEED_ID = `feed_${'1'.repeat(32)}`
const TOKEN = 'T'.repeat(43)
const SUBSCRIPTION_PATH = `/subscription-feeds/${FEED_ID}/${TOKEN}.ics`

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
      if (closed) {
        return
      }
      closed = true
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await app.locals.closeApplication()
    },
  }
}

function referenceDto() {
  return {
    schemaVersion: 'noticepilot.referenceSubscriptionFeed.v0.1',
    calendarName: 'NoticePilot 학생 일정',
    eventCount: 601,
    tokenPrefix: TOKEN.slice(0, 12),
    subscriptionPath: SUBSCRIPTION_PATH,
    expiresOnServerRestart: true,
  }
}

test('RF-00 reference mode is restricted to loopback server hosts', () => {
  for (const host of [
    '127.0.0.1',
    '127.0.0.2',
    '::1',
    '[::1]',
    '0:0:0:0:0:0:0:1',
  ]) {
    assert.equal(isReferenceFeedLoopbackHost(host), true)
  }

  for (const host of [
    '0.0.0.0',
    '::',
    '192.168.0.10',
    'localhost',
    '',
    null,
  ]) {
    assert.equal(isReferenceFeedLoopbackHost(host), false)
  }

  let factoryCallCount = 0
  assert.throws(
    () =>
      createApp({
        referenceFeedEnabled: true,
        referenceFeedHost: '0.0.0.0',
        referenceFeedGatewayFactory() {
          factoryCallCount += 1
          return {}
        },
      }),
    (error) =>
      error.code === 'REFERENCE_FEED_LOOPBACK_REQUIRED' &&
      error.message ===
        'Reference feed mode requires a loopback-only server host.',
  )
  assert.equal(factoryCallCount, 0)

  assert.doesNotThrow(() =>
    createApp({
      referenceFeedEnabled: false,
      referenceFeedHost: '0.0.0.0',
    }),
  )
})

test('RF-01 provisioning is opt-in and accepts only the exact {} JSON body', async (t) => {
  const app = createApp({ referenceFeedEnabled: false })
  const testServer = await startTestServer(app)
  t.after(() => testServer.close())

  const disabled = await fetch(
    `${testServer.baseUrl}/api/subscription-feeds/reference`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    },
  )
  assert.equal(disabled.status, 503)
  assert.equal(disabled.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await disabled.json(), {
    error: {
      type: 'reference_feed_unavailable',
      message: 'The reference subscription feed is unavailable.',
    },
  })

  for (const body of ['[]', '{"campuses":[]}', 'null']) {
    const invalid = await fetch(
      `${testServer.baseUrl}/api/subscription-feeds/reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      },
    )
    assert.equal(invalid.status, 400)
    assert.equal(invalid.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await invalid.json(), {
      error: {
        type: 'invalid_request',
        message: 'Request body must be exactly {}.',
      },
    })
  }

  const malformedJson = await fetch(
    `${testServer.baseUrl}/api/subscription-feeds/reference`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    },
  )
  assert.equal(malformedJson.status, 400)
  assert.equal(malformedJson.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await malformedJson.json(), {
    error: {
      type: 'invalid_request',
      message: 'Request body must be exactly {}.',
    },
  })

  const wrongContentType = await fetch(
    `${testServer.baseUrl}/api/subscription-feeds/reference`,
    {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    },
  )
  assert.equal(wrongContentType.status, 400)
  assert.equal(wrongContentType.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await wrongContentType.json(), {
    error: {
      type: 'invalid_request',
      message: 'Request body must be exactly {}.',
    },
  })
})

test('RF-02 provisioning returns only the approved reference DTO and closes its gateway', async (t) => {
  let closeCount = 0
  const gateway = {
    async provisionReferenceFeed() {
      return referenceDto()
    },
    async close() {
      closeCount += 1
    },
  }
  const app = createApp({
    referenceFeedEnabled: true,
    referenceFeedGateway: gateway,
  })
  const testServer = await startTestServer(app)
  t.after(() => testServer.close())

  const response = await fetch(
    `${testServer.baseUrl}/api/subscription-feeds/reference`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    },
  )
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), referenceDto())

  await testServer.close()
  assert.equal(closeCount, 1)
})

test('RF-03 GET/HEAD and conditional requests preserve calendar headers', async (t) => {
  const seen = []
  const gateway = {
    async provisionReferenceFeed() {
      return referenceDto()
    },
    async renderFeed(input) {
      seen.push(input)
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
        },
        body: Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'),
      }
    },
  }
  const app = createApp({
    referenceFeedEnabled: true,
    referenceFeedGateway: gateway,
  })
  const testServer = await startTestServer(app)
  t.after(() => testServer.close())

  const getResponse = await fetch(`${testServer.baseUrl}${SUBSCRIPTION_PATH}`)
  assert.equal(getResponse.status, 200)
  assert.equal(getResponse.headers.get('etag'), '"snapshot-hash"')
  assert.match(getResponse.headers.get('content-type') || '', /^text\/calendar/)
  assert.match(await getResponse.text(), /^BEGIN:VCALENDAR/)

  const headResponse = await fetch(`${testServer.baseUrl}${SUBSCRIPTION_PATH}`, {
    method: 'HEAD',
  })
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), '')

  const notModified = await fetch(`${testServer.baseUrl}${SUBSCRIPTION_PATH}`, {
    headers: { 'if-none-match': '"snapshot-hash"' },
  })
  assert.equal(notModified.status, 304)
  assert.equal(notModified.headers.get('etag'), '"snapshot-hash"')
  assert.equal(await notModified.text(), '')

  assert.deepEqual(seen[0], {
    feedId: FEED_ID,
    token: TOKEN,
    ifNoneMatch: null,
  })
})

test('RF-04 public failures use generic 404/410/503 responses without the token', async (t) => {
  const codes = new Map()
  const gateway = {
    async renderFeed({ feedId }) {
      throw new ReferenceFeedGatewayError(codes.get(feedId) || 'not_found')
    },
  }
  const app = createApp({
    referenceFeedEnabled: true,
    referenceFeedGateway: gateway,
  })
  const testServer = await startTestServer(app)
  t.after(() => testServer.close())

  const cases = [
    ['2', 'not_found', 404, 'not found'],
    ['3', 'gone', 410, 'gone'],
    ['4', 'temporarily_unavailable', 503, 'temporarily unavailable'],
  ]
  for (const [digit, code, expectedStatus, expectedBody] of cases) {
    const feedId = `feed_${digit.repeat(32)}`
    codes.set(feedId, code)
    const response = await fetch(
      `${testServer.baseUrl}/subscription-feeds/${feedId}/${TOKEN}.ics`,
    )
    const body = await response.text()
    assert.equal(response.status, expectedStatus)
    assert.equal(body, expectedBody)
    assert.equal(body.includes(TOKEN), false)
  }

  const malformed = await fetch(
    `${testServer.baseUrl}/subscription-feeds/not-a-feed/${TOKEN}.ics`,
  )
  assert.equal(malformed.status, 404)
  assert.equal(await malformed.text(), 'not found')

  const malformedSuffix = await fetch(
    `${testServer.baseUrl}${SUBSCRIPTION_PATH}/unexpected`,
  )
  const malformedSuffixBody = await malformedSuffix.text()
  assert.equal(malformedSuffix.status, 404)
  assert.equal(malformedSuffixBody, 'not found')
  assert.equal(malformedSuffixBody.includes(TOKEN), false)
})

test(
  'RF-05 real Foundation bridge provisions, authenticates, renders, and returns 304',
  { timeout: 120_000 },
  async (t) => {
    const gateway = new PythonReferenceFeedGateway({ requestTimeoutMs: 120_000 })
    const app = createApp({
      referenceFeedEnabled: true,
      referenceFeedGateway: gateway,
    })
    const testServer = await startTestServer(app)
    t.after(() => testServer.close())

    const provisioned = await fetch(
      `${testServer.baseUrl}/api/subscription-feeds/reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    )
    assert.equal(provisioned.status, 201)
    const dto = await provisioned.json()
    assert.equal(dto.eventCount, 601)
    assert.equal(dto.expiresOnServerRestart, true)
    assert.match(
      dto.subscriptionPath,
      /^\/subscription-feeds\/feed_[0-9a-f]{32}\/[A-Za-z0-9_-]{32,256}\.ics$/,
    )

    const rendered = await fetch(`${testServer.baseUrl}${dto.subscriptionPath}`)
    assert.equal(rendered.status, 200)
    const etag = rendered.headers.get('etag')
    assert(etag)
    const calendar = await rendered.text()
    assert.match(calendar, /^BEGIN:VCALENDAR\r?$/m)
    assert.equal((calendar.match(/^BEGIN:VEVENT\r?$/gm) || []).length, 601)

    const invalidTokenPath = dto.subscriptionPath.replace(
      /\/[^/]+\.ics$/,
      `/${'X'.repeat(43)}.ics`,
    )
    const unauthorized = await fetch(`${testServer.baseUrl}${invalidTokenPath}`)
    assert.equal(unauthorized.status, 404)
    assert.equal(await unauthorized.text(), 'not found')

    const notModified = await fetch(
      `${testServer.baseUrl}${dto.subscriptionPath}`,
      { headers: { 'if-none-match': etag } },
    )
    assert.equal(notModified.status, 304)
    assert.equal(await notModified.text(), '')
  },
)
