import { readJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

export interface RepoTarget {
  owner: string;
  repo: string;
  branch: string;
  accessToken: string;
}

interface StoredProject {
  repo_url: string;
  branch: string;
}

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "GameForge-Agent",
  };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Resolves the connected repo + branch (this user's project.json) combined
// with the caller-supplied access token (from the current request's session)
// into what every Contents API call needs. Returns null if project.json
// doesn't exist yet, which callers surface as 401.
export async function getRepoTarget(userId: number, accessToken: string): Promise<RepoTarget | null> {
  let project: StoredProject;
  try {
    project = await readJson<StoredProject>(getUserDataPath(userId, "project.json"));
  } catch {
    return null;
  }

  const fullName = project.repo_url.replace("https://github.com/", "");
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return null;

  return { owner, repo, branch: project.branch, accessToken };
}

// Null if the file doesn't exist yet at this path/branch.
export async function getFileSha(target: RepoTarget, path: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(target.branch)}`,
    { headers: githubHeaders(target.accessToken) }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to look up current state of ${path} (${res.status})`);
  }
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

// v9: read-only — the current full content of an existing file, so Code
// Generation Agent can extend it instead of guessing from scratch. Null if
// the file doesn't exist (or isn't a plain file, e.g. a directory/submodule)
// rather than throwing, since a stale/renamed path shouldn't abort generation.
export async function getFileContent(target: RepoTarget, path: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(target.branch)}`,
    { headers: githubHeaders(target.accessToken) }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read ${path} (${res.status})`);
  }
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content, "base64").toString("utf-8");
}

// Creates or overwrites a file with newContent in full (never a patch/diff
// application) — a sha saved from an earlier step can be stale, so this
// always re-fetches the current sha immediately before writing to avoid a
// GitHub 409 from an out-of-date sha.
export async function putFileContent(
  target: RepoTarget,
  path: string,
  content: string,
  message: string
): Promise<{ commitSha: string }> {
  const sha = await getFileSha(target, path);
  const res = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}`,
    {
      method: "PUT",
      headers: { ...githubHeaders(target.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: target.branch,
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub PUT ${path} failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { commit: { sha: string } };
  return { commitSha: data.commit.sha };
}

// Returns null (no-op) if the file is already gone rather than treating a
// missing file as an error.
export async function deleteFile(
  target: RepoTarget,
  path: string,
  message: string
): Promise<{ commitSha: string } | null> {
  const sha = await getFileSha(target, path);
  if (!sha) return null;

  const res = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}`,
    {
      method: "DELETE",
      headers: { ...githubHeaders(target.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha, branch: target.branch }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub DELETE ${path} failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { commit: { sha: string } };
  return { commitSha: data.commit.sha };
}
