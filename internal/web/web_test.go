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

	"adblocker/internal/blocklist"
	"adblocker/internal/filter"
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
	q := querylog.New(10)
	q.Add(querylog.Entry{Domain: "ad.doubleclick.net", Blocked: true})
	ts := httptest.NewServer(New(f, q, "secret", log.New(io.Discard, "", 0)).Handler())
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
