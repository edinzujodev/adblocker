// Package blocklist parses hosts-format blocklists and answers whether a
// domain (or any of its parent domains) is blocked.
package blocklist

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// hostnames that appear in most hosts files but must never be blocked.
var ignored = map[string]bool{
	"localhost":             true,
	"localhost.localdomain": true,
	"local":                 true,
	"broadcasthost":         true,
	"ip6-localhost":         true,
	"ip6-loopback":          true,
	"ip6-localnet":          true,
	"ip6-mcastprefix":       true,
	"ip6-allnodes":          true,
	"ip6-allrouters":        true,
	"ip6-allhosts":          true,
	"0.0.0.0":               true,
}

// List is a set of blocked domains. It is safe for concurrent use.
type List struct {
	mu      sync.RWMutex
	domains map[string]struct{}
}

// New returns an empty list.
func New() *List {
	return &List{domains: make(map[string]struct{})}
}

// Normalize lowercases a domain and strips a trailing dot.
func Normalize(d string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(d)), ".")
}

// Add blocks a single domain (and therefore its subdomains). It returns false
// for empty or always-allowed names such as localhost.
func (l *List) Add(domain string) bool {
	d := Normalize(domain)
	if d == "" || ignored[d] {
		return false
	}
	l.mu.Lock()
	l.domains[d] = struct{}{}
	l.mu.Unlock()
	return true
}

// Len returns the number of blocked domains.
func (l *List) Len() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.domains)
}

// IsBlocked reports whether domain or any parent domain is in the list.
// For "a.b.example.com" it checks a.b.example.com, b.example.com,
// example.com and com.
func (l *List) IsBlocked(domain string) bool {
	d := Normalize(domain)
	l.mu.RLock()
	defer l.mu.RUnlock()
	for d != "" {
		if _, ok := l.domains[d]; ok {
			return true
		}
		i := strings.IndexByte(d, '.')
		if i < 0 {
			break
		}
		d = d[i+1:]
	}
	return false
}

// Parse reads a hosts-format (or plain one-domain-per-line) list and adds
// every domain to l. It returns the number of entries read.
//
// Accepted lines:
//
//	0.0.0.0 ads.example.com
//	127.0.0.1 ads.example.com tracker.example.com  # comment
//	ads.example.com
func (l *List) Parse(r io.Reader) (int, error) {
	n := 0
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if i := strings.IndexByte(line, '#'); i >= 0 {
			line = line[:i]
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		hosts := fields
		if isIP(fields[0]) {
			hosts = fields[1:]
		}
		for _, h := range hosts {
			if !validDomain(h) {
				continue
			}
			if l.Add(h) {
				n++
			}
		}
	}
	return n, sc.Err()
}

// Load reads a blocklist from a local file path or an http(s) URL.
func (l *List) Load(source string) (int, error) {
	var r io.ReadCloser
	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		client := &http.Client{Timeout: 60 * time.Second}
		resp, err := client.Get(source)
		if err != nil {
			return 0, err
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return 0, fmt.Errorf("fetching %s: %s", source, resp.Status)
		}
		r = resp.Body
	} else {
		f, err := os.Open(source)
		if err != nil {
			return 0, err
		}
		r = f
	}
	defer r.Close()
	return l.Parse(r)
}

func isIP(s string) bool {
	// Cheap check: hosts-file addresses are IPv4 dotted quads or contain ':'.
	if strings.Contains(s, ":") {
		return true
	}
	if strings.Count(s, ".") != 3 {
		return false
	}
	for _, c := range s {
		if c != '.' && (c < '0' || c > '9') {
			return false
		}
	}
	return true
}

func validDomain(s string) bool {
	if s == "" || len(s) > 253 || isIP(s) {
		return false
	}
	for _, c := range s {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-', c == '.', c == '_':
		default:
			return false
		}
	}
	return true
}
