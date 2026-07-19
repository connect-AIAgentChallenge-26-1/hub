# S-Lite LAN HTTPS Validation with Caddy

## Validation Boundary

This profile is intended to prove one durable S-Lite calendar URL from another
device on the same trusted local network. It does not require a registered
domain or expose NoticePilot to the internet.

```text
calendar client on the same LAN
  └─ HTTPS <reserved-private-IP>:8443
       └─ Caddy with its internal CA
            └─ GET/HEAD /calendar/* only
                 └─ 127.0.0.1:3001 Node/Python/SQLite

operator on the NoticePilot host
  └─ 127.0.0.1:3001/api/subscription-feeds/slite
```

Use [`Caddyfile.lan`](../../deploy/caddy/Caddyfile.lan) only for this LAN
profile. The public-domain [`Caddyfile`](../../deploy/caddy/Caddyfile) remains a
separate deployment profile. Do not concatenate or run both configurations.

Caddy uses its internal CA for this profile. The LAN Caddyfile deliberately
skips automatic host trust-store installation. Every client device must trust
the exported CA root before it can subscribe without a TLS error. The root
certificate is a trust anchor, not an application secret: distribute it only
to devices whose TLS trust store you administer, and never distribute the CA
private key.

## Prerequisites

- the NoticePilot host and test client are on the same trusted LAN;
- client isolation is disabled for those two devices;
- the host has a DHCP reservation or other stable private IPv4 address;
- TCP 8443 is allowed from the LAN but not forwarded by the router;
- Node.js 22+, Python 3.14, and Caddy 2 are installed on the host;
- production dependencies are installed with `npm ci --omit=dev` or the local
  development dependencies are already present.

Follow the [official Caddy installation guide](https://caddyserver.com/docs/install)
for the host. On macOS, the guide lists the community-maintained Homebrew
formula; verify the installed binary before continuing:

```bash
brew install caddy
caddy version
```

Do not use `0.0.0.0`, `::`, a public interface address, or a public DNS name in
the LAN environment file. A changing DHCP address breaks both the URL and the
certificate name.

## 1. Reserve and Record the LAN Address

Reserve the host address in the router first. On macOS, inspect the current
Wi-Fi address with:

```bash
ipconfig getifaddr en0
```

Copy the example and replace both example addresses with that reserved private
address. Keep the port at `8443` for the first validation:

```bash
cp deploy/caddy/caddy-lan.env.example .env.caddy-lan
chmod 600 .env.caddy-lan
```

`.env.caddy-lan` is ignored by Git. `NOTICEPILOT_LAN_HOST` controls the
certificate and URL identity; `NOTICEPILOT_LAN_BIND` restricts the listening
socket to the selected interface. They must be the same IP for this first
slice. Set `NOTICEPILOT_LAN_CIDR` to the single trusted client subnet; it is a
second application-level filter, not a replacement for the host firewall.

Parse the file as data and reject unsafe values before starting either process.
Do not `source` this file as shell code:

```bash
node scripts/deployment/validate-slite-lan-env.mjs .env.caddy-lan
```

The validator accepts only matching RFC1918 IPv4 host/bind values, one
containing private CIDR, and an unprivileged port from 1024 through 65535. It
also rejects Caddy's local admin port 2019 and Node's loopback port 3001. The
file must contain exactly the four known keys, have no group/other permissions,
and contain no shell syntax, duplicate keys, or unknown keys.

## 2. Start the Loopback S-Lite Service

Create a private ignored runtime directory and a shared mode-`0600` raw key
file. This keeps the administrator key available to a second local operator
shell without printing or evaluating it as shell code:

```bash
mkdir -p .noticepilot-local
chmod 700 .noticepilot-local
umask 077
openssl rand -hex 32 > .noticepilot-local/slite-admin-key
chmod 600 .noticepilot-local/slite-admin-key
```

Start Node in the first terminal:

```bash
export NOTICEPILOT_ENABLE_SLITE_FEED=true
export NOTICEPILOT_SLITE_ADMIN_KEY="$(tr -d '\r\n' < .noticepilot-local/slite-admin-key)"
export NOTICEPILOT_SLITE_DB_PATH="$PWD/.noticepilot-local/slite.sqlite3"
HOST=127.0.0.1 PORT=3001 npm run dev:server
```

The key file is generated locally rather than accepted from an untrusted
source. Never copy or commit it. The server rejects a LAN or wildcard `HOST`;
only Caddy receives LAN traffic.

## 3. Start the LAN Caddy Profile

In a second terminal, use the checked-in launcher. It safely parses the exact
environment file once, passes only its validated network values to the fixed
LAN Caddyfile, and fixes Caddy storage under the ignored private runtime
directory:

```bash
node scripts/deployment/run-slite-lan-caddy.mjs .env.caddy-lan validate
node scripts/deployment/run-slite-lan-caddy.mjs .env.caddy-lan run
```

The CA root is created at:

```text
.noticepilot-local/share/caddy/pki/authorities/local/root.crt
```

Install that `root.crt` as a trusted root certificate on the other LAN device
using the operating-system vendor's certificate-profile instructions. Confirm
the file being installed is `root.crt`; never copy `root.key` or the entire
Caddy data directory to the client.

## 4. Issue and Verify the Capability

Issue the feed from a third terminal on the same host. Read the raw key as data;
do not source either local file as shell code:

```bash
export NOTICEPILOT_SLITE_ADMIN_KEY="$(tr -d '\r\n' < .noticepilot-local/slite-admin-key)"
curl --fail-with-body -X POST http://127.0.0.1:3001/api/subscription-feeds/slite \
  -H "Authorization: Bearer $NOTICEPILOT_SLITE_ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Join the returned one-time `subscriptionPath` to the LAN origin:

```text
https://192.168.1.50:8443/calendar/<opaque-token>.ics
```

Before copying the URL to a client, verify it on the host against the exact CA:

```bash
curl --fail --cacert \
  .noticepilot-local/share/caddy/pki/authorities/local/root.crt \
  -I 'https://192.168.1.50:8443/calendar/<opaque-token>.ics'
```

Then register the same URL in a calendar application on the trusted LAN device.
Expected behavior:

- initial `GET` and `HEAD` return `200` with `text/calendar`;
- conditional refresh can return `304`;
- query strings, malformed/encoded paths, unsupported methods, and `/api`
  return a generic `404`;
- stopping Node makes a valid capability return a generic `503`;
- restarting Node and Caddy preserves the same URL because SQLite is retained;
- Caddy logs do not contain the capability token.

On macOS, confirm the actual listeners with:

```bash
lsof -nP -iTCP:2019 -iTCP:3001 -iTCP:8443 -sTCP:LISTEN
```

On Linux, select the private IPv4 address with `ip -4 address show scope global`
instead of `ipconfig`, install Caddy from its official package, and inspect the
same listeners with:

```bash
ss -ltnp | grep -E ':(2019|3001|8443)([[:space:]]|$)'
```

Port 3001 and Caddy admin port 2019 must show loopback addresses only. Port
8443 must show only the selected private IPv4 address, never `0.0.0.0` or `::`.
The LAN profile disables HTTP/3, so these commands must show no UDP 8443
listener:

```bash
# macOS
lsof -nP -iUDP:8443

# Linux
ss -lunp | grep -E ':8443([[:space:]]|$)'
```

## 5. LAN Safety Checks

- Verify the router has no port-forward or UPnP mapping for TCP 8443.
- Restrict the host firewall rule to the private LAN subnet if the host firewall
  supports source ranges.
- Do not send the capability URL through chat, analytics, screenshots, or issue
  trackers; possession of the URL grants read access.
- Rotate the feed immediately if the URL is exposed.
- Remove the installed Caddy root from client devices when this validation
  environment is retired.

## Remaining Gate

This profile is limited to LAN transport and client-compatibility proof. Until
a physical client completes the lifecycle above, that evidence remains
pending. A service that fetches calendars from an external server cannot reach
a private LAN address. Public availability still requires the separate
public-domain profile, a real DNS name, internet-facing host/firewall review,
public certificate validation, monitoring, and backup/restore drills.
