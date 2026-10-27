// Package web serves the adblocker's admin interface: a password-protected
// JSON API under /api/ and the static web app that uses it.
//
// Clients authenticate with POST /api/login. The browser gets an HttpOnly
// session cookie; other clients (the mobile app) send the returned token as
// "Authorization: Bearer <token>" instead. Logging in with the master
// password instead returns a short-lived reset token that can only set a new
// password (POST /api/password/reset).
package web

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"adblocker/internal/auth"
	"adblocker/internal/filter"
	"adblocker/internal/groups"
	"adblocker/internal/querylog"
	"adblocker/internal/sysdns"
)

// dist is the React app built from web/ by `npm run build`.
//
//go:embed all:dist
var dist embed.FS

const (
	cookieName     = "adblocker_session"
	sessionTTL     = 30 * 24 * time.Hour
	failedLoginLag = time.Second // slows password guessing to ~1 try/second
	resetTTL       = 10 * time.Minute
)

// Server is the web interface. Create it with New.
type Server struct {
	filter  *filter.Filter
	groups  *groups.Manager
	queries *querylog.Log
	sysDNS  *sysdns.Controller // may be nil
	logger  *log.Logger
	auth    *auth.Store
	master  func(password string) bool // auth.CheckMaster; replaced in tests

	loginMu  sync.Mutex // serializes login and password checks
	mu       sync.Mutex
	sessions map[string]time.Time // token -> expiry
	resets   map[string]time.Time // master-password reset token -> expiry
}

// New returns a Server that checks logins against store and the built-in
// master password. sysDNS may be nil, which hides the "protect this computer"
// switch.
func New(f *filter.Filter, g *groups.Manager, queries *querylog.Log, sysDNS *sysdns.Controller, store *auth.Store, logger *log.Logger) *Server {
	return &Server{
		filter:   f,
		groups:   g,
		queries:  queries,
		sysDNS:   sysDNS,
		logger:   logger,
		auth:     store,
		master:   auth.CheckMaster,
		sessions: make(map[string]time.Time),
		resets:   make(map[string]time.Time),
	}
}

// Handler returns the HTTP handler for the API and the web app.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("POST /api/logout", s.logout)
	mux.HandleFunc("POST /api/password/reset", s.resetPassword)

	api := http.NewServeMux()
	api.HandleFunc("GET /api/status", s.status)
	api.HandleFunc("POST /api/password", s.changePassword)
	api.HandleFunc("POST /api/enabled", s.setEnabled)
	api.HandleFunc("GET /api/queries", s.recentQueries)
	api.HandleFunc("GET /api/top-blocked", s.topBlocked)
	api.HandleFunc("GET /api/check", s.check)
	api.HandleFunc("GET /api/this-computer", s.thisComputer)
	api.HandleFunc("POST /api/this-computer", s.setThisComputer)
	api.HandleFunc("GET /api/custom", s.listDomains(s.filter.Custom))
	api.HandleFunc("POST /api/custom", s.addDomain(s.filter.AddCustom))
	api.HandleFunc("DELETE /api/custom/{domain}", s.removeDomain(s.filter.RemoveCustom))
	api.HandleFunc("GET /api/allowlist", s.listDomains(s.filter.Allowed))
	api.HandleFunc("POST /api/allowlist", s.addDomain(s.filter.AddAllowed))
	api.HandleFunc("DELETE /api/allowlist/{domain}", s.removeDomain(s.filter.RemoveAllowed))
	api.HandleFunc("GET /api/groups", s.listGroups)
	api.HandleFunc("POST /api/groups", s.createGroup)
	api.HandleFunc("PATCH /api/groups/{id}", s.updateGroup)
	api.HandleFunc("DELETE /api/groups/{id}", s.deleteGroup)
	api.HandleFunc("POST /api/groups/{id}/entries", s.addGroupEntry)
	api.HandleFunc("DELETE /api/groups/{id}/entries/{entry}", s.removeGroupEntry)
	api.HandleFunc("GET /api/bundles", s.listBundles)
	api.HandleFunc("POST /api/bundles", s.createBundle)
	api.HandleFunc("PATCH /api/bundles/{id}", s.updateBundle)
	api.HandleFunc("PUT /api/bundles/{id}/groups", s.setBundleGroups)
	api.HandleFunc("DELETE /api/bundles/{id}", s.deleteBundle)
	mux.Handle("/api/", s.requireAuth(api))

	files, _ := fs.Sub(dist, "dist")
	mux.Handle("/", http.FileServerFS(files))
	return securityHeaders(mux)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		// Scripts only from this server. The UI library sets some styles at
		// runtime, so inline styles are allowed; they cannot run code.
		h.Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
		} else if strings.HasPrefix(r.URL.Path, "/assets/") {
			// Built files have a content hash in their name, so they never change.
			h.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			h.Set("Cache-Control", "no-cache") // revalidate, so updates show up
		}
		next.ServeHTTP(w, r)
	})
}

// --- auth ---

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	s.loginMu.Lock()
	ok := s.auth.Check(req.Password)
	master := !ok && s.master(req.Password)
	if !ok && !master {
		time.Sleep(failedLoginLag)
	}
	s.loginMu.Unlock()

	switch {
	case master:
		// The master password only lets someone choose a new password.
		token := newToken()
		s.mu.Lock()
		dropExpired(s.resets)
		s.resets[token] = time.Now().Add(resetTTL)
		s.mu.Unlock()
		s.logger.Printf("web: master password used from %s to reset the password", r.RemoteAddr)
		writeJSON(w, map[string]any{"reset": true, "resetToken": token})
		return
	case !ok:
		s.logger.Printf("web: failed login from %s", r.RemoteAddr)
		writeError(w, http.StatusUnauthorized, "that password isn't right")
		return
	}

	token := newToken()
	expires := time.Now().Add(sessionTTL)
	s.mu.Lock()
	dropExpired(s.sessions)
	s.sessions[token] = expires
	s.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, map[string]string{"token": token})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := requestToken(r); token != "" {
		s.mu.Lock()
		delete(s.sessions, token)
		s.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

// resetPassword sets a new password with a token from a master-password
// login, then signs out every device.
func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ResetToken string `json:"resetToken"`
		Password   string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	s.mu.Lock()
	exp, ok := s.resets[req.ResetToken]
	s.mu.Unlock()
	if req.ResetToken == "" || !ok || time.Now().After(exp) {
		writeError(w, http.StatusUnauthorized, "this reset has expired; log in with the master password again")
		return
	}
	if !s.setPassword(w, req.Password, "") {
		return
	}
	s.mu.Lock()
	delete(s.resets, req.ResetToken)
	s.mu.Unlock()
	s.logger.Printf("web: password reset with the master password from %s", r.RemoteAddr)
	w.WriteHeader(http.StatusNoContent)
}

// changePassword lets a logged-in user change the password. It needs the
// current one, so an unlocked phone left lying around can't change it, and
// signs out every other device.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	s.loginMu.Lock()
	ok := s.auth.Check(req.Current)
	if !ok {
		time.Sleep(failedLoginLag)
	}
	s.loginMu.Unlock()
	if !ok {
		writeError(w, http.StatusForbidden, "your current password isn't right")
		return
	}
	if !s.setPassword(w, req.Password, requestToken(r)) {
		return
	}
	s.logger.Printf("web: password changed from %s", r.RemoteAddr)
	w.WriteHeader(http.StatusNoContent)
}

// setPassword stores password and ends every session except keep. It writes
// the error response and returns false on failure.
func (s *Server) setPassword(w http.ResponseWriter, password, keep string) bool {
	if err := s.auth.Set(password); err != nil {
		if errors.Is(err, auth.ErrTooShort) {
			writeError(w, http.StatusBadRequest, "the new password is too short: "+err.Error())
		} else {
			writeError(w, http.StatusInternalServerError, "could not save the password: "+err.Error())
		}
		return false
	}
	s.mu.Lock()
	for t := range s.sessions {
		if t != keep {
			delete(s.sessions, t)
		}
	}
	s.mu.Unlock()
	return true
}

func dropExpired(tokens map[string]time.Time) {
	now := time.Now()
	for t, exp := range tokens {
		if now.After(exp) {
			delete(tokens, t)
		}
	}
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := requestToken(r)
		s.mu.Lock()
		exp, ok := s.sessions[token]
		s.mu.Unlock()
		if token == "" || !ok || time.Now().After(exp) {
			writeError(w, http.StatusUnauthorized, "please log in")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requestToken(r *http.Request) string {
	if t, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return t
	}
	if c, err := r.Cookie(cookieName); err == nil {
		return c.Value
	}
	return ""
}

func newToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// --- API ---

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	st := s.queries.Stats()
	writeJSON(w, map[string]any{
		"enabled":        s.filter.Enabled(),
		"totalQueries":   st.Total,
		"blockedQueries": st.Blocked,
		"blocklistSize":  s.filter.BlocklistSize(),
		"customCount":    len(s.filter.Custom()),
		"allowCount":     len(s.filter.Allowed()),
	})
}

func (s *Server) setEnabled(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	s.filter.SetEnabled(req.Enabled)
	s.logger.Printf("web: blocking switched %s by %s", onOff(req.Enabled), r.RemoteAddr)
	writeJSON(w, map[string]bool{"enabled": req.Enabled})
}

func (s *Server) recentQueries(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 1000 {
		limit = n
	}
	blockedOnly := r.URL.Query().Get("blocked") == "true"
	writeJSON(w, s.queries.Recent(limit, blockedOnly))
}

func (s *Server) topBlocked(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.queries.TopBlocked(20))
}

func (s *Server) check(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(r.URL.Query().Get("domain"))
	if domain == "" {
		writeError(w, http.StatusBadRequest, "domain is required")
		return
	}
	writeJSON(w, s.filter.Check(cleanDomain(domain)))
}

func (s *Server) thisComputer(w http.ResponseWriter, r *http.Request) {
	if s.sysDNS == nil {
		writeJSON(w, sysdns.Status{Message: "Not available."})
		return
	}
	st, err := s.sysDNS.Status()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reading network settings: "+err.Error())
		return
	}
	writeJSON(w, st)
}

func (s *Server) setThisComputer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if s.sysDNS == nil {
		writeError(w, http.StatusNotImplemented, sysdns.ErrUnsupported.Error())
		return
	}
	err := s.sysDNS.Set(req.Enabled)
	switch {
	case errors.Is(err, sysdns.ErrUnsupported):
		writeError(w, http.StatusNotImplemented, err.Error())
		return
	case errors.Is(err, sysdns.ErrNotAdmin):
		writeError(w, http.StatusForbidden, err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "changing network settings: "+err.Error())
		return
	}
	s.logger.Printf("web: this computer's DNS switched %s by %s", onOff(req.Enabled), r.RemoteAddr)
	s.thisComputer(w, r)
}

func (s *Server) listDomains(list func() []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, list())
	}
}

func (s *Server) addDomain(add func(string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Domain string `json:"domain"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		d := cleanEntry(req.Domain)
		if err := add(d); err != nil {
			writeDomainError(w, err)
			return
		}
		s.logger.Printf("web: %s added %s to %s", r.RemoteAddr, d, r.URL.Path)
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) removeDomain(remove func(string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := r.PathValue("domain")
		if err := remove(d); err != nil {
			writeDomainError(w, err)
			return
		}
		s.logger.Printf("web: %s removed %s from %s", r.RemoteAddr, d, r.URL.Path)
		w.WriteHeader(http.StatusNoContent)
	}
}

// cleanDomain accepts what people paste: "https://www.instagram.com/foo"
// becomes "www.instagram.com".
// cleanEntry turns what a user typed into a list entry. "www.instagram.com"
// means the whole site: instagram.com, which covers www and every other
// subdomain.
func cleanEntry(s string) string {
	return strings.TrimPrefix(cleanDomain(s), "www.")
}

func cleanDomain(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if i := strings.Index(s, "://"); i >= 0 {
		s = s[i+3:]
	}
	if i := strings.IndexAny(s, "/?#"); i >= 0 {
		s = s[:i]
	}
	if i := strings.LastIndexByte(s, ':'); i >= 0 {
		s = s[:i] // port
	}
	return strings.TrimSuffix(s, ".")
}

// --- block groups ---

func (s *Server) listGroups(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.groups.List())
}

func (s *Server) createGroup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string   `json:"name"`
		Entries []string `json:"entries"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	for i, e := range req.Entries {
		req.Entries[i] = cleanEntry(e)
	}
	g, err := s.groups.Create(req.Name, req.Entries)
	if err != nil {
		writeGroupError(w, err)
		return
	}
	s.logger.Printf("web: %s created block group %q", r.RemoteAddr, g.Name)
	writeJSON(w, g)
}

// updateGroup switches a group on or off and/or renames it.
func (s *Server) updateGroup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    *string `json:"name"`
		Enabled *bool   `json:"enabled"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	id := r.PathValue("id")
	var g groups.Group
	var err error
	if req.Name != nil {
		if g, err = s.groups.Rename(id, *req.Name); err != nil {
			writeGroupError(w, err)
			return
		}
	}
	if req.Enabled != nil {
		if g, err = s.groups.SetEnabled(id, *req.Enabled); err != nil {
			writeGroupError(w, err)
			return
		}
		s.logger.Printf("web: block group %q switched %s by %s", g.Name, onOff(*req.Enabled), r.RemoteAddr)
	}
	if req.Name == nil && req.Enabled == nil {
		writeError(w, http.StatusBadRequest, "nothing to change")
		return
	}
	writeJSON(w, g)
}

func (s *Server) deleteGroup(w http.ResponseWriter, r *http.Request) {
	if err := s.groups.Delete(r.PathValue("id")); err != nil {
		writeGroupError(w, err)
		return
	}
	s.logger.Printf("web: %s deleted block group %s", r.RemoteAddr, r.PathValue("id"))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) addGroupEntry(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	g, err := s.groups.AddEntry(r.PathValue("id"), cleanEntry(req.Domain))
	if err != nil {
		writeGroupError(w, err)
		return
	}
	writeJSON(w, g)
}

func (s *Server) removeGroupEntry(w http.ResponseWriter, r *http.Request) {
	g, err := s.groups.RemoveEntry(r.PathValue("id"), r.PathValue("entry"))
	if err != nil {
		writeGroupError(w, err)
		return
	}
	writeJSON(w, g)
}

// --- bundles ---

func (s *Server) listBundles(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.groups.Bundles())
}

func (s *Server) createBundle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string   `json:"name"`
		Groups []string `json:"groups"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	b, err := s.groups.CreateBundle(req.Name, req.Groups)
	if err != nil {
		writeGroupError(w, err)
		return
	}
	s.logger.Printf("web: %s created bundle %q", r.RemoteAddr, b.Name)
	writeJSON(w, b)
}

// updateBundle switches a bundle on or off and/or renames it.
func (s *Server) updateBundle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    *string `json:"name"`
		Enabled *bool   `json:"enabled"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.Name == nil && req.Enabled == nil {
		writeError(w, http.StatusBadRequest, "nothing to change")
		return
	}
	id := r.PathValue("id")
	var b groups.Bundle
	var err error
	if req.Name != nil {
		if b, err = s.groups.RenameBundle(id, *req.Name); err != nil {
			writeGroupError(w, err)
			return
		}
	}
	if req.Enabled != nil {
		if b, err = s.groups.SetBundleEnabled(id, *req.Enabled); err != nil {
			writeGroupError(w, err)
			return
		}
		s.logger.Printf("web: bundle %q switched %s by %s", b.Name, onOff(*req.Enabled), r.RemoteAddr)
	}
	writeJSON(w, b)
}

func (s *Server) setBundleGroups(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Groups []string `json:"groups"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	b, err := s.groups.SetBundleGroups(r.PathValue("id"), req.Groups)
	if err != nil {
		writeGroupError(w, err)
		return
	}
	writeJSON(w, b)
}

func (s *Server) deleteBundle(w http.ResponseWriter, r *http.Request) {
	if err := s.groups.DeleteBundle(r.PathValue("id")); err != nil {
		writeGroupError(w, err)
		return
	}
	s.logger.Printf("web: %s deleted bundle %s", r.RemoteAddr, r.PathValue("id"))
	w.WriteHeader(http.StatusNoContent)
}

func writeGroupError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, groups.ErrNoGroup), errors.Is(err, groups.ErrNotFound), errors.Is(err, groups.ErrNoBundle):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, groups.ErrBuiltin), errors.Is(err, groups.ErrInvalidName),
		errors.Is(err, filter.ErrInvalidDomain), errors.Is(err, filter.ErrInvalidKeyword):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, groups.ErrDownload):
		writeError(w, http.StatusBadGateway, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "could not save the groups: "+err.Error())
	}
}

// --- helpers ---

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	// Requiring a JSON content type means a cross-site HTML form cannot
	// submit to the API.
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "expected application/json")
		return false
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func writeDomainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, filter.ErrInvalidDomain), errors.Is(err, filter.ErrInvalidKeyword):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, filter.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "could not save the list: "+err.Error())
	}
}

func onOff(b bool) string {
	if b {
		return "on"
	}
	return "off"
}
