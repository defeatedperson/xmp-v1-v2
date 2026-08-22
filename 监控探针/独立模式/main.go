package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"xmp-monitor/function"

	_ "modernc.org/sqlite"
)

type App struct {
	db          *function.Database
	mutex       sync.Mutex
	lastMonitor time.Time
}

type APIRequest struct {
	DayOffset int `json:"day_offset"`
}

type APIResponse struct {
	Success        bool                     `json:"success"`
	Message        string                   `json:"message,omitempty"`
	MonitorData    []function.MonitorData   `json:"monitor_data,omitempty"`
	DeviceInfo     *function.DeviceInfo     `json:"device_info,omitempty"`
	MonthlyTraffic *function.MonthlyTraffic `json:"monthly_traffic,omitempty"`
}

type SystemUsageResponse struct {
	Success bool                  `json:"success"`
	Message string                `json:"message,omitempty"`
	Data    *function.SystemUsage `json:"data,omitempty"`
}

const (
	maxBodyBytes      = 1 << 20
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 10 * time.Second
	writeTimeout      = 15 * time.Second
	idleTimeout       = 60 * time.Second
)

func main() {
	app := &App{}

	if err := app.initialize(); err != nil {
		log.Fatalf("应用初始化失败: %v", err)
	}

	http.HandleFunc("/monitor", app.handleMonitor)
	http.HandleFunc("/system", app.handleSystem)
	http.HandleFunc("/version", app.handleVersion)

	if err := app.startServer(); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}

func (app *App) initialize() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取程序路径失败: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	monitorDir := filepath.Join(exeDir, "monitor")
	if mkErr := os.MkdirAll(monitorDir, 0755); mkErr != nil {
		return fmt.Errorf("创建运行目录失败: %v", mkErr)
	}

	if err = app.loadEnvConfig(exeDir); err != nil {
		return err
	}

	if err = app.checkCerts(exeDir); err != nil {
		return err
	}

	dbPath := filepath.Join(monitorDir, "monitor.db")
	db, err := function.NewDatabase(dbPath)
	if err != nil {
		return fmt.Errorf("初始化数据库失败: %v", err)
	}
	app.db = db

	app.startMonitorTicker()

	fmt.Printf("应用初始化成功，端口: %d\n", app.getPort())
	return nil
}

func (app *App) loadEnvConfig(exeDir string) error {
	envPath := filepath.Join(exeDir, ".env")
	data, err := os.ReadFile(envPath)
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %v，请创建.env文件", err)
	}

	config = &Config{}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "PORT=") && len(line) > 5 {
			portStr := strings.TrimPrefix(line, "PORT=")
			if _, err := fmt.Sscanf(portStr, "%d", &config.Port); err != nil {
				return fmt.Errorf("解析PORT失败: %v", err)
			}
			if config.Port > 0 {
				return nil
			}
		}
	}
	return fmt.Errorf("未找到有效的PORT配置")
}

type Config struct {
	Port int
}

var config *Config

func (app *App) getPort() int {
	if config == nil {
		return 0
	}
	return config.Port
}

func (app *App) checkCerts(exeDir string) error {
	certDir := filepath.Join(exeDir, "cert")
	requiredFiles := []string{"cert.pem", "cert.key", "ca.pem"}

	for _, file := range requiredFiles {
		filePath := filepath.Join(certDir, file)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			return fmt.Errorf("证书文件缺失: %s，请将证书放入cert目录", file)
		}
	}
	return nil
}

func (app *App) startMonitorTicker() {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			app.collectMonitorData()
		}
	}()

	app.collectMonitorData()
}

func (app *App) collectMonitorData() {
	app.mutex.Lock()
	defer app.mutex.Unlock()

	load, err := function.GetSystemLoad()
	if err != nil {
		fmt.Printf("获取系统负载失败: %v\n", err)
		return
	}

	data := function.MonitorData{
		Timestamp:    time.Now().Truncate(5 * time.Minute),
		CPUUsage:     load.CPUUsage,
		MemoryUsage:  load.MemoryUsage,
		DiskUsage:    load.DiskUsage,
		UploadMBps:   load.UploadMBps,
		DownloadMBps: load.DownloadMBps,
	}

	if insErr := app.db.InsertOrUpdateData(data); insErr != nil {
		fmt.Printf("插入监控数据失败: %v\n", insErr)
	}

	app.lastMonitor = time.Now()
}

func (app *App) startServer() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取程序路径失败: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	certDir := filepath.Join(exeDir, "cert")

	tlsConfig, err := function.LoadMTLSCertificates(certDir)
	if err != nil {
		return fmt.Errorf("加载mTLS证书失败: %v", err)
	}

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", app.getPort()),
		Handler:           nil,
		TLSConfig:         tlsConfig,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}

	fmt.Printf("HTTPS服务器启动成功，地址: %s\n", server.Addr)
	return server.ListenAndServeTLS("", "")
}

func (app *App) handleMonitor(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		app.sendErrorResponse(w, http.StatusMethodNotAllowed, "只允许GET请求")
		return
	}

	dayOffset := 0
	if offsetStr := r.URL.Query().Get("day_offset"); offsetStr != "" {
		if _, err := fmt.Sscanf(offsetStr, "%d", &dayOffset); err != nil {
			app.sendErrorResponse(w, http.StatusBadRequest, "无效的day_offset参数")
			return
		}
		if dayOffset < 0 || dayOffset > 30 {
			app.sendErrorResponse(w, http.StatusBadRequest, "day_offset必须在0-30之间")
			return
		}
	}

	response, err := app.getData(dayOffset)
	if err != nil {
		app.sendErrorResponse(w, http.StatusInternalServerError, fmt.Sprintf("获取数据失败: %v", err))
		return
	}

	app.sendSuccessResponse(w, response)
}

func (app *App) handleSystem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		app.sendErrorResponse(w, http.StatusMethodNotAllowed, "只允许GET请求")
		return
	}

	usage, err := function.GetSystemUsage()
	if err != nil {
		app.sendSystemError(w, http.StatusInternalServerError, fmt.Sprintf("获取系统资源失败: %v", err))
		return
	}

	app.sendSystemSuccess(w, &usage)
}

func (app *App) getData(dayOffset int) (*APIResponse, error) {
	monitorData, err := app.db.GetDataByDay(dayOffset)
	if err != nil {
		return nil, err
	}

	deviceInfo, err := function.GetDeviceInfo()
	if err != nil {
		return nil, err
	}

	monthlyTraffic, err := function.GetMonthlyTraffic()
	if err != nil {
		return nil, err
	}

	response := &APIResponse{
		Success:        true,
		MonitorData:    monitorData,
		DeviceInfo:     &deviceInfo,
		MonthlyTraffic: &monthlyTraffic,
	}

	return response, nil
}

func (app *App) sendSuccessResponse(w http.ResponseWriter, data *APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if encErr := json.NewEncoder(w).Encode(data); encErr != nil {
		fmt.Printf("发送响应失败: %v\n", encErr)
	}
}

func (app *App) sendErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	response := &APIResponse{
		Success: false,
		Message: message,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if encErr := json.NewEncoder(w).Encode(response); encErr != nil {
		fmt.Printf("发送错误响应失败: %v\n", encErr)
	}
}

func (app *App) sendSystemSuccess(w http.ResponseWriter, usage *function.SystemUsage) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if encErr := json.NewEncoder(w).Encode(&SystemUsageResponse{
		Success: true,
		Data:    usage,
	}); encErr != nil {
		fmt.Printf("发送响应失败: %v\n", encErr)
	}
}

func (app *App) sendSystemError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if encErr := json.NewEncoder(w).Encode(&SystemUsageResponse{
		Success: false,
		Message: message,
	}); encErr != nil {
		fmt.Printf("发送响应失败: %v\n", encErr)
	}
}

func (app *App) handleVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Version string `json:"version"`
	}{Version: "xmp-monitor v2.0.0"})
}
