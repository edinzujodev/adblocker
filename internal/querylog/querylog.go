// Package querylog keeps the most recent DNS queries in memory, plus running
// totals, for the web interface.
package querylog

import (
	"sort"
	"sync"
	"time"
)

// Entry is one answered DNS query.
type Entry struct {
	Time    time.Time `json:"time"`
	Client  string    `json:"client"`
	Type    string    `json:"type"`
	Domain  string    `json:"domain"`
	Blocked bool      `json:"blocked"`
}

// Stats are totals since the server started.
type Stats struct {
	Total   uint64 `json:"total"`
	Blocked uint64 `json:"blocked"`
}

// DomainCount is a domain and how many times it was blocked.
type DomainCount struct {
	Domain string `json:"domain"`
	Count  uint64 `json:"count"`
}

// Log is a fixed-size ring of recent entries. It is safe for concurrent use.
type Log struct {
	mu      sync.Mutex
	ring    []Entry
	next    int
	full    bool
	stats   Stats
	blocked map[string]uint64 // per-domain block counts
}

// New returns a Log that keeps the last size entries.
func New(size int) *Log {
	return &Log{ring: make([]Entry, size), blocked: make(map[string]uint64)}
}

// Add records e.
func (l *Log) Add(e Entry) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.ring[l.next] = e
	l.next = (l.next + 1) % len(l.ring)
	if l.next == 0 {
		l.full = true
	}
	l.stats.Total++
	if e.Blocked {
		l.stats.Blocked++
		l.blocked[e.Domain]++
	}
}

// Recent returns up to n entries, newest first. With blockedOnly it skips
// allowed queries.
func (l *Log) Recent(n int, blockedOnly bool) []Entry {
	l.mu.Lock()
	defer l.mu.Unlock()
	size := l.next
	if l.full {
		size = len(l.ring)
	}
	out := make([]Entry, 0, min(n, size))
	for i := 1; i <= size && len(out) < n; i++ {
		e := l.ring[(l.next-i+len(l.ring))%len(l.ring)]
		if blockedOnly && !e.Blocked {
			continue
		}
		out = append(out, e)
	}
	return out
}

// Stats returns totals since start.
func (l *Log) Stats() Stats {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.stats
}

// TopBlocked returns the n most blocked domains, most blocked first.
func (l *Log) TopBlocked(n int) []DomainCount {
	l.mu.Lock()
	out := make([]DomainCount, 0, len(l.blocked))
	for d, c := range l.blocked {
		out = append(out, DomainCount{d, c})
	}
	l.mu.Unlock()
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Domain < out[j].Domain
	})
	return out[:min(n, len(out))]
}
