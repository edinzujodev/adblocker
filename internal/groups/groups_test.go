package groups

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func testManager(t *testing.T) (*Manager, string) {
	t.Helper()
	dir := t.TempDir()
	hosts := filepath.Join(dir, "hosts")
	os.WriteFile(hosts, []byte("0.0.0.0 casino.example\n0.0.0.0 bets.example\n"), 0o600)
	cats := []Category{
		{ID: "social", Name: "Social media", Entries: []string{"instagram", "x.com"}},
		{ID: "gambling", Name: "Gambling", Source: hosts},
		{ID: "broken", Name: "Broken", Source: filepath.Join(dir, "missing")},
	}
	path := filepath.Join(dir, "groups.json")
	m, err := newManager(path, cats)
	if err != nil {
		t.Fatal(err)
	}
	return m, path
}

func TestCategories(t *testing.T) {
	m, _ := testManager(t)
	if _, _, ok := m.Match("www.instagram.com"); ok {
		t.Error("blocked while the category is off")
	}

	if _, err := m.SetEnabled("social", true); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{"www.instagram.com", "scontent.cdninstagram.com", "api.x.com"} {
		if g, _, ok := m.Match(d); !ok || g != "Social media" {
			t.Errorf("Match(%q) = %q, %v", d, g, ok)
		}
	}
	if _, _, ok := m.Match("example.com"); ok {
		t.Error("example.com blocked")
	}

	g, err := m.SetEnabled("gambling", true)
	if err != nil {
		t.Fatal(err)
	}
	if g.Size != 2 {
		t.Errorf("gambling size = %d, want 2", g.Size)
	}
	if name, rule, ok := m.Match("www.casino.example"); !ok || name != "Gambling" || rule != "casino.example" {
		t.Errorf("Match(casino) = %q, %q, %v", name, rule, ok)
	}

	if _, err := m.SetEnabled("broken", true); !errors.Is(err, ErrDownload) {
		t.Errorf("broken download: err = %v", err)
	}
	for _, g := range m.List() {
		if g.ID == "broken" && (g.Enabled || g.Error == "") {
			t.Errorf("broken = %+v, want off with an error", g)
		}
	}

	if _, err := m.AddEntry("social", "tiktok"); err != ErrBuiltin {
		t.Errorf("edit category: err = %v", err)
	}
	if err := m.Delete("social"); err != ErrBuiltin {
		t.Errorf("delete category: err = %v", err)
	}
	if _, err := m.SetEnabled("nope", true); err != ErrNoGroup {
		t.Errorf("unknown group: err = %v", err)
	}
}

func TestUserGroups(t *testing.T) {
	m, path := testManager(t)
	g, err := m.Create("  Homework   time ", []string{"roblox", "youtube.com"})
	if err != nil {
		t.Fatal(err)
	}
	if g.Name != "Homework time" || !g.Enabled || len(g.Entries) != 2 {
		t.Errorf("created %+v", g)
	}
	if name, _, ok := m.Match("www.roblox.com"); !ok || name != "Homework time" {
		t.Errorf("Match(roblox) = %q, %v", name, ok)
	}

	if _, err := m.Create(" ", nil); err != ErrInvalidName {
		t.Errorf("empty name: err = %v", err)
	}
	if _, err := m.AddEntry(g.ID, "ab"); err == nil {
		t.Error("short keyword accepted")
	}
	if _, err := m.AddEntry(g.ID, "discord"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.RemoveEntry(g.ID, "youtube.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.RemoveEntry(g.ID, "youtube.com"); err != ErrNotFound {
		t.Errorf("remove twice: err = %v", err)
	}
	if _, err := m.Rename(g.ID, "School"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.SetEnabled(g.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := m.Match("roblox.com"); ok {
		t.Error("blocked while the group is off")
	}
	m.SetEnabled("gambling", true)

	// A new Manager reads the same file back.
	cats := []Category{{ID: "gambling", Name: "Gambling", Entries: []string{"bet365.com"}}}
	again, err := newManager(path, cats)
	if err != nil {
		t.Fatal(err)
	}
	list := again.List()
	if len(list) != 2 || !list[0].Enabled {
		t.Fatalf("reloaded = %+v", list)
	}
	if u := list[1]; u.ID != g.ID || u.Name != "School" || u.Enabled || len(u.Entries) != 2 {
		t.Errorf("reloaded group = %+v", u)
	}

	if err := again.Delete(g.ID); err != nil {
		t.Fatal(err)
	}
	if err := again.Delete(g.ID); err != ErrNoGroup {
		t.Errorf("delete twice: err = %v", err)
	}
}
