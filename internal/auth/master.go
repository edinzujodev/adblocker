package auth

import (
	"embed"
	"strings"
)

// keys holds master.hash once `go run ./cmd/masterpw` has written it. The file
// is git-ignored, so the hash is built into the program but never committed;
// the folder's README keeps the embed working on a fresh checkout.
//
//go:embed keys
var keys embed.FS

// masterHash is the hash of the master password: built into the program so
// it can't be changed from the web interface or on the server computer.
// Empty means no master password.
var masterHash = readMaster()

func readMaster() string {
	b, _ := keys.ReadFile("keys/master.hash") // missing: no master password
	return string(b)
}

// HasMaster reports whether a master password is built in.
func HasMaster() bool { return strings.TrimSpace(masterHash) != "" }

// CheckMaster reports whether password is the master password.
func CheckMaster(password string) bool { return Verify(masterHash, password) }
