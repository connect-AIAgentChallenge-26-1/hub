'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../work/server');
const { createSupabaseStore } = require('./supabase-store');

const ROOT_DIR = __dirname;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));

function createSupabaseApp(overrides = {}) {
  const fetchImpl = overrides.fetchImpl || globalThis.fetch;
  const secretKey = overrides.supabaseSecretKey
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const store = overrides.store || createSupabaseStore({
    supabaseUrl: overrides.supabaseUrl || process.env.SUPABASE_URL,
    secretKey,
    fetchImpl
  });

  return createApp({
    ...overrides,
    store,
    fetchImpl,
    openAiApiKey: overrides.openAiApiKey === undefined ? process.env.OPENAI_API_KEY : overrides.openAiApiKey,
    model: overrides.model || process.env.OPENAI_MODEL || 'gpt-5.6-luna'
  });
}

if (require.main === module) {
  const app = createSupabaseApp();
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => {
    console.log(`Supabase 플래너 백엔드가 http://${host}:${port} 에서 실행 중입니다.`);
  });
  process.on('SIGINT', () => {
    app.server.close(() => {
      app.close();
      process.exit(0);
    });
  });
}

module.exports = { createSupabaseApp };
