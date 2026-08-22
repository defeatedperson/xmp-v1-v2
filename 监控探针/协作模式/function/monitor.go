package function

import (
    "strings"
    "time"

    "github.com/shirou/gopsutil/v3/cpu"
    "github.com/shirou/gopsutil/v3/disk"
    "github.com/shirou/gopsutil/v3/mem"
    "github.com/shirou/gopsutil/v3/net"
)

// Package function 负载监控：提供采集系统负载的函数。
//
// 使用方式：
//  1) 调用 GetSystemLoad() 获取一次负载快照：
//     load, err := function.GetSystemLoad()
//     if err != nil {
//         // 处理错误
//     }
//     // 使用 load.CPUUsage / load.MemoryUsage / load.DiskUsage / load.UploadMBps / load.DownloadMBps
//
// 返回内容说明（单位）：
//  - CPUUsage：CPU 使用率，百分比 [0,100]
//  - MemoryUsage：内存使用率，百分比 [0,100]
//  - DiskUsage：磁盘使用率，百分比 [0,100]
//  - UploadMBps：上行带宽瞬时速率，MB/s（采样 1 秒）
//  - DownloadMBps：下行带宽瞬时速率，MB/s（采样 1 秒）
type SystemLoad struct {
    CPUUsage       float64
    MemoryUsage    float64
    DiskUsage      float64
    UploadMBps     float64
    DownloadMBps   float64
}

// GetSystemLoad 采集当前系统负载的快照。
// 跨平台说明：磁盘使用率优先尝试 "/"，在 Windows 上回退到 "C:\\"；网卡统计会过滤常见虚拟接口。
func GetSystemLoad() (SystemLoad, error) {
    var load SystemLoad

    cpuPercent, err := cpu.Percent(time.Second, false)
    if err != nil {
        return load, err
    }
    if len(cpuPercent) > 0 {
        load.CPUUsage = cpuPercent[0]
    }

    vmStat, err := mem.VirtualMemory()
    if err != nil {
        return load, err
    }
    load.MemoryUsage = vmStat.UsedPercent

    diskStat, err := disk.Usage("/")
    if err != nil {
        diskStat, err = disk.Usage("C:\\")
        if err != nil {
            return load, err
        }
    }
    load.DiskUsage = diskStat.UsedPercent

    up, down, err := bandwidthMBps()
    if err != nil {
        return load, err
    }
    load.UploadMBps = up
    load.DownloadMBps = down

    return load, nil
}

// bandwidthMBps 以 1 秒采样窗口计算上/下行瞬时速率（MB/s），过滤常见虚拟网卡。
func bandwidthMBps() (uploadMBps, downloadMBps float64, err error) {
    start, err := net.IOCounters(true)
    if err != nil {
        return 0, 0, err
    }

    time.Sleep(time.Second)

    end, err := net.IOCounters(true)
    if err != nil {
        return 0, 0, err
    }

    var upBytes, downBytes uint64
    for i := range start {
        if i < len(end) && start[i].Name == end[i].Name {
            if isVirtualInterface(start[i].Name) {
                continue
            }
            upBytes += end[i].BytesSent - start[i].BytesSent
            downBytes += end[i].BytesRecv - start[i].BytesRecv
        }
    }

    uploadMBps = float64(upBytes) / (1024 * 1024)
    downloadMBps = float64(downBytes) / (1024 * 1024)
    return uploadMBps, downloadMBps, nil
}

// isVirtualInterface 判断是否为常见虚拟/环回网卡，避免干扰带宽统计。
func isVirtualInterface(name string) bool {
    prefixes := []string{
        "docker", "veth", "br-", "lo", "Loopback",
        "vmnet", "vboxnet", "tun", "tap", "vEthernet",
        "Hyper-V", "VMware", "Bluetooth",
    }
    n := strings.ToLower(name)
    for _, p := range prefixes {
        pl := strings.ToLower(p)
        if strings.HasPrefix(n, pl) || strings.Contains(n, pl) {
            return true
        }
    }
    return false
}