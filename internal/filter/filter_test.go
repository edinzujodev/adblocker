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
	for _, d := range []string{"1.2.3.4", "bad domain.com", "a..b.com"} {
		if err := f.AddCustom(d); err != ErrInvalidDomain {
			t.Errorf("AddCustom(%q) = %v, want ErrInvalidDomain", d, err)
		}
	}
	// Names without a dot are keywords.
	for _, d := range []string{"", "com", "localhost", "bad word"} {
		if err := f.AddCustom(d); err != ErrInvalidKeyword {
			t.Errorf("AddCustom(%q) = %v, want ErrInvalidKeyword", d, err)
		}
	}
	if err := f.RemoveAllowed("nope.com"); err != ErrNotFound {
		t.Errorf("RemoveAllowed = %v, want ErrNotFound", err)
	}
}

func TestKeywords(t *testing.T) {
	f, custom, allow := newFilter(t)
	if err := f.AddCustom("Instagram"); err != nil {
		t.Fatal(err)
	}
	if err := f.AddCustom("fb"); err != ErrInvalidKeyword {
		t.Errorf("AddCustom(fb) = %v, want ErrInvalidKeyword", err)
	}
	if err := f.AddAllowed("instagram"); err != ErrInvalidDomain {
		t.Errorf("AddAllowed(instagram) = %v, want ErrInvalidDomain", err)
	}
	if err := f.AddAllowed("help.instagram.net"); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		domain  string
		blocked bool
	}{
		{"instagram.com", true},
		{"www.instagram.com", true},
		{"scontent.cdninstagram.com", true},
		{"instagram.de", true},
		{"help.instagram.net", false}, // allowlist wins
		{"example.com", false},
	}
	for _, tt := range tests {
		if r := f.Check(tt.domain); r.Blocked != tt.blocked {
			t.Errorf("Check(%q) = %+v, want blocked=%v", tt.domain, r, tt.blocked)
		}
	}

	again, err := New(blocklist.New(), custom, allow)
	if err != nil {
		t.Fatal(err)
	}
	if r := again.Check("cdninstagram.com"); !r.Blocked || r.Rule != "instagram" {
		t.Errorf("after reload: %+v", r)
	}
	if err := again.RemoveCustom("instagram"); err != nil {
		t.Fatal(err)
	}
	if r := again.Check("instagram.com"); r.Blocked {
		t.Errorf("after remove: %+v", r)
	}
}
