import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".next",
  "build",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const ARTIFACTS = {
  "work-records": {
    type: "work-record",
    id: /^WI-\d{4}$/,
    statuses: new Set(["in-progress", "blocked", "done"]),
    pathsRequired: true,
  },
  adr: {
    type: "adr",
    id: /^ADR-\d{4}$/,
    statuses: new Set(["proposed", "accepted", "superseded", "rejected"]),
  },
  troubleshooting: {
    type: "troubleshooting",
    id: /^TS-\d{4}$/,
    statuses: new Set(["draft", "verified", "retired"]),
  },
  experiments: {
    type: "experiment",
    id: /^EXP-\d{4}$/,
    statuses: new Set(["planned", "running", "completed", "invalidated"]),
  },
  runbooks: {
    type: "runbook",
    id: /^RUN-\d{4}$/,
    statuses: new Set(["draft", "verified", "retired"]),
  },
  "case-studies": {
    type: "case-study",
    id: /^CASE-\d{4}$/,
    statuses: new Set(["draft", "verified", "retired"]),
  },
};

function normalize(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function walk(root, current = root) {
  if (!existsSync(current)) return [];
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walk(root, target));
    else if (entry.isFile()) files.push(normalize(path.relative(root, target)));
  }
  return files;
}

export function listMarkdownFiles(root = ROOT) {
  return walk(root).filter((file) => file.toLowerCase().endsWith(".md"));
}

function parseFrontmatter(content, file, errors) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    errors.push(`FRONTMATTER_REQUIRED ${file}: YAML frontmatter가 없습니다.`);
    return null;
  }

  try {
    const data = parseYaml(match[1]);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("frontmatter must be a mapping");
    }
    return data;
  } catch (error) {
    errors.push(`FRONTMATTER_INVALID ${file}: ${error.message}`);
    return null;
  }
}

function artifactFiles(root) {
  const results = [];
  for (const [directory, policy] of Object.entries(ARTIFACTS)) {
    const base = path.join(root, "docs", directory);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const full = path.join(base, name);
      if (name === "README.md" || !name.endsWith(".md") || !statSync(full).isFile()) continue;
      results.push({
        file: normalize(path.relative(root, full)),
        full,
        policy,
      });
    }
  }
  return results;
}

function validateArtifacts(root, errors) {
  const ids = new Map();
  const artifacts = [];
  const required = ["id", "title", "type", "status", "date", "owners", "related"];

  for (const item of artifactFiles(root)) {
    const content = readFileSync(item.full, "utf8");
    const metadata = parseFrontmatter(content, item.file, errors);
    if (!metadata) continue;

    for (const field of required) {
      if (metadata[field] === undefined || metadata[field] === null || metadata[field] === "") {
        errors.push(`FRONTMATTER_FIELD ${item.file}: 필수 필드 ${field}가 없습니다.`);
      }
    }

    if (metadata.type !== item.policy.type) {
      errors.push(`TYPE_MISMATCH ${item.file}: type은 ${item.policy.type}이어야 합니다.`);
    }
    if (typeof metadata.id !== "string" || !item.policy.id.test(metadata.id)) {
      errors.push(`ID_FORMAT ${item.file}: ID 형식이 올바르지 않습니다.`);
    } else {
      if (ids.has(metadata.id)) {
        errors.push(`DUPLICATE_ID ${item.file}: ${metadata.id}가 ${ids.get(metadata.id)}와 중복됩니다.`);
      }
      ids.set(metadata.id, item.file);
      if (!path.basename(item.file).startsWith(`${metadata.id}-`)) {
        errors.push(`FILENAME_ID ${item.file}: 파일명은 ${metadata.id}- 로 시작해야 합니다.`);
      }
    }
    if (!item.policy.statuses.has(metadata.status)) {
      errors.push(`STATUS_VALUE ${item.file}: 허용되지 않은 status ${metadata.status}입니다.`);
    }
    if (typeof metadata.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) {
      errors.push(`DATE_FORMAT ${item.file}: date는 YYYY-MM-DD 문자열이어야 합니다.`);
    }
    if (!Array.isArray(metadata.owners) || metadata.owners.length === 0) {
      errors.push(`OWNERS_REQUIRED ${item.file}: owners는 비어 있지 않은 배열이어야 합니다.`);
    }
    if (!Array.isArray(metadata.related)) {
      errors.push(`RELATED_FORMAT ${item.file}: related는 배열이어야 합니다.`);
    }
    if (item.policy.pathsRequired && (!Array.isArray(metadata.paths) || metadata.paths.length === 0)) {
      errors.push(`PATHS_REQUIRED ${item.file}: Work Record paths가 필요합니다.`);
    }

    for (const related of Array.isArray(metadata.related) ? metadata.related : []) {
      if (typeof related !== "string" || !related.endsWith(".md")) continue;
      const target = path.resolve(path.dirname(item.full), related);
      if (!existsSync(target)) {
        errors.push(`RELATED_LINK ${item.file}: related 문서가 없습니다: ${related}`);
      }
    }

    artifacts.push({ ...item, metadata });
  }
  return artifacts;
}

function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function headingAnchors(content) {
  const counts = new Map();
  const anchors = new Set();
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!heading) continue;
    const base = githubSlug(heading[1]);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function markdownTargets(content) {
  const targets = [];
  const pattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of content.matchAll(pattern)) {
    targets.push(match[1].replace(/^<|>$/g, ""));
  }
  return targets;
}

function validateInternalLinks(root, files, errors) {
  const contentCache = new Map();
  for (const file of files) {
    const full = path.join(root, file);
    const content = readFileSync(full, "utf8");
    contentCache.set(path.resolve(full), content);
    for (const rawTarget of markdownTargets(content)) {
      if (/^(?:https?:|mailto:|tel:)/i.test(rawTarget)) continue;
      const [encodedPath, encodedAnchor] = rawTarget.split("#", 2);
      let targetPath;
      try {
        targetPath = decodeURIComponent(encodedPath || "");
      } catch {
        errors.push(`LINK_ENCODING ${file}: 링크를 decode할 수 없습니다: ${rawTarget}`);
        continue;
      }
      const resolved = targetPath
        ? path.resolve(path.dirname(full), targetPath)
        : path.resolve(full);
      if (!existsSync(resolved)) {
        errors.push(`BROKEN_LINK ${file}: 대상이 없습니다: ${rawTarget}`);
        continue;
      }
      if (encodedAnchor && statSync(resolved).isFile() && resolved.toLowerCase().endsWith(".md")) {
        const targetContent = contentCache.get(resolved) ?? readFileSync(resolved, "utf8");
        const anchor = decodeURIComponent(encodedAnchor).toLowerCase();
        if (!headingAnchors(targetContent).has(anchor)) {
          errors.push(`BROKEN_ANCHOR ${file}: anchor가 없습니다: ${rawTarget}`);
        }
      }
    }
  }
}

function validatePlaceholders(root, markdownFiles, errors) {
  const patterns = [
    /\b(?:TODO|TBD|FIXME|XXX)\b/i,
    /\{\{[^}]+\}\}/,
    /<<[^>]+>>/,
    /작성\s*(?:필요|예정)/,
  ];
  for (const file of markdownFiles) {
    if (file.startsWith("docs/templates/") || file.startsWith("tools/docs/test-fixtures/")) continue;
    const content = readFileSync(path.join(root, file), "utf8");
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        errors.push(`PLACEHOLDER ${file}: 미완성 placeholder 패턴 ${pattern}을 포함합니다.`);
        break;
      }
    }
  }
}

function shouldScanSecret(file) {
  if (file.startsWith("documents/") || file.startsWith("plans/") ||
      file.startsWith("tools/docs/test-fixtures/")) return false;
  if (file.toLowerCase().endsWith(".html") || file === "package-lock.json") return false;
  return /(?:^|\/)(?:Dockerfile|Makefile)$/.test(file) ||
    /\.(?:md|txt|json|ya?ml|toml|properties|gradle|java|js|mjs|sh|env|example)$/i.test(file);
}

function validateSecrets(root, errors) {
  const highConfidence = [
    /AKIA[0-9A-Z]{16}/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  const generic = /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\b\s*[:=]\s*["']?([^\s"'#]{16,})/ig;
  const safePrefixes = /^(?:example|placeholder|changeme|local|test|placepick|\$\{|<)/i;

  for (const file of walk(root).filter(shouldScanSecret)) {
    const content = readFileSync(path.join(root, file), "utf8");
    if (highConfidence.some((pattern) => pattern.test(content))) {
      errors.push(`SECRET_PATTERN ${file}: 고신뢰 비밀 패턴이 감지되었습니다.`);
      continue;
    }
    for (const match of content.matchAll(generic)) {
      if (!safePrefixes.test(match[1])) {
        errors.push(`SECRET_PATTERN ${file}: credential처럼 보이는 값이 감지되었습니다.`);
        break;
      }
    }
  }
}

function validateJava17Policy(root, errors) {
  const activeFiles = walk(root).filter((file) => {
    if (/^(?:docs|documents|plans|tools)\//.test(file)) return false;
    return /(?:^|\/)(?:Dockerfile|Makefile)$/.test(file) ||
      /\.(?:java|gradle|kts|ya?ml|json|toml|properties|sh)$/i.test(file);
  });
  const forbidden = [
    /java-version\s*:\s*["']?21\b/i,
    /devcontainers\/java:21\b/i,
    /JavaLanguageVersion\.of\(21\)/,
    /(?:source|target)Compatibility\s*=.*\b21\b/,
    /JAVA_VERSION\s*[:=]\s*["']?21\b/i,
  ];
  for (const file of activeFiles) {
    const content = readFileSync(path.join(root, file), "utf8");
    if (forbidden.some((pattern) => pattern.test(content))) {
      errors.push(`JAVA17_POLICY ${file}: 활성 설정에 Java 21 지정이 남아 있습니다.`);
    }
  }
}

function validateGithubConfiguration(root, errors) {
  const githubRoot = path.join(root, ".github");
  if (!existsSync(githubRoot)) return;
  const yamlFiles = walk(githubRoot).filter((file) => /\.ya?ml$/i.test(file));
  for (const relative of yamlFiles) {
    const full = path.join(githubRoot, relative);
    const repositoryFile = normalize(path.join(".github", relative));
    const content = readFileSync(full, "utf8");
    try {
      parseYaml(content);
    } catch (error) {
      errors.push(`GITHUB_YAML ${repositoryFile}: YAML을 해석할 수 없습니다: ${error.message}`);
      continue;
    }

    if (!repositoryFile.startsWith(".github/workflows/")) continue;
    for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
      const action = match[1];
      if (action.startsWith("./")) continue;
      const revision = action.includes("@") ? action.slice(action.lastIndexOf("@") + 1) : "";
      if (!/^[0-9a-f]{40}$/.test(revision)) {
        errors.push(`ACTION_PIN ${repositoryFile}: action은 40자리 commit SHA로 고정해야 합니다: ${action}`);
      }
    }
  }
  if (existsSync(path.join(githubRoot, "workflows", "auto-merge.yml"))) {
    errors.push("AUTO_MERGE_POLICY 예약 자동 병합 workflow를 사용할 수 없습니다.");
  }
}

function validateCodexPolicy(root, errors) {
  if (existsSync(path.join(root, ".codex", "config.toml"))) {
    errors.push("CODEX_CONFIG_POLICY 선택 사항인 .codex/config.toml을 만들 수 없습니다.");
  }
}

export function globMatches(file, glob) {
  let regex = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        index += 1;
        if (glob[index + 1] === "/") {
          index += 1;
          regex += "(?:.*/)?";
        } else {
          regex += ".*";
        }
      } else {
        regex += "[^/]*";
      }
    } else if (char === "?") {
      regex += "[^/]";
    } else {
      regex += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${regex}$`).test(file);
}

export function validateRepository({ root = ROOT, changedFiles } = {}) {
  const errors = [];
  const markdownFiles = listMarkdownFiles(root).filter((file) =>
    !file.startsWith("documents/") && !file.startsWith("plans/") &&
    !file.startsWith("docs/archive/") &&
    !file.startsWith("tools/docs/test-fixtures/"));
  const artifacts = validateArtifacts(root, errors);
  validateInternalLinks(root, markdownFiles, errors);
  validatePlaceholders(root, markdownFiles, errors);
  validateSecrets(root, errors);
  validateJava17Policy(root, errors);
  validateGithubConfiguration(root, errors);
  validateCodexPolicy(root, errors);
  return errors;
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  const errors = validateRepository();
  if (errors.length > 0) {
    console.error(`문서/저장소 정책 검사 실패 (${errors.length}건)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("문서/저장소 정책 검사 통과");
  }
}
