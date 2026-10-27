package sysdns

import (
	"reflect"
	"testing"
)

type fakeSystem struct {
	admin   bool
	ads     []Adapter
	applied []change
	saved   map[string]string // Wi-Fi network -> saved DNS server
}

func (f *fakeSystem) clearSaved(server string) (int, error) {
	n := 0
	for net, s := range f.saved {
		if s == server {
			delete(f.saved, net)
			n++
		}
	}
	return n, nil
}

func (f *fakeSystem) isAdmin() bool                { return f.admin }
func (f *fakeSystem) adapters() ([]Adapter, error) { return f.ads, nil }
func (f *fakeSystem) apply(c []change) error {
	f.applied = append(f.applied, c...)
	for _, ch := range c {
		for i := range f.ads {
			if f.ads[i].Index == ch.Index {
				f.ads[i].Servers = ch.Servers
			}
		}
	}
	return nil
}

func newFake(admin bool) (*Controller, *fakeSystem) {
	f := &fakeSystem{admin: admin, ads: []Adapter{
		{Index: 1, Name: "Wi-Fi", Up: true, Servers: []string{"192.168.0.1"}},
		{Index: 2, Name: "Ethernet", Up: false, Servers: []string{"192.168.0.1"}},
	}}
	return &Controller{sys: f, server: "127.0.0.1", fallback: "1.1.1.1"}, f
}

func TestOnOff(t *testing.T) {
	c, f := newFake(true)

	st, _ := c.Status()
	if st.Enabled || len(st.Adapters) != 1 || st.Adapters[0].Name != "Wi-Fi" {
		t.Fatalf("initial status = %+v", st)
	}

	if err := c.Set(true); err != nil {
		t.Fatal(err)
	}
	// Only the connected adapter is changed, and its router stays as backup.
	if want := []change{{1, []string{"127.0.0.1", "192.168.0.1"}}}; !reflect.DeepEqual(f.applied, want) {
		t.Errorf("on: applied %v, want %v", f.applied, want)
	}
	if st, _ := c.Status(); !st.Enabled {
		t.Errorf("after on: %+v", st)
	}

	f.applied = nil
	if changed, err := c.Restore(); err != nil || !changed {
		t.Errorf("Restore = %v, %v", changed, err)
	}
	if want := []change{{1, nil}}; !reflect.DeepEqual(f.applied, want) {
		t.Errorf("restore: applied %v, want %v", f.applied, want)
	}
	if changed, _ := c.Restore(); changed {
		t.Error("second Restore changed something")
	}
}

func TestOnAddsMissingBackup(t *testing.T) {
	c, f := newFake(true)
	f.ads[0].Servers = []string{"127.0.0.1"} // set up by hand, no backup
	if err := c.Set(true); err != nil {
		t.Fatal(err)
	}
	if want := []change{{1, []string{"127.0.0.1", "1.1.1.1"}}}; !reflect.DeepEqual(f.applied, want) {
		t.Errorf("applied %v, want %v", f.applied, want)
	}
}

func TestAlwaysHasBackup(t *testing.T) {
	c, _ := newFake(true)
	tests := []struct {
		current, want []string
	}{
		{[]string{"192.168.0.1"}, []string{"127.0.0.1", "192.168.0.1"}},
		{[]string{"192.168.0.1", "8.8.8.8"}, []string{"127.0.0.1", "192.168.0.1", "8.8.8.8"}},
		{nil, []string{"127.0.0.1", "1.1.1.1"}},
		{[]string{"127.0.0.1"}, []string{"127.0.0.1", "1.1.1.1"}},
	}
	for _, tt := range tests {
		if got := c.withBackups(tt.current); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("withBackups(%v) = %v, want %v", tt.current, got, tt.want)
		}
	}
}

func TestRestoreClearsOtherNetworks(t *testing.T) {
	// Protection was turned on at home, then the laptop moved to another
	// Wi-Fi: the current adapter is fine, but home's saved setting is not.
	c, f := newFake(true)
	f.saved = map[string]string{"Barcelona": "127.0.0.1", "Office": "10.0.0.1"}

	if changed, err := c.Restore(); err != nil || !changed {
		t.Errorf("Restore = %v, %v; want true, nil", changed, err)
	}
	if _, ok := f.saved["Barcelona"]; ok {
		t.Error("saved setting for Barcelona still points at JoK")
	}
	if f.saved["Office"] != "10.0.0.1" {
		t.Error("unrelated saved setting was changed")
	}
	if f.applied != nil {
		t.Errorf("current adapter changed unnecessarily: %v", f.applied)
	}
}

func TestNotAdmin(t *testing.T) {
	c, f := newFake(false)
	if err := c.Set(true); err != ErrNotAdmin {
		t.Errorf("Set = %v, want ErrNotAdmin", err)
	}
	if st, _ := c.Status(); st.Admin || st.Message == "" {
		t.Errorf("status = %+v", st)
	}
	if changed, _ := c.Restore(); changed || f.applied != nil {
		t.Error("Restore changed settings without admin rights")
	}
}

func TestServerFor(t *testing.T) {
	tests := []struct{ listen, server string }{
		{"127.0.0.1:53", "127.0.0.1"},
		{":53", "127.0.0.1"},
		{"0.0.0.0:53", "127.0.0.1"},
		{"192.168.0.5:53", "192.168.0.5"},
		{"127.0.0.1:15353", ""},
		{"[::1]:53", ""},
	}
	for _, tt := range tests {
		if got, _ := serverFor(tt.listen); got != tt.server {
			t.Errorf("serverFor(%q) = %q, want %q", tt.listen, got, tt.server)
		}
	}
}
