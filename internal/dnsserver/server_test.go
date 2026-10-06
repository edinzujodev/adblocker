package dnsserver

import (
	"io"
	"log"
	"net"
	"testing"

	"github.com/miekg/dns"

	"adblocker/internal/blocklist"
)

// startServer runs h on a random local UDP port and returns its address.
func startServer(t *testing.T, h dns.Handler) string {
	t.Helper()
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &dns.Server{PacketConn: pc, Handler: h}
	started := make(chan struct{})
	srv.NotifyStartedFunc = func() { close(started) }
	go srv.ActivateAndServe()
	<-started
	t.Cleanup(func() { srv.Shutdown() })
	return pc.LocalAddr().String()
}

func TestBlockedAndForwarded(t *testing.T) {
	// Fake upstream that answers every A query with 93.184.216.34.
	upstream := startServer(t, dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		rr, _ := dns.NewRR(r.Question[0].Name + " 300 IN A 93.184.216.34")
		m.Answer = append(m.Answer, rr)
		w.WriteMsg(m)
	}))

	list := blocklist.New()
	list.Add("doubleclick.net")
	addr := startServer(t, New(list, upstream, log.New(io.Discard, "", 0)))

	query := func(name string, qtype uint16) *dns.Msg {
		m := new(dns.Msg)
		m.SetQuestion(dns.Fqdn(name), qtype)
		resp, err := dns.Exchange(m, addr)
		if err != nil {
			t.Fatalf("query %s: %v", name, err)
		}
		return resp
	}

	if r := query("ad.doubleclick.net", dns.TypeA); len(r.Answer) != 1 || !r.Answer[0].(*dns.A).A.Equal(net.IPv4zero) {
		t.Errorf("blocked A: got %v", r.Answer)
	}
	if r := query("doubleclick.net", dns.TypeAAAA); len(r.Answer) != 1 || !r.Answer[0].(*dns.AAAA).AAAA.Equal(net.IPv6zero) {
		t.Errorf("blocked AAAA: got %v", r.Answer)
	}
	if r := query("example.com", dns.TypeA); len(r.Answer) != 1 || r.Answer[0].(*dns.A).A.String() != "93.184.216.34" {
		t.Errorf("forwarded A: got %v", r.Answer)
	}
}
