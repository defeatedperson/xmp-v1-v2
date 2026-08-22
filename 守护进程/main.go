//go:build linux
// +build linux

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// 配置常量
const (
	SocketFileName        = "daemon.sock"
	LogFileName           = "data/log/daemon.log"
	NodeAgentBin          = "./node-agent"
	MonitorBin            = "./xmp-monitor"
	BusinessUser          = "xmpanel"
	DockerGroup           = "docker"
	MaxRestartsPerMin     = 4
	LogMaxLines           = 200
	HeartbeatTimeout      = 3 * time.Minute
	HeartbeatCheckInt     = 30 * time.Second
	MaxNoHeartbeatRestart = 3
)

// 全局变量
var (
	workDir        string
	appLogger      *Logger
	rateLimiter    *RateLimiter
	procMgr        *ProcessManager
	businessUid    uint32
	businessGid    uint32
	businessGroups []uint32
)

// Logger 简单的文件日志记录器，支持行数限制
type Logger struct {
	mu       sync.Mutex
	filePath string
}

func NewLogger(path string) *Logger {
	// 确保日志目录存在
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Printf("无法创建日志目录: %v\n", err)
	}
	return &Logger{filePath: path}
}

// Log 写入日志
func (l *Logger) Log(format string, v ...interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	msg := fmt.Sprintf(format, v...)
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	line := fmt.Sprintf("[%s] %s\n", timestamp, msg)

	// 打开文件追加
	f, err := os.OpenFile(l.filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("无法写入日志: %v\n", err)
		return
	}
	f.WriteString(line)
	f.Close()

	// 触发清理（简单起见，每次写入后检查，或者可以异步做）
	// 为性能考虑，这里简化为不做实时清理，实际生产中应定期清理
}

// Rotate 保留最近 N 行（使用原子操作避免竞争条件）
func (l *Logger) Rotate() {
	l.mu.Lock()
	defer l.mu.Unlock()

	// 读取当前文件内容
	f, err := os.Open(l.filePath)
	if err != nil {
		return
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if len(lines) <= LogMaxLines {
		return
	}

	// 保留最后 N 行
	keep := lines[len(lines)-LogMaxLines:]

	// 创建临时文件写入新内容
	tempPath := l.filePath + ".tmp"
	tempFile, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return
	}

	for _, line := range keep {
		tempFile.WriteString(line + "\n")
	}
	tempFile.Close()

	// 原子性重命名临时文件到目标文件
	if err := os.Rename(tempPath, l.filePath); err != nil {
		// 如果重命名失败，清理临时文件
		os.Remove(tempPath)
	}
}

// RateLimiter 重启风暴防护
type RateLimiter struct {
	mu     sync.Mutex
	counts []time.Time
	limit  int
	window time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:  limit,
		window: window,
		counts: make([]time.Time, 0),
	}
}

// Allow 检查是否允许操作
func (r *RateLimiter) Allow() bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	// 清理过期的记录
	valid := make([]time.Time, 0)
	for _, t := range r.counts {
		if now.Sub(t) <= r.window {
			valid = append(valid, t)
		}
	}
	r.counts = valid

	if len(r.counts) >= r.limit {
		return false
	}

	r.counts = append(r.counts, now)
	return true
}

// ProcessManager 业务进程管理
type ProcessManager struct {
	mu           sync.Mutex
	services     map[string]*ServiceInfo
	shuttingDown bool
}

type ServiceInfo struct {
	Name                       string
	CmdPath                    string
	Cmd                        *exec.Cmd
	Running                    bool
	Stopping                   bool
	Pid                        int
	StartTime                  time.Time
	RestartCount               int
	LastHeart                  time.Time
	NoHeartbeatRestartCount    int
	NoHeartbeatRestartDisabled bool
	exitCh                     chan struct{}
}

func NewProcessManager() *ProcessManager {
	pm := &ProcessManager{services: make(map[string]*ServiceInfo)}
	pm.services["node-agent"] = &ServiceInfo{Name: "node-agent", CmdPath: NodeAgentBin}
	pm.services["xmp-monitor"] = &ServiceInfo{Name: "xmp-monitor", CmdPath: MonitorBin}
	return pm
}

func (pm *ProcessManager) BeginShutdown() {
	pm.mu.Lock()
	pm.shuttingDown = true
	pm.mu.Unlock()
}

func (pm *ProcessManager) StartHeartbeatMonitor() {
	ticker := time.NewTicker(HeartbeatCheckInt)
	for range ticker.C {
		now := time.Now()

		var toRestart []struct {
			name string
			pid  int
		}

		pm.mu.Lock()
		for name, s := range pm.services {
			if !s.Running || s.Pid == 0 {
				continue
			}
			if s.NoHeartbeatRestartDisabled {
				continue
			}

			if now.Sub(s.LastHeart) <= HeartbeatTimeout {
				continue
			}

			if s.NoHeartbeatRestartCount >= MaxNoHeartbeatRestart {
				s.NoHeartbeatRestartDisabled = true
				appLogger.Log("心跳超时重启已停止: %s (已尝试%d次)", name, s.NoHeartbeatRestartCount)
				continue
			}

			toRestart = append(toRestart, struct {
				name string
				pid  int
			}{name: name, pid: s.Pid})
		}
		pm.mu.Unlock()

		for _, item := range toRestart {
			pm.restartIfNoHeartbeat(item.name, item.pid)
		}
	}
}

func (pm *ProcessManager) restartIfNoHeartbeat(name string, pid int) {
	pm.mu.Lock()
	s, ok := pm.services[name]
	if !ok || !s.Running || s.Pid != pid || s.NoHeartbeatRestartDisabled {
		pm.mu.Unlock()
		return
	}
	last := s.LastHeart
	pm.mu.Unlock()

	appLogger.Log("检测到心跳超时，尝试重启: %s (PID:%d, last:%s)", name, pid, last.Format(time.RFC3339))

	for attempt := 1; attempt <= MaxNoHeartbeatRestart; attempt++ {
		pm.mu.Lock()
		s, ok = pm.services[name]
		if !ok || !s.Running || s.Pid != pid || s.NoHeartbeatRestartDisabled {
			pm.mu.Unlock()
			return
		}
		s.NoHeartbeatRestartCount = attempt
		pm.mu.Unlock()

		pm.RestartRequest(name, pid)

		pm.mu.Lock()
		s, ok = pm.services[name]
		isRunning := ok && s.Running
		pm.mu.Unlock()

		if isRunning {
			return
		}

		time.Sleep(2 * time.Second)
	}

	pm.mu.Lock()
	s, ok = pm.services[name]
	if ok {
		s.NoHeartbeatRestartDisabled = true
	}
	pm.mu.Unlock()
	appLogger.Log("心跳超时重启失败，停止尝试: %s (已尝试%d次)", name, MaxNoHeartbeatRestart)
}

// StartService 启动指定服务
func (pm *ProcessManager) StartService(name, binPath string) {
	pm.mu.Lock()
	s, ok := pm.services[name]
	if !ok {
		s = &ServiceInfo{Name: name, CmdPath: binPath}
		pm.services[name] = s
	}
	if s.Running {
		pm.mu.Unlock()
		return
	}
	s.Stopping = false

	cmd := exec.Command(binPath)
	cmd.Dir = workDir

	// 设置运行用户和进程组
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Credential: &syscall.Credential{Uid: businessUid, Gid: businessGid, Groups: businessGroups},
		Setpgid:    true, // 创建新的进程组，便于管理子进程
	}

	// 简单重定向输出到 /dev/null，因为业务日志自己管理
	// 实际也可以重定向到文件
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		pm.mu.Unlock()
		appLogger.Log("启动服务失败 %s: %v", name, err)
		return
	}

	appLogger.Log("服务已启动: %s (PID: %d)", name, cmd.Process.Pid)

	s.Cmd = cmd
	s.Running = true
	s.Pid = cmd.Process.Pid
	s.StartTime = time.Now()
	s.LastHeart = time.Now()
	s.RestartCount++
	s.exitCh = make(chan struct{})
	service := s
	pm.mu.Unlock()

	// 启动协程等待退出
	go func(s *ServiceInfo) {
		err := s.Cmd.Wait()
		var shouldRestart bool
		var wasStopping bool
		var isShuttingDown bool

		pm.mu.Lock()
		wasStopping = s.Stopping
		isShuttingDown = pm.shuttingDown
		s.Running = false
		s.Pid = 0
		if s.exitCh != nil {
			close(s.exitCh)
			s.exitCh = nil
		}
		pm.mu.Unlock()

		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			}
		}

		// 退出有两类：
		// 1) 守护进程优雅退出/主动停止导致的退出：不应触发自动重启，否则会在退出瞬间把服务又拉起，形成“守护进程退出但子进程残留”。
		// 2) 服务自身异常退出：应触发自动重启（受速率限制保护）。
		shouldRestart = !(isShuttingDown || wasStopping)

		if shouldRestart {
			appLogger.Log("服务意外退出: %s (ExitCode: %d)", s.Name, exitCode)
			pm.HandleExit(s.Name)
			return
		}

		appLogger.Log("服务已停止: %s (ExitCode: %d)", s.Name, exitCode)
	}(service)
}

// HandleExit 处理进程退出，尝试重启
func (pm *ProcessManager) HandleExit(name string) {
	// 检查速率限制
	if !rateLimiter.Allow() {
		appLogger.Log("拒绝重启 %s: 触发重启风暴保护 (1分钟内超过%d次)", name, MaxRestartsPerMin)
		return
	}

	pm.mu.Lock()
	service, ok := pm.services[name]
	pm.mu.Unlock()

	if !ok {
		return
	}

	appLogger.Log("正在尝试重启服务: %s", name)
	pm.StartService(name, service.CmdPath)
}

// RestartRequest 主动请求重启
func (pm *ProcessManager) RestartRequest(name string, pid int) {
	// 检查速率限制
	if !rateLimiter.Allow() {
		appLogger.Log("拒绝重启请求 %s: 触发重启风暴保护", name)
		return
	}

	pm.mu.Lock()
	service, ok := pm.services[name]
	if ok && service.Running && pid != 0 && service.Pid != pid {
		pm.mu.Unlock()
		appLogger.Log("拒绝重启请求 %s: PID不匹配(请求:%d, 当前:%d)", name, pid, service.Pid)
		return
	}
	pm.mu.Unlock()

	if !ok || !service.Running {
		// 如果没运行，直接启动
		if ok {
			pm.StartService(name, service.CmdPath)
		}
		return
	}

	appLogger.Log("收到重启请求，正在重启: %s", name)

	pm.stopService(name, 30*time.Second)

	// 重新启动
	pm.StartService(name, service.CmdPath)
}

func (pm *ProcessManager) stopService(name string, timeout time.Duration) {
	pm.mu.Lock()
	service, ok := pm.services[name]
	if !ok || !service.Running || service.Cmd == nil || service.Cmd.Process == nil || service.exitCh == nil {
		pm.mu.Unlock()
		return
	}
	service.Stopping = true
	proc := service.Cmd.Process
	exitCh := service.exitCh
	pm.mu.Unlock()

	// 首先向进程组发送 SIGTERM，确保所有子进程都能收到信号
	if err := syscall.Kill(-proc.Pid, syscall.SIGTERM); err != nil {
		// 如果进程组信号失败，回退到单个进程信号
		_ = proc.Signal(syscall.SIGTERM)
	}

	select {
	case <-exitCh:
		return
	case <-time.After(timeout):
		// 超时后强制终止整个进程组
		if err := syscall.Kill(-proc.Pid, syscall.SIGKILL); err != nil {
			// 如果进程组信号失败，回退到单个进程终止
			_ = proc.Kill()
		}
		select {
		case <-exitCh:
		case <-time.After(5 * time.Second):
		}
	}
}

// StopAll 停止所有服务
func (pm *ProcessManager) StopAll() {
	pm.BeginShutdown()
	pm.stopService("node-agent", 30*time.Second)
	pm.stopService("xmp-monitor", 30*time.Second)
}

// Request 消息结构
type Request struct {
	Type    string `json:"type"`
	Service string `json:"service"`
	Pid     int    `json:"pid"`
}

func main() {
	var err error
	exePath, err := os.Executable()
	if err != nil {
		panic(err)
	}
	workDir, err = filepath.Abs(filepath.Dir(exePath))
	if err != nil {
		panic(err)
	}

	// 切换工作目录
	os.Chdir(workDir)

	// 初始化日志
	appLogger = NewLogger(filepath.Join(workDir, LogFileName))
	appLogger.Log("守护进程启动")

	// 1. 用户环境检查与初始化
	if err := initUsers(); err != nil {
		appLogger.Log("致命错误: 用户环境初始化失败: %v", err)
		os.Exit(1)
	}

	if err := ensureBusinessDirs(); err != nil {
		appLogger.Log("致命错误: 业务目录初始化失败: %v", err)
		os.Exit(1)
	}

	// 2. 初始化组件
	rateLimiter = NewRateLimiter(MaxRestartsPerMin, time.Minute)
	procMgr = NewProcessManager()

	// 3. 启动业务进程
	// StartService 本身是非阻塞的：内部只负责启动子进程，并在单独协程中 Wait。
	procMgr.StartService("node-agent", NodeAgentBin)
	procMgr.StartService("xmp-monitor", MonitorBin)

	// 4. 启动 Socket 服务
	go startSocketServer()

	// 5. 启动心跳监测任务
	go procMgr.StartHeartbeatMonitor()

	// 6. 启动日志轮转任务 (每10分钟检查一次)
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			appLogger.Rotate()
		}
	}()

	// 7. 信号处理
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	appLogger.Log("收到信号 %v, 正在优雅退出...", sig)

	// 停止服务（使用进程组确保所有子进程都被终止）
	procMgr.StopAll()

	// 清理 Socket
	os.Remove(filepath.Join(workDir, SocketFileName))

	appLogger.Log("守护进程已优雅退出")
}

func initUsers() error {
	xmpanel, err := ensureUserExists(BusinessUser, "/bin/bash")
	if err != nil {
		return err
	}

	if groupErr := ensureUserInGroup(BusinessUser, DockerGroup); groupErr != nil {
		return groupErr
	}

	uid, _ := strconv.Atoi(xmpanel.Uid)
	gid, _ := strconv.Atoi(xmpanel.Gid)
	businessUid = uint32(uid)
	businessGid = uint32(gid)

	groupCmd := exec.Command("id", "-G", BusinessUser)
	groupOut, err := groupCmd.Output()
	if err != nil {
		return fmt.Errorf("获取用户组ID失败: %v", err)
	}
	fields := strings.Fields(string(groupOut))
	groupIDs := make([]uint32, 0, len(fields))
	for _, f := range fields {
		n, convErr := strconv.ParseUint(f, 10, 32)
		if convErr != nil {
			continue
		}
		groupIDs = append(groupIDs, uint32(n))
	}
	if len(groupIDs) == 0 {
		groupIDs = []uint32{businessGid}
	}
	businessGroups = groupIDs

	return nil
}

func ensureBusinessDirs() error {
	dataDir := filepath.Join(workDir, "data")
	wwwDir := filepath.Join(workDir, "data", "www")
	logDir := filepath.Join(workDir, "data", "log")
	monitorDir := filepath.Join(workDir, "monitor")

	dirs := []string{dataDir, wwwDir, logDir, monitorDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}

	// Set data directory ownership and permissions for xmpanel user
	if err := os.Chown(dataDir, int(businessUid), int(businessGid)); err != nil {
		return err
	}
	if err := os.Chmod(dataDir, 0755); err != nil {
		return err
	}

	// Set www directory ownership and permissions
	// xmpanel user as owner, 1777 permissions for container compatibility
	if err := os.Chown(wwwDir, int(businessUid), int(businessGid)); err != nil {
		return err
	}
	if err := os.Chmod(wwwDir, 01777); err != nil {
		return err
	}

	// Set log directory ownership and permissions
	if err := chownR(logDir, int(businessUid), int(businessGid)); err != nil {
		return err
	}
	if err := os.Chmod(logDir, 0750); err != nil {
		return err
	}

	// Set monitor directory ownership and permissions
	if err := chownR(monitorDir, int(businessUid), int(businessGid)); err != nil {
		return err
	}
	if err := os.Chmod(monitorDir, 0750); err != nil {
		return err
	}

	return nil
}

func chownR(root string, uid, gid int) error {
	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		return os.Chown(path, uid, gid)
	})
}

// startSocketServer 启动 Socket 监听
func startSocketServer() {
	sockPath := filepath.Join(workDir, SocketFileName)
	os.Remove(sockPath) // 清理旧的

	l, err := net.Listen("unix", sockPath)
	if err != nil {
		appLogger.Log("Socket 监听失败: %v", err)
		return
	}
	defer l.Close()

	// 设置权限 0660，所有者 xmpanel
	if err := os.Chown(sockPath, int(businessUid), int(businessGid)); err != nil {
		appLogger.Log("Socket 权限设置失败: %v", err)
	}
	if err := os.Chmod(sockPath, 0660); err != nil {
		appLogger.Log("Socket Mode 设置失败: %v", err)
	}

	for {
		conn, err := l.Accept()
		if err != nil {
			continue
		}
		go handleConnection(conn)
	}
}

// handleConnection 处理连接
func handleConnection(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Text()
		var req Request
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			continue
		}

		handleRequest(req)
	}
}

// handleRequest 处理具体请求
func handleRequest(req Request) {
	switch req.Type {
	case "heartbeat":
		// 更新心跳时间，这里暂未做超时强杀逻辑，仅更新状态
		procMgr.mu.Lock()
		if s, ok := procMgr.services[req.Service]; ok {
			if s.Running && req.Pid == s.Pid {
				s.LastHeart = time.Now()
				s.NoHeartbeatRestartCount = 0
				s.NoHeartbeatRestartDisabled = false
			}
		}
		procMgr.mu.Unlock()

	case "restart-self":
		// 业务请求重启自身
		go procMgr.RestartRequest(req.Service, req.Pid)

	case "restart-docker":
		// 请求重启 Docker
		go handleRestartDocker(req.Service, req.Pid)

	case "check-web-perm":
		// 请求修复Web目录权限
		go handleCheckWebPerm(req.Service, req.Pid)
	}
}

// handleRestartDocker 重启 Docker 引擎
func handleRestartDocker(service string, pid int) {
	if !isValidSender(service, pid) {
		return
	}
	if !rateLimiter.Allow() {
		appLogger.Log("拒绝重启 Docker: 触发重启风暴保护")
		return
	}

	appLogger.Log("开始重启 Docker 引擎...")
	// 尝试 systemctl restart docker
	cmd := exec.Command("systemctl", "restart", "docker")
	if err := cmd.Run(); err != nil {
		appLogger.Log("Docker 重启失败: %v", err)
	} else {
		appLogger.Log("Docker 重启成功")
	}
}

func isValidSender(service string, pid int) bool {
	procMgr.mu.Lock()
	defer procMgr.mu.Unlock()
	s, ok := procMgr.services[service]
	if !ok || !s.Running {
		return false
	}
	return pid != 0 && s.Pid == pid
}

func ensureUserExists(userName, shell string) (*user.User, error) {
	u, err := user.Lookup(userName)
	if _, ok := err.(user.UnknownUserError); ok {
		appLogger.Log("用户 %s 不存在，正在创建...", userName)
		if out, runErr := exec.Command("useradd", "-m", "-s", shell, userName).CombinedOutput(); runErr != nil {
			return nil, fmt.Errorf("创建用户失败: %v, output: %s", runErr, out)
		}
		u, err = user.Lookup(userName)
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func getUserGroupNames(userName string) ([]string, error) {
	out, err := exec.Command("id", "-nG", userName).Output()
	if err != nil {
		return nil, err
	}
	return strings.Fields(string(out)), nil
}

func ensureUserInGroup(userName, groupName string) error {
	groups, err := getUserGroupNames(userName)
	if err != nil {
		return fmt.Errorf("检查用户组失败: %v", err)
	}
	for _, g := range groups {
		if g == groupName {
			return nil
		}
	}
	appLogger.Log("用户 %s 不在 %s 组，正在添加...", userName, groupName)
	if out, runErr := exec.Command("usermod", "-aG", groupName, userName).CombinedOutput(); runErr != nil {
		return fmt.Errorf("添加用户到组失败: %v, output: %s", runErr, out)
	}
	return nil
}

// handleCheckWebPerm 修复Web目录权限
func handleCheckWebPerm(service string, pid int) {
	if !isValidSender(service, pid) {
		return
	}

	appLogger.Log("开始修复Web目录权限...")

	wwwDir := filepath.Join(workDir, "data", "www")

	// 确保目录存在
	if err := os.MkdirAll(wwwDir, 0755); err != nil {
		appLogger.Log("创建Web目录失败: %v", err)
		return
	}

	// 设置www目录本身所有权（不递归，避免影响容器挂载目录）
	if err := os.Chown(wwwDir, int(businessUid), int(businessGid)); err != nil {
		appLogger.Log("设置Web目录所有权失败: %v", err)
		return
	}

	// 设置1777权限（任何人可读写执行）
	if err := os.Chmod(wwwDir, 01777); err != nil {
		appLogger.Log("设置Web目录权限失败: %v", err)
		return
	}

	appLogger.Log("Web目录权限修复完成: %s", wwwDir)
}
