// Package dnsserver is a DNS server that answers blocked domains with
// 0.0.0.0 / :: and forwards everything else to an upstream resolver.
package dnsserver

import (
	"log"
	"net"
	"time"

	"github.com/miekg/dns"

	"adblocker/internal/blocklist"
)

// blockedTTL is the TTL (seconds) on answers for blocked domains.
const blockedTTL = 60

// Server holds the blocklist and upstream configuration.
type Server struct {
	List     *blocklist.List
	Upstream string // host:port, e.g. 1.1.1.1:53
	Logger   *log.Logger

	udp, tcp *dns.Client
}

// New returns a Server ready to be used as a dns.Handler.
func New(list *blocklist.List, upstream string, logger *log.Logger) *Server {
	return &Server{
		List:     list,
		Upstream: upstream,
		Logger:   logger,
		udp:      &dns.Client{Net: "udp", Timeout: 5 * time.Second},
		tcp:      &dns.Client{Net: "tcp", Timeout: 5 * time.Second},
	}
}

// ServeDNS implements dns.Handler.
func (s *Server) ServeDNS(w dns.ResponseWriter, req *dns.Msg) {
	if len(req.Question) == 0 {
		m := new(dns.Msg)
		m.SetRcode(req, dns.RcodeFormatError)
		w.WriteMsg(m)
		return
	}
	q := req.Question[0]
	client := clientIP(w.RemoteAddr())
	qtype := dns.TypeToString[q.Qtype]

	if s.List.IsBlocked(q.Name) {
		s.Logger.Printf("BLOCKED  %-15s %-5s %s", client, qtype, q.Name)
		w.WriteMsg(blockedReply(req))
		return
	}

	resp, err := s.forward(req, w.RemoteAddr())
	if err != nil {
		s.Logger.Printf("ERROR    %-15s %-5s %s: %v", client, qtype, q.Name, err)
		m := new(dns.Msg)
		m.SetRcode(req, dns.RcodeServerFailure)
		w.WriteMsg(m)
		return
	}
	s.Logger.Printf("ALLOWED  %-15s %-5s %s", client, qtype, q.Name)
	w.WriteMsg(resp)
}

// forward sends req to the upstream over the same transport the client used,
// retrying over TCP if the UDP answer was truncated.
func (s *Server) forward(req *dns.Msg, from net.Addr) (*dns.Msg, error) {
	c := s.udp
	if _, isTCP := from.(*net.TCPAddr); isTCP {
		c = s.tcp
	}
	resp, _, err := c.Exchange(req, s.Upstream)
	if err == nil && resp.Truncated && c == s.udp {
		resp, _, err = s.tcp.Exchange(req, s.Upstream)
	}
	return resp, err
}

// blockedReply answers A with 0.0.0.0, AAAA with ::, and any other query
// type with an empty NOERROR response.
func blockedReply(req *dns.Msg) *dns.Msg {
	m := new(dns.Msg)
	m.SetReply(req)
	m.Authoritative = true
	q := req.Question[0]
	hdr := dns.RR_Header{Name: q.Name, Class: dns.ClassINET, Ttl: blockedTTL}
	switch q.Qtype {
	case dns.TypeA:
		hdr.Rrtype = dns.TypeA
		m.Answer = append(m.Answer, &dns.A{Hdr: hdr, A: net.IPv4zero})
	case dns.TypeAAAA:
		hdr.Rrtype = dns.TypeAAAA
		m.Answer = append(m.Answer, &dns.AAAA{Hdr: hdr, AAAA: net.IPv6zero})
	}
	return m
}

func clientIP(a net.Addr) string {
	switch v := a.(type) {
	case *net.UDPAddr:
		return v.IP.String()
	case *net.TCPAddr:
		return v.IP.String()
	}
	return a.String()
}
