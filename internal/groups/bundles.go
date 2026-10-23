package groups

import "slices"

// Bundle describes a bundle for the web interface.
type Bundle struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Enabled bool     `json:"enabled"`
	Groups  []string `json:"groups"` // group IDs, in the order they were added
}

// bundle is a named set of groups. While it is enabled, every group in it
// blocks, whatever the group's own switch says; switching the bundle off
// leaves the groups' own switches as they were.
type bundle struct {
	id, name string
	enabled  bool
	groups   []string
}

func (b *bundle) add(id string) {
	if !slices.Contains(b.groups, id) {
		b.groups = append(b.groups, id)
	}
}

func (b *bundle) remove(id string) {
	b.groups = slices.DeleteFunc(b.groups, func(g string) bool { return g == id })
}

func (b *bundle) info() Bundle {
	return Bundle{ID: b.id, Name: b.name, Enabled: b.enabled, Groups: slices.Clone(b.groups)}
}

// Bundles returns every bundle in the order they were made.
func (m *Manager) Bundles() []Bundle {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Bundle, len(m.bundles))
	for i, b := range m.bundles {
		out[i] = b.info()
	}
	return out
}

// CreateBundle adds a bundle, switched off, holding the given groups.
func (m *Manager) CreateBundle(name string, groupIDs []string) (Bundle, error) {
	name, err := cleanName(name)
	if err != nil {
		return Bundle{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	b := &bundle{id: "b" + newID()[1:], name: name}
	for _, id := range groupIDs {
		if m.find(id) == nil {
			return Bundle{}, ErrNoGroup
		}
		b.add(id)
	}
	m.bundles = append(m.bundles, b)
	return b.info(), m.save()
}

// RenameBundle changes a bundle's name.
func (m *Manager) RenameBundle(id, name string) (Bundle, error) {
	name, err := cleanName(name)
	if err != nil {
		return Bundle{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	b := m.findBundle(id)
	if b == nil {
		return Bundle{}, ErrNoBundle
	}
	b.name = name
	return b.info(), m.save()
}

// SetBundleEnabled switches a bundle on or off. Switching on first downloads
// the lists its categories need; if that fails the bundle stays off and the
// error wraps ErrDownload.
func (m *Manager) SetBundleEnabled(id string, on bool) (Bundle, error) {
	m.mu.RLock()
	b := m.findBundle(id)
	var members []*group
	if b != nil {
		members = m.members(b.groups)
	}
	m.mu.RUnlock()
	if b == nil {
		return Bundle{}, ErrNoBundle
	}
	if on {
		if err := m.fetchLists(members); err != nil {
			return Bundle{}, err
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	b.enabled = on
	return b.info(), m.save()
}

// SetBundleGroups replaces the groups in a bundle. If the bundle is on, the
// lists of newly added categories are downloaded first.
func (m *Manager) SetBundleGroups(id string, groupIDs []string) (Bundle, error) {
	m.mu.RLock()
	b := m.findBundle(id)
	members := m.members(groupIDs)
	missing := len(members) != len(groupIDs)
	on := b != nil && b.enabled
	m.mu.RUnlock()
	switch {
	case b == nil:
		return Bundle{}, ErrNoBundle
	case missing:
		return Bundle{}, ErrNoGroup
	}
	if on {
		if err := m.fetchLists(members); err != nil {
			return Bundle{}, err
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	b.groups = nil
	for _, id := range groupIDs {
		if m.find(id) != nil { // may have been deleted meanwhile
			b.add(id)
		}
	}
	return b.info(), m.save()
}

// DeleteBundle removes a bundle. Its groups keep their own switches.
func (m *Manager) DeleteBundle(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	i := slices.IndexFunc(m.bundles, func(b *bundle) bool { return b.id == id })
	if i < 0 {
		return ErrNoBundle
	}
	m.bundles = slices.Delete(m.bundles, i, i+1)
	return m.save()
}

func (m *Manager) findBundle(id string) *bundle {
	for _, b := range m.bundles {
		if b.id == id {
			return b
		}
	}
	return nil
}

// members returns the groups with the given IDs that exist. Callers hold m.mu.
func (m *Manager) members(ids []string) []*group {
	var out []*group
	for _, id := range ids {
		if g := m.find(id); g != nil {
			out = append(out, g)
		}
	}
	return out
}

// refresh records on each group the first enabled bundle that contains it.
// Callers hold m.mu for writing (or are still constructing m).
func (m *Manager) refresh() {
	for _, g := range m.groups {
		g.via = ""
	}
	for _, b := range m.bundles {
		if !b.enabled {
			continue
		}
		for _, g := range m.members(b.groups) {
			if g.via == "" {
				g.via = b.name
			}
		}
	}
}
