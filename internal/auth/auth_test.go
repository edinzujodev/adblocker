package auth

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHashVerify(t *testing.T) {
	h, err := Hash("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "pbkdf2-sha256$600000$") {
		t.Errorf("hash = %q", h)
	}
	if !Verify(h, "correct horse") || Verify(h, "wrong horse") {
		t.Error("Verify gave the wrong answer")
	}
	if h2, _ := Hash("correct horse"); h2 == h {
		t.Error("two hashes of the same password are equal: no salt?")
	}
	for _, bad := range []string{"", "plain", "pbkdf2-sha256$x$a$b", "md5$1$a$b"} {
		if Verify(bad, "") || Verify(bad, "plain") {
			t.Errorf("Verify(%q) matched", bad)
		}
	}
}

func TestStore(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "auth.json")
	plain := filepath.Join(dir, "admin-password.txt")
	os.WriteFile(plain, []byte("first-pass\n"), 0o600)

	s, err := Open(path, plain, "first-pass", false)
	if err != nil {
		t.Fatal(err)
	}
	if !s.Check("first-pass") || s.Check("other") {
		t.Error("initial password not set")
	}
	b, _ := os.ReadFile(path)
	if strings.Contains(string(b), "first-pass") {
		t.Error("auth.json contains the password itself")
	}

	if err := s.Set("short"); err != ErrTooShort {
		t.Errorf("Set(short) = %v", err)
	}
	if err := s.Set("a new password"); err != nil {
		t.Fatal(err)
	}
	if s.Check("first-pass") || !s.Check("a new password") {
		t.Error("password not changed")
	}
	if _, err := os.Stat(plain); !os.IsNotExist(err) {
		t.Error("the file with the old password is still there")
	}

	// A restart keeps the changed password; initial only applies to a new file.
	again, err := Open(path, plain, "first-pass", false)
	if err != nil {
		t.Fatal(err)
	}
	if !again.Check("a new password") {
		t.Error("changed password lost on reload")
	}
	// reset (the -password flag) replaces it.
	reset, err := Open(path, plain, "from the flag", true)
	if err != nil {
		t.Fatal(err)
	}
	if !reset.Check("from the flag") {
		t.Error("reset didn't set the password")
	}
}

func TestMaster(t *testing.T) {
	old := masterHash
	t.Cleanup(func() { masterHash = old })

	masterHash = ""
	if HasMaster() || CheckMaster("") || CheckMaster("anything") {
		t.Error("an empty master hash must match nothing")
	}
	masterHash, _ = Hash("the master passphrase")
	masterHash += "\n" // as written to master.hash
	if !HasMaster() || !CheckMaster("the master passphrase") || CheckMaster("guess") {
		t.Error("CheckMaster gave the wrong answer")
	}
}
