import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { loadSliteLanEnvironmentFile } from './validate-slite-lan-env.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeRoot = join(repositoryRoot, '.noticepilot-local')
const caddyfile = join(repositoryRoot, 'deploy/caddy/Caddyfile.lan')

function fail(message) {
  process.stderr.write(`LAN Caddy launch rejected: ${message}\n`)
  process.exitCode = 1
}

if (process.argv.length !== 4 || !['validate', 'run'].includes(process.argv[3])) {
  fail('usage: node run-slite-lan-caddy.mjs <mode-0600-env-file> <validate|run>')
} else {
  try {
    const environment = loadSliteLanEnvironmentFile(process.argv[2])
    mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 })
    const hostEnvironment = {
      PATH: process.env.PATH ?? '',
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    }

    const child = spawn(
      'caddy',
      [process.argv[3], '--config', caddyfile, '--adapter', 'caddyfile'],
      {
        env: {
          ...hostEnvironment,
          ...environment,
          XDG_CONFIG_HOME: join(runtimeRoot, 'config'),
          XDG_DATA_HOME: join(runtimeRoot, 'share'),
        },
        stdio: 'inherit',
      },
    )

    child.on('error', (error) => fail(error.message))
    child.on('exit', (code, signal) => {
      if (signal) {
        fail(`Caddy exited from signal ${signal}`)
      } else {
        process.exitCode = code ?? 1
      }
    })
  } catch (error) {
    fail(error.message)
  }
}
