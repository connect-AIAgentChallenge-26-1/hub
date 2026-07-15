import { rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = resolve(frontendRoot, ".next");

if (dirname(buildDirectory) !== frontendRoot || basename(buildDirectory) !== ".next") {
  throw new Error("E2E build directory escaped the frontend root.");
}

rmSync(buildDirectory, {
  force: true,
  maxRetries: 3,
  recursive: true,
  retryDelay: 100,
});
