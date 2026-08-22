package function

import "math"

type SystemUsage struct {
	CPU    int `json:"cpu"`
	Memory int `json:"memory"`
}

func GetSystemUsage() (SystemUsage, error) {
	load, err := GetSystemLoad()
	if err != nil {
		return SystemUsage{}, err
	}
	return SystemUsage{
		CPU:    int(math.Round(load.CPUUsage)),
		Memory: int(math.Round(load.MemoryUsage)),
	}, nil
}
