// Package filter decides whether a domain is blocked. It combines the
// downloaded blocklists with two lists the user edits at runtime (custom
// blocks and an allowlist) and an on/off switch.
package filter

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"adblocker/internal/blocklist"
)

// Reasons reported in Result.Reason.
const (
	ReasonBlocklist = "blocklist" // on a downloaded list
	ReasonCustom    = "custom"    // on the user's own block list
	ReasonAllowlist = "allowlist" // explicitly allowed by the user
	ReasonDisabled  = "disabled"  // blocking is switched off
	ReasonNotListed = "not-listed"
)

var (
	ErrInvalidDomain = errors.New("not a valid domain name")
	ErrNotFound      = errors.New("domain is not on the list")
)

// Result explains a blocking decision.
type Result struct {
	Domain  string `json:"domain"`
	Blocked bool   `json:"blocked"`
	Reason  string `json:"reason"`
	Rule    string `json:"rule,omitempty"` // list entry that matched
}

// Filter is safe for concurrent use.
type Filter struct {
	lists   *blocklist.List // downloaded lists, read-only after startup
	custom  *editable
	allow   *editable
	enabled atomic.Bool
}

// New returns an enabled Filter. customPath and allowPath are loaded if they
// exist and rewritten whenever the lists change; "" keeps a list in memory only.
func New(lists *blocklist.List, customPath, allowPath string) (*Filter, error) {
	f := &Filter{
		lists:  lists,
		custom: &editable{list: blocklist.New(), path: customPath, prefix: "0.0.0.0 ", header: customHeader},
		allow:  &editable{list: blocklist.New(), path: allowPath, header: allowHeader},
	}
	for _, e := range []*editable{f.custom, f.allow} {
		if err := e.load(); err != nil {
			return nil, err
		}
	}
	f.enabled.Store(true)
	return f, nil
}

// Check decides whether domain is blocked. The allowlist wins over every
// block list, so allowing a domain is how a user unblocks something that a
// downloaded list blocks.
func (f *Filter) Check(domain string) Result {
	r := Result{Domain: blocklist.Normalize(domain)}
	if rule, ok := f.allow.list.Match(domain); ok {
		r.Reason, r.Rule = ReasonAllowlist, rule
		return r
	}
	rule, ok := f.custom.list.Match(domain)
	r.Reason = ReasonCustom
	if !ok {
		rule, ok = f.lists.Match(domain)
		r.Reason = ReasonBlocklist
	}
	switch {
	case !ok:
		r.Reason = ReasonNotListed
	case !f.Enabled():
		r.Reason, r.Rule = ReasonDisabled, rule
	default:
		r.Blocked, r.Rule = true, rule
	}
	return r
}

// Enabled reports whether blocking is on.
func (f *Filter) Enabled() bool { return f.enabled.Load() }

// SetEnabled switches blocking on or off.
func (f *Filter) SetEnabled(on bool) { f.enabled.Store(on) }

// BlocklistSize is the number of domains on the downloaded lists.
func (f *Filter) BlocklistSize() int { return f.lists.Len() }

// Custom returns the user's blocked domains, sorted.
func (f *Filter) Custom() []string { return f.custom.list.Domains() }

// AddCustom blocks domain and its subdomains.
func (f *Filter) AddCustom(domain string) error { return f.custom.add(domain) }

// RemoveCustom removes domain from the user's block list.
func (f *Filter) RemoveCustom(domain string) error { return f.custom.remove(domain) }

// Allowed returns the user's allowed domains, sorted.
func (f *Filter) Allowed() []string { return f.allow.list.Domains() }

// AddAllowed never blocks domain or its subdomains.
func (f *Filter) AddAllowed(domain string) error { return f.allow.add(domain) }

// RemoveAllowed removes domain from the allowlist.
func (f *Filter) RemoveAllowed(domain string) error { return f.allow.remove(domain) }

const customHeader = `# My blocked sites. Managed by the adblocker web interface; edits made
# here while the server runs are overwritten. A domain also blocks its
# subdomains, so instagram.com covers www.instagram.com.
`

const allowHeader = `# Always-allowed sites. These are never blocked, even if a blocklist
# contains them. Managed by the adblocker web interface.
`

// editable is a list the user changes at runtime, persisted to a file.
type editable struct {
	list   *blocklist.List
	path   string
	prefix string // written before each domain, e.g. "0.0.0.0 "
	header string

	mu sync.Mutex // serializes changes and file writes
}

func (e *editable) load() error {
	if e.path == "" {
		return nil
	}
	if _, err := e.list.Load(e.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("loading %s: %w", e.path, err)
	}
	return nil
}

func (e *editable) add(domain string) error {
	if !blocklist.Valid(domain) {
		return ErrInvalidDomain
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.list.Add(domain)
	return e.save()
}

func (e *editable) remove(domain string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.list.Remove(domain) {
		return ErrNotFound
	}
	return e.save()
}

// save rewrites the file atomically (temp file + rename).
func (e *editable) save() error {
	if e.path == "" {
		return nil
	}
	var b strings.Builder
	b.WriteString(e.header)
	for _, d := range e.list.Domains() {
		b.WriteString(e.prefix + d + "\n")
	}
	tmp, err := os.CreateTemp(filepath.Dir(e.path), ".adblocker-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(b.String()); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), e.path)
}
