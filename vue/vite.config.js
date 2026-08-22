import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 只在明确需要时启用Vue DevTools，避免扩展冲突
    // vueDevTools()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 开发服务器配置
  server: {
    // 明确指定主机和端口，避免IPv6权限问题
    host: '127.0.0.1',
    port: 8889,
    // 反向代理配置
    proxy: {
      // 将 /api 的请求转发到后端服务
      '/api': {
        target: 'https://127.0.0.1:5889',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  // 构建配置
  build: {
    outDir: '../api/html',
    emptyOutDir: true,
    // 去除生产环境的控制台日志
    terserOptions: {
      compress: {
        // 删除console语句
        drop_console: true,
        // 删除debugger语句
        drop_debugger: true,
      },
    },
    // 启用gzip压缩
    rollupOptions: {
      output: {
        // 对打包后的文件进行gzip压缩
        manualChunks: {
          // 分包策略，优化加载性能
          vendor: ['vue', 'vue-router'],
        },
      },
    },
    // 生成.gz文件
    reportCompressedSize: true,
  },
})
