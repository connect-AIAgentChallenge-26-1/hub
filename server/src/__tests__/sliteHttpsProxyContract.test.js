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

test('TLS-03 LAN HTTPS uses an internal CA and a pinned private interface', async () => {
  const caddyfile = await read('deploy/caddy/Caddyfile.lan')

  assert.match(caddyfile, /auto_https disable_redirects/)
  assert.match(caddyfile, /^\s*skip_install_trust$/m)
  assert.match(caddyfile, /servers \{\s+protocols h1 h2\s+\}/m)
  assert.doesNotMatch(caddyfile, /protocols[^\n]*h3/)
  assert.match(
    caddyfile,
    /^https:\/\/\{\$NOTICEPILOT_LAN_HOST\}:\{\$NOTICEPILOT_LAN_HTTPS_PORT\} \{$/m,
  )
  assert.match(caddyfile, /^\s*bind \{\$NOTICEPILOT_LAN_BIND\}$/m)
  assert.match(caddyfile, /^\s*tls internal$/m)
  assert.match(caddyfile, /^\s*remote_ip \{\$NOTICEPILOT_LAN_CIDR\}$/m)
  assert.match(
    caddyfile,
    /vars_regexp \{http\.request\.uri\} \^\/calendar\/\[A-Za-z0-9_\-\]\{32,256\}\\\.ics\$/,
  )
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:3001/)
  assert.equal((caddyfile.match(/^\s*reverse_proxy\b/gm) || []).length, 1)
  assert.equal((caddyfile.match(/^\s*log\b/gm) || []).length, 1)
  assert.match(caddyfile, /request>uri replace \[REDACTED\]/)
  assert.match(caddyfile, /header_up -Authorization/)
  assert.match(caddyfile, /header_up -Cookie/)
  assert.match(caddyfile, /header_up -Forwarded/)
  assert.match(caddyfile, /header_up -Proxy-Authorization/)
  assert.match(caddyfile, /header_up -Referer/)
  assert.match(caddyfile, /@upstream_failure status 5xx/)
  assert.match(caddyfile, /handle_response @upstream_failure/)
  assert.match(caddyfile, /respond "not found" 404/)
  assert.match(caddyfile, /handle_errors \{[\s\S]*respond "temporarily unavailable" 503/)
  assert.doesNotMatch(caddyfile, /^\s*(?:handle_path|redir|tls_insecure_skip_verify|trusted_proxies)\b/m)
  assert.doesNotMatch(caddyfile, /Strict-Transport-Security/)
})

test('TLS-04 LAN environment contains only explicit non-secret network identity', async () => {
  const environment = await read('deploy/caddy/caddy-lan.env.example')

  assert.match(environment, /^NOTICEPILOT_LAN_HOST=192\.168\.1\.50$/m)
  assert.match(environment, /^NOTICEPILOT_LAN_BIND=192\.168\.1\.50$/m)
  assert.match(environment, /^NOTICEPILOT_LAN_CIDR=192\.168\.1\.0\/24$/m)
  assert.match(environment, /^NOTICEPILOT_LAN_HTTPS_PORT=8443$/m)
  assert.doesNotMatch(environment, /0\.0\.0\.0|::/)
  assert.doesNotMatch(environment, /UPSTREAM|ADMIN_KEY|TOKEN|PASSWORD|SECRET/)
})

test('TLS-05 LAN runtime state and copied environment stay outside Git', async () => {
  const ignore = await read('.gitignore')

  assert.match(ignore, /^\.env\.\*$/m)
  assert.match(ignore, /^\.noticepilot-local\/$/m)
})

test('TLS-06 LAN launcher validates one file and invokes only the fixed Caddy profile', async () => {
  const launcher = await read('scripts/deployment/run-slite-lan-caddy.mjs')

  assert.match(launcher, /loadSliteLanEnvironmentFile\(process\.argv\[2\]\)/)
  assert.match(launcher, /\['validate', 'run'\]\.includes\(process\.argv\[3\]\)/)
  assert.match(launcher, /const caddyfile = join\(repositoryRoot, 'deploy\/caddy\/Caddyfile\.lan'\)/)
  assert.match(launcher, /spawn\(\s*'caddy'/)
  assert.match(launcher, /XDG_CONFIG_HOME: join\(runtimeRoot, 'config'\)/)
  assert.match(launcher, /XDG_DATA_HOME: join\(runtimeRoot, 'share'\)/)
  assert.doesNotMatch(
    launcher,
    /shell:\s*true|\.\.\.process\.env|NOTICEPILOT_PUBLIC_HOST|ADMIN_KEY|TOKEN|PASSWORD|SECRET/,
  )
})
