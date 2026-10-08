# adblocker

A home ad blocker in the style of Pi-hole: a small DNS server that answers
ad/tracker domains with `0.0.0.0` / `::` and forwards everything else to an
upstream resolver. It is a single Go binary, built to run on a Windows PC for
development and on a Raspberry Pi 3 Model B+ (linux/arm64) later.

## Layout

```
cmd/adblocker/         main program (flags, startup)
internal/blocklist/    hosts-format list parsing + domain matching
internal/filter/       block decision: lists + your own blocks/allows + on/off
internal/querylog/     recent queries and counters for the web interface
internal/dnsserver/    DNS handler: block or forward, query logging
internal/web/          web interface: JSON API + embedded web app (static/)
```

## Requirements

- Go 1.27+ (`go version`)

## Run

```powershell
go run ./cmd/adblocker
```

Defaults: listens on `127.0.0.1:53` (UDP + TCP), forwards to `1.1.1.1:53`,
blocks the StevenBlack unified hosts list
(`https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts`).

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `-listen` | `127.0.0.1:53` | Address to listen on. Use `:53` to serve the whole LAN, or e.g. `127.0.0.1:15353` for testing. |
| `-upstream` | `1.1.1.1:53` | Resolver allowed queries are forwarded to. |
| `-blocklist` | StevenBlack hosts | File path or http(s) URL in hosts format. Repeat the flag (or comma-separate) for several lists. |
| `-custom` | `custom-blocklist.txt` | Your own blocked sites. Edited from the web interface; don't also pass it to `-blocklist`. |
| `-allowlist` | `allowlist.txt` | Sites that are never blocked. Edited from the web interface. |
| `-web` | `:8080` | Web interface address. `:8080` is reachable from your phone; `""` turns it off. |
| `-password` | `$ADBLOCKER_PASSWORD` | Web interface password. If unset, one is generated on first run and kept in `-password-file`. |
| `-password-file` | `admin-password.txt` | Where the generated password is stored. |

Examples:

```powershell
go run ./cmd/adblocker -listen 127.0.0.1:15353
go run ./cmd/adblocker -blocklist my-hosts.txt -blocklist https://example.org/hosts
```

Every query is logged as `BLOCKED` or `ALLOWED` with client IP, type and name.

Note: on Windows, port 5353 is taken by mDNS, and `nslookup` ignores
`-port=`, so test on port 53 with `nslookup doubleclick.net 127.0.0.1`.

## Web interface

On startup the server prints the web addresses and the password:

```
web interface: http://localhost:8080
  on your phone (same Wi-Fi): http://192.168.0.23:8080
web password: k7mxq2vbtr (stored in admin-password.txt)
```

Open the phone address in your phone's browser and log in. The interface has
three tabs:

- **Home**: blocking on/off switch, query counters, and a "test a site" box
  that says whether a domain is blocked and why.
- **Activity**: recently blocked domains (with an Allow button) and the most
  blocked domains.
- **Lists**: your own blocked sites and always-allowed sites. Changes take
  effect immediately, no restart needed. A pasted URL such as
  `https://www.instagram.com/` is stored as `instagram.com`, which covers all
  subdomains.

Windows asks whether to allow the program through the firewall the first
time; allow it on **private** networks, or your phone can't connect. Because
`go run` builds to a new temporary path each time, build once and run the
binary instead so the firewall rule sticks:

```powershell
go build -o bin/adblocker.exe ./cmd/adblocker
.\bin\adblocker.exe
```

### API

The web app uses a JSON API, which the planned mobile app will use too.
`POST /api/login` with `{"password": "..."}` returns `{"token": "..."}` and
sets a session cookie; send either the cookie or `Authorization: Bearer
<token>` on the other calls.

| Method | Path | Body / query | Result |
|--------|------|--------------|--------|
| `GET` | `/api/status` | | `enabled`, `totalQueries`, `blockedQueries`, `blocklistSize`, `customCount`, `allowCount` |
| `POST` | `/api/enabled` | `{"enabled": false}` | switches blocking on/off |
| `GET` | `/api/queries` | `?blocked=true&limit=100` | recent queries, newest first |
| `GET` | `/api/top-blocked` | | 20 most blocked domains |
| `GET` | `/api/check` | `?domain=instagram.com` | `blocked`, `reason`, `rule` |
| `GET` / `POST` | `/api/custom` | `{"domain": "..."}` | list / add your blocked sites |
| `DELETE` | `/api/custom/{domain}` | | remove one |
| `GET` / `POST` | `/api/allowlist` | `{"domain": "..."}` | list / add allowed sites |
| `DELETE` | `/api/allowlist/{domain}` | | remove one |
| `POST` | `/api/logout` | | ends the session |

## Test

```powershell
go vet ./...
go test ./...
```

## Build for Raspberry Pi (linux/arm64)

```powershell
$env:GOOS="linux"; $env:GOARCH="arm64"; go build -o bin/adblocker-linux-arm64 ./cmd/adblocker
Remove-Item Env:GOOS, Env:GOARCH
```

(bash: `GOOS=linux GOARCH=arm64 go build -o bin/adblocker-linux-arm64 ./cmd/adblocker`)

## Use it as this PC's DNS (Windows)

Start the server first, then in an **administrator** PowerShell:

```powershell
Get-NetAdapter | Where-Object Status -eq Up          # find your adapter name, e.g. "Wi-Fi"
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses 127.0.0.1
Clear-DnsClientCache
```

Undo (back to the DNS your router hands out via DHCP):

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ResetServerAddresses
Clear-DnsClientCache
```

While the PC points at `127.0.0.1`, the adblocker must be running, or name
resolution stops. Browsers with "secure DNS" (DNS-over-HTTPS) enabled skip
it, so turn that off in the browser to see blocking.
