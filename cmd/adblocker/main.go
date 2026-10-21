// Command adblocker is a Pi-hole style DNS server that blocks ad and tracker
// domains and forwards everything else to an upstream resolver.
package main

import (
	"crypto/rand"
	"errors"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/miekg/dns"

	"adblocker/internal/blocklist"
	"adblocker/internal/dnsserver"
	"adblocker/internal/filter"
	"adblocker/internal/querylog"
	"adblocker/internal/sysdns"
	"adblocker/internal/web"
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
	customPath := flag.String("custom", "custom-blocklist.txt", "file holding your own blocked sites (edited from the web interface)")
	allowPath := flag.String("allowlist", "allowlist.txt", "file holding always-allowed sites (edited from the web interface)")
	webAddr := flag.String("web", ":8080", `address for the web interface; "" turns it off`)
	password := flag.String("password", os.Getenv("ADBLOCKER_PASSWORD"), "web interface password (default: $ADBLOCKER_PASSWORD, else read from or generated into -password-file)")
	passwordFile := flag.String("password-file", "admin-password.txt", "where the generated web password is kept")
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

	f, err := filter.New(list, *customPath, *allowPath)
	if err != nil {
		logger.Fatal(err)
	}
	logger.Printf("%d sites on your own block list, %d always allowed", len(f.Custom()), len(f.Allowed()))
	queries := querylog.New(5000)

	handler := dnsserver.New(f, queries, *upstream, logger)
	errs := make(chan error, 3)
	for _, network := range []string{"udp", "tcp"} {
		srv := &dns.Server{Addr: *listen, Net: network, Handler: handler}
		go func() { errs <- srv.ListenAndServe() }()
	}
	logger.Printf("listening on %s (udp+tcp), upstream %s", *listen, *upstream)

	upstreamHost, _, _ := net.SplitHostPort(*upstream)
	thisPC := sysdns.New(*listen, upstreamHost)
	if st, err := thisPC.Status(); err == nil && st.Supported && !st.Admin {
		logger.Printf("note: start EasioProtect as administrator to switch this computer's DNS from the web interface")
	}

	if *webAddr != "" {
		pw, err := webPassword(*password, *passwordFile)
		if err != nil {
			logger.Fatalf("web password: %v", err)
		}
		srv := &http.Server{
			Addr:              *webAddr,
			Handler:           web.New(f, queries, thisPC, pw, logger).Handler(),
			ReadHeaderTimeout: 10 * time.Second,
		}
		go func() { errs <- srv.ListenAndServe() }()
		logWebURLs(logger, *webAddr)
		if *password == "" {
			logger.Printf("web password: %s (stored in %s)", pw, *passwordFile)
		}
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errs:
		restoreDNS(logger, thisPC)
		logger.Fatalf("server error: %v", err)
	case s := <-sig:
		logger.Printf("received %s, shutting down", s)
		restoreDNS(logger, thisPC)
	}
}

// restoreDNS puts this computer's DNS back to automatic if it points at the
// adblocker, which is about to stop answering.
func restoreDNS(logger *log.Logger, c *sysdns.Controller) {
	changed, err := c.Restore()
	switch {
	case err != nil:
		logger.Printf("warning: could not restore this computer's DNS settings: %v", err)
	case changed:
		logger.Printf("this computer's DNS is back to automatic")
	}
}

// webPassword returns explicit if set; otherwise the password stored in file,
// generating and saving a new one on first run.
func webPassword(explicit, file string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if b, err := os.ReadFile(file); err == nil {
		if pw := strings.TrimSpace(string(b)); pw != "" {
			return pw, nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	// No look-alike characters (0/O, 1/l/I), so it is easy to type on a phone.
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, 10)
	rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	pw := string(b)
	return pw, os.WriteFile(file, []byte(pw+"\n"), 0o600)
}

// logWebURLs prints the addresses where the web interface can be opened,
// including this machine's LAN addresses for phones on the same Wi-Fi.
func logWebURLs(logger *log.Logger, addr string) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		logger.Printf("web interface on %s", addr)
		return
	}
	if host != "" && host != "0.0.0.0" && host != "::" {
		logger.Printf("web interface: http://%s", net.JoinHostPort(host, port))
		return
	}
	logger.Printf("web interface: http://localhost:%s", port)
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if ok && ipnet.IP.To4() != nil && ipnet.IP.IsPrivate() {
			logger.Printf("  on your phone (same Wi-Fi): http://%s", net.JoinHostPort(ipnet.IP.String(), port))
		}
	}
}
