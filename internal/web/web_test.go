package web

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"

	"adblocker/internal/auth"
	"adblocker/internal/blocklist"
	"adblocker/internal/filter"
	"adblocker/internal/groups"
	"adblocker/internal/querylog"
)

func newTestServer(t *testing.T) (*httptest.Server, *filter.Filter) {
	t.Helper()
	lists := blocklist.New()
	lists.Add("doubleclick.net")
	f, err := filter.New(lists, "", "")
	if err != nil {
		t.Fatal(err)
	}
	g, err := groups.New("")
	if err != nil {
		t.Fatal(err)
	}
	f.SetGroups(g)
	q := querylog.New(10)
	q.Add(querylog.Entry{Domain: "ad.doubleclick.net", Blocked: true})
	store, err := auth.Open("", "", "secret", false)
	if err != nil {
		t.Fatal(err)
	}
	srv := New(f, g, q, nil, store, log.New(io.Discard, "", 0))
	srv.master = func(pw string) bool { return pw == "the master key" }
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts, f
}

// call sends a request and returns the status code, decoding JSON into out.
func call(t *testing.T, c *http.Client, method, url, body string, out any) int {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			t.Fatalf("%s %s: decoding: %v", method, url, err)
		}
	}
	return resp.StatusCode
}

func TestRequiresLogin(t *testing.T) {
	ts, _ := newTestServer(t)
	c := ts.Client()
	if code := call(t, c, "GET", ts.URL+"/api/status", "", nil); code != http.StatusUnauthorized {
		t.Errorf("status without login = %d, want 401", code)
	}
	if code := call(t, c, "POST", ts.URL+"/api/login", `{"password":"wrong"}`, nil); code != http.StatusUnauthorized {
		t.Errorf("wrong password = %d, want 401", code)
	}
	// The web app itself loads without logging in.
	if code := call(t, c, "GET", ts.URL+"/", "", nil); code != http.StatusOK {
		t.Errorf("index = %d, want 200", code)
	}
}

func TestBearerToken(t *testing.T) {
	ts, _ := newTestServer(t)
	var login struct{ Token string }
	if code := call(t, ts.Client(), "POST", ts.URL+"/api/login", `{"password":"secret"}`, &login); code != http.StatusOK || login.Token == "" {
		t.Fatalf("login = %d, token %q", code, login.Token)
	}
	req, _ := http.NewRequest("GET", ts.URL+"/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+login.Token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status with bearer token = %d, want 200", resp.StatusCode)
	}
}

func TestDashboardFlow(t *testing.T) {
	ts, f := newTestServer(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	if code := call(t, c, "POST", ts.URL+"/api/login", `{"password":"secret"}`, nil); code != http.StatusOK {
		t.Fatalf("login = %d", code)
	}

	var status struct {
		Enabled        bool
		BlockedQueries int
		BlocklistSize  int
	}
	call(t, c, "GET", ts.URL+"/api/status", "", &status)
	if !status.Enabled || status.BlockedQueries != 1 || status.BlocklistSize != 1 {
		t.Errorf("status = %+v", status)
	}

	// Turn blocking off.
	call(t, c, "POST", ts.URL+"/api/enabled", `{"enabled":false}`, nil)
	if f.Enabled() {
		t.Error("blocking still enabled")
	}

	// Block a site pasted as a full URL, then check and remove it.
	if code := call(t, c, "POST", ts.URL+"/api/custom", `{"domain":"https://www.Instagram.com/explore/"}`, nil); code != http.StatusNoContent {
		t.Fatalf("add custom = %d", code)
	}
	var custom []string
	call(t, c, "GET", ts.URL+"/api/custom", "", &custom)
	if len(custom) != 1 || custom[0] != "instagram.com" {
		t.Errorf("custom = %v", custom)
	}
	f.SetEnabled(true)
	var r filter.Result
	call(t, c, "GET", ts.URL+"/api/check?domain=www.instagram.com", "", &r)
	if !r.Blocked || r.Reason != filter.ReasonCustom {
		t.Errorf("check = %+v", r)
	}
	if code := call(t, c, "DELETE", ts.URL+"/api/custom/instagram.com", "", nil); code != http.StatusNoContent {
		t.Errorf("remove custom = %d", code)
	}

	// Invalid input is rejected.
	if code := call(t, c, "POST", ts.URL+"/api/allowlist", `{"domain":"not a domain"}`, nil); code != http.StatusBadRequest {
		t.Errorf("invalid domain = %d, want 400", code)
	}

	var recent []querylog.Entry
	call(t, c, "GET", ts.URL+"/api/queries?blocked=true", "", &recent)
	if len(recent) != 1 || recent[0].Domain != "ad.doubleclick.net" {
		t.Errorf("recent = %v", recent)
	}

	// After logout the session no longer works.
	call(t, c, "POST", ts.URL+"/api/logout", "", nil)
	if code := call(t, c, "GET", ts.URL+"/api/status", "", nil); code != http.StatusUnauthorized {
		t.Errorf("status after logout = %d, want 401", code)
	}
}

func TestRejectsFormPosts(t *testing.T) {
	ts, _ := newTestServer(t)
	resp, err := http.Post(ts.URL+"/api/login", "application/x-www-form-urlencoded", strings.NewReader("password=secret"))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnsupportedMediaType {
		t.Errorf("form post = %d, want 415", resp.StatusCode)
	}
}

func TestGroupsAPI(t *testing.T) {
	ts, _ := newTestServer(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	call(t, c, "POST", ts.URL+"/api/login", `{"password":"secret"}`, nil)

	var list []groups.Group
	call(t, c, "GET", ts.URL+"/api/groups", "", &list)
	if len(list) != len(groups.Categories) || list[0].ID != "social" || list[0].Enabled {
		t.Fatalf("groups = %+v", list)
	}

	// Switch on a built-in category.
	var g groups.Group
	if code := call(t, c, "PATCH", ts.URL+"/api/groups/social", `{"enabled":true}`, &g); code != http.StatusOK || !g.Enabled {
		t.Fatalf("enable social = %d %+v", code, g)
	}
	var r filter.Result
	call(t, c, "GET", ts.URL+"/api/check?domain=www.instagram.com", "", &r)
	if !r.Blocked || r.Reason != filter.ReasonGroup || r.Group != "Social media" {
		t.Errorf("check = %+v", r)
	}
	if code := call(t, c, "POST", ts.URL+"/api/groups/social/entries", `{"domain":"example.com"}`, nil); code != http.StatusBadRequest {
		t.Errorf("edit category = %d, want 400", code)
	}

	// Make a group of my own, edit it, then delete it.
	if code := call(t, c, "POST", ts.URL+"/api/groups", `{"name":"Homework","entries":["https://www.roblox.com/"]}`, &g); code != http.StatusOK {
		t.Fatalf("create = %d", code)
	}
	if len(g.Entries) != 1 || g.Entries[0] != "roblox.com" || !g.Enabled {
		t.Errorf("created %+v", g)
	}
	base := ts.URL + "/api/groups/" + g.ID
	call(t, c, "POST", base+"/entries", `{"domain":"minecraft"}`, &g)
	if len(g.Entries) != 2 {
		t.Errorf("after add: %+v", g)
	}
	if code := call(t, c, "POST", base+"/entries", `{"domain":"ab"}`, nil); code != http.StatusBadRequest {
		t.Errorf("short keyword = %d, want 400", code)
	}
	call(t, c, "GET", ts.URL+"/api/check?domain=education.minecraft.net", "", &r)
	if !r.Blocked || r.Group != "Homework" || r.Rule != "minecraft" {
		t.Errorf("check = %+v", r)
	}
	call(t, c, "DELETE", base+"/entries/roblox.com", "", &g)
	call(t, c, "PATCH", base, `{"name":"School","enabled":false}`, &g)
	if g.Name != "School" || g.Enabled || len(g.Entries) != 1 {
		t.Errorf("after edits: %+v", g)
	}
	if code := call(t, c, "DELETE", base, "", nil); code != http.StatusNoContent {
		t.Errorf("delete = %d", code)
	}
	if code := call(t, c, "DELETE", base, "", nil); code != http.StatusNotFound {
		t.Errorf("delete again = %d, want 404", code)
	}
}

func TestBundlesAPI(t *testing.T) {
	ts, _ := newTestServer(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	call(t, c, "POST", ts.URL+"/api/login", `{"password":"secret"}`, nil)

	var b groups.Bundle
	if code := call(t, c, "POST", ts.URL+"/api/bundles", `{"name":"Kids mode","groups":["social","gaming"]}`, &b); code != http.StatusOK {
		t.Fatalf("create = %d", code)
	}
	if b.Enabled || len(b.Groups) != 2 {
		t.Errorf("created %+v", b)
	}
	base := ts.URL + "/api/bundles/" + b.ID
	call(t, c, "PATCH", base, `{"enabled":true}`, &b)
	if !b.Enabled {
		t.Errorf("after enable: %+v", b)
	}

	var r filter.Result
	call(t, c, "GET", ts.URL+"/api/check?domain=www.roblox.com", "", &r)
	if !r.Blocked || r.Group != "Gaming" || r.Bundle != "Kids mode" {
		t.Errorf("check = %+v", r)
	}
	var list []groups.Group
	call(t, c, "GET", ts.URL+"/api/groups", "", &list)
	if list[2].ID != "gaming" || list[2].Enabled || list[2].BlockedBy != "Kids mode" {
		t.Errorf("gaming = %+v", list[2])
	}

	call(t, c, "PUT", base+"/groups", `{"groups":["social"]}`, &b)
	call(t, c, "GET", ts.URL+"/api/check?domain=www.roblox.com", "", &r)
	if r.Blocked {
		t.Errorf("roblox still blocked after gaming left the bundle: %+v", r)
	}
	if code := call(t, c, "PUT", base+"/groups", `{"groups":["nope"]}`, nil); code != http.StatusNotFound {
		t.Errorf("unknown group = %d, want 404", code)
	}

	var all []groups.Bundle
	call(t, c, "GET", ts.URL+"/api/bundles", "", &all)
	if len(all) != 1 || all[0].Name != "Kids mode" {
		t.Errorf("bundles = %+v", all)
	}
	if code := call(t, c, "DELETE", base, "", nil); code != http.StatusNoContent {
		t.Errorf("delete = %d", code)
	}

	// An empty bundle lists its groups as [], not null (the apps read .length).
	var raw []map[string]any
	call(t, c, "POST", ts.URL+"/api/bundles", `{"name":"Empty"}`, nil)
	call(t, c, "GET", ts.URL+"/api/bundles", "", &raw)
	if g, ok := raw[0]["groups"].([]any); !ok || len(g) != 0 {
		t.Errorf("empty bundle groups = %#v, want []", raw[0]["groups"])
	}
	if code := call(t, c, "PATCH", base, `{"enabled":true}`, nil); code != http.StatusNotFound {
		t.Errorf("patch deleted = %d, want 404", code)
	}
}

func TestPasswords(t *testing.T) {
	ts, _ := newTestServer(t)
	login := func(pw string) (*http.Client, int, map[string]any) {
		jar, _ := cookiejar.New(nil)
		c := &http.Client{Jar: jar}
		var out map[string]any
		code := call(t, c, "POST", ts.URL+"/api/login", `{"password":"`+pw+`"}`, &out)
		return c, code, out
	}

	// Change the password: needs the current one, signs out other devices.
	phone, _, _ := login("secret")
	laptop, code, _ := login("secret")
	if code != http.StatusOK {
		t.Fatalf("login = %d", code)
	}
	if code := call(t, laptop, "POST", ts.URL+"/api/password", `{"current":"nope","password":"new password 1"}`, nil); code != http.StatusForbidden {
		t.Errorf("wrong current = %d, want 403", code)
	}
	if code := call(t, laptop, "POST", ts.URL+"/api/password", `{"current":"secret","password":"short"}`, nil); code != http.StatusBadRequest {
		t.Errorf("too short = %d, want 400", code)
	}
	if code := call(t, laptop, "POST", ts.URL+"/api/password", `{"current":"secret","password":"new password 1"}`, nil); code != http.StatusNoContent {
		t.Fatalf("change = %d", code)
	}
	if code := call(t, laptop, "GET", ts.URL+"/api/status", "", nil); code != http.StatusOK {
		t.Errorf("the device that changed it was signed out: %d", code)
	}
	if code := call(t, phone, "GET", ts.URL+"/api/status", "", nil); code != http.StatusUnauthorized {
		t.Errorf("other device still signed in: %d", code)
	}
	if _, code, _ := login("secret"); code != http.StatusUnauthorized {
		t.Errorf("old password still works: %d", code)
	}

	// Forgot it: the master password gives a reset token, not a session.
	m, code, out := login("the master key")
	if code != http.StatusOK || out["reset"] != true || out["token"] != nil {
		t.Fatalf("master login = %d %v", code, out)
	}
	if code := call(t, m, "GET", ts.URL+"/api/status", "", nil); code != http.StatusUnauthorized {
		t.Errorf("master login opened the dashboard: %d", code)
	}
	token, _ := out["resetToken"].(string)
	if code := call(t, m, "POST", ts.URL+"/api/password/reset", `{"resetToken":"forged","password":"recovered pw"}`, nil); code != http.StatusUnauthorized {
		t.Errorf("forged reset token = %d, want 401", code)
	}
	if code := call(t, m, "POST", ts.URL+"/api/password/reset", `{"resetToken":"`+token+`","password":"recovered pw"}`, nil); code != http.StatusNoContent {
		t.Fatalf("reset = %d", code)
	}
	if code := call(t, laptop, "GET", ts.URL+"/api/status", "", nil); code != http.StatusUnauthorized {
		t.Errorf("devices still signed in after a reset: %d", code)
	}
	if code := call(t, m, "POST", ts.URL+"/api/password/reset", `{"resetToken":"`+token+`","password":"second try"}`, nil); code != http.StatusUnauthorized {
		t.Errorf("reset token worked twice: %d", code)
	}
	if _, code, _ := login("recovered pw"); code != http.StatusOK {
		t.Errorf("new password doesn't work: %d", code)
	}
}
