//go:build !linux
// +build !linux

package main

import "fmt"

func main() {
	fmt.Println("该守护进程仅支持在 Linux 环境运行/编译，请使用 GOOS=linux 构建。")
}

