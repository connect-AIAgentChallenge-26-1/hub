# S30 Samsung Calendar Subscription QA

Status: `in_progress`

- S30-A automated feed/protocol QA: `completed`
- S30-B physical Samsung Calendar QA: `awaiting_physical_device`
- S30 overall completion: `false`

## 1. Boundary

S30 validates the existing S29 subscription feed against a Samsung Calendar client. It does not change CalendarEvent identity, S28 feed membership, PostgreSQL persistence, or the production feed token contract.

The automated layer can prove iCalendar and HTTP conformance. It cannot prove how a particular Samsung Calendar build installs, polls, updates, or removes a subscribed event. That claim requires a physical Samsung device and the actual Samsung Calendar application.

A one-time `.ics` import is not a subscription. If the client only imports a static copy and does not poll the same URL, S30-B must fail closed.

## 2. S30-A automated checks

Implementation:

- `noticepilot_samsung_calendar_qa.py`
- `noticepilot_s30_qa_server.py`
- `tools/build_s30_samsung_qa.py`
- `tools/serve_s30_samsung_qa.py`
- `tools/set_s30_samsung_qa_stage.py`
- `tools/validate_s30_samsung_physical_report.py`

Runtime evidence:

- `runtime/s30-v1/automated-qa-report.json`
- `runtime/s30-v1/manifest.json`

The automated audit checks:

1. UTF-8 and CRLF serialization.
2. RFC 5545 physical line folding at 75 octets or fewer.
3. VCALENDAR envelope and required properties.
4. `VTIMEZONE` and `TZID=Asia/Seoul`.
5. unique persistent `UID` per feed.
6. non-negative `SEQUENCE` and valid `STATUS`.
7. all-day exclusive `DTEND` projection.
8. timed start/end ordering.
9. `Content-Type`, `Content-Disposition`, `ETag`, `Cache-Control`, and `Last-Modified`.
10. conditional GET `304` behavior.
11. full reference feeds: student 601 VEVENT and job 299 VEVENT.
12. lifecycle fixtures for initial, update/new-event, and cancellation stages.

Normative format reference: RFC 5545. Client-specific behavior remains observational.

## 3. Physical lifecycle fixture

The local QA endpoint keeps one URL while changing its body through three stages:

```text
initial    2 events; all-day and Asia/Seoul timed event
updated    same UID with SEQUENCE 1 and extended end; one new event
cancelled  same UID with SEQUENCE 2 and STATUS:CANCELLED
```

Fixture path:

```text
/s30-samsung-calendar/noticepilot-qa.ics
```

The local server is for same-network QA only. It is not a production server and does not provide TLS or production authentication.

## 4. Physical execution

From the package root:

```bash
python3 tools/serve_s30_samsung_qa.py \
  --root . \
  --host 0.0.0.0 \
  --port 8765
```

Find the Mac LAN address, for example:

```bash
ipconfig getifaddr en0
```

On the Samsung device, use:

```text
http://<MAC_LAN_IP>:8765/s30-samsung-calendar/noticepilot-qa.ics
```

Do not mark the first screen as success merely because the app offers to import the file. The installed calendar must continue polling the same URL.

Stage transitions are made without changing the URL:

```bash
python3 tools/set_s30_samsung_qa_stage.py --root . --stage initial
python3 tools/set_s30_samsung_qa_stage.py --root . --stage updated
python3 tools/set_s30_samsung_qa_stage.py --root . --stage cancelled
```

Client polling is controlled by the client. Record the observed refresh latency rather than inventing a guaranteed interval.

## 5. Acceptance criteria

All seven checks must pass with evidence:

- URL-backed subscription, not static import.
- initial all-day dates are correct.
- timed event displays in Asia/Seoul.
- Korean UTF-8 text is intact.
- the new event appears after refresh.
- the updated event keeps one instance under the stable UID.
- cancellation does not create a duplicate and is removed or visibly cancelled according to the observed client behavior.

Copy the template:

```bash
mkdir -p runtime/s30-v1/physical-qa
cp runtime/s30-v1/samsung-physical-qa-result.template.json \
  runtime/s30-v1/physical-qa/samsung-physical-qa-result.json
```

Fill the result and validate it:

```bash
python3 tools/validate_s30_samsung_physical_report.py \
  --report runtime/s30-v1/physical-qa/samsung-physical-qa-result.json
```

Only a passing physical report can move S30-B and S30 to `completed`.

## 6. Fail-closed outcomes requiring creator decision

If Samsung Calendar exposes only static import, or if it cannot poll a URL without an intermediary account, do not silently adopt Google Calendar. Record `static_import` or `unsupported` and keep S30 incomplete. The next architecture decision must explicitly choose among:

- a supported polling calendar account or CalDAV bridge;
- a small Android companion app using the device calendar provider;
- dropping native Samsung Calendar subscription from the MVP;
- another user-approved intermediary.

No such fallback is selected in this package.
