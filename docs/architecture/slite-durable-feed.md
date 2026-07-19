# S-Lite Durable Single Feed

## Goal and Boundary

S-Lite provides the smallest persistent product slice for issuing one calendar
subscription link. One trusted operator controls one feed. Calendar clients can
continue using the issued URL after the Node server and Python bridge restart.

S-Lite deliberately does not include accounts, a management UI, campus/source
filters, live crawling, AI extraction, multiple feeds, or deployment
automation. It renders the fixed 601-event Foundation.25.1 snapshot.

## Runtime Flow

```text
administrator
  └─ Bearer-authenticated create / inspect / rotate / revoke
       └─ Express S-Lite router
            └─ long-lived Python JSON-lines bridge
                 ├─ SQLite singleton: feed ID, status, token hash, fingerprint
                 └─ Foundation.25.1: immutable profile, snapshot, events, ICS

calendar client
  └─ GET or HEAD /calendar/:opaqueToken.ics
       └─ hash comparison → status check → Foundation ICS render
```

The raw token and full subscription path exist only in process memory while a
successful create or rotate response is built. SQLite stores the SHA-256 hash
and a 12-character hash fingerprint, not the token, token prefix, or URL.
Consequently, an existing URL keeps working after restart but cannot be shown
again by the status API.

## Required Configuration

S-Lite starts only when all of these conditions hold:

- `NOTICEPILOT_ENABLE_SLITE_FEED=true` exactly;
- `NOTICEPILOT_SLITE_ADMIN_KEY` is a 32–256 character base64url token;
- `NOTICEPILOT_SLITE_DB_PATH` is an absolute path;
- `NOTICEPILOT_ENABLE_REFERENCE_FEED` is not enabled.

Missing or invalid configuration fails startup before the gateway process is
created. There is no in-memory fallback. The SQLite file is created with mode
`0600`; a pre-existing symlink, non-regular file, overly broad permissions,
unknown schema, corrupt database, or incompatible Foundation snapshot fails
closed.

The Python bridge is started lazily on the first S-Lite gateway request. The
general `/api/health` endpoint covers the Express analyze service, not SQLite
readiness; an unusable S-Lite database therefore returns `503` at the S-Lite
administrator/public boundary and never falls back to memory.

## Administrator API

Every request uses `Authorization: Bearer <administrator key>`. Credentials are
accepted only from that header and compared as fixed-size SHA-256 digests. All
administrator responses use `Cache-Control: no-store`.

| Method and path | Meaning | Success |
| --- | --- | --- |
| `GET /api/subscription-feeds/slite` | Inspect safe state; never reconstruct a URL | `200` |
| `POST /api/subscription-feeds/slite` | Create only when no singleton exists; body must be exactly `{}` | `201` |
| `POST /api/subscription-feeds/slite/rotate` | Keep feed ID, replace token, and explicitly reactivate a revoked feed; body must be exactly `{}` | `200` |
| `DELETE /api/subscription-feeds/slite` | Persistently revoke; repeated deletion is idempotent | `204` |

Create and rotate return `subscriptionPath` once, only after SQLite commit.
Status returns `subscriptionPathRecoverable: false`. Creating when the singleton
already exists returns `409`; losing a URL therefore requires explicit rotate.

## Public Calendar API

`GET` and `HEAD /calendar/:opaqueToken.ics` support `ETag` and conditional
`304`. Only calendar-safe response headers cross the Python/Node boundary.
Malformed, unknown, old, and revoked capabilities all return the same plain
`404` without reflecting the request URL. Dependency or storage failures return
plain `503` with `Retry-After: 300`.

Public links are bearer capabilities. An actual deployment must use HTTPS and
must configure proxy/access logs so the path is not retained. Do not place the
token in query parameters, cookies, analytics events, application logs, or
support screenshots.

## Persistence and Recovery

SQLite is the authoritative source for mutable feed state. Writes use
`BEGIN IMMEDIATE`, a five-second busy timeout, delete journaling, and
`synchronous=FULL`. Static Foundation data is rebuilt in memory at process
start, then the singleton feed row is restored into the delivery service.

Back up the database file from stable persistent storage. Restore must preserve
its private permissions and use a Foundation build containing the same profile
and snapshot. Deleting or losing the database permanently invalidates the
issued link because the raw token cannot be reconstructed.

## Explicit Limitations and Next Gate

The bridge serializes requests within one process. S-Lite is therefore approved
only for one Node process, one Python bridge, and one replica. Multi-process
coordination, live snapshot migration, rate limiting, TLS/reverse-proxy config,
secret rotation, monitoring, automated backup/restore drills, and physical
calendar-client lifecycle evidence remain deployment gates rather than hidden
assumptions.
