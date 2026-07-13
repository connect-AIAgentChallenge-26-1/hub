---
type: documentation
aliases:
  - Codex LLM Wiki Schema
  - Codex Wiki Harness
description: Codex-first operating instructions for the cmds-llm-wiki vault. Defines the Raw Sources / Wiki / Schema architecture, repo-scoped skills, and safe edit rules.
author:
  - "[[김규태]]"
date created: 2026-04-10
date modified: 2026-07-08
tags:
  - system
  - schema
  - codex
status: active
version: "2.0.0-codex"
---

# AGENTS.md - Codex LLM Wiki Harness

Codex reads this file automatically when it starts in this repository. Keep this file short and operational; detailed workflows live in `.agents/skills/{operation}/SKILL.md` and `.codex/commands/{operation}.md`.

## Codex Priority

When working in this vault, use this order:

1. `AGENTS.md` for durable repository rules.
2. A matching repo skill in `.agents/skills/{operation}/SKILL.md` when the task matches an operation.
3. The matching `.codex/commands/{operation}.md` as the detailed runtime checklist.
4. `Core Context.md`, `index.md`, and `log.md` for vault state.
5. `CLAUDE.md` only as a legacy/Claude mirror when a missing detail is not present in Codex files.

Do not require Claude parity for normal Codex work. Update Claude files only when the user explicitly asks to maintain the Claude harness too.

## Available Repo Skills

These skills are checked into the repository under `.agents/skills`, so Codex can discover them when launched from the repository root or a subfolder in this Git repo.

| User intent | Skill | Detail file |
|---|---|---|
| Capture browser or AI research tabs | `capture-tabs` | `.codex/commands/capture-tabs.md` |
| Process inbox items | `inbox` | `.codex/commands/inbox.md` |
| Ingest a source | `ingest` | `.codex/commands/ingest.md` |
| Query the compiled Wiki | `query` | `.codex/commands/query.md` |
| Run health checks | `lint` | `.codex/commands/lint.md` |
| Show vault status | `status` | `.codex/commands/status.md` |
| Rebuild search index | `reindex` | `.codex/commands/reindex.md` |
| Refresh user context | `refresh-context` | `.codex/commands/refresh-context.md` |
| Verify one Wiki page | `verify` | `.codex/commands/verify.md` |
| Audit the whole vault | `audit` | `.codex/commands/audit.md` |

Users can invoke skills explicitly with `$ingest`, `$query`, `$lint`, etc. Codex may also invoke them implicitly when the prompt matches the skill description.

## Architecture

- `10. Raw Sources/`: source evidence. Preserve original content under `## Original Content`.
- `20. Wiki/`: LLM-maintained concepts, entities, guides, and maps.
- `30. Queries/`: saved synthesis results from substantial questions.
- `AGENTS.md`, `.agents/skills/`, `.codex/commands/`: Codex schema and operation harness.
- `CLAUDE.md`, `.claude/`: optional legacy Claude Code harness.

Raw Sources are evidence; Wiki pages are compiled reusable knowledge. Do not blur those roles.

## Write Rules

- Read `Core Context.md` before substantial capture, ingest, query, lint, verify, or audit work.
- Use `rg` / `rg --files` for local search.
- Use patch-style edits for manual file changes.
- Do not rewrite Raw Sources except when performing an explicit ingest or source-update workflow.
- Preserve original source text under `## Original Content`.
- Update `index.md` and append `log.md` when an operation changes vault content.
- Keep user-specific placeholders unless the user asks to personalize the template.

## Markdown And YAML Rules

- YAML frontmatter uses 2 spaces.
- Body indentation uses tabs where indentation matters.
- YAML wikilinks are quoted: `"[[link]]"`.
- Body wikilinks are plain: `[[link]]`.
- Mermaid labels use quotes: `A["label"]`.
- Dates use `YYYY-MM-DD`.
- New YAML keys use camelCase.

Required frontmatter for normal notes:

```yaml
type: wiki-page
aliases:
  - Example
description: "English LLM hint."
author:
  - Codex
date created: 2026-07-08
date modified: 2026-07-08
tags:
  - llm-wiki
```

## Ingest Guardrails

- Ask one collection-purpose question before ingest unless the user explicitly asks Codex to infer it.
- Record the answer in `collectionPurpose`.
- If a mothership vault is configured in `Core Context.md`, search it for 2-5 related notes and record verified links in `mainVaultRelated`.
- New Wiki pages start with `explored: false` and `verificationStatus: unverified`.
- High-confidence or synthesis-heavy pages include a `> [!note] Bias Check` callout.

## Verification Guardrails

- Use `claimType`, `evidenceScope`, `verificationStatus`, `verifiedAt`, `verifiedBy`, and `disputed` when verifying Wiki pages.
- Do not erase conflicting evidence. Mark unresolved conflicts with `disputed: true` and a `> [!warning] Disputed Claim` callout.
- In query answers, hedge pages with `verificationStatus: partial`, `unverified`, or `disputed`.

## Distribution Notes For Maintainers

Repo skills in `.agents/skills` are usable immediately for this repository after clone, as long as Codex is launched inside the repository. No `.ps1` installer is required for repo-scoped use.

For use in every repository on a machine, copy or symlink skill folders into `$HOME/.agents/skills`. For public reusable distribution beyond this repo, package skills as a Codex plugin rather than asking users to run ad hoc install scripts.
