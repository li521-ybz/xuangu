/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // GitHub Pages 项目站点用相对路径，确保资源正确加载
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '股票看盘工作台',
        short_name: '看盘',
        description: '个人 A 股看盘工作台：看盘总览 / 自选 / 持仓 / 选股 / 模拟盘 / 策略回测',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    pool: 'threads'
  }
});
