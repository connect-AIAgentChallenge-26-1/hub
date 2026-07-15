#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const MAX_REQUEST_BYTES = 1024 * 1024;
const ENV_NAMES = new Set([
  "PLACEPICK_EXTERNAL_MODE",
  "LOCAL_WORKFLOW_CONTROL_TOKEN",
  "LOCAL_NAVER_KEY_ID",
  "LOCAL_NAVER_KEY",
  "LOCAL_ELICE_TOKEN",
  "NAVER_API_HUB_KEY_ID",
  "NAVER_API_HUB_KEY",
  "PROXY_TOKEN",
  "CHAT_PROXY_URL",
  "OPENAI_MODEL"
]);

function fail(code) {
  process.stderr.write(`LOCAL_LINKED_GATEWAY status=failed errorCode=${code}\n`);
  process.exit(1);
}

function requiredPath(value) {
  if (typeof value !== "string" || value === "" || value.includes("\0")) {
    fail("NODE_GATEWAY_ARGUMENT_INVALID");
  }
  return value;
}

function requiredPort(value) {
  if (!/^[0-9]{1,5}$/u.test(value ?? "")) {
    fail("NODE_GATEWAY_ARGUMENT_INVALID");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    fail("NODE_GATEWAY_ARGUMENT_INVALID");
  }
  return port;
}

async function regularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readEnvironment(path) {
  if (!(await regularFile(path))) fail("NODE_GATEWAY_ENV_INVALID");
  let text;
  try {
    const bytes = await readFile(path);
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    fail("NODE_GATEWAY_ENV_INVALID");
  }
  const environment = {};
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator < 1) fail("NODE_GATEWAY_ENV_INVALID");
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!ENV_NAMES.has(name) || Object.hasOwn(environment, name) || value === "" ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
      fail("NODE_GATEWAY_ENV_INVALID");
    }
    environment[name] = value;
  }
  if (Object.keys(environment).length !== ENV_NAMES.size) {
    fail("NODE_GATEWAY_ENV_INVALID");
  }
  return environment;
}

async function requestBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks, total);
}

function requestHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(nodeHeaders)) {
    if (rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) headers.append(name, value);
    } else {
      headers.set(name, rawValue);
    }
  }
  return headers;
}

function writeProblem(response, status, errorCode) {
  const body = JSON.stringify({
    type: "about:blank",
    title: "로컬 Gateway 요청을 처리하지 못했습니다.",
    status,
    errorCode
  });
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/problem+json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

const [entryPathValue, bundlePathValue, envPathValue, portValue, ...extra] =
  process.argv.slice(2);
if (extra.length !== 0) fail("NODE_GATEWAY_ARGUMENT_INVALID");
const entryPath = requiredPath(entryPathValue);
const bundlePath = requiredPath(bundlePathValue);
const envPath = requiredPath(envPathValue);
const port = requiredPort(portValue);
if (!(await regularFile(entryPath))) fail("NODE_GATEWAY_ARGUMENT_INVALID");
const environment = await readEnvironment(envPath);

try {
  await build({
    bundle: true,
    entryPoints: [entryPath],
    format: "esm",
    logLevel: "silent",
    outfile: bundlePath,
    platform: "node",
    target: "node24"
  });
} catch {
  fail("NODE_GATEWAY_BUNDLE_FAILED");
}

let LocalLinkedWorkflowGateway;
try {
  ({ LocalLinkedWorkflowGateway } = await import(
    `${pathToFileURL(bundlePath).href}?instance=${Date.now()}`
  ));
} catch {
  fail("NODE_GATEWAY_BUNDLE_FAILED");
}
const gateway = new LocalLinkedWorkflowGateway();

const server = createServer(async (incoming, outgoing) => {
  try {
    if (typeof incoming.url !== "string" || !incoming.url.startsWith("/")) {
      writeProblem(outgoing, 400, "NODE_GATEWAY_REQUEST_INVALID");
      return;
    }
    const method = incoming.method ?? "GET";
    const body = method === "GET" || method === "HEAD"
      ? undefined
      : await requestBody(incoming);
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method,
      headers: requestHeaders(incoming.headers),
      body
    });
    const response = await gateway.fetch(request, environment);
    const bytes = new Uint8Array(await response.arrayBuffer());
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(bytes);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "REQUEST_TOO_LARGE";
    writeProblem(
      outgoing,
      tooLarge ? 413 : 500,
      tooLarge ? "NODE_GATEWAY_REQUEST_TOO_LARGE" : "NODE_GATEWAY_INTERNAL_ERROR"
    );
  }
});

server.on("error", () => fail("NODE_GATEWAY_LISTEN_FAILED"));
server.listen(port, "127.0.0.1");

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(1), 2_000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
