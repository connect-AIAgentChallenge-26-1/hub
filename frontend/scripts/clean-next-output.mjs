import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = resolve(frontendRoot, ".next");

if (dirname(buildDirectory) !== frontendRoot || basename(buildDirectory) !== ".next") {
  throw new Error("Next build directory escaped the frontend root.");
}

// The Dev Container mounts `.next` itself as a named volume. Keep the mount point and remove
// only generated children so interrupted dev/typegen writes cannot poison the next verification.
if (existsSync(buildDirectory)) {
  for (const entry of readdirSync(buildDirectory)) {
    const target = resolve(buildDirectory, entry);
    if (dirname(target) !== buildDirectory) {
      throw new Error("Next build artifact escaped the .next directory.");
    }
    rmSync(target, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }
}
