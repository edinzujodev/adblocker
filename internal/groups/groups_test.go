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
	if _, _, _, ok := m.Match("www.instagram.com"); ok {
		t.Error("blocked while the category is off")
	}

	if _, err := m.SetEnabled("social", true); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{"www.instagram.com", "scontent.cdninstagram.com", "api.x.com"} {
		if g, _, _, ok := m.Match(d); !ok || g != "Social media" {
			t.Errorf("Match(%q) = %q, %v", d, g, ok)
		}
	}
	if _, _, _, ok := m.Match("example.com"); ok {
		t.Error("example.com blocked")
	}

	g, err := m.SetEnabled("gambling", true)
	if err != nil {
		t.Fatal(err)
	}
	if g.Size != 2 {
		t.Errorf("gambling size = %d, want 2", g.Size)
	}
	if name, _, rule, ok := m.Match("www.casino.example"); !ok || name != "Gambling" || rule != "casino.example" {
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
	if name, _, _, ok := m.Match("www.roblox.com"); !ok || name != "Homework time" {
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
	if _, _, _, ok := m.Match("roblox.com"); ok {
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

func TestBundles(t *testing.T) {
	m, path := testManager(t)
	homework, err := m.Create("Homework", []string{"roblox"})
	if err != nil {
		t.Fatal(err)
	}
	m.SetEnabled(homework.ID, false)
	m.SetEnabled("social", true) // on by its own switch too

	b, err := m.CreateBundle("Kids mode", []string{"social", "gambling", homework.ID})
	if err != nil {
		t.Fatal(err)
	}
	if b.Enabled || len(b.Groups) != 3 {
		t.Errorf("created %+v", b)
	}
	if _, _, _, ok := m.Match("www.roblox.com"); ok {
		t.Error("blocked while the bundle is off")
	}

	// Switching the bundle on blocks its groups and downloads gambling's list.
	if _, err := m.SetBundleEnabled(b.ID, true); err != nil {
		t.Fatal(err)
	}
	if g, via, _, ok := m.Match("www.roblox.com"); !ok || g != "Homework" || via != "Kids mode" {
		t.Errorf("Match(roblox) = %q via %q, %v", g, via, ok)
	}
	if g, via, _, ok := m.Match("casino.example"); !ok || g != "Gambling" || via != "Kids mode" {
		t.Errorf("Match(casino) = %q via %q, %v", g, via, ok)
	}
	if _, via, _, _ := m.Match("instagram.com"); via != "" {
		t.Errorf("social is on by its own switch, but via = %q", via)
	}
	for _, g := range m.List() {
		if g.ID == "gambling" && (g.Enabled || g.BlockedBy != "Kids mode") {
			t.Errorf("gambling = %+v, want own switch off, blocked by Kids mode", g)
		}
	}

	// Switching it off leaves the groups' own switches alone.
	m.SetBundleEnabled(b.ID, false)
	if _, _, _, ok := m.Match("roblox.com"); ok {
		t.Error("roblox still blocked after the bundle went off")
	}
	if _, _, _, ok := m.Match("instagram.com"); !ok {
		t.Error("social's own switch was changed by the bundle")
	}

	// A bundle can't be switched on if a list it needs won't download.
	if _, err := m.SetBundleGroups(b.ID, []string{"broken"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.SetBundleEnabled(b.ID, true); !errors.Is(err, ErrDownload) {
		t.Errorf("broken bundle: err = %v", err)
	}
	if _, err := m.SetBundleGroups(b.ID, []string{"nope"}); err != ErrNoGroup {
		t.Errorf("unknown group: err = %v", err)
	}
	if _, err := m.SetBundleGroups(b.ID, []string{homework.ID, "social"}); err != nil {
		t.Fatal(err)
	}
	m.SetBundleEnabled(b.ID, true)
	m.RenameBundle(b.ID, "School")

	// Deleting a group takes it out of bundles; everything survives a reload.
	if err := m.Delete(homework.ID); err != nil {
		t.Fatal(err)
	}
	again, err := newManager(path, []Category{{ID: "social", Name: "Social media", Entries: []string{"instagram"}}})
	if err != nil {
		t.Fatal(err)
	}
	bs := again.Bundles()
	if len(bs) != 1 || bs[0].Name != "School" || !bs[0].Enabled || len(bs[0].Groups) != 1 || bs[0].Groups[0] != "social" {
		t.Fatalf("reloaded bundles = %+v", bs)
	}
	if err := again.DeleteBundle(bs[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := again.DeleteBundle(bs[0].ID); err != ErrNoBundle {
		t.Errorf("delete twice: err = %v", err)
	}
}
