// Package sysdns points the DNS settings of the computer running the
// adblocker at the adblocker itself, so the web interface can protect this
// computer with one switch. Only Windows is supported; on the Raspberry Pi
// the router hands out the Pi as DNS server instead.
package sysdns

import (
	"errors"
	"net"
	"os"
	"slices"
)

var (
	ErrUnsupported = errors.New("not supported on this computer")
	ErrNotAdmin    = errors.New("EasioProtect must run as administrator to change this computer's DNS settings")
)

// Status describes whether this computer uses the adblocker for DNS.
type Status struct {
	Supported bool      `json:"supported"`
	Admin     bool      `json:"admin"`
	Enabled   bool      `json:"enabled"` // every connected adapter uses the adblocker
	Computer  string    `json:"computer"`
	Adapters  []Adapter `json:"adapters"` // connected adapters only
	Message   string    `json:"message,omitempty"`
}

// Adapter is a network adapter and its IPv4 DNS servers.
type Adapter struct {
	Index   int      `json:"-"`
	Name    string   `json:"name"`
	Up      bool     `json:"-"`
	Servers []string `json:"servers"`
}

// change sets an adapter's DNS servers, or puts it back to automatic (DHCP)
// when Servers is empty.
type change struct {
	Index   int
	Servers []string
}

// system is the OS-specific part.
type system interface {
	isAdmin() bool
	adapters() ([]Adapter, error)
	apply([]change) error // also flushes the DNS cache
	// clearSaved removes server from DNS settings Windows saved for Wi-Fi
	// networks that are not connected right now, and returns how many it
	// cleared. Otherwise rejoining such a network later would leave the
	// computer asking a DNS server that is no longer running.
	clearSaved(server string) (int, error)
}

// Controller switches this computer's DNS between EasioProtect and the
// network's normal (DHCP) servers.
//
// It always fails open: EasioProtect is set as the first DNS server and the
// network's own servers stay behind it as backups. If EasioProtect is not
// running (crashed, killed, laptop moved to another Wi-Fi), Windows gets no
// answer from it and immediately asks the backup, so the internet keeps
// working; only blocking stops.
type Controller struct {
	sys      system
	server   string // address this computer should use, e.g. 127.0.0.1
	fallback string // backup when an adapter has no DNS servers of its own
	reason   string // why it is unsupported, if it is
}

// New returns a Controller for a DNS server listening on listen (host:port).
// fallback (an IPv4 address, e.g. the upstream resolver) is the backup DNS
// server for adapters that don't already have one.
func New(listen, fallback string) *Controller {
	sys, reason := newSystem()
	c := &Controller{sys: sys, fallback: fallback, reason: reason}
	if reason == "" {
		c.server, c.reason = serverFor(listen)
	}
	return c
}

// serverFor returns the address the OS should use to reach a DNS server
// listening on listen, or why it can't.
func serverFor(listen string) (server, reason string) {
	host, port, err := net.SplitHostPort(listen)
	if err != nil || port != "53" {
		return "", "The DNS server must listen on port 53 for this computer to use it."
	}
	ip := net.ParseIP(host)
	switch {
	case host == "" || (ip != nil && ip.IsUnspecified()):
		return "127.0.0.1", ""
	case ip != nil && ip.To4() != nil:
		return ip.String(), ""
	}
	return "", "The DNS server must listen on an IPv4 address for this computer to use it."
}

// Status reports the current DNS settings.
func (c *Controller) Status() (Status, error) {
	st := Status{Message: c.reason}
	st.Computer, _ = os.Hostname()
	if c.reason != "" {
		return st, nil
	}
	st.Supported = true
	st.Admin = c.sys.isAdmin()
	all, err := c.sys.adapters()
	if err != nil {
		return st, err
	}
	pointed := 0
	for _, a := range all {
		if !a.Up {
			continue
		}
		st.Adapters = append(st.Adapters, a)
		if c.usesUs(a) {
			pointed++
		}
	}
	st.Enabled = len(st.Adapters) > 0 && pointed == len(st.Adapters)
	switch {
	case len(st.Adapters) == 0:
		st.Message = "No connected network adapter found."
	case !st.Admin:
		st.Message = "Start EasioProtect as administrator to switch this from here."
	}
	return st, nil
}

// Set points every connected adapter at the adblocker (on), or puts every
// adapter that uses the adblocker back to automatic DNS (off).
func (c *Controller) Set(on bool) error {
	if c.reason != "" {
		return ErrUnsupported
	}
	if !c.sys.isAdmin() {
		return ErrNotAdmin
	}
	all, err := c.sys.adapters()
	if err != nil {
		return err
	}
	var changes []change
	for _, a := range all {
		switch {
		case on && a.Up && (!c.usesUs(a) || len(a.Servers) < 2): // also adds a missing backup
			changes = append(changes, change{a.Index, c.withBackups(a.Servers)})
		case !on && c.usesUs(a):
			changes = append(changes, change{a.Index, nil})
		}
	}
	if !on {
		if _, err := c.sys.clearSaved(c.server); err != nil {
			return err
		}
	}
	if len(changes) == 0 {
		return nil
	}
	return c.sys.apply(changes)
}

// Restore is called on shutdown: once EasioProtect stops, any network
// setting still pointing at it would leave the computer without working DNS,
// including settings saved for Wi-Fi networks it is not connected to now. It
// reports whether anything was changed. Without admin rights it does nothing.
func (c *Controller) Restore() (bool, error) {
	if c.reason != "" || !c.sys.isAdmin() {
		return false, nil
	}
	cleared, err := c.sys.clearSaved(c.server)
	if err != nil {
		return false, err
	}
	all, err := c.sys.adapters()
	if err != nil {
		return cleared > 0, err
	}
	used := false
	for _, a := range all {
		used = used || c.usesUs(a)
	}
	if !used {
		return cleared > 0, nil
	}
	return true, c.Set(false)
}

// withBackups puts EasioProtect first and keeps the adapter's current servers
// behind it as backups. There is always at least one backup.
func (c *Controller) withBackups(current []string) []string {
	servers := []string{c.server}
	for _, s := range current {
		if s != c.server && !slices.Contains(servers, s) {
			servers = append(servers, s)
		}
	}
	if len(servers) == 1 && c.fallback != "" && c.fallback != c.server {
		servers = append(servers, c.fallback)
	}
	return servers
}

func (c *Controller) usesUs(a Adapter) bool {
	return len(a.Servers) > 0 && a.Servers[0] == c.server
}
