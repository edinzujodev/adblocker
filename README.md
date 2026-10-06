# adblocker

A home ad blocker in the style of Pi-hole: a small DNS server that answers
ad/tracker domains with `0.0.0.0` / `::` and forwards everything else to an
upstream resolver. It is a single Go binary, built to run on a Windows PC for
development and on a Raspberry Pi 3 Model B+ (linux/arm64) later.

## Layout

```
cmd/adblocker/         main program (flags, startup)
internal/blocklist/    hosts-format list parsing + domain matching
internal/dnsserver/    DNS handler: block or forward, query logging
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

Examples:

```powershell
go run ./cmd/adblocker -listen 127.0.0.1:15353
go run ./cmd/adblocker -blocklist my-hosts.txt -blocklist https://example.org/hosts
```

Every query is logged as `BLOCKED` or `ALLOWED` with client IP, type and name.

Note: on Windows, port 5353 is taken by mDNS, and `nslookup` ignores
`-port=`, so test on port 53 with `nslookup doubleclick.net 127.0.0.1`.

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
