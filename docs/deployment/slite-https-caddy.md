# S-Lite HTTPS Deployment with Caddy

## Deployment Boundary

This is the first deployable S-Lite boundary:

```text
calendar client
  └─ HTTPS 443
       └─ Caddy
            └─ GET/HEAD /calendar/* only
                 └─ 127.0.0.1:3001 Node/Python/SQLite

operator over SSH or local shell
  └─ 127.0.0.1:3001/api/subscription-feeds/slite
```

Caddy terminates public TLS. Node stays on loopback. The reverse proxy never
routes `/api`, so the administrator credential is not accepted through the
public hostname. The Caddyfile intentionally has no access-log directive
because the calendar path contains the bearer capability.

The checked-in configuration follows Caddy's documented
[Automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[request matcher](https://caddyserver.com/docs/caddyfile/matchers), and
[reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
contracts. Use the official package for the target Linux distribution as
described in the [Caddy installation guide](https://caddyserver.com/docs/install).

## Prerequisites

- one Linux host with a public DNS name;
- DNS `A`/`AAAA` records pointing to that host;
- inbound TCP 80 and 443 allowed for ACME and HTTPS;
- port 3001 blocked externally;
- Node.js 22 and Python 3.14 available as `node` and `python3`;
- the repository at `/opt/noticepilot` and production dependencies;
- an operator with SSH/local shell access;
- persistent storage at `/var/lib/noticepilot`.

Do not continue with a private IP, an unregistered hostname, or a host whose
proxy/access logs cannot exclude the full request path.

## 1. Prepare the Node Service

Create a dedicated account and private state/config directories:

```bash
sudo useradd --system --home /var/lib/noticepilot --shell /usr/sbin/nologin noticepilot
sudo install -d -o noticepilot -g noticepilot -m 0700 /var/lib/noticepilot
sudo install -d -o root -g noticepilot -m 0750 /etc/noticepilot
```

Install the example environment, replace `REPLACE_ME` with a new 64-character
hex key, and keep the file private:

```bash
sudo install -o root -g noticepilot -m 0640 deploy/systemd/slite.env.example /etc/noticepilot/slite.env
openssl rand -hex 32
sudoedit /etc/noticepilot/slite.env
```

Install and start the unit only after `/opt/noticepilot` contains the reviewed
merge commit and `npm ci --omit=dev` has completed:

```bash
sudo install -o root -g root -m 0644 deploy/systemd/noticepilot-slite.service /etc/systemd/system/noticepilot-slite.service
sudo systemctl daemon-reload
sudo systemctl enable --now noticepilot-slite
sudo systemctl status noticepilot-slite
```

The placeholder administrator key is intentionally invalid, so a forgotten
replacement makes the service fail closed.

## 2. Install the Public Caddy Boundary

Install Caddy from its official stable package, then install the configuration
and its non-secret environment file:

```bash
sudo install -o root -g root -m 0644 deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo install -o root -g root -m 0644 deploy/systemd/caddy.env.example /etc/noticepilot/caddy.env
sudoedit /etc/noticepilot/caddy.env
sudo install -d -o root -g root -m 0755 /etc/systemd/system/caddy.service.d
sudo install -o root -g root -m 0644 deploy/systemd/caddy-noticepilot.conf /etc/systemd/system/caddy.service.d/noticepilot.conf
```

Replace `calendar.example.com` with the real public DNS name. The Caddyfile
fixes its only upstream at `127.0.0.1:3001`; changing it requires a new reviewed
deployment boundary.

Validate with the same environment Caddy will receive, then reload it:

```bash
sudo systemctl daemon-reload
set -a
. /etc/noticepilot/caddy.env
set +a
sudo --preserve-env=NOTICEPILOT_PUBLIC_HOST \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
sudo systemctl status caddy
sudo journalctl -u caddy -n 50 --no-pager
```

Before enabling either service, also verify the runtimes:

```bash
node --version
python3 --version
```

Caddy obtains and renews the certificate automatically. Automatic HTTP-to-HTTPS
redirects are disabled: a capability path submitted over plaintext HTTP must
not be preserved in a redirect. Always issue and distribute an `https://` URL.

## 3. Issue the One-Time Link Locally

Run this only on the host or through an SSH session. Do not call the lifecycle
API through the public DNS name.

```bash
set -a
. /etc/noticepilot/slite.env
set +a
curl --fail-with-body -X POST http://127.0.0.1:3001/api/subscription-feeds/slite \
  -H "Authorization: Bearer $NOTICEPILOT_SLITE_ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Join the public origin and one-time `subscriptionPath` from the response:

```text
https://calendar.example.com/calendar/<opaque-token>.ics
```

The full URL cannot be recovered from status or SQLite. If it is lost, rotate
the token locally and replace the calendar-client subscription URL.

## 4. Release Verification

From a different network, verify the issued capability:

```bash
curl --fail --proto '=https' --tlsv1.2 -I 'https://calendar.example.com/calendar/<opaque-token>.ics'
curl --fail --proto '=https' --tlsv1.2 'https://calendar.example.com/calendar/<opaque-token>.ics'
```

Expected results:

- a valid `GET` and `HEAD` return `200` with `text/calendar`;
- `If-None-Match` can return `304`;
- an invalid token returns generic plain `404`;
- a query on an otherwise valid capability returns generic plain `404`;
- `POST /calendar/...` returns generic plain `404`;
- public `GET /api/subscription-feeds/slite` returns generic plain `404`;
- the certificate matches the public hostname;
- no proxy/access log stores the capability path.

Restart both services and verify the same URL again:

```bash
sudo systemctl restart noticepilot-slite caddy
```

The existing calendar URL must still return `200` or conditional `304`.

## Remaining Production Gates

This configuration does not create a cloud host, DNS record, firewall rule, or
backup. Before treating the endpoint as production-ready, complete:

- host and DNS selection;
- firewall verification and operating-system patching;
- encrypted SQLite backup and restore drill;
- Caddy/Node availability monitoring without capability-path logging;
- administrator secret rotation procedure;
- real calendar-client registration, refresh, rotate, revoke, and restart QA.
