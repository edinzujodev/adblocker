// Command masterpw sets the master password: the recovery password that is
// built into EasioProtect and can't be changed from the web interface.
//
//	go run ./cmd/masterpw
//
// It asks for the password twice (hidden) and writes its hash to
// internal/auth/keys/master.hash (git-ignored). Rebuild EasioProtect
// afterwards to use it.
package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/term"

	"adblocker/internal/auth"
)

const target = "internal/auth/keys/master.hash" // git-ignored: never committed

// minMaster is longer than the normal password's minimum: the same master
// password works in every copy of this build, and the hash ships with it.
const minMaster = 16

func main() {
	if _, err := os.Stat(filepath.Dir(target)); err != nil {
		fail("run this from the repository root (the folder with go.mod)")
	}
	pw := ask("New master password: ")
	if len([]rune(string(pw))) < minMaster {
		fail(fmt.Sprintf("use at least %d characters; a long random passphrase is best", minMaster))
	}
	if !bytes.Equal(pw, ask("Type it again: ")) {
		fail("the two passwords don't match")
	}
	h, err := auth.Hash(string(pw))
	if err != nil {
		fail(err.Error())
	}
	if err := os.WriteFile(target, []byte(h+"\n"), 0o644); err != nil {
		fail(err.Error())
	}
	fmt.Printf("Saved the master password's hash to %s.\n", target)
	fmt.Println("Rebuild EasioProtect to use it:  go build -o bin/adblocker.exe ./cmd/adblocker")
	fmt.Println("Keep the password itself somewhere safe; it can't be recovered from the hash.")
}

func ask(prompt string) []byte {
	fmt.Fprint(os.Stderr, prompt)
	pw, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if err != nil {
		fail("couldn't read the password (run this in a terminal): " + err.Error())
	}
	return bytes.TrimSpace(pw)
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "masterpw:", msg)
	os.Exit(1)
}
