# AGENTS.md

## Purpose

This file provides guidance for Codex and other development agents working in
this repository. This repository is a local document workspace for game planning
workflows, not a standalone runtime agent product.

## Project Context

This project uses Codex plus repository-local rules, workflows, templates, and
skills as a document-based game planning agent.

The core principle is Human in the Loop: Codex may analyze, draft, and propose
changes, but actual project changes must go through approval-oriented flows.

## Key References

- Project overview and usage: `README.md`
- Workspace goals and user scenarios: `docs/plan.md`
- Maintenance checklist: `docs/checklist.md`
- Workspace architecture: `docs/architecture.md`
- Feature and scenario verification: `docs/verification.md`
- Workflow rules: `docs/workflows/`
- Reusable task skills: `docs/skills/`
- Output templates: `docs/templates/`

## Archive Notes

- `docs/dev-log/` is a historical archive kept for the user to read.
- Do not use `docs/dev-log/` as current behavior guidance, architecture truth,
  workflow policy, or implementation direction.
- If `docs/dev-log/` conflicts with `AGENTS.md`, `README.md`, `docs/plan.md`,
  `docs/architecture.md`, `docs/workflows/`, or `docs/skills/`, ignore the
  dev-log content for current work.

## Operating Rules

- Preserve the approval-based workflow.
- Do not bypass Approval Queue, Decision Log, source reconfirmation, or the
  Version History required for confirmed design changes.
- Before changing confirmed design documents in `workspace/design/`, confirm
  that the user explicitly approved the corresponding approval item.
- If approval is not explicit, produce or update an approval queue draft instead
  of editing confirmed design documents.
- Keep all project knowledge grounded in files under this repository.
- Do not invent project facts. Use `TBD` and ask follow-up questions when
  required information is missing.
- Use `workspace/document_plan.md` as a guide to recommended design documents,
  but do not block an out-of-plan request. Ask whether to add the new type.
- Select specialized templates from `docs/templates/design/`; use the generic
  design template only when no specialized type fits naturally.
- Do not save a design proposal until every template field is answered with a
  concrete value, user-confirmed `TBD`, or `N/A` with a reason, and at least one
  non-metadata field contains concrete design information.
- Register conversation, Markdown, and TXT source materials through the material
  intake workflow. Registration alone must not create a design proposal.
- For material-derived proposals, compare both target and source hashes before
  applying approval.
- Delete only registered copies inside `workspace/materials/inbox/`, and only
  after every selected candidate is confirmed or explicitly skipped and the
  source tombstone is recorded. Never delete an external source file.
- AI-derived resource and task candidates require approval before they are added
  to confirmed workspace inventories.
- User-stated task additions, field changes, and completion updates may be
  applied directly to the task board. Do not infer completion state or due dates.
- Schedule status and workspace recovery requests are read-only unless the user
  separately requests a concrete task update.
- Keep changes scoped to the requested behavior and avoid unrelated refactors.
- Do not hardcode API keys, tokens, or other secrets.

## File Roles

- `workspace/design/`: confirmed project design documents.
- `workspace/ideas/temporary_ideas.md`: unapproved ideas and loose notes.
- `workspace/document_plan.md`: recommended document types and their progress.
- `workspace/materials/`: registered source copies and their lifecycle index.
- `workspace/approvals/approval_queue.md`: pending, held, rejected, or approved
  change proposals.
- `workspace/decisions/decision_log.md`: accepted or rejected decision records.
- `workspace/versions/version_history.md`: approved document change history.
- `workspace/resources/resource_inventory.md`: approved production resources.
- `workspace/tasks/task_board.md`: user-stated or approved local tasks.

## Commands

There is no default runtime command. This workspace is operated through Codex
instructions and Markdown files.

For a quick structure check, use:

```bash
find docs workspace -maxdepth 3 -type f | sort
```

## Style

- Keep implementation simple and explicit.
- Preserve the Korean product documentation style unless asked otherwise.
- Prefer concise Markdown sections and reviewable bullets.
- Keep approval, decision, and version records easy to scan.
