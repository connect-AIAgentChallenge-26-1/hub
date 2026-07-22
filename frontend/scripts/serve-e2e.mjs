import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import "./clean-next-output.mjs";

const require = createRequire(import.meta.url);
const nextBinary = require.resolve("next/dist/bin/next");
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const environment = {
  ...process.env,
  NEXT_PUBLIC_PRODUCT_API_MODE: "mock",
  NEXT_TELEMETRY_DISABLED: "1",
  PLACEPICK_E2E_MOCK_API: "true",
};

await runNext(["build"]);

const standaloneRoot = resolve(frontendRoot, ".next", "standalone", "frontend");
const standaloneServer = resolve(standaloneRoot, "server.js");
if (!existsSync(standaloneServer)) {
  throw new Error("Next standalone server was not produced by the E2E build.");
}
copyIfPresent(resolve(frontendRoot, ".next", "static"), resolve(standaloneRoot, ".next", "static"));
copyIfPresent(resolve(frontendRoot, "public"), resolve(standaloneRoot, "public"));

const server = spawn(
  process.execPath,
  [standaloneServer],
  {
    cwd: standaloneRoot,
    env: { ...environment, HOSTNAME: "127.0.0.1", PORT: "3000" },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

const exitCode = await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code, signal) => {
    if (signal != null) {
      resolve(0);
      return;
    }
    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;

function runNext(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBinary, ...arguments_], {
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal != null) {
        reject(new Error(`Next ${arguments_[0]} process was terminated by ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Next ${arguments_[0]} process failed with exit code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

function copyIfPresent(source, destination) {
  if (existsSync(source)) cpSync(source, destination, { recursive: true });
}
