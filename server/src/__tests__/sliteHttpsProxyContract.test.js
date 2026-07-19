import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

async function read(relativePath) {
  return readFile(new URL(relativePath, `file://${repositoryRoot}/`), 'utf8')
}

test('TLS-00 Caddy exposes only HTTPS calendar GET and HEAD', async () => {
  const caddyfile = await read('deploy/caddy/Caddyfile')

  assert.match(caddyfile, /^\{[\s\S]*admin 127\.0\.0\.1:2019/m)
  assert.match(caddyfile, /auto_https disable_redirects/)
  assert.match(caddyfile, /\{\$NOTICEPILOT_PUBLIC_HOST\}/)
  assert.match(
    caddyfile,
    /@calendar \{\s+method GET HEAD\s+vars_regexp \{http\.request\.uri\} \^\/calendar\/\[A-Za-z0-9_\-\]\{32,256\}\\\.ics\$/m,
  )
  assert.match(
    caddyfile,
    /reverse_proxy 127\.0\.0\.1:3001/,
  )
  assert.equal((caddyfile.match(/^\s*reverse_proxy\b/gm) || []).length, 1)
  assert.doesNotMatch(caddyfile, /handle_path/)
  assert.match(caddyfile, /header_up -Authorization/)
  assert.match(caddyfile, /header_up -Cookie/)
  assert.match(caddyfile, /header_up -Forwarded/)
  assert.match(caddyfile, /header_up -Proxy-Authorization/)
  assert.match(caddyfile, /header_up -Referer/)
  assert.match(caddyfile, /respond "not found" 404/)
  assert.match(caddyfile, /Strict-Transport-Security "max-age=31536000"/)
  assert.equal((caddyfile.match(/^\s*log\b/gm) || []).length, 1)
  assert.doesNotMatch(caddyfile, /reverse_proxy[^\n]*\/api/)
  assert.match(caddyfile, /request>uri replace \[REDACTED\]/)
  assert.match(caddyfile, /@upstream_failure status 5xx/)
  assert.match(caddyfile, /handle_response @upstream_failure/)
  assert.equal((caddyfile.match(/header Retry-After "300"/g) || []).length, 2)
  assert.match(caddyfile, /handle_errors \{[\s\S]*respond "temporarily unavailable" 503/)
})

test('TLS-01 the Node service remains loopback-only with private persistent state', async () => {
  const [service, environment] = await Promise.all([
    read('deploy/systemd/noticepilot-slite.service'),
    read('deploy/systemd/slite.env.example'),
  ])

  assert.match(service, /^User=noticepilot$/m)
  assert.match(service, /^Group=noticepilot$/m)
  assert.match(service, /^UMask=0077$/m)
  assert.match(service, /^NoNewPrivileges=true$/m)
  assert.match(service, /^ProtectSystem=strict$/m)
  assert.match(service, /^ReadWritePaths=\/var\/lib\/noticepilot$/m)
  assert.match(
    service,
    /^ExecStart=\/usr\/bin\/env NODE_ENV=production HOST=127\.0\.0\.1 PORT=3001 \/usr\/bin\/node server\/src\/index\.js$/m,
  )
  assert.match(service, /^StateDirectory=noticepilot$/m)
  assert.match(service, /^StateDirectoryMode=0700$/m)
  assert.match(environment, /^NOTICEPILOT_ENABLE_SLITE_FEED=true$/m)
  assert.match(
    environment,
    /^NOTICEPILOT_SLITE_DB_PATH=\/var\/lib\/noticepilot\/slite\.sqlite3$/m,
  )
  assert.match(environment, /^NOTICEPILOT_SLITE_ADMIN_KEY=REPLACE_ME$/m)
})

test('TLS-02 Caddy gets only non-secret host configuration', async () => {
  const [override, environment] = await Promise.all([
    read('deploy/systemd/caddy-noticepilot.conf'),
    read('deploy/systemd/caddy.env.example'),
  ])

  assert.match(override, /^EnvironmentFile=\/etc\/noticepilot\/caddy\.env$/m)
  assert.match(environment, /^NOTICEPILOT_PUBLIC_HOST=calendar\.example\.com$/m)
  assert.doesNotMatch(environment, /UPSTREAM/)
  assert.doesNotMatch(environment, /ADMIN_KEY|TOKEN|PASSWORD|SECRET/)
})
