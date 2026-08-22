package main

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var (
	scriptDir string
	exeName   = "xmp-monitor.exe"
	envFile   string
	certDir   string
	certPem   string
	certKey   string
	caPem     string
)

func init() {
	exePath, _ := os.Executable()
	scriptDir = filepath.Dir(exePath)

	envFile = filepath.Join(scriptDir, "data", ".env")
	certDir = filepath.Join(scriptDir, "data", "cert")
	certPem = filepath.Join(certDir, "cert.pem")
	certKey = filepath.Join(certDir, "cert.key")
	caPem = filepath.Join(certDir, "ca.pem")
}

func isTempDirectory(path string) bool {
	lower := strings.ToLower(path)
	tempPatterns := []string{"temp", "appdata\\local\\temp", "download", "下载"}
	for _, pattern := range tempPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

func getCurrentStatus() (configured bool, port string, certComplete bool, running bool) {
	configured = false
	port = "未设置"
	certComplete = false
	running = false

	if _, err := os.Stat(envFile); err == nil {
		configured = true
		if content, err := os.ReadFile(envFile); err == nil {
			re := regexp.MustCompile(`PORT=(\d+)`)
			matches := re.FindStringSubmatch(string(content))
			if len(matches) > 1 {
				port = matches[1]
			}
		}
	}

	if _, err := os.Stat(certPem); err == nil {
		if _, err := os.Stat(certKey); err == nil {
			if _, err := os.Stat(caPem); err == nil {
				certComplete = true
			}
		}
	}

	cmd := exec.Command("tasklist", "/FI", "IMAGENAME eq "+exeName)
	output, _ := cmd.Output()
	if strings.Contains(string(output), exeName) {
		running = true
	}

	return
}

func writeMenu(statusText string) {
	fmt.Println("\n========================================")
	fmt.Println("   XMP 监控探针 - Windows 管理工具")
	fmt.Println("========================================")
	fmt.Println("")
	fmt.Println("当前状态:")
	fmt.Print(statusText)
	fmt.Println("")
	fmt.Println("========================================")
}

func getStatusText() string {
	configured, port, certComplete, running := getCurrentStatus()

	configText := "未配置"
	if configured {
		configText = "已配置"
	}
	certText := "缺失"
	if certComplete {
		certText = "完整"
	}
	runText := "已停止"
	if running {
		runText = "运行中"
	}

	return fmt.Sprintf("  - 配置: %s\n  - 端口: %s\n  - 证书: %s\n  - 运行: %s", configText, port, certText, runText)
}

func initializeConfig() bool {
	fmt.Println("请粘贴配置信息：")
	fmt.Println("1. 复制主控端生成的完整安装命令")
	fmt.Println("2. 在窗口中粘贴")
	fmt.Println("3. 按 Ctrl+Z(一起按，一次即可） 然后回车确认")
	fmt.Println("")
	fmt.Println("例如: NODE_ID=66 PORT=50924 CERT_PEM_B64='...'")
	fmt.Println("")

	reader := bufio.NewReader(os.Stdin)
	var lines []string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		lines = append(lines, line)
	}

	inputText := strings.Join(lines, "")

	portRe := regexp.MustCompile(`PORT=(\d+)`)
	matches := portRe.FindStringSubmatch(inputText)
	if len(matches) < 2 {
		fmt.Println("错误: 未找到 PORT 字段")
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}
	port := matches[1]

	var certPemB64, certKeyB64, caPemB64 string

	certPemRe := regexp.MustCompile(`CERT_PEM_B64='([^']+)'`)
	matches = certPemRe.FindStringSubmatch(inputText)
	if len(matches) < 2 {
		certPemRe2 := regexp.MustCompile(`CERT_PEM_B64=([^\s]+)`)
		matches = certPemRe2.FindStringSubmatch(inputText)
		if len(matches) < 2 {
			fmt.Println("错误: 缺少 CERT_PEM_B64 字段")
			fmt.Print("按回车返回...")
			bufio.NewReader(os.Stdin).ReadString('\n')
			return false
		}
		certPemB64 = matches[1]
	} else {
		certPemB64 = matches[1]
	}

	certKeyRe := regexp.MustCompile(`CERT_KEY_B64='([^']+)'`)
	matches = certKeyRe.FindStringSubmatch(inputText)
	if len(matches) < 2 {
		certKeyRe2 := regexp.MustCompile(`CERT_KEY_B64=([^\s]+)`)
		matches = certKeyRe2.FindStringSubmatch(inputText)
		if len(matches) < 2 {
			fmt.Println("错误: 缺少 CERT_KEY_B64 字段")
			fmt.Print("按回车返回...")
			bufio.NewReader(os.Stdin).ReadString('\n')
			return false
		}
		certKeyB64 = matches[1]
	} else {
		certKeyB64 = matches[1]
	}

	caPemRe := regexp.MustCompile(`CA_PEM_B64='([^']+)'`)
	matches = caPemRe.FindStringSubmatch(inputText)
	if len(matches) < 2 {
		caPemRe2 := regexp.MustCompile(`CA_PEM_B64=([^\s]+)`)
		matches = caPemRe2.FindStringSubmatch(inputText)
		if len(matches) < 2 {
			fmt.Println("错误: 缺少 CA_PEM_B64 字段")
			fmt.Print("按回车返回...")
			bufio.NewReader(os.Stdin).ReadString('\n')
			return false
		}
		caPemB64 = matches[1]
	} else {
		caPemB64 = matches[1]
	}

	dataDir := filepath.Join(scriptDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		fmt.Printf("错误: 创建目录失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	fmt.Println("正在写入配置文件...")
	envContent := fmt.Sprintf("PORT=%s\n", port)
	if err := os.WriteFile(envFile, []byte(envContent), 0644); err != nil {
		fmt.Printf("错误: 写入配置文件失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	fmt.Println("正在写入证书...")
	if err := os.MkdirAll(certDir, 0755); err != nil {
		fmt.Printf("错误: 创建证书目录失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	decodeAndWrite := func(b64Content, path string) error {
		decoded, err := base64.StdEncoding.DecodeString(b64Content)
		if err != nil {
			return err
		}
		return os.WriteFile(path, decoded, 0644)
	}

	if err := decodeAndWrite(certPemB64, certPem); err != nil {
		fmt.Printf("错误: 写入 cert.pem 失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	if err := decodeAndWrite(certKeyB64, certKey); err != nil {
		fmt.Printf("错误: 写入 cert.key 失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	if err := decodeAndWrite(caPemB64, caPem); err != nil {
		fmt.Printf("错误: 写入 ca.pem 失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	fmt.Println("配置完成!")
	time.Sleep(2 * time.Second)
	return true
}

func startMonitor() bool {
	exePath := filepath.Join(scriptDir, "data", exeName)
	if _, err := os.Stat(exePath); os.IsNotExist(err) {
		fmt.Printf("错误: 未找到 %s\n", exeName)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	fmt.Println("========================================")
	fmt.Println("   警告")
	fmt.Println("========================================")
	fmt.Println("")
	fmt.Println("监控程序启动时会出现控制台窗口，这是正常现象。")
	fmt.Println("如果窗口立即闪退，可能是配置错误或端口被占用。")
	fmt.Println("")
	fmt.Print("是否继续启动？[Y/N]: ")

	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)
	if input != "Y" && input != "y" {
		return false
	}

	cmd := exec.Command("cmd", "/c", "start", "", exePath)
	cmd.Dir = filepath.Join(scriptDir, "data")
	if err := cmd.Start(); err != nil {
		fmt.Printf("错误: 启动失败 - %v\n", err)
		fmt.Print("按回车返回...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		return false
	}

	fmt.Println("监控已启动")
	time.Sleep(2 * time.Second)
	return true
}

func stopMonitor() bool {
	cmd := exec.Command("taskkill", "/IM", exeName, "/F")
	_, err := cmd.Output()
	if err != nil {
		fmt.Println("监控未运行")
	} else {
		fmt.Println("监控已停止")
	}
	time.Sleep(2 * time.Second)
	return true
}

func main() {
	if isTempDirectory(scriptDir) {
		fmt.Println("========================================")
		fmt.Println("   警告")
		fmt.Println("========================================")
		fmt.Println("")
		fmt.Println("检测到当前可能在临时目录中运行。")
		fmt.Println("请将程序移动到其他目录后再运行！")
		fmt.Println("")
		fmt.Printf("当前目录: %s\n", scriptDir)
		fmt.Println("")
		fmt.Print("按回车退出...")
		bufio.NewReader(os.Stdin).ReadString('\n')
		os.Exit(0)
	}

	for {
		statusText := getStatusText()

		writeMenu(statusText)

		configured, _, _, _ := getCurrentStatus()

		options := []string{}
		if !configured {
			options = append(options, "0. 初始化配置")
			options = append(options, "1. 启动监控")
			options = append(options, "2. 停止监控")
			options = append(options, "3. 更新证书")
			options = append(options, "4. 退出")
		} else {
			options = append(options, "1. 启动监控")
			options = append(options, "2. 停止监控")
			options = append(options, "3. 更新证书")
			options = append(options, "0. 退出")
		}

		for _, opt := range options {
			fmt.Println(opt)
		}
		fmt.Println("")

		fmt.Print("请选择: ")
		reader := bufio.NewReader(os.Stdin)
		choice, _ := reader.ReadString('\n')
		choice = strings.TrimSpace(choice)

		switch choice {
		case "0":
			if configured {
				os.Exit(0)
			} else {
				initializeConfig()
			}
		case "1":
			startMonitor()
		case "2":
			stopMonitor()
		case "3":
			initializeConfig()
		case "4":
			if !configured {
				os.Exit(0)
			}
		}
	}
}
