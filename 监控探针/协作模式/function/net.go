package function

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	gnet "github.com/shirou/gopsutil/v3/net"
)

type MonthlyTraffic struct {
	Month    string  `json:"month"`
	Upload   float64 `json:"upload"`
	Download float64 `json:"download"`
}

type trafficMonitor struct {
	mu             sync.Mutex
	lastIOCounters []gnet.IOCountersStat
	lastTime       time.Time
	totalUpload    float64
	totalDownload  float64
	currentMonth   string
}

var (
	tm   *trafficMonitor
	once sync.Once
)

func ensureStarted() {
	once.Do(func() {
		tm = &trafficMonitor{
			currentMonth: time.Now().Format("2006-01"),
			lastTime:     time.Now(),
		}

		if saved, err := loadMonthlyTraffic(); err == nil {
			if saved.Month == tm.currentMonth {
				tm.totalUpload = saved.Upload
				tm.totalDownload = saved.Download
			}
		}

		updateTicker := time.NewTicker(30 * time.Second)
		go func() {
			for range updateTicker.C {
				tm.update()
			}
		}()

		saveTicker := time.NewTicker(5 * time.Minute)
		go func() {
			for range saveTicker.C {
				saveMonthlyTraffic(tm.get())
			}
		}()
	})
}

func GetMonthlyTraffic() (MonthlyTraffic, error) {
	ensureStarted()
	tm.update()
	return tm.get(), nil
}

func (t *trafficMonitor) update() error {
	ioCounters, err := gnet.IOCounters(true)
	if err != nil {
		return err
	}

	now := time.Now()
	currentMonth := now.Format("2006-01")

	t.mu.Lock()
	defer t.mu.Unlock()

	if t.currentMonth != currentMonth {
		t.totalUpload = 0
		t.totalDownload = 0
		t.currentMonth = currentMonth
	}

	if len(t.lastIOCounters) > 0 {
		lastMap := make(map[string]gnet.IOCountersStat)
		for _, c := range t.lastIOCounters {
			lastMap[c.Name] = c
		}

		var upBytes, downBytes uint64
		for _, cur := range ioCounters {
			if isVirtualInterface(cur.Name) {
				continue
			}
			if prev, ok := lastMap[cur.Name]; ok {
				if cur.BytesSent >= prev.BytesSent {
					upBytes += cur.BytesSent - prev.BytesSent
				} else {
					upBytes += cur.BytesSent
				}
				if cur.BytesRecv >= prev.BytesRecv {
					downBytes += cur.BytesRecv - prev.BytesRecv
				} else {
					downBytes += cur.BytesRecv
				}
			}
		}

		t.totalUpload += float64(upBytes) / (1024 * 1024)
		t.totalDownload += float64(downBytes) / (1024 * 1024)
	}

	t.lastIOCounters = ioCounters
	t.lastTime = now

	return nil
}

func (t *trafficMonitor) get() MonthlyTraffic {
	t.mu.Lock()
	defer t.mu.Unlock()
	return MonthlyTraffic{
		Month:    t.currentMonth,
		Upload:   t.totalUpload,
		Download: t.totalDownload,
	}
}

func writeFileAtomic(filename string, data []byte, perm os.FileMode) error {
	temp := filename + ".tmp"
	if err := os.WriteFile(temp, data, perm); err != nil {
		return err
	}
	if err := os.Rename(temp, filename); err != nil {
		os.Remove(temp)
		return err
	}
	return nil
}

func monthlyTrafficFile() string {
	exePath, err := os.Executable()
	if err != nil {
		return "monthly_traffic.json"
	}
	exeDir := filepath.Dir(exePath)
	monitorDir := filepath.Join(exeDir, "monitor")
	_ = os.MkdirAll(monitorDir, 0755)
	return filepath.Join(monitorDir, "monthly_traffic.json")
}

func saveMonthlyTraffic(traffic MonthlyTraffic) error {
	data, err := json.MarshalIndent(traffic, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(monthlyTrafficFile(), data, 0644)
}

func loadMonthlyTraffic() (MonthlyTraffic, error) {
	filename := monthlyTrafficFile()
	currentMonth := time.Now().Format("2006-01")

	def := MonthlyTraffic{Month: currentMonth, Upload: 0, Download: 0}
	data, err := os.ReadFile(filename)
	if err != nil {
		if os.IsNotExist(err) {
			return def, nil
		}
		return def, err
	}
	var mt MonthlyTraffic
	if err := json.Unmarshal(data, &mt); err != nil {
		return def, err
	}
	if mt.Month != currentMonth {
		return def, nil
	}
	return mt, nil
}
