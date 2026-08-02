---
name: generate-tests
description: Create or update focused Vitest tests for the Later Next.js, React, Express, and TypeScript codebase. Use when implementing a feature or bug fix, when changed behavior lacks coverage, when a regression needs reproduction, or when the user asks to generate, improve, or review tests.
---

# Generate Tests

Add the smallest set of high-value tests that proves the requested behavior without coupling tests
to implementation details.

## Workflow

1. Inspect `git diff`, the changed source files, neighboring tests, `vitest.config.ts`, and
   `package.json`.
2. State the observable behavior and failure modes introduced by the change.
3. Select the existing test location and tool:
   - Pure functions in `lib/` or `server/`: colocated `*.test.ts` with Vitest.
   - Express routes and middleware: `server/index.test.ts` or a colocated server test with
     Supertest.
   - React components and pages: colocated `*.test.tsx` with jsdom and React Testing Library.
4. Write tests in this priority order:
   - Primary successful user or API flow.
   - Validation, error, or fallback flow that could cause data loss or a broken screen.
   - Boundary behavior only when the implementation has a meaningful boundary.
   - Regression case when fixing a reported bug.
5. Run the narrowest affected test command first.
6. Run `npm test`, `npx tsc --noEmit`, and `npm run build` after focused tests pass.
7. Report tests added, behavior covered, commands run, and any remaining gap.

## Testing Standards

- Assert user-visible behavior, API contracts, persisted payloads, and state transitions.
- Prefer accessible queries such as `getByRole` and `findByText` for React tests.
- Exercise UI interactions with Testing Library rather than calling component internals.
- Mock Supabase, Gemini, Storage, metadata requests, network calls, and browser APIs at the
  boundary. Never call live external services.
- Reset mocks and global stubs between tests.
- Cover both the AI success path and rule-based fallback when changing classification behavior.
- Verify HTTP status and response body for Express validation and error cases.
- Check that destructive or state-changing actions update the visible list.
- Reuse existing fixtures and mock shapes when practical.
- Do not rewrite production code solely to satisfy a brittle assertion.
- Do not assert Tailwind class strings, private helpers, exact generated timestamps, or incidental
  log output unless those are the requested contract.
- Do not use snapshots for behavior that can be expressed with direct assertions.

## Later-Specific Checks

Apply only checks relevant to the change:

- Saved items keep `title`, `summary`, `content`, `original_url`, `image_url`,
  `source_platform`, `category_main`, `category_sub`, `is_archived`, `archived_at`, and
  `created_at` fixture fields aligned with `lib/items.ts`.
- Image tests cover JPEG, PNG, WebP, the 5 MB limit, and Storage failure when those paths change.
- Classification tests reject malformed Gemini output and preserve rule-based fallback.
- URL analysis tests verify that URL Context is enabled only for HTTP/HTTPS inputs and that
  ordinary text requests do not enable external retrieval tools.
- Metadata tests block unsafe destinations and enforce redirect, timeout, size, and content-type
  limits when request handling changes.
- Archive tests distinguish active and archived queries and cover both archive and restore.
- Source-label tests cover YouTube, Instagram, X, Naver, manual input, and generic hostname
  fallbacks without asserting decorative Tailwind classes.
- Do not treat public caption metadata as proof that an Instagram or other social video itself was
  retrieved. Test and document the evidence level separately when provenance behavior changes.

## Commands

Use a focused command first:

```bash
npx vitest run path/to/changed.test.ts
```

Then run the complete gate:

```bash
npm test
npx tsc --noEmit
npm run build
```

If a command fails because the execution sandbox blocks local sockets, rerun it only with the
required execution permission. Do not classify an environment error as an application failure
without reproducing it.
