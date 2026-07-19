import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SubscriptionFeedApiError,
  isReferenceSubscriptionFeedDto,
  provisionReferenceSubscriptionFeed,
} from './subscriptionFeedApi.js'

const referenceDto = {
  schemaVersion: 'noticepilot.referenceSubscriptionFeed.v0.1',
  calendarName: 'NoticePilot 학생 일정',
  eventCount: 601,
  tokenPrefix: 'TTTTTTTTTTTT',
  subscriptionPath:
    '/subscription-feeds/feed_11111111111111111111111111111111/TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.ics',
  expiresOnServerRestart: true,
}

test('provisioning sends the exact empty JSON object and accepts the exact DTO', async () => {
  let request
  const result = await provisionReferenceSubscriptionFeed(async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify(referenceDto), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  })

  assert.equal(request.url, '/api/subscription-feeds/reference')
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.headers['Content-Type'], 'application/json')
  assert.equal(request.options.body, '{}')
  assert.deepEqual(result, referenceDto)
})

test('DTO validation rejects missing, extra, and mistyped fields', () => {
  assert.equal(isReferenceSubscriptionFeedDto(referenceDto), true)
  assert.equal(
    isReferenceSubscriptionFeedDto({ ...referenceDto, eventCount: '601' }),
    false,
  )
  assert.equal(
    isReferenceSubscriptionFeedDto({ ...referenceDto, capabilityToken: 'secret' }),
    false,
  )

  const { tokenPrefix: _omitted, ...missingField } = referenceDto
  assert.equal(isReferenceSubscriptionFeedDto(missingField), false)
})

test('invalid success payloads and unavailable responses stay typed', async () => {
  await assert.rejects(
    provisionReferenceSubscriptionFeed(
      async () => new Response('{}', { status: 201 }),
    ),
    (error) =>
      error instanceof SubscriptionFeedApiError &&
      error.type === 'invalid_response' &&
      error.status === 201,
  )

  await assert.rejects(
    provisionReferenceSubscriptionFeed(
      async () =>
        new Response(
          JSON.stringify({
            error: { type: 'reference_feed_unavailable' },
          }),
          { status: 503 },
        ),
    ),
    (error) =>
      error instanceof SubscriptionFeedApiError &&
      error.type === 'reference_feed_unavailable' &&
      error.status === 503,
  )
})
