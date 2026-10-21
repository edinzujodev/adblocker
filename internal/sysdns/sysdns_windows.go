//go:build windows

package sysdns

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type windowsSystem struct{}

func newSystem() (system, string) { return windowsSystem{}, "" }

func (windowsSystem) isAdmin() bool {
	return windows.GetCurrentProcessToken().IsElevated()
}

// Physical adapters only: virtual ones (VPN, Hyper-V, Bluetooth PAN) are
// left alone.
const listScript = `$ErrorActionPreference = 'Stop'
$out = @(Get-NetAdapter -Physical | ForEach-Object {
  [pscustomobject]@{
    index   = $_.ifIndex
    name    = $_.Name
    up      = ($_.Status -eq 'Up')
    servers = @((Get-DnsClientServerAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses)
  }
})
ConvertTo-Json -InputObject $out -Compress -Depth 3`

func (windowsSystem) adapters() ([]Adapter, error) {
	out, err := powershell(listScript)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Index   int      `json:"index"`
		Name    string   `json:"name"`
		Up      bool     `json:"up"`
		Servers []string `json:"servers"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("reading adapter list: %w", err)
	}
	ads := make([]Adapter, len(raw))
	for i, r := range raw {
		ads[i] = Adapter{Index: r.Index, Name: r.Name, Up: r.Up, Servers: r.Servers}
	}
	return ads, nil
}

func (windowsSystem) apply(changes []change) error {
	var script strings.Builder
	script.WriteString("$ErrorActionPreference = 'Stop'\n")
	for _, c := range changes {
		if len(c.Servers) == 0 {
			fmt.Fprintf(&script, "Set-DnsClientServerAddress -InterfaceIndex %d -ResetServerAddresses\n", c.Index)
		} else {
			fmt.Fprintf(&script, "Set-DnsClientServerAddress -InterfaceIndex %d -ServerAddresses '%s'\n", c.Index, strings.Join(c.Servers, "','"))
		}
	}
	script.WriteString("Clear-DnsClientCache\n")
	_, err := powershell(script.String())
	return err
}

func powershell(script string) ([]byte, error) {
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return nil, errors.New(firstLine(msg))
		}
		return nil, err
	}
	return out, nil
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return s
}

// Windows keeps DNS settings per interface and, below it, per Wi-Fi network:
// Interfaces\{adapter GUID}\{network} keys hold a NameServer value that is
// applied whenever that network is joined.
const interfacesKey = `SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces`

func (windowsSystem) clearSaved(server string) (int, error) {
	root, err := registry.OpenKey(registry.LOCAL_MACHINE, interfacesKey, registry.ENUMERATE_SUB_KEYS)
	if err != nil {
		return 0, err
	}
	defer root.Close()
	ifaces, err := root.ReadSubKeyNames(-1)
	if err != nil {
		return 0, err
	}
	cleared := 0
	for _, iface := range ifaces {
		k, err := registry.OpenKey(root, iface, registry.ENUMERATE_SUB_KEYS)
		if err != nil {
			continue
		}
		networks, _ := k.ReadSubKeyNames(-1)
		k.Close()
		for _, network := range networks {
			n, err := clearNameServer(interfacesKey+`\`+iface+`\`+network, server)
			if err != nil {
				return cleared, err
			}
			cleared += n
		}
	}
	return cleared, nil
}

// clearNameServer empties the NameServer value at path if its first entry is
// server, which makes that network use automatic (DHCP) DNS again.
func clearNameServer(path, server string) (int, error) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE|registry.SET_VALUE)
	if err != nil {
		return 0, nil // not readable or writable: not ours to fix
	}
	defer k.Close()
	v, _, err := k.GetStringValue("NameServer")
	if err != nil {
		return 0, nil
	}
	first, _, _ := strings.Cut(strings.ReplaceAll(v, " ", ","), ",")
	if first != server {
		return 0, nil
	}
	return 1, k.SetStringValue("NameServer", "")
}
