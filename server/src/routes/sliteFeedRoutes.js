import { createHash, timingSafeEqual } from 'node:crypto'
import express, { Router } from 'express'
import { ReferenceFeedGatewayError } from '../services/referenceFeedGateway.js'
import {
  isSliteIssueDto,
  isSliteStatusDto,
} from '../services/sliteFeedGateway.js'

const TOKEN_FILE_PATTERN = /^([A-Za-z0-9_-]{32,256})\.ics$/
const SAFE_FEED_HEADERS = new Set([
  'cache-control',
  'content-disposition',
  'content-type',
  'etag',
  'last-modified',
  'x-noticepilot-snapshot-id',
])

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest()
}

function isExactEmptyObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

function sendAdminError(response, statusCode, type, message) {
  response.set('Cache-Control', 'no-store').status(statusCode).json({
    error: { type, message },
  })
}

function sendUnavailable(response) {
  sendAdminError(
    response,
    503,
    'slite_feed_unavailable',
    'The S-Lite subscription feed is unavailable.',
  )
}

function sendPublicError(response, statusCode) {
  response
    .set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    })
    .type('text/plain')
    .status(statusCode)
    .send(statusCode === 404 ? 'not found' : 'temporarily unavailable')
}

function applyFeedHeaders(response, headers) {
  for (const [name, value] of Object.entries(headers)) {
    if (SAFE_FEED_HEADERS.has(name.toLowerCase()) && typeof value === 'string') {
      response.set(name, value)
    }
  }
  response.set({
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
}

function createAdminGuard({ enabled, adminKey }) {
  const expectedDigest = enabled ? digest(adminKey) : null
  return (_request, response, next) => {
    if (!enabled) {
      sendUnavailable(response)
      return
    }
    const authorization = _request.get('authorization') || ''
    const match = /^Bearer ([^\s]+)$/.exec(authorization)
    const presentedDigest = digest(match?.[1] || '')
    if (!match || !timingSafeEqual(expectedDigest, presentedDigest)) {
      response.set('WWW-Authenticate', 'Bearer')
      sendAdminError(
        response,
        401,
        'unauthorized',
        'A valid S-Lite administrator credential is required.',
      )
      return
    }
    next()
  }
}

function requireEmptyJson(request, response, next) {
  if (!request.is('application/json') || !isExactEmptyObject(request.body)) {
    sendAdminError(
      response,
      400,
      'invalid_request',
      'Request body must be exactly {}.',
    )
    return
  }
  next()
}

function adminStatusFor(error) {
  if (!(error instanceof ReferenceFeedGatewayError)) {
    return 503
  }
  if (error.code === 'not_found') {
    return 404
  }
  if (error.code === 'conflict') {
    return 409
  }
  return 503
}

function sendGatewayAdminError(response, error) {
  const statusCode = adminStatusFor(error)
  if (statusCode === 404) {
    sendAdminError(response, 404, 'slite_feed_not_found', 'The S-Lite feed does not exist.')
    return
  }
  if (statusCode === 409) {
    sendAdminError(response, 409, 'slite_feed_exists', 'The S-Lite feed already exists.')
    return
  }
  sendUnavailable(response)
}

export function createSliteFeedRouters({ enabled, adminKey, gateway } = {}) {
  const apiRouter = Router({ caseSensitive: true, strict: true })
  const publicRouter = Router({ caseSensitive: true, strict: true })
  const adminGuard = createAdminGuard({ enabled, adminKey })
  const jsonParser = express.json({ limit: '4kb', strict: true })

  apiRouter.get('/slite', adminGuard, async (_request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      const result = await gateway.getSliteFeedStatus()
      if (!isSliteStatusDto(result)) {
        sendUnavailable(response)
        return
      }
      response.json(result)
    } catch (error) {
      sendGatewayAdminError(response, error)
    }
  })

  apiRouter.post(
    '/slite',
    adminGuard,
    jsonParser,
    requireEmptyJson,
    async (_request, response) => {
      response.set('Cache-Control', 'no-store')
      try {
        const result = await gateway.provisionSliteFeed()
        if (!isSliteIssueDto(result)) {
          sendUnavailable(response)
          return
        }
        response.status(201).json(result)
      } catch (error) {
        sendGatewayAdminError(response, error)
      }
    },
  )

  apiRouter.post(
    '/slite/rotate',
    adminGuard,
    jsonParser,
    requireEmptyJson,
    async (_request, response) => {
      response.set('Cache-Control', 'no-store')
      try {
        const result = await gateway.rotateSliteFeed()
        if (!isSliteIssueDto(result)) {
          sendUnavailable(response)
          return
        }
        response.json(result)
      } catch (error) {
        sendGatewayAdminError(response, error)
      }
    },
  )

  apiRouter.delete('/slite', adminGuard, async (_request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      const result = await gateway.revokeSliteFeed()
      if (!isSliteStatusDto(result)) {
        sendUnavailable(response)
        return
      }
      response.status(204).end()
    } catch (error) {
      if (adminStatusFor(error) === 404) {
        response.status(204).end()
        return
      }
      sendUnavailable(response)
    }
  })

  publicRouter.all('/:tokenFile', async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendPublicError(response, 404)
      return
    }
    const tokenMatch = TOKEN_FILE_PATTERN.exec(request.params.tokenFile)
    if (!enabled || !gateway || tokenMatch === null) {
      sendPublicError(response, 404)
      return
    }
    try {
      const result = await gateway.renderSliteFeed({
        token: tokenMatch[1],
        ifNoneMatch: request.get('if-none-match') || null,
      })
      if (result.statusCode !== 200 && result.statusCode !== 304) {
        response.set('Retry-After', '300')
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
      const isNotFound =
        error instanceof ReferenceFeedGatewayError &&
        (error.code === 'not_found' || error.code === 'invalid_request')
      if (!isNotFound) {
        response.set('Retry-After', '300')
      }
      sendPublicError(response, isNotFound ? 404 : 503)
    }
  })

  publicRouter.use((_request, response) => {
    sendPublicError(response, 404)
  })

  return { apiRouter, publicRouter }
}
