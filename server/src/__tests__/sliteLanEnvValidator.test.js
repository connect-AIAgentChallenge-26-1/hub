import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  loadSliteLanEnvironmentFile,
  parseSliteLanEnvironmentText,
  validateSliteLanEnvironment,
} from '../../../scripts/deployment/validate-slite-lan-env.mjs'

const validEnvironment = Object.freeze({
  NOTICEPILOT_LAN_HOST: '192.168.1.50',
  NOTICEPILOT_LAN_BIND: '192.168.1.50',
  NOTICEPILOT_LAN_CIDR: '192.168.1.0/24',
  NOTICEPILOT_LAN_HTTPS_PORT: '8443',
})

test('LAN-ENV-00 accepts one pinned RFC1918 address and containing CIDR', () => {
  assert.deepEqual(validateSliteLanEnvironment(validEnvironment), {
    host: '192.168.1.50',
    bind: '192.168.1.50',
    cidr: '192.168.1.0/24',
    port: 8443,
  })
})

for (const host of ['0.0.0.0', '127.0.0.1', '169.254.1.2', '203.0.113.10', '::']) {
  test(`LAN-ENV-01 rejects non-private host ${host}`, () => {
    assert.throws(
      () => validateSliteLanEnvironment({
        ...validEnvironment,
        NOTICEPILOT_LAN_HOST: host,
        NOTICEPILOT_LAN_BIND: host,
      }),
      /stable RFC1918 IPv4/,
    )
  })
}

test('LAN-ENV-02 rejects a bind address different from the certificate host', () => {
  assert.throws(
    () => validateSliteLanEnvironment({
      ...validEnvironment,
      NOTICEPILOT_LAN_BIND: '192.168.1.51',
    }),
    /must equal/,
  )
})

for (const port of ['443', '0', '2019', '3001', '65536', '8443/tcp', ' 8443']) {
  test(`LAN-ENV-03 rejects unsafe port ${JSON.stringify(port)}`, () => {
    assert.throws(
      () => validateSliteLanEnvironment({
        ...validEnvironment,
        NOTICEPILOT_LAN_HTTPS_PORT: port,
      }),
      /NOTICEPILOT_LAN_HTTPS_PORT/,
    )
  })
}

for (const cidr of ['192.168.2.0/24', '192.168.1.1/24', '172.0.0.0/8', '0.0.0.0/0']) {
  test(`LAN-ENV-04 rejects unsuitable CIDR ${cidr}`, () => {
    assert.throws(
      () => validateSliteLanEnvironment({
        ...validEnvironment,
        NOTICEPILOT_LAN_CIDR: cidr,
      }),
      /CIDR|belong/,
    )
  })
}

test('LAN-ENV-05 rejects missing and whitespace-injected values', () => {
  assert.throws(
    () => validateSliteLanEnvironment({ ...validEnvironment, NOTICEPILOT_LAN_HOST: '' }),
    /must be present/,
  )
  assert.throws(
    () => validateSliteLanEnvironment({
      ...validEnvironment,
      NOTICEPILOT_LAN_CIDR: '192.168.1.0/24\nrespond injected',
    }),
    /without whitespace/,
  )
})

test('LAN-ENV-06 parses one exact environment file without ambient fallback', () => {
  assert.deepEqual(
    parseSliteLanEnvironmentText([
      'NOTICEPILOT_LAN_HOST=192.168.1.50',
      'NOTICEPILOT_LAN_BIND=192.168.1.50',
      'NOTICEPILOT_LAN_CIDR=192.168.1.0/24',
      'NOTICEPILOT_LAN_HTTPS_PORT=8443',
      '',
    ].join('\n')),
    validEnvironment,
  )
})

test('LAN-ENV-07 rejects missing, duplicate, and unknown file keys', () => {
  const exactText = Object.entries(validEnvironment)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  assert.throws(
    () => parseSliteLanEnvironmentText(exactText.replace(/NOTICEPILOT_LAN_CIDR=.*\n/, '')),
    /NOTICEPILOT_LAN_CIDR must be present/,
  )
  assert.throws(
    () => parseSliteLanEnvironmentText(`${exactText}\nNOTICEPILOT_LAN_HOST=192.168.1.50`),
    /duplicate key/,
  )
  assert.throws(
    () => parseSliteLanEnvironmentText(`${exactText}\nNOTICEPILOT_PUBLIC_HOST=example.com`),
    /unknown key/,
  )
})

test('LAN-ENV-08 loads only a regular mode-0600 environment file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'noticepilot-lan-env-'))
  const path = join(directory, 'lan.env')
  const exactText = Object.entries(validEnvironment)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  try {
    writeFileSync(path, exactText, { encoding: 'utf8', mode: 0o600 })
    assert.deepEqual(loadSliteLanEnvironmentFile(path), validEnvironment)

    chmodSync(path, 0o644)
    assert.throws(() => loadSliteLanEnvironmentFile(path), /group or other permissions/)
    assert.throws(() => loadSliteLanEnvironmentFile(directory), /regular file/)
    assert.throws(() => loadSliteLanEnvironmentFile(join(directory, 'missing')), /ENOENT/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
