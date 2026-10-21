//go:build !windows

package sysdns

func newSystem() (system, string) {
	return nil, "Only available on Windows. On the Raspberry Pi, set the Pi as the DNS server in your router instead."
}
