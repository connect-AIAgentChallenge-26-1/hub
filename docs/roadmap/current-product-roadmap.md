# NoticePilot Current Product Roadmap

> Baseline: 2026-07-19 after Foundation.25.1 restoration and S-Lite durable-feed implementation
>
> Next productization route: S-Lite deployment and real calendar-client proof
>
> AI route: Route M — postponed as an independent product decision

## 1. Purpose

This roadmap connects the repository's implemented baseline to an actual
product release sequence. It separates two product routes that share contracts
but have different users, dependencies, risks, and release gates:

- **Route M — Manual / AI assistant:** a user supplies one notice, reviews
  evidence-backed extraction, edits the result, and exports actionable output.
- **Route S — Automated subscription:** the service ingests notices, maintains
  durable event identity, and publishes an account-owned feed that calendar
  clients continue to refresh.

The routes must not be reported or implemented as one undifferentiated phase.

## 2. Current Product Baseline

| Surface | Status | Current boundary |
| --- | --- | --- |
| Manual analysis UI | Runtime active | Client mock and Express server mock support review, editing, evidence, Markdown, and selected one-off all-day ICS export. |
| AI contracts | Contract complete | Raw schema, prompt contract, normalization, strict validation, and error boundaries are documented; no live provider is connected. |
| Test corpus | 10-entry baseline collected | Verified public entries now cover scholarship, school notice, assignment, competition, job posting, and ambiguous-date cases; deterministic corpus validation is next. |
| Foundation.25.1 | Implemented, isolated | The exact package, data, persistence, projection, feed, and tests are restored. |
| Local reference delivery | Opt-in runtime active | One fixed 601-event snapshot is exposed through an in-memory loopback capability that expires on server restart. |
| S-Lite durable delivery | Runtime and HTTPS kit implemented; host pending | One administrator can issue, inspect, rotate, and revoke one SQLite-backed capability URL; Caddy exposes only its calendar read path. |
| Production ingestion and feed | Pending | No live root ingestion, account-owned durable feed, production deployment, or operating service exists. |
| Calendar-client QA | Automated evidence only | S30-A is complete; S30-B still requires a physical Samsung device. |

S-Lite proves the durable single-link boundary. It is not evidence of production
account ownership, live ingestion/refresh, hardened deployment, or real-client
compatibility.

## 3. Route Decision

S-Lite deployment and real-client proof are the next implementation route.

Reasons:

- the first product goal is an ICS link that a calendar client can keep polling;
- the smallest useful scope is one trusted administrator and one durable feed,
  without accounts, crawling, or AI;
- token persistence, restart recovery, rotation, and revocation are now
  implemented and must be proven behind HTTPS on persistent storage;
- AI extraction quality and live ingestion remain separate risks and should not
  be pulled into this first release boundary.

This decision selects the next validation route, not a production launch or
permission to handle private notice data.

## 4. Productization Flow

```text
P0 Product truth and quality foundation
├─ canonical roadmap and Wiki authority
├─ verified corpus and human expected truth
├─ schema, adapter, HTTP, and security contracts
└─ protected PR and CI workflow
          │
          ├─ S-Lite — durable single feed
          │  SQLite capability → HTTPS deployment → real-client QA
          │
          ├─ Route M — Manual / AI assistant (postponed)
          │  corpus → evaluation harness → server AI vertical slice
          │
          └─ Route S — Automated subscription expansion
             live ingestion → event runtime → durable account feed
             → management UI → multi-client QA
                          │
                          ▼
P3 Shared production gate
deployment · observability · privacy/retention · incident/rollback · SLO
```

## 5. P0 — Product Truth and Quality Foundation

### Work

1. Reconcile repository documentation and the presentation Wiki through the
   reviewed, one-way authority process.
2. Build at least 10 verified real corpus entries with manually extracted text,
   human expected results, evidence, and privacy/copyright review.
3. Validate corpus index paths, JSON shape, source evidence, and category
   distribution deterministically.
4. Preserve the protected-branch checks and fork/upstream workflow boundary.

### Exit gate

- repository and Wiki authority direction is explicit;
- at least 10 verified real entries exist;
- every entry has extracted text and expected truth;
- fabricated evidence and sensitive student data are absent;
- the master and track-specific roadmaps agree;
- required CI remains green and upstream workflow diff remains empty for any
  upstream submission.

Ten examples are an integration entry gate, not sufficient product-quality
evidence. School-level parser work remains blocked until roughly 30 verified
examples exist.

## 6. Route M — Manual / AI Assistant

### M1 — Corpus baseline

Complete P0 corpus collection and record category coverage, ambiguity, evidence
quality, copyright risk, and privacy review.

Status: the initial 10-entry collection gate is complete. Structure, evidence,
and distribution checks are implemented in M2 rather than inferred from file
presence alone.

### M2 — Evaluation harness

Provide deterministic checks for corpus structure and a report shape that can
compare provider output with human expected truth without treating every text
difference as a semantic failure.

### M3 — Small server-side AI vertical slice

Initial runtime scope:

```text
manual text
→ POST /api/analyze mode="ai"
→ one server-side provider adapter
→ AI raw schema parse
→ normalization and strict app-schema validation
→ existing review/edit UI
→ Markdown and one-off ICS export
```

Keep client mock and server mock available. Do not include PDF, HWP, HWPX,
OCR, authentication, database, crawling, or subscription management in this
slice. Provider credentials remain server-only.

### M4 — Corpus-based AI QA

Measure:

- schema-valid response rate;
- deadline, task, submission, requirement, caution, and calendar-candidate
  correctness;
- evidence coverage and hallucination rate;
- critical omission and user-correction rate;
- review-required appropriateness;
- latency, timeout, quota, malformed JSON, and provider-failure behavior.

Do not silently fall back to mock output after a provider failure.

### M5 — Controlled expansion

Only after M4 evidence supports it, evaluate file extraction and date resolution
as separate stages. Analyze and extract remain separate capabilities. School
parsing and batch export retain their own entry gates.

### Route M release gate

- the target user and supported input class are explicit;
- corpus-backed quality thresholds and stop criteria are approved;
- evidence remains traceable through review and editing;
- prompt injection, secrets, personal data, logs, and retention are reviewed;
- provider failure cannot produce a false successful analysis;
- Korean and English critical flows remain usable;
- mock regression paths and export behavior remain stable.

## 7. Route S — Subscription Product

The S-Lite entry slice is implemented. Automated ingestion and account-owned
subscription expansion remain separately gated.

Sequence:

1. **S0 S-Lite durable link:** one administrator, one SQLite singleton, one
   fixed Foundation snapshot, hash-only capability persistence, restart
   recovery, rotation, and revocation. Runtime and Caddy/systemd kit are
   complete; real host/DNS deployment, backup/restore drill, and client
   lifecycle evidence remain.
2. **S1 live ingestion:** approved hosts and schemes, redirect and IP
   revalidation, response/attachment limits, scheduler, retries, and failure
   isolation.
3. **S2 event runtime:** promotion, reconciliation, persistent identity,
   revision, sequence, cancellation, and durable repositories wired from live
   root input.
4. **S3 account feed:** identity, SubscriptionProfile ownership, token hashes,
   rotation/revocation, private caching, authorization failures, and durable
   endpoint state.
5. **S4 management experience:** campus and source filters, feed status,
   lifecycle controls, errors, and recovery UI.
6. **S5 calendar-client evidence:** Samsung and other approved clients must
   prove continuing URL refresh, updates, stable UID behavior, and cancellation.
7. **S6 operations:** production deployment, monitoring, backup/restore,
   incident response, rollback, and service-level objectives.

S30-B physical Samsung QA retires one client risk. Passing it against a local
fixture does not complete S1 through S4 or authorize production deployment.

## 8. Shared Production Gate

Before either route is offered to external users, define and verify:

- target user, core problem, and excluded use cases;
- product KPI, release threshold, stop condition, and rollback signal;
- personal-data collection, retention, deletion, and user-consent policy;
- authentication and authorization boundaries where accounts or private data
  exist;
- production secrets and environment separation;
- rate limits, abuse prevention, audit-safe logs, and error redaction;
- monitoring, alerting, backup/restore, incident response, and rollback;
- accessibility and Korean/English critical-path QA.

## 9. Product Metrics

### Route M

- successful analysis activation rate;
- schema-valid output rate;
- evidence coverage;
- critical omission, hallucination, and user-correction rate;
- time to reviewed export;
- provider latency and failure rate.

### Route S

- subscription provisioning success rate;
- feed freshness and stale-snapshot rate;
- duplicate, update, and cancellation correctness;
- unauthorized access and revocation correctness;
- calendar-client refresh latency;
- delivery error and recovery rate.

## 10. Execution Rules

- Implement one route and one vertical slice at a time.
- Keep roadmap, corpus, Wiki, provider, and subscription work in separate
  reviewable commit and PR boundaries.
- Require the latest default branch, both protected CI checks, and resolved
  conversations before merge.
- Use `OlemeQ/hub` as the only push destination.
- Any upstream submission starts from `upstream/N153_전홍찬`, excludes
  `.github/workflows/**`, and follows the guardrail in Issue #21.
- Wiki publication, upstream PR creation, production deployment, and physical
  device mutation each retain a separate approval gate.

## 11. Active Tracking

- Weekly execution plan: Issue #24
- Repository-to-Wiki authority: Issue #22
- Samsung S30-B physical-device QA: Issue #23
- Upstream PR workflow guardrail: Issue #21
- AI route detail: [`phase-4-plan.md`](phase-4-plan.md)
- Batch/export route detail: [`batch-calendar-export.md`](batch-calendar-export.md)
