package querylog

import (
	"fmt"
	"testing"
)

func TestRingAndStats(t *testing.T) {
	l := New(3)
	for i := range 5 {
		l.Add(Entry{Domain: fmt.Sprintf("d%d.com", i), Blocked: i%2 == 0})
	}

	got := l.Recent(10, false)
	want := []string{"d4.com", "d3.com", "d2.com"}
	if len(got) != len(want) {
		t.Fatalf("Recent = %v, want %v", got, want)
	}
	for i := range want {
		if got[i].Domain != want[i] {
			t.Errorf("Recent[%d] = %s, want %s", i, got[i].Domain, want[i])
		}
	}

	if b := l.Recent(10, true); len(b) != 2 || b[0].Domain != "d4.com" || b[1].Domain != "d2.com" {
		t.Errorf("Recent blocked = %v", b)
	}
	if st := l.Stats(); st.Total != 5 || st.Blocked != 3 {
		t.Errorf("Stats = %+v", st)
	}
}

func TestTopBlocked(t *testing.T) {
	l := New(10)
	for _, d := range []string{"a.com", "b.com", "b.com", "c.com", "b.com", "a.com"} {
		l.Add(Entry{Domain: d, Blocked: true})
	}
	l.Add(Entry{Domain: "allowed.com"})

	top := l.TopBlocked(2)
	if len(top) != 2 || top[0] != (DomainCount{"b.com", 3}) || top[1] != (DomainCount{"a.com", 2}) {
		t.Errorf("TopBlocked = %v", top)
	}
}
