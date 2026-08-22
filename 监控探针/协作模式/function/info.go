// Package function 提供设备信息获取函数，用于采集当前节点的静态硬件信息。
//
// 使用方式：
//  1. 导入本包后直接调用 GetDeviceInfo()
//     info, err := function.GetDeviceInfo()
//     if err != nil {
//     // 处理错误
//     }
//     // 使用返回的 info 字段，如 info.CPUModel、info.Cores 等
//
// 返回内容说明：
//   - CPUModel：CPU型号字符串（例如 "Intel(R) Core(TM) i7-8650U"）
//   - Cores：物理或逻辑核心数（来自 gopsutil 的 Info.Cores）
//   - MemorySizeMB：内存总量，单位 MB
//   - DiskSizeMB：系统盘总量，单位 MB；优先尝试 "/"，在 Windows 上回退到 "C:\\"
package function

import (
	"runtime"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

// DeviceInfo 描述设备静态硬件信息。
// 字段单位与含义：
//   - CPUModel：CPU型号名称
//   - Cores：CPU核心数
//   - MemorySizeMB：内存总量（MB）
//   - DiskSizeMB：磁盘总量（MB）
type DeviceInfo struct {
	CPUModel     string
	Cores        int
	MemorySizeMB float64
	DiskSizeMB   float64
}

// GetDeviceInfo 采集当前设备的 CPU 型号、核心数、内存总量（MB）与磁盘总量（MB）。
// 跨平台说明：优先从根分区 "/" 读取磁盘信息；若失败则回退 Windows 的 "C:\\"。
// 错误：任一底层采集失败会返回非 nil 的错误与零值 DeviceInfo。
func GetDeviceInfo() (DeviceInfo, error) {
	var info DeviceInfo

	cpus, err := cpu.Info()
	if err != nil {
		return info, err
	}
	if len(cpus) > 0 {
		info.CPUModel = cpus[0].ModelName
	}
	logicalCores := runtime.NumCPU()
	if logicalCores > 0 {
		info.Cores = logicalCores
	} else {
		cores, cerr := cpu.Counts(true)
		if cerr == nil && cores > 0 {
			info.Cores = cores
		} else if len(cpus) > 0 {
			info.Cores = int(cpus[0].Cores)
		}
	}

	vmStat, err := mem.VirtualMemory()
	if err != nil {
		return info, err
	}
	// Total 为字节数，转换为 MB
	info.MemorySizeMB = float64(vmStat.Total) / (1024 * 1024)

	diskStat, err := disk.Usage("/")
	if err != nil {
		diskStat, err = disk.Usage("C:\\")
		if err != nil {
			return info, err
		}
	}
	// Total 为字节数，转换为 MB
	info.DiskSizeMB = float64(diskStat.Total) / (1024 * 1024)

	return info, nil
}
