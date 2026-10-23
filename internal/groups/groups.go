// Package groups manages block groups: built-in categories (social media,
// gaming, ...) the user switches on or off, the user's own named groups of
// domains and keywords, and bundles that switch several groups on at once.
// Choices are saved to a JSON file.
package groups

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"adblocker/internal/blocklist"
)

const maxNameLen = 50

var (
	ErrNoGroup     = errors.New("no such group")
	ErrNoBundle    = errors.New("no such bundle")
	ErrNotFound    = errors.New("entry is not in the group")
	ErrBuiltin     = errors.New("built-in categories can only be switched on or off")
	ErrInvalidName = fmt.Errorf("give it a name of up to %d characters", maxNameLen)
	ErrDownload    = errors.New("could not download the list")
)

// Group describes a group for the web interface.
type Group struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Builtin     bool     `json:"builtin"`
	Enabled     bool     `json:"enabled"`             // the group's own switch
	BlockedBy   string   `json:"blockedBy,omitempty"` // a switched-on bundle that blocks it
	Entries     []string `json:"entries"`             // listed domains and keywords, sorted
	Size        int      `json:"size"`                // entries plus downloaded domains
	Error       string   `json:"error,omitempty"`
}

type group struct {
	id, name, description string
	builtin               bool
	enabled               bool
	source                string          // list to download, "" if none
	entries               *blocklist.List // listed domains and keywords
	downloaded            *blocklist.List // nil until source is loaded
	err                   string          // last download error
	via                   string          // name of an enabled bundle containing it
}

// active reports whether the group blocks: its own switch or a bundle.
func (g *group) active() bool { return g.enabled || g.via != "" }

// Manager is safe for concurrent use.
type Manager struct {
	path string

	mu      sync.RWMutex // guards groups, bundles and their fields, and file writes
	groups  []*group     // categories first, then the user's groups
	bundles []*bundle
}

// New loads the saved choices from path ("" keeps everything in memory) and
// downloads the lists of active categories. A failed download leaves the
// category on with only its listed entries; Group.Error says why.
func New(path string) (*Manager, error) {
	return newManager(path, Categories)
}

func newManager(path string, categories []Category) (*Manager, error) {
	m := &Manager{path: path}
	for _, c := range categories {
		g := &group{id: c.ID, name: c.Name, description: c.Description, builtin: true, source: c.Source, entries: blocklist.New()}
		for _, e := range c.Entries {
			if err := g.entries.AddEntry(e); err != nil {
				return nil, fmt.Errorf("category %s: %q: %w", c.ID, e, err)
			}
		}
		m.groups = append(m.groups, g)
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	m.refresh()
	for _, g := range m.groups {
		if g.active() && g.source != "" {
			list, err := download(g.source)
			if err != nil {
				g.err = err.Error()
				continue
			}
			g.downloaded = list
		}
	}
	return m, nil
}

// Match returns the active group that blocks domain, the bundle that
// switched it on ("" if its own switch did) and the entry that matched.
func (m *Manager) Match(domain string) (group, bundle, rule string, ok bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, g := range m.groups {
		if !g.active() {
			continue
		}
		bundle := g.via
		if g.enabled {
			bundle = ""
		}
		if rule, ok := g.entries.Match(domain); ok {
			return g.name, bundle, rule, true
		}
		if g.downloaded != nil {
			if rule, ok := g.downloaded.Match(domain); ok {
				return g.name, bundle, rule, true
			}
		}
	}
	return "", "", "", false
}

// List returns every group: categories first, then the user's groups in the
// order they were made.
func (m *Manager) List() []Group {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Group, len(m.groups))
	for i, g := range m.groups {
		out[i] = g.info()
	}
	return out
}

// SetEnabled switches a group on or off. Switching on a category with a
// downloadable list fetches it first if needed; if that fails the category
// stays off and the error wraps ErrDownload.
func (m *Manager) SetEnabled(id string, on bool) (Group, error) {
	m.mu.RLock()
	g := m.find(id)
	m.mu.RUnlock()
	if g == nil {
		return Group{}, ErrNoGroup
	}
	if on {
		if err := m.fetchLists([]*group{g}); err != nil {
			return Group{}, err
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	g.enabled = on
	return g.info(), m.save()
}

// fetchLists downloads the lists of gs that have a source but no list yet. It
// runs without the lock, so blocking keeps working meanwhile. On failure the
// group's error is recorded and the error wraps ErrDownload.
func (m *Manager) fetchLists(gs []*group) error {
	for _, g := range gs {
		m.mu.RLock()
		need := g.source != "" && g.downloaded == nil
		m.mu.RUnlock()
		if !need {
			continue
		}
		list, err := download(g.source)
		m.mu.Lock()
		if err != nil {
			g.err = err.Error()
		} else {
			g.downloaded, g.err = list, ""
		}
		m.mu.Unlock()
		if err != nil {
			return fmt.Errorf("%w for %s: %v", ErrDownload, g.name, err)
		}
	}
	return nil
}

// Create adds a user group, switched on, with the given entries.
func (m *Manager) Create(name string, entries []string) (Group, error) {
	name, err := cleanName(name)
	if err != nil {
		return Group{}, err
	}
	g := &group{id: newID(), name: name, enabled: true, entries: blocklist.New()}
	for _, e := range entries {
		if err := g.entries.AddEntry(e); err != nil {
			return Group{}, fmt.Errorf("%s: %w", e, err)
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.groups = append(m.groups, g)
	return g.info(), m.save()
}

// Rename changes a user group's name.
func (m *Manager) Rename(id, name string) (Group, error) {
	name, err := cleanName(name)
	if err != nil {
		return Group{}, err
	}
	return m.change(id, func(g *group) error {
		g.name = name
		return nil
	})
}

// AddEntry adds a domain or keyword to a user group.
func (m *Manager) AddEntry(id, entry string) (Group, error) {
	return m.change(id, func(g *group) error { return g.entries.AddEntry(entry) })
}

// RemoveEntry removes a domain or keyword from a user group.
func (m *Manager) RemoveEntry(id, entry string) (Group, error) {
	return m.change(id, func(g *group) error {
		if !g.entries.Remove(entry) {
			return ErrNotFound
		}
		return nil
	})
}

// Delete removes a user group.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, g := range m.groups {
		if g.id != id {
			continue
		}
		if g.builtin {
			return ErrBuiltin
		}
		m.groups = append(m.groups[:i], m.groups[i+1:]...)
		for _, b := range m.bundles {
			b.remove(id)
		}
		return m.save()
	}
	return ErrNoGroup
}

// change applies fn to a user group and saves.
func (m *Manager) change(id string, fn func(*group) error) (Group, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	g := m.find(id)
	switch {
	case g == nil:
		return Group{}, ErrNoGroup
	case g.builtin:
		return Group{}, ErrBuiltin
	}
	if err := fn(g); err != nil {
		return Group{}, err
	}
	return g.info(), m.save()
}

func (m *Manager) find(id string) *group {
	for _, g := range m.groups {
		if g.id == id {
			return g
		}
	}
	return nil
}

func (g *group) info() Group {
	size := g.entries.Len()
	if g.downloaded != nil {
		size += g.downloaded.Len()
	}
	return Group{
		ID:          g.id,
		Name:        g.name,
		Description: g.description,
		Builtin:     g.builtin,
		Enabled:     g.enabled,
		BlockedBy:   g.via,
		Entries:     g.entries.Domains(),
		Size:        size,
		Error:       g.err,
	}
}

func cleanName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" || len([]rune(name)) > maxNameLen {
		return "", ErrInvalidName
	}
	return name, nil
}

func newID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return "g" + hex.EncodeToString(b)
}

func download(src string) (*blocklist.List, error) {
	l := blocklist.New()
	if _, err := l.Load(src); err != nil {
		return nil, err
	}
	return l, nil
}

// --- saving ---

// saved is the file format: which categories are on, the user's groups and
// bundles.
type saved struct {
	Categories []string      `json:"categories"`
	Groups     []savedGroup  `json:"groups"`
	Bundles    []savedBundle `json:"bundles"`
}

type savedGroup struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Enabled bool     `json:"enabled"`
	Entries []string `json:"entries"`
}

type savedBundle struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Enabled bool     `json:"enabled"`
	Groups  []string `json:"groups"`
}

func (m *Manager) load() error {
	if m.path == "" {
		return nil
	}
	b, err := os.ReadFile(m.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var s saved
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("reading %s: %w", m.path, err)
	}
	for _, id := range s.Categories {
		if g := m.find(id); g != nil && g.builtin {
			g.enabled = true
		}
	}
	for _, sg := range s.Groups {
		if sg.ID == "" || m.find(sg.ID) != nil {
			continue
		}
		g := &group{id: sg.ID, name: sg.Name, enabled: sg.Enabled, entries: blocklist.New()}
		for _, e := range sg.Entries {
			g.entries.AddEntry(e) // skip entries edited into something invalid
		}
		m.groups = append(m.groups, g)
	}
	for _, sb := range s.Bundles {
		if sb.ID == "" || m.findBundle(sb.ID) != nil {
			continue
		}
		b := &bundle{id: sb.ID, name: sb.Name, enabled: sb.Enabled}
		for _, id := range sb.Groups {
			if m.find(id) != nil {
				b.add(id) // skip groups deleted by hand
			}
		}
		m.bundles = append(m.bundles, b)
	}
	return nil
}

// save writes the file atomically (temp file + rename) and refreshes which
// groups bundles switch on. Callers hold m.mu.
func (m *Manager) save() error {
	m.refresh()
	if m.path == "" {
		return nil
	}
	s := saved{Categories: []string{}, Groups: []savedGroup{}, Bundles: []savedBundle{}}
	for _, g := range m.groups {
		switch {
		case g.builtin && g.enabled:
			s.Categories = append(s.Categories, g.id)
		case !g.builtin:
			s.Groups = append(s.Groups, savedGroup{ID: g.id, Name: g.name, Enabled: g.enabled, Entries: g.entries.Domains()})
		}
	}
	for _, b := range m.bundles {
		s.Bundles = append(s.Bundles, savedBundle{ID: b.id, Name: b.name, Enabled: b.enabled, Groups: b.groups})
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".adblocker-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(b, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), m.path)
}
