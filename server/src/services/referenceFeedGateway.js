import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const DEFAULT_BRIDGE_PATH = fileURLToPath(
  new URL('../../python/reference_feed_bridge.py', import.meta.url),
)
const DEFAULT_FOUNDATION_ROOT = fileURLToPath(
  new URL('../../../packages/noticepilot-knu-crawler/', import.meta.url),
)

export class ReferenceFeedGatewayError extends Error {
  constructor(code = 'unavailable') {
    super('Reference feed gateway request failed.')
    this.name = 'ReferenceFeedGatewayError'
    this.code = code
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export class PythonReferenceFeedGateway {
  constructor({
    pythonCommand = process.env.NOTICEPILOT_PYTHON || 'python3',
    bridgePath = DEFAULT_BRIDGE_PATH,
    foundationRoot = DEFAULT_FOUNDATION_ROOT,
    bridgeArgs = [],
    requestTimeoutMs = 30_000,
    spawnProcess = spawn,
  } = {}) {
    this.pythonCommand = pythonCommand
    this.bridgePath = bridgePath
    this.foundationRoot = foundationRoot
    this.bridgeArgs = [...bridgeArgs]
    this.requestTimeoutMs = requestTimeoutMs
    this.spawnProcess = spawnProcess
    this.child = null
    this.lines = null
    this.pending = new Map()
    this.nextRequestId = 1
    this.closed = false
  }

  _failAll(code = 'unavailable') {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new ReferenceFeedGatewayError(code))
    }
    this.pending.clear()
  }

  _handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      this._failAll()
      this.child?.kill()
      return
    }

    if (!isRecord(message) || typeof message.id !== 'string') {
      this._failAll()
      this.child?.kill()
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (message.ok === true && isRecord(message.result)) {
      pending.resolve(message.result)
      return
    }

    const code = isRecord(message.error) ? message.error.code : 'unavailable'
    pending.reject(
      new ReferenceFeedGatewayError(
        typeof code === 'string' ? code : 'unavailable',
      ),
    )
  }

  _ensureChild() {
    if (this.closed) {
      throw new ReferenceFeedGatewayError()
    }
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child
    }

    const child = this.spawnProcess(
      this.pythonCommand,
      [
        '-B',
        this.bridgePath,
        '--foundation-root',
        this.foundationRoot,
        ...this.bridgeArgs,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      },
    )
    this.child = child
    this.lines = createInterface({ input: child.stdout })
    this.lines.on('line', (line) => this._handleLine(line))

    // Do not forward bridge stderr: public errors and application logs must not
    // accidentally capture capability-bearing request context.
    child.stderr.resume()
    child.once('error', () => this._failAll())
    child.once('exit', () => {
      this._failAll()
      this.lines?.close()
      if (this.child === child) {
        this.child = null
        this.lines = null
      }
    })
    return child
  }

  _request(method, params) {
    let child
    try {
      child = this._ensureChild()
    } catch (error) {
      return Promise.reject(error)
    }

    const id = `reference-feed-${this.nextRequestId++}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new ReferenceFeedGatewayError())
        child.kill()
      }, this.requestTimeoutMs)
      timer.unref?.()
      this.pending.set(id, { reject, resolve, timer })

      const payload = JSON.stringify({ id, method, params }) + '\n'
      child.stdin.write(payload, (error) => {
        if (!error) {
          return
        }
        const pending = this.pending.get(id)
        if (!pending) {
          return
        }
        clearTimeout(pending.timer)
        this.pending.delete(id)
        reject(new ReferenceFeedGatewayError())
      })
    })
  }

  async provisionReferenceFeed() {
    const result = await this._request('provision_reference', {})
    const expectedKeys = new Set([
      'schemaVersion',
      'calendarName',
      'eventCount',
      'tokenPrefix',
      'subscriptionPath',
      'expiresOnServerRestart',
    ])
    if (
      Object.keys(result).length !== expectedKeys.size ||
      Object.keys(result).some((key) => !expectedKeys.has(key)) ||
      result.schemaVersion !== 'noticepilot.referenceSubscriptionFeed.v0.1' ||
      typeof result.calendarName !== 'string' ||
      !Number.isInteger(result.eventCount) ||
      typeof result.tokenPrefix !== 'string' ||
      typeof result.subscriptionPath !== 'string' ||
      result.expiresOnServerRestart !== true
    ) {
      throw new ReferenceFeedGatewayError()
    }
    return result
  }

  async renderFeed({ feedId, token, ifNoneMatch = null }) {
    const result = await this._request('render_feed', {
      feedId,
      token,
      ifNoneMatch,
    })
    if (
      !Number.isInteger(result.statusCode) ||
      !isRecord(result.headers) ||
      typeof result.bodyBase64 !== 'string'
    ) {
      throw new ReferenceFeedGatewayError()
    }
    return {
      statusCode: result.statusCode,
      headers: result.headers,
      body: Buffer.from(result.bodyBase64, 'base64'),
    }
  }

  async close() {
    if (this.closed) {
      return
    }
    this.closed = true
    this._failAll()
    const child = this.child
    if (!child || child.exitCode !== null) {
      return
    }

    await new Promise((resolve) => {
      const finish = () => resolve()
      child.once('exit', finish)
      child.kill()
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 2_000)
      timer.unref?.()
    })
  }
}

export function createPythonReferenceFeedGateway(options) {
  return new PythonReferenceFeedGateway(options)
}
