import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = resolve(frontendRoot, ".next");

if (dirname(buildDirectory) !== frontendRoot || basename(buildDirectory) !== ".next") {
  throw new Error("E2E build directory escaped the frontend root.");
}

// Dev Container는 `.next` 자체를 named volume mount point로 사용한다. mount point를
// 삭제하려 하면 EBUSY가 발생하므로 디렉터리는 유지하고 그 안의 생성물만 정리한다.
if (existsSync(buildDirectory)) {
  for (const entry of readdirSync(buildDirectory)) {
    const target = resolve(buildDirectory, entry);
    if (dirname(target) !== buildDirectory) {
      throw new Error("E2E build artifact escaped the .next directory.");
    }
    rmSync(target, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }
}
