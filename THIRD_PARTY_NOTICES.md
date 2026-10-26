# 第三方软件声明

项目自己的源码遵循根目录 MIT 许可证。通过 npm 安装的第三方软件及其依赖遵循各自许可证，其版权不由本项目的许可证替代。

| 软件 | 用途 | 许可证 | 项目地址 |
| --- | --- | --- | --- |
| Electron | 桌面运行时 | MIT | https://github.com/electron/electron |
| electron-builder / NSIS | 桌面安装打包 | MIT / zlib 及工具各自许可证 | https://github.com/electron-userland/electron-builder |
| electron-updater | 检查、下载和安装桌面更新 | MIT | https://github.com/electron-userland/electron-builder |
| React / React DOM | 界面 | MIT | https://github.com/facebook/react |
| Vite | 开发与构建 | MIT | https://github.com/vitejs/vite |
| CodeMirror 6 | SQL 编辑器 | MIT | https://github.com/codemirror |
| node-sql-parser | MySQL 语法解析 | Apache-2.0 | https://github.com/taozhi8833998/node-sql-parser |
| decimal.js | 十进制金额计算 | MIT | https://github.com/MikeMcl/decimal.js |
| sql-formatter | SQL 格式化 | MIT | https://github.com/sql-formatter-org/sql-formatter |
| shadcn/ui、@shadcn/react | 通用界面组件 | MIT | https://github.com/shadcn-ui/ui |
| Radix UI | 界面交互原语 | MIT | https://github.com/radix-ui/primitives |
| Lucide | 图标 | ISC | https://github.com/lucide-icons/lucide |
| Tailwind CSS | 样式 | MIT | https://github.com/tailwindlabs/tailwindcss |

`components/ui/` 使用 shadcn/ui 组件。`vendor/shadcn-tailwind-4.13.0.css` 的原始 MIT 声明保存在相邻的 `vendor/shadcn-tailwind-4.13.0.LICENSE.md` 中，也适用于所包含的 shadcn/ui 组件来源。

`package-lock.json` 锁定第三方依赖的版本、完整性校验值与可用的许可证标识。运行 `npm ci` 后，依赖的完整许可证和可能附带的 NOTICE 文件可在相应 `node_modules/` 包目录中找到。再分发构建产物时应保留适用的第三方许可证及声明。
