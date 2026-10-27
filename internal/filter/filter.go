// Package filter decides whether a domain is blocked. It combines the
// downloaded blocklists with two lists the user edits at runtime (custom
// blocks and an allowlist), block groups, and an on/off switch.
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
	ReasonGroup     = "group"     // in an enabled block group
	ReasonAllowlist = "allowlist" // explicitly allowed by the user
	ReasonDisabled  = "disabled"  // blocking is switched off
	ReasonNotListed = "not-listed"
)

var (
	ErrInvalidDomain  = blocklist.ErrInvalidDomain
	ErrInvalidKeyword = blocklist.ErrInvalidKeyword
	ErrNotFound       = errors.New("that website isn't on the list")
)

// Result explains a blocking decision.
type Result struct {
	Domain  string `json:"domain"`
	Blocked bool   `json:"blocked"`
	Reason  string `json:"reason"`
	Rule    string `json:"rule,omitempty"`   // list entry that matched
	Group   string `json:"group,omitempty"`  // block group's name, for ReasonGroup
	Bundle  string `json:"bundle,omitempty"` // bundle that switched the group on, if any
}

// Groups finds the active block group that covers a domain, and the bundle
// that switched it on ("" if the group's own switch did).
type Groups interface {
	Match(domain string) (group, bundle, rule string, ok bool)
}

// Filter is safe for concurrent use.
type Filter struct {
	lists   *blocklist.List // downloaded lists, read-only after startup
	custom  *editable
	allow   *editable
	groups  Groups // may be nil
	enabled atomic.Bool
}

// New returns an enabled Filter. customPath and allowPath are loaded if they
// exist and rewritten whenever the lists change; "" keeps a list in memory only.
func New(lists *blocklist.List, customPath, allowPath string) (*Filter, error) {
	f := &Filter{
		lists:  lists,
		custom: &editable{list: blocklist.New(), path: customPath, prefix: "0.0.0.0 ", header: customHeader, keywords: true},
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

// SetGroups makes Check consult g. Call it before the Filter is in use.
func (f *Filter) SetGroups(g Groups) { f.groups = g }

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
	if !ok && f.groups != nil {
		r.Group, r.Bundle, rule, ok = f.groups.Match(domain)
		r.Reason = ReasonGroup
	}
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

// AddCustom blocks domain and its subdomains. A name without a dot, such as
// "instagram", is a keyword and blocks every domain that contains it.
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
# subdomains, so instagram.com covers www.instagram.com. A word without a dot
# is a keyword: instagram blocks every domain containing "instagram".
`

const allowHeader = `# Always-allowed sites. These are never blocked, even if a blocklist
# contains them. Managed by the adblocker web interface.
`

// editable is a list the user changes at runtime, persisted to a file.
type editable struct {
	list     *blocklist.List
	path     string
	prefix   string // written before each domain, e.g. "0.0.0.0 "
	header   string
	keywords bool // names without a dot are keywords

	mu sync.Mutex // serializes changes and file writes
}

func (e *editable) load() error {
	if e.path == "" {
		return nil
	}
	if _, err := e.list.Load(e.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("loading %s: %w", e.path, err)
	}
	if e.keywords {
		// The file stores keywords like domains; Load read them as domains.
		for _, d := range e.list.Domains() {
			if !strings.Contains(d, ".") {
				e.list.Remove(d)
				e.list.AddKeyword(d)
			}
		}
	}
	return nil
}

func (e *editable) add(domain string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.keywords {
		if err := e.list.AddEntry(domain); err != nil {
			return err
		}
	} else {
		if !blocklist.Valid(domain) {
			return ErrInvalidDomain
		}
		e.list.Add(domain)
	}
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
