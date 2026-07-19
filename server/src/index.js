import express from 'express'
import { isIP } from 'node:net'
import { createAnalyzeRouter } from './routes/analyzeRoutes.js'
import { createReferenceFeedRouters } from './routes/referenceFeedRoutes.js'
import { createPythonReferenceFeedGateway } from './services/referenceFeedGateway.js'

export function isReferenceFeedLoopbackHost(host) {
  if (typeof host !== 'string') {
    return false
  }

  const normalized = host.trim().toLowerCase()
  const address =
    normalized.startsWith('[') && normalized.endsWith(']')
      ? normalized.slice(1, -1)
      : normalized

  if (isIP(address) === 4) {
    return address.startsWith('127.')
  }
  if (isIP(address) === 6) {
    return address === '::1' || address === '0:0:0:0:0:0:0:1'
  }
  return false
}

export function createApp({
  analyzeNotice,
  referenceFeedEnabled =
    process.env.NOTICEPILOT_ENABLE_REFERENCE_FEED === 'true',
  referenceFeedHost = process.env.HOST || '127.0.0.1',
  referenceFeedGateway,
  referenceFeedGatewayFactory = createPythonReferenceFeedGateway,
} = {}) {
  if (
    referenceFeedEnabled &&
    !isReferenceFeedLoopbackHost(referenceFeedHost)
  ) {
    const error = new Error(
      'Reference feed mode requires a loopback-only server host.',
    )
    error.code = 'REFERENCE_FEED_LOOPBACK_REQUIRED'
    throw error
  }

  const app = express()
  const gateway = referenceFeedEnabled
    ? referenceFeedGateway || referenceFeedGatewayFactory()
    : null
  const { apiRouter: referenceFeedApiRouter, publicRouter: referenceFeedRouter } =
    createReferenceFeedRouters({
      enabled: referenceFeedEnabled,
      gateway,
    })

  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'noticepilot-analyze-api',
    })
  })

  app.use('/api/analyze', createAnalyzeRouter({ analyzeNotice }))
  app.use('/api/subscription-feeds', referenceFeedApiRouter)
  app.use('/subscription-feeds', referenceFeedRouter)

  let closed = false
  app.locals.closeApplication = async () => {
    if (closed) {
      return
    }
    closed = true
    await gateway?.close?.()
  }

  app.use((error, request, response, _next) => {
    const isReferenceProvisioningRequest =
      request.method === 'POST' &&
      request.path === '/api/subscription-feeds/reference'

    if (
      isReferenceProvisioningRequest &&
      error.status === 400 &&
      error.type === 'entity.parse.failed'
    ) {
      response.set('Cache-Control', 'no-store').status(400).json({
        error: {
          type: 'invalid_request',
          message: 'Request body must be exactly {}.',
        },
      })
      return
    }

    if (error.status === 400 && error.type === 'entity.parse.failed') {
      response.status(400).json({
        error: {
          type: 'invalid_json',
          message: 'Request body contains invalid JSON.',
        },
      })
      return
    }

    if (error.status === 413 && error.type === 'entity.too.large') {
      response.status(413).json({
        error: {
          type: 'request_too_large',
          message: 'Request body exceeds the allowed size limit.',
        },
      })
      return
    }

    const statusCode = error.statusCode || 500

    response.status(statusCode).json({
      error: {
        type: error.type || 'server_error',
        message:
          error.publicMessage ||
          'The analysis server could not complete the request.',
      },
    })
  })

  return app
}

const isMainModule = process.argv[1]
  ? import.meta.url === new URL(process.argv[1], 'file:').href
  : false

if (isMainModule) {
  const port = Number(process.env.PORT || process.env.NOTICEPILOT_API_PORT || 3001)
  const host = process.env.HOST || '127.0.0.1'
  const app = createApp({ referenceFeedHost: host })

  const server = app.listen(port, host, () => {
    console.log(`NoticePilot analyze API listening on http://${host}:${port}`)
  })

  server.once('close', () => {
    void app.locals.closeApplication()
  })

  server.on('error', (error) => {
    console.error(error)
    void app.locals.closeApplication()
    process.exitCode = 1
  })

  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    server.close()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
