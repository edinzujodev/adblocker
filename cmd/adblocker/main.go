// Command adblocker is a Pi-hole style DNS server that blocks ad and tracker
// domains and forwards everything else to an upstream resolver.
package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/miekg/dns"

	"adblocker/internal/blocklist"
	"adblocker/internal/dnsserver"
)

// listFlag collects repeated -blocklist flags (comma-separated also works).
type listFlag []string

func (f *listFlag) String() string { return strings.Join(*f, ",") }
func (f *listFlag) Set(v string) error {
	for _, s := range strings.Split(v, ",") {
		if s = strings.TrimSpace(s); s != "" {
			*f = append(*f, s)
		}
	}
	return nil
}

func main() {
	listen := flag.String("listen", "127.0.0.1:53", "address to listen on (UDP and TCP), e.g. :53 or 127.0.0.1:5353")
	upstream := flag.String("upstream", "1.1.1.1:53", "upstream DNS server to forward allowed queries to")
	var sources listFlag
	flag.Var(&sources, "blocklist", "hosts-format blocklist file path or http(s) URL (repeatable)")
	flag.Parse()

	logger := log.New(os.Stdout, "", log.LstdFlags)

	if len(sources) == 0 {
		sources = listFlag{"https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"}
	}
	list := blocklist.New()
	for _, src := range sources {
		n, err := list.Load(src)
		if err != nil {
			logger.Printf("warning: could not load blocklist %s: %v", src, err)
			continue
		}
		logger.Printf("loaded %d entries from %s", n, src)
	}
	logger.Printf("%d unique domains blocked", list.Len())

	handler := dnsserver.New(list, *upstream, logger)
	errs := make(chan error, 2)
	for _, network := range []string{"udp", "tcp"} {
		srv := &dns.Server{Addr: *listen, Net: network, Handler: handler}
		go func() { errs <- srv.ListenAndServe() }()
	}
	logger.Printf("listening on %s (udp+tcp), upstream %s", *listen, *upstream)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errs:
		logger.Fatalf("server error: %v", err)
	case s := <-sig:
		logger.Printf("received %s, shutting down", s)
	}
}
