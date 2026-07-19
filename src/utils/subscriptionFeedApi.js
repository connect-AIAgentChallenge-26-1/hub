const referenceFeedEndpoint = '/api/subscription-feeds/reference'
const referenceFeedSchemaVersion =
  'noticepilot.referenceSubscriptionFeed.v0.1'
const referenceFeedDtoKeys = [
  'schemaVersion',
  'calendarName',
  'eventCount',
  'tokenPrefix',
  'subscriptionPath',
  'expiresOnServerRestart',
]

export class SubscriptionFeedApiError extends Error {
  constructor(type, status = null) {
    super('Reference subscription feed request failed.')
    this.name = 'SubscriptionFeedApiError'
    this.type = type
    this.status = status
  }
}

export function isReferenceSubscriptionFeedDto(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const keys = Object.keys(value)

  return (
    keys.length === referenceFeedDtoKeys.length &&
    keys.every((key) => referenceFeedDtoKeys.includes(key)) &&
    value.schemaVersion === referenceFeedSchemaVersion &&
    typeof value.calendarName === 'string' &&
    Number.isInteger(value.eventCount) &&
    typeof value.tokenPrefix === 'string' &&
    typeof value.subscriptionPath === 'string' &&
    value.expiresOnServerRestart === true
  )
}

export async function provisionReferenceSubscriptionFeed(fetchImpl = fetch) {
  let response

  try {
    response = await fetchImpl(referenceFeedEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch {
    throw new SubscriptionFeedApiError('network_error')
  }

  let payload

  try {
    payload = await response.json()
  } catch {
    throw new SubscriptionFeedApiError('invalid_response', response.status)
  }

  if (!response.ok) {
    const serverType =
      typeof payload?.error?.type === 'string'
        ? payload.error.type
        : 'reference_feed_unavailable'

    throw new SubscriptionFeedApiError(serverType, response.status)
  }

  if (!isReferenceSubscriptionFeedDto(payload)) {
    throw new SubscriptionFeedApiError('invalid_response', response.status)
  }

  return payload
}
