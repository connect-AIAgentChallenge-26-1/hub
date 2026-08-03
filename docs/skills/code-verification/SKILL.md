---
name: code-verification
description: Verify changes in the Jigeum Review React and Express project with focused tests, server syntax checks, production builds, and honest completion reporting. Use when implementing, fixing, refactoring, or reviewing frontend, API, Supabase, authentication, or AI review-analysis code in this repository.
---

# Code Verification

## Workflow

1. Inspect the changed files and identify the user-visible behavior and failure risks.
2. For a new behavior, write the smallest failing test first when practical and run it to record the expected failure.
3. Implement only enough code to make that test pass.
4. Run focused tests, then the complete relevant test suite.
5. Run a production build for frontend changes and a syntax check for server entry-point changes.
6. Review the diff for secrets, unrelated edits, misleading claims, and test-only data presented as production data.
7. Report the commands run, pass/fail counts, warnings, and anything not verified against a live external service.

## Commands

Use commands from the repository root.

```bash
npm test -- --watchAll=false --runTestsByPath src/App.test.js
npm run test:server
node --check server.mjs
npm run build
```

## Project-specific checks

- Keep Supabase Secret Key and OpenAI API Key on the Express server only.
- Confirm unauthenticated users can search places but cannot submit reviews.
- Confirm profile changes pass through Express and persist to `profiles`.
- Do not describe localStorage test reviews as verified database reviews.
- Preserve map viewport, search query, and results when returning from a place detail page.
- Keep receipt verification and OCR status explicit; do not mark planned behavior as implemented.

## Completion format

Provide changed behavior, test-first evidence when used, verification results, and remaining limitations.

