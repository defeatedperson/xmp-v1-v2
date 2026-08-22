//go:build !linux

package proxy

import "os"

func diskUsageFraction(path string) (float64, error) {
	if _, err := os.Stat(path); err != nil {
		return 0, err
	}
	return 0, nil
}

