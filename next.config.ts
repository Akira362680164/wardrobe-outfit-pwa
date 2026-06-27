import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "export",
  outputFileTracingRoot: configDir,
  reactStrictMode: true,
  trailingSlash: true,
  // v0.9.32-dev: 允许手机热点 / WiFi IP 通过 dev server 加载 _next/* 静态资源。
  // Next.js 15.5 默认只允许 ['localhost', '0.0.0.0', '127.0.0.1', '[::1]'],
  // 手机浏览器用 10.120.118.35 / 192.168.x.x 等 host 访问会被判 cross-origin 拒绝 _next/*,
  // 表现为 "HTML 能加载一次 / 样式 JS 资源被拒 → 白屏" 或 "刷新后连 HTML 都被随机拒"。
  // 列出常用的 dev IP 段 + macOS 桥接 IP, 实际生效 host 由当前活跃网卡决定。
  // 仅 dev server 生效, 不影响生产构建 (生产 APK 走 out/ 静态资源 + Capacitor WebView 加载本地)。
  allowedDevOrigins: [
    "10.120.118.35",
    "172.30.193.100",
    "192.168.1.1",
    "192.168.0.1",
    "192.168.43.1",
    "localhost",
  ],
  // v0.9.0 M3: 生产构建脱产 console.log/info/debug; 保留 error/warn (异常路径)
  compiler: {
    removeConsole: {
      exclude: ["error", "warn"],
    },
  },
  // v2.0.2: 生产构建时不将 ESLint warning 视为 error（大量历史未使用变量警告不影响功能）
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
