import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 允許從所有 IP 地址訪問
    port: 3001,      // 前端開發伺服器端口
    proxy: {
      // 將所有以 '/api' 開頭的請求代理到您的後端伺服器
      '/api': {
        target: 'http://10.28.141.12:9988', // 替換為您的後端伺服器地址和端口
        changeOrigin: true, // 更改請求的 Origin 頭部，以便後端正確處理
        secure: false, // 如果後端是 HTTP 而非 HTTPS，設置為 false
        // *** 修正點：移除 rewrite 規則，確保 /api 前綴被保留 ***
        // 因為您的後端路由 (例如 /api/voicetotext) 已經包含了 /api
        // 所以這裡不需要將其移除。
        // rewrite: (path) => path.replace(/^\/api/, ''), // 將此行註釋掉或移除
      },
      '/auth': { // 處理 /auth 開頭的 API 請求
        target: 'http://10.28.141.12:9988', // 您的後端真實位址
        changeOrigin: true, 
        secure: false,
      },
    },
    watch: {
      usePolling: true, // 在某些 Linux 環境或 WSL 中可能需要此選項
    },
  },
});

