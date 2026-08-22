package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"xmp-monitor/function"

	_ "modernc.org/sqlite"
)

// App 应用程序结构
type App struct {
	db          *function.Database
	mutex       sync.Mutex
	lastMonitor time.Time
}

// APIRequest API请求结构
type APIRequest struct {
	DayOffset int `json:"day_offset"`
}

// APIResponse API响应结构
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

	// 初始化应用
	if err := app.initialize(); err != nil {
		log.Fatalf("应用初始化失败: %v", err)
	}

	// 设置路由
	http.HandleFunc("/", app.handleRequest)
	http.HandleFunc("/system", app.handleSystem)
	http.HandleFunc("/version", app.handleVersion)

	// 启动HTTPS服务器
	if err := app.startServer(); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}

// initialize 初始化应用程序
func (app *App) initialize() error {
	// 获取程序所在目录
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取程序路径失败: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	monitorDir := filepath.Join(exeDir, "monitor")
	if mkErr := os.MkdirAll(monitorDir, 0755); mkErr != nil {
		return fmt.Errorf("创建运行目录失败: %v", mkErr)
	}

	// 初始化数据库
	dbPath := filepath.Join(monitorDir, "monitor.db")
	db, err := function.NewDatabase(dbPath)
	if err != nil {
		return fmt.Errorf("初始化数据库失败: %v", err)
	}
	app.db = db

	// 启动监控定时器
	app.startMonitorTicker()

	app.startHeartbeatReporter(filepath.Join(exeDir, "daemon.sock"))
	fmt.Printf("应用初始化成功，模式: 协作模式\n")
	return nil
}

func (app *App) startHeartbeatReporter(sockPath string) {
	pid := os.Getpid()
	serviceName := "xmp-monitor"
	hadError := false

	sendOnce := func() {
		err := sendHeartbeat(sockPath, serviceName, pid)
		if err != nil {
			if !hadError {
				fmt.Printf("心跳上报失败: %v\n", err)
				hadError = true
			}
			return
		}
		if hadError {
			fmt.Printf("心跳上报恢复\n")
			hadError = false
		}
	}

	go func() {
		sendOnce()
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			sendOnce()
		}
	}()
}

func sendHeartbeat(sockPath, service string, pid int) error {
	conn, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()

	msg := struct {
		Type    string `json:"type"`
		Service string `json:"service"`
		Pid     int    `json:"pid"`
	}{
		Type:    "heartbeat",
		Service: service,
		Pid:     pid,
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	payload = append(payload, '\n')
	_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_, err = conn.Write(payload)
	return err
}

// startMonitorTicker 启动监控定时器
func (app *App) startMonitorTicker() {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			app.collectMonitorData()
		}
	}()

	// 立即执行一次监控数据收集
	app.collectMonitorData()
}

// collectMonitorData 收集监控数据
func (app *App) collectMonitorData() {
	app.mutex.Lock()
	defer app.mutex.Unlock()

	// 获取系统负载
	load, err := function.GetSystemLoad()
	if err != nil {
		fmt.Printf("获取系统负载失败: %v\n", err)
		return
	}

	// 创建监控数据
	data := function.MonitorData{
		Timestamp:    time.Now().Truncate(5 * time.Minute), // 截断到5分钟
		CPUUsage:     load.CPUUsage,
		MemoryUsage:  load.MemoryUsage,
		DiskUsage:    load.DiskUsage,
		UploadMBps:   load.UploadMBps,
		DownloadMBps: load.DownloadMBps,
	}

	// 插入或更新数据
	if insErr := app.db.InsertOrUpdateData(data); insErr != nil {
		fmt.Printf("插入监控数据失败: %v\n", insErr)
	}

	app.lastMonitor = time.Now()
}

// startServer 启动HTTPS服务器
func (app *App) startServer() error {
	// 获取程序所在目录
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取程序路径失败: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	monitorDir := filepath.Join(exeDir, "monitor")
	if mkErr := os.MkdirAll(monitorDir, 0755); mkErr != nil {
		return fmt.Errorf("创建运行目录失败: %v", mkErr)
	}

	sockPath := filepath.Join(monitorDir, "xmp-monitor.sock")
	if rmErr := os.Remove(sockPath); rmErr != nil && !os.IsNotExist(rmErr) {
		return fmt.Errorf("清理socket失败: %v", rmErr)
	}

	listener, lerr := net.Listen("unix", sockPath)
	if lerr != nil {
		return fmt.Errorf("创建socket监听失败: %v", lerr)
	}
	defer listener.Close()
	defer os.Remove(sockPath)

	if chErr := os.Chmod(sockPath, 0600); chErr != nil {
		return fmt.Errorf("设置socket权限失败: %v", chErr)
	}

	server := &http.Server{
		Handler:           nil,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
	fmt.Printf("Unix Socket HTTP服务器启动成功，socket: %s\n", sockPath)
	return server.Serve(listener)
}

// handleRequest 处理API请求
func (app *App) handleRequest(w http.ResponseWriter, r *http.Request) {
	// 只允许POST请求
	if r.Method != http.MethodPost {
		app.sendErrorResponse(w, http.StatusMethodNotAllowed, "只允许POST请求")
		return
	}

	// 读取请求体
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			app.sendErrorResponse(w, http.StatusRequestEntityTooLarge, "请求体过大")
			return
		}
		app.sendErrorResponse(w, http.StatusBadRequest, "读取请求体失败")
		return
	}

	// 解析请求
	var request APIRequest
	if uerr := json.Unmarshal(body, &request); uerr != nil {
		app.sendErrorResponse(w, http.StatusBadRequest, "解析请求失败")
		return
	}

	// 获取数据
	response, err := app.getData(request.DayOffset)
	if err != nil {
		app.sendErrorResponse(w, http.StatusInternalServerError, fmt.Sprintf("获取数据失败: %v", err))
		return
	}

	// 发送响应
	app.sendSuccessResponse(w, response)
}

func (app *App) handleSystem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if r.Method == http.MethodPost {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				w.WriteHeader(http.StatusRequestEntityTooLarge)
				return
			}
			w.WriteHeader(http.StatusBadRequest)
			return
		}
	}

	usage, err := function.GetSystemUsage()
	if err != nil {
		app.sendSystemError(w, http.StatusInternalServerError, fmt.Sprintf("获取系统资源失败: %v", err))
		return
	}

	app.sendSystemSuccess(w, &usage)
}

// getData 获取指定天数的数据
func (app *App) getData(dayOffset int) (*APIResponse, error) {
	// 获取监控数据
	monitorData, err := app.db.GetDataByDay(dayOffset)
	if err != nil {
		return nil, err
	}

	// 获取设备信息
	deviceInfo, err := function.GetDeviceInfo()
	if err != nil {
		return nil, err
	}

	// 获取月流量
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

// sendSuccessResponse 发送成功响应
func (app *App) sendSuccessResponse(w http.ResponseWriter, data *APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if encErr := json.NewEncoder(w).Encode(data); encErr != nil {
		fmt.Printf("发送响应失败: %v\n", encErr)
	}
}

// sendErrorResponse 发送错误响应
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
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	var req map[string]any
	if decErr := dec.Decode(&req); decErr != nil {
		var maxErr *http.MaxBytesError
		if errors.As(decErr, &maxErr) {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Version string `json:"version"`
	}{Version: "ym-lite v1.0.1"})
}
