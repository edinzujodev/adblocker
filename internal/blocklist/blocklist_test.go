package blocklist

import (
	"strings"
	"testing"
)

const sample = `# StevenBlack style header
127.0.0.1 localhost
127.0.0.1 localhost.localdomain
::1 localhost
0.0.0.0 0.0.0.0

0.0.0.0 doubleclick.net
0.0.0.0 ads.example.com   # trailing comment
127.0.0.1 tracker.one.com tracker.two.com
plain-domain.org
  0.0.0.0   UPPER.Example.NET.
0.0.0.0 bad!domain.com
`

func TestParse(t *testing.T) {
	l := New()
	n, err := l.Parse(strings.NewReader(sample))
	if err != nil {
		t.Fatal(err)
	}
	if n != 6 {
		t.Errorf("entries read = %d, want 6", n)
	}
	if l.Len() != 6 {
		t.Errorf("Len = %d, want 6", l.Len())
	}
	for _, d := range []string{"localhost", "localhost.localdomain", "0.0.0.0", "bad!domain.com"} {
		if l.IsBlocked(d) {
			t.Errorf("%q should not be blocked", d)
		}
	}
}

func TestIsBlocked(t *testing.T) {
	l := New()
	if _, err := l.Parse(strings.NewReader(sample)); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		domain string
		want   bool
	}{
		{"doubleclick.net", true},
		{"doubleclick.net.", true},
		{"DoubleClick.NET", true},
		{"stats.g.doubleclick.net", true},
		{"ads.example.com", true},
		{"x.ads.example.com", true},
		{"example.com", false},
		{"notdoubleclick.net", false},
		{"doubleclick.net.evil.org", false},
		{"tracker.one.com", true},
		{"tracker.two.com", true},
		{"plain-domain.org", true},
		{"upper.example.net", true},
		{"net", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := l.IsBlocked(tt.domain); got != tt.want {
			t.Errorf("IsBlocked(%q) = %v, want %v", tt.domain, got, tt.want)
		}
	}
}
