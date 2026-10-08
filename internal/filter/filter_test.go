package filter

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"adblocker/internal/blocklist"
)

func newFilter(t *testing.T) (*Filter, string, string) {
	t.Helper()
	dir := t.TempDir()
	custom := filepath.Join(dir, "custom.txt")
	allow := filepath.Join(dir, "allow.txt")
	lists := blocklist.New()
	lists.Add("doubleclick.net")
	f, err := New(lists, custom, allow)
	if err != nil {
		t.Fatal(err)
	}
	return f, custom, allow
}

func TestCheck(t *testing.T) {
	f, _, _ := newFilter(t)
	if err := f.AddCustom("instagram.com"); err != nil {
		t.Fatal(err)
	}
	if err := f.AddAllowed("good.doubleclick.net"); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		domain  string
		blocked bool
		reason  string
		rule    string
	}{
		{"ad.doubleclick.net.", true, ReasonBlocklist, "doubleclick.net"},
		{"www.instagram.com", true, ReasonCustom, "instagram.com"},
		{"x.good.doubleclick.net", false, ReasonAllowlist, "good.doubleclick.net"},
		{"example.com", false, ReasonNotListed, ""},
	}
	for _, tt := range tests {
		r := f.Check(tt.domain)
		if r.Blocked != tt.blocked || r.Reason != tt.reason || r.Rule != tt.rule {
			t.Errorf("Check(%q) = %+v, want blocked=%v reason=%s rule=%s", tt.domain, r, tt.blocked, tt.reason, tt.rule)
		}
	}

	f.SetEnabled(false)
	if r := f.Check("ad.doubleclick.net"); r.Blocked || r.Reason != ReasonDisabled {
		t.Errorf("disabled: got %+v", r)
	}
}

func TestEditsPersist(t *testing.T) {
	f, custom, allow := newFilter(t)
	for _, d := range []string{"tiktok.com", "Instagram.com"} {
		if err := f.AddCustom(d); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.AddAllowed("example.org"); err != nil {
		t.Fatal(err)
	}
	if err := f.RemoveCustom("tiktok.com"); err != nil {
		t.Fatal(err)
	}

	b, _ := os.ReadFile(custom)
	if !strings.Contains(string(b), "0.0.0.0 instagram.com\n") || strings.Contains(string(b), "tiktok") {
		t.Errorf("custom file:\n%s", b)
	}

	// A new Filter reads the same files back.
	again, err := New(blocklist.New(), custom, allow)
	if err != nil {
		t.Fatal(err)
	}
	if got := again.Custom(); len(got) != 1 || got[0] != "instagram.com" {
		t.Errorf("reloaded custom = %v", got)
	}
	if got := again.Allowed(); len(got) != 1 || got[0] != "example.org" {
		t.Errorf("reloaded allowlist = %v", got)
	}
}

func TestInvalidAndMissing(t *testing.T) {
	f, _, _ := newFilter(t)
	for _, d := range []string{"", "com", "localhost", "1.2.3.4", "bad domain.com", "a..b.com"} {
		if err := f.AddCustom(d); err != ErrInvalidDomain {
			t.Errorf("AddCustom(%q) = %v, want ErrInvalidDomain", d, err)
		}
	}
	if err := f.RemoveAllowed("nope.com"); err != ErrNotFound {
		t.Errorf("RemoveAllowed = %v, want ErrNotFound", err)
	}
}
