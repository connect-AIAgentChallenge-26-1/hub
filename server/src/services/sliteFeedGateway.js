import { fileURLToPath } from 'node:url'
import {
  PythonReferenceFeedGateway,
  ReferenceFeedGatewayError,
} from './referenceFeedGateway.js'

const DEFAULT_BRIDGE_PATH = fileURLToPath(
  new URL('../../python/slite_feed_bridge.py', import.meta.url),
)

const ISSUE_KEYS = new Set([
  'schemaVersion',
  'feedId',
  'calendarName',
  'eventCount',
  'status',
  'tokenFingerprint',
  'subscriptionPath',
  'persistsAcrossRestart',
])
const STATUS_KEYS = new Set([
  'schemaVersion',
  'feedId',
  'calendarName',
  'eventCount',
  'status',
  'tokenFingerprint',
  'createdAt',
  'updatedAt',
  'subscriptionPathRecoverable',
])

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.size &&
    Object.keys(value).every((key) => keys.has(key))
  )
}

function isCommonDto(value) {
  return (
    value.schemaVersion === 'noticepilot.sliteSubscriptionFeed.v0.1' &&
    /^feed_[0-9a-f]{32}$/.test(value.feedId) &&
    typeof value.calendarName === 'string' &&
    value.calendarName.length > 0 &&
    Number.isInteger(value.eventCount) &&
    value.eventCount >= 0 &&
    ['active', 'revoked'].includes(value.status) &&
    typeof value.tokenFingerprint === 'string' &&
    /^[0-9a-f]{12}$/.test(value.tokenFingerprint)
  )
}

export function isSliteIssueDto(value) {
  return (
    hasExactKeys(value, ISSUE_KEYS) &&
    isCommonDto(value) &&
    value.status === 'active' &&
    /^\/calendar\/[A-Za-z0-9_-]{32,256}\.ics$/.test(
      value.subscriptionPath,
    ) &&
    value.persistsAcrossRestart === true
  )
}

export function isSliteStatusDto(value) {
  return (
    hasExactKeys(value, STATUS_KEYS) &&
    isCommonDto(value) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    value.subscriptionPathRecoverable === false
  )
}

function requireDto(value, validator) {
  if (!validator(value)) {
    throw new ReferenceFeedGatewayError()
  }
  return value
}

export class PythonSliteFeedGateway extends PythonReferenceFeedGateway {
  constructor({ databasePath, bridgePath = DEFAULT_BRIDGE_PATH, ...options } = {}) {
    if (typeof databasePath !== 'string' || databasePath.length === 0) {
      throw new TypeError('S-Lite databasePath is required.')
    }
    super({
      ...options,
      bridgePath,
      bridgeArgs: ['--database-path', databasePath],
    })
  }

  async getSliteFeedStatus() {
    return requireDto(
      await this._request('get_status', {}),
      isSliteStatusDto,
    )
  }

  async provisionSliteFeed() {
    return requireDto(
      await this._request('provision_slite', {}),
      isSliteIssueDto,
    )
  }

  async rotateSliteFeed() {
    return requireDto(
      await this._request('rotate_slite', {}),
      isSliteIssueDto,
    )
  }

  async revokeSliteFeed() {
    return requireDto(
      await this._request('revoke_slite', {}),
      isSliteStatusDto,
    )
  }

  async renderSliteFeed({ token, ifNoneMatch = null }) {
    const result = await this._request('render_slite', {
      token,
      ifNoneMatch,
    })
    if (
      !Number.isInteger(result.statusCode) ||
      result.headers === null ||
      typeof result.headers !== 'object' ||
      Array.isArray(result.headers) ||
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
}

export function createPythonSliteFeedGateway(options) {
  return new PythonSliteFeedGateway(options)
}
