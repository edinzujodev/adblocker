`go run ./cmd/masterpw` writes the master password's hash to `master.hash` in
this folder. That file is in `.gitignore` on purpose: it must never be
committed, so keep a backup of the master password yourself. Without it the
build simply has no master password.
