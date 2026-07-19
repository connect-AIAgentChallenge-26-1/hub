import { readFileSync, statSync } from 'node:fs'
import { isIPv4 } from 'node:net'
import { pathToFileURL } from 'node:url'

const REQUIRED_KEYS = [
  'NOTICEPILOT_LAN_HOST',
  'NOTICEPILOT_LAN_BIND',
  'NOTICEPILOT_LAN_CIDR',
  'NOTICEPILOT_LAN_HTTPS_PORT',
]
const RESERVED_PORTS = new Set([2019, 3001])

function ipv4ToInteger(address) {
  return address
    .split('.')
    .reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0)
}

function privatePrefixLength(address) {
  const value = ipv4ToInteger(address)

  if (((value & 0xff000000) >>> 0) === 0x0a000000) return 8
  if (((value & 0xfff00000) >>> 0) === 0xac100000) return 12
  if (((value & 0xffff0000) >>> 0) === 0xc0a80000) return 16
  return null
}

function parsePrivateCidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(value)
  if (!match || !isIPv4(match[1])) {
    throw new Error('NOTICEPILOT_LAN_CIDR must be one canonical private IPv4 CIDR')
  }

  const network = match[1]
  const prefix = Number(match[2])
  const privateMinimum = privatePrefixLength(network)
  if (privateMinimum === null || prefix < privateMinimum) {
    throw new Error('NOTICEPILOT_LAN_CIDR must stay within one RFC1918 range')
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const networkInteger = ipv4ToInteger(network)
  if (((networkInteger & mask) >>> 0) !== networkInteger) {
    throw new Error('NOTICEPILOT_LAN_CIDR must use its canonical network address')
  }

  return { networkInteger, mask }
}

export function validateSliteLanEnvironment(environment) {
  const values = Object.fromEntries(
    REQUIRED_KEYS.map((key) => [key, environment[key] ?? '']),
  )

  for (const [key, value] of Object.entries(values)) {
    if (!value || value.trim() !== value || /\s/.test(value)) {
      throw new Error(`${key} must be present without whitespace`)
    }
  }

  const host = values.NOTICEPILOT_LAN_HOST
  const bind = values.NOTICEPILOT_LAN_BIND
  if (!isIPv4(host) || privatePrefixLength(host) === null) {
    throw new Error('NOTICEPILOT_LAN_HOST must be a stable RFC1918 IPv4 address')
  }
  if (bind !== host) {
    throw new Error('NOTICEPILOT_LAN_BIND must equal NOTICEPILOT_LAN_HOST')
  }

  const port = Number(values.NOTICEPILOT_LAN_HTTPS_PORT)
  if (
    !/^\d+$/.test(values.NOTICEPILOT_LAN_HTTPS_PORT)
    || port < 1024
    || port > 65535
    || RESERVED_PORTS.has(port)
  ) {
    throw new Error(
      'NOTICEPILOT_LAN_HTTPS_PORT must be an unreserved integer from 1024 to 65535',
    )
  }

  const { networkInteger, mask } = parsePrivateCidr(values.NOTICEPILOT_LAN_CIDR)
  if (((ipv4ToInteger(host) & mask) >>> 0) !== networkInteger) {
    throw new Error('NOTICEPILOT_LAN_HOST must belong to NOTICEPILOT_LAN_CIDR')
  }

  return Object.freeze({ host, bind, cidr: values.NOTICEPILOT_LAN_CIDR, port })
}

export function parseSliteLanEnvironmentText(text) {
  const environment = {}

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line === '') continue

    const match = /^([A-Z][A-Z0-9_]*)=([^\s]+)$/.exec(line)
    if (!match) {
      throw new Error(`LAN environment line ${index + 1} must be one unquoted KEY=value pair`)
    }

    const [, key, value] = match
    if (!REQUIRED_KEYS.includes(key)) {
      throw new Error(`LAN environment contains unknown key ${key}`)
    }
    if (Object.hasOwn(environment, key)) {
      throw new Error(`LAN environment contains duplicate key ${key}`)
    }
    environment[key] = value
  }

  validateSliteLanEnvironment(environment)
  return Object.freeze(environment)
}

export function loadSliteLanEnvironmentFile(path) {
  const metadata = statSync(path)
  if (!metadata.isFile()) {
    throw new Error('LAN environment path must be a regular file')
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error('LAN environment file must not grant group or other permissions')
  }

  return parseSliteLanEnvironmentText(readFileSync(path, 'utf8'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) {
      throw new Error('usage: node validate-slite-lan-env.mjs <mode-0600-env-file>')
    }
    loadSliteLanEnvironmentFile(process.argv[2])
    process.stdout.write('LAN HTTPS environment file is valid.\n')
  } catch (error) {
    process.stderr.write(`LAN HTTPS environment rejected: ${error.message}\n`)
    process.exitCode = 1
  }
}
