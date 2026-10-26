// Package auth stores the web interface password and checks the master
// password.
//
// The password is the one users log in with and can change from Settings;
// only its PBKDF2 hash is kept, in a JSON file. The master password is a
// recovery key built into the program (see master.go): it can't be changed
// from the interface, and logging in with it only allows setting a new
// password.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// MinLength is the shortest password Set accepts.
const MinLength = 8

// iterations follows OWASP's PBKDF2-SHA256 guidance. A check takes a moment
// on a Raspberry Pi, which also slows down guessing.
const iterations = 600_000

var ErrTooShort = fmt.Errorf("use at least %d characters", MinLength)

// Hash returns a salted PBKDF2-SHA256 hash of password in the form
// "pbkdf2-sha256$<iterations>$<salt>$<key>" (base64, no padding).
func Hash(password string) (string, error) {
	salt := make([]byte, 16)
	rand.Read(salt)
	key, err := pbkdf2.Key(sha256.New, password, salt, iterations, 32)
	if err != nil {
		return "", err
	}
	enc := base64.RawStdEncoding
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", iterations, enc.EncodeToString(salt), enc.EncodeToString(key)), nil
}

// Verify reports whether password matches hash. A malformed or empty hash
// matches nothing.
func Verify(hash, password string) bool {
	parts := strings.Split(strings.TrimSpace(hash), "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 1 {
		return false
	}
	enc := base64.RawStdEncoding
	salt, err1 := enc.DecodeString(parts[2])
	want, err2 := enc.DecodeString(parts[3])
	if err1 != nil || err2 != nil || len(want) == 0 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iter, len(want))
	return err == nil && subtle.ConstantTimeCompare(got, want) == 1
}

// Store holds the password hash. It is safe for concurrent use.
type Store struct {
	path      string // "" keeps the hash in memory only
	plainFile string // file with the first, generated password; removed on change

	mu   sync.Mutex
	hash string
}

type saved struct {
	PasswordHash string `json:"passwordHash"`
}

// Open loads the password hash from path. If there is none yet, or reset is
// true, the password becomes initial. plainFile, if set, is the file the
// first password was printed to; it is deleted once the password changes so
// it never shows an old password.
func Open(path, plainFile, initial string, reset bool) (*Store, error) {
	s := &Store{path: path, plainFile: plainFile}
	if path != "" && !reset {
		b, err := os.ReadFile(path)
		switch {
		case err == nil:
			var sv saved
			if err := json.Unmarshal(b, &sv); err != nil || sv.PasswordHash == "" {
				return nil, fmt.Errorf("reading %s: no password hash in it", path)
			}
			s.hash = sv.PasswordHash
			return s, nil
		case !errors.Is(err, os.ErrNotExist):
			return nil, err
		}
	}
	if initial == "" {
		return nil, errors.New("no password set")
	}
	h, err := Hash(initial)
	if err != nil {
		return nil, err
	}
	s.hash = h
	return s, s.save()
}

// Check reports whether password is the current password.
func (s *Store) Check(password string) bool {
	s.mu.Lock()
	h := s.hash
	s.mu.Unlock()
	return Verify(h, password)
}

// Set changes the password.
func (s *Store) Set(password string) error {
	if len([]rune(password)) < MinLength {
		return ErrTooShort
	}
	h, err := Hash(password)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hash = h
	if err := s.save(); err != nil {
		return err
	}
	if s.plainFile != "" {
		os.Remove(s.plainFile) // it holds the old password now
	}
	return nil
}

// save writes the hash atomically (temp file + rename).
func (s *Store) save() error {
	if s.path == "" {
		return nil
	}
	b, _ := json.MarshalIndent(saved{PasswordHash: s.hash}, "", "  ")
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".adblocker-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(b, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path)
}
