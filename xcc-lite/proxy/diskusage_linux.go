//go:build linux

package proxy

import "golang.org/x/sys/unix"

func diskUsageFraction(path string) (float64, error) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, err
	}
	blocks := float64(st.Blocks)
	if blocks <= 0 {
		return 0, nil
	}
	avail := float64(st.Bavail)
	used := blocks - avail
	if used < 0 {
		used = 0
	}
	return used / blocks, nil
}

