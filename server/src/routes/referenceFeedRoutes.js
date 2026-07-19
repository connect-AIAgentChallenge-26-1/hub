import { Router } from 'express'
import { ReferenceFeedGatewayError } from '../services/referenceFeedGateway.js'

const FEED_ID_PATTERN = /^feed_[0-9a-f]{32}$/
const TOKEN_FILE_PATTERN = /^([A-Za-z0-9_-]{32,256})\.ics$/
const REFERENCE_DTO_KEYS = new Set([
  'schemaVersion',
  'calendarName',
  'eventCount',
  'tokenPrefix',
  'subscriptionPath',
  'expiresOnServerRestart',
])
const SAFE_FEED_HEADERS = new Set([
  'cache-control',
  'content-disposition',
  'content-type',
  'etag',
  'last-modified',
  'x-noticepilot-snapshot-id',
])

function isExactEmptyObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

function isReferenceDto(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === REFERENCE_DTO_KEYS.size &&
    Object.keys(value).every((key) => REFERENCE_DTO_KEYS.has(key)) &&
    value.schemaVersion === 'noticepilot.referenceSubscriptionFeed.v0.1' &&
    typeof value.calendarName === 'string' &&
    Number.isInteger(value.eventCount) &&
    typeof value.tokenPrefix === 'string' &&
    typeof value.subscriptionPath === 'string' &&
    value.expiresOnServerRestart === true
  )
}

function sendProvisioningUnavailable(response) {
  response.status(503).json({
    error: {
      type: 'reference_feed_unavailable',
      message: 'The reference subscription feed is unavailable.',
    },
  })
}

function sendPublicError(response, statusCode) {
  const responses = {
    404: 'not found',
    410: 'gone',
    503: 'temporarily unavailable',
  }
  response.type('text/plain').status(statusCode).send(responses[statusCode])
}

function publicStatusFor(error) {
  if (!(error instanceof ReferenceFeedGatewayError)) {
    return 503
  }
  if (error.code === 'not_found' || error.code === 'invalid_request') {
    return 404
  }
  if (error.code === 'gone') {
    return 410
  }
  return 503
}

function applyFeedHeaders(response, headers) {
  for (const [name, value] of Object.entries(headers)) {
    if (
      SAFE_FEED_HEADERS.has(name.toLowerCase()) &&
      typeof value === 'string'
    ) {
      response.set(name, value)
    }
  }
}

export function createReferenceFeedRouters({ enabled, gateway } = {}) {
  const apiRouter = Router({ caseSensitive: true, strict: true })
  const publicRouter = Router({ caseSensitive: true, strict: true })

  apiRouter.post('/reference', async (request, response) => {
    response.set('Cache-Control', 'no-store')
    if (!request.is('application/json') || !isExactEmptyObject(request.body)) {
      response.status(400).json({
        error: {
          type: 'invalid_request',
          message: 'Request body must be exactly {}.',
        },
      })
      return
    }
    if (!enabled || !gateway) {
      sendProvisioningUnavailable(response)
      return
    }

    try {
      const result = await gateway.provisionReferenceFeed()
      if (!isReferenceDto(result)) {
        sendProvisioningUnavailable(response)
        return
      }
      response.status(201).json(result)
    } catch {
      sendProvisioningUnavailable(response)
    }
  })

  publicRouter.all('/:feedId/:tokenFile', async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendPublicError(response, 404)
      return
    }

    const tokenMatch = TOKEN_FILE_PATTERN.exec(request.params.tokenFile)
    if (
      !enabled ||
      !gateway ||
      !FEED_ID_PATTERN.test(request.params.feedId) ||
      tokenMatch === null
    ) {
      sendPublicError(response, 404)
      return
    }

    try {
      const result = await gateway.renderFeed({
        feedId: request.params.feedId,
        token: tokenMatch[1],
        ifNoneMatch: request.get('if-none-match') || null,
      })
      if (result.statusCode !== 200 && result.statusCode !== 304) {
        sendPublicError(response, 503)
        return
      }

      applyFeedHeaders(response, result.headers)
      response.status(result.statusCode)
      if (result.statusCode === 304 || request.method === 'HEAD') {
        response.end()
        return
      }
      response.send(result.body)
    } catch (error) {
      const statusCode = publicStatusFor(error)
      if (statusCode === 503) {
        response.set('Retry-After', '300')
      }
      sendPublicError(response, statusCode)
    }
  })

  // Express's default 404 body echoes the requested URL. Keep every malformed
  // capability URL inside this generic boundary so a token is never reflected.
  publicRouter.use((_request, response) => {
    sendPublicError(response, 404)
  })

  return { apiRouter, publicRouter }
}
