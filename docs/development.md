# 开发、构建与部署

[文档目录](README.md) · [SQL 支持范围](sql-compatibility.md) · [测试与验收](testing.md) · [贡献指南](../CONTRIBUTING.md)

## 环境与本地运行

需要 Node.js **22.13 或更高版本**及 npm。CI 当前使用 Node.js 24，依赖版本由 `package-lock.json` 锁定。

```bash
git clone https://github.com/MarikoAkina/sql-lab.git sql-lab
cd sql-lab
npm ci
npm run dev
```

首次安装依赖需要联网。打开 Vite 输出的本地网址；应用无需数据库连接、账号或 API 密钥，首次运行会创建示例数据。

手机与电脑在同一局域网时，可启动：

```bash
npm run dev -- --host 0.0.0.0
```

手机使用电脑局域网 IP 与终端显示的端口访问。开发服务器用于本地调试；局域网 HTTP 环境可能限制剪贴板等浏览器能力，完整手机验收使用 HTTPS 实例。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm test` | SQL、存储、DOM 集成与桌面协议检查 |
| `npm run test:engine` | SQL 核心检查 |
| `npm run test:storage` | 保存与备份检查 |
| `npm run test:ui` | DOM 集成检查 |
| `npm run test:desktop` | 桌面本地协议与路径检查 |
| `npm run build` | 生成静态网页到 `dist/` |
| `npm run preview` | 本地预览构建结果 |
| `npm run desktop` | 构建网页后启动 Electron 开发版 |
| `npm run dist:windows` | 构建 Windows x64 NSIS 安装程序 |

`npm start` 同样运行 Vite preview，是本地构建预览，不是生产服务器。

## 代码入口

| 模块 | 入口 | 职责 |
| --- | --- | --- |
| 应用挂载 | [main.jsx](../main.jsx)、[index.html](../index.html) | React 应用入口与网页配置 |
| 工作台 | [app/page.jsx](../app/page.jsx)、[app/globals.css](../app/globals.css) | 编辑、结果、导航、练习和响应式界面 |
| 编辑与辅助界面 | [components/sql-editor.jsx](../components/sql-editor.jsx)、[components/support.jsx](../components/support.jsx) | CodeMirror 编辑器、补全与帮助 |
| SQL 核心 | [lib/sql/engine.mjs](../lib/sql/engine.mjs)、[lib/sql/lexer.mjs](../lib/sql/lexer.mjs) | AST 执行、关系计算、类型约束、词法扫描与语句切分 |
| 标量函数 | [lib/sql/functions.mjs](../lib/sql/functions.mjs) | 参数规格、文本边界、十进制和日期函数 |
| 示例与教学 | [lib/sql/seed.mjs](../lib/sql/seed.mjs)、[lib/sql/lessons.mjs](../lib/sql/lessons.mjs) | 示例库、27 道练习、结果与状态批改 |
| 后台任务 | [lib/sql/worker.mjs](../lib/sql/worker.mjs)、[lib/worker-client.mjs](../lib/worker-client.mjs) | Worker 执行与主线程通信 |
| 本地存储 | [lib/storage.mjs](../lib/storage.mjs) | IndexedDB、完整备份封装与恢复校验 |
| Windows 包装 | [desktop/main.cjs](../desktop/main.cjs)、[desktop/protocol.cjs](../desktop/protocol.cjs) | Electron 窗口、菜单与本地静态资源来源 |
| 下载版本信息 | [lib/release.mjs](../lib/release.mjs) | 前端安装包、校验文件和发布页链接 |

主线程接收编辑器输入并提交 Worker。Worker 解析并执行 SQL，返回结果、日志与更新后的数据库状态；工作台展示结果，并通过 IndexedDB 保存状态。练习批改使用独立示例副本，避免改变工作台数据。

目录分工见 [仓库首页](../README.md#源码目录)。扩展语法时应同时更新执行器、相关验收、[兼容文档](sql-compatibility.md)和帮助界面。

## 部署静态网页

```bash
npm run build
npm run preview
```

生产部署将 `dist/` 放在静态网站服务的根路径，并使用 HTTPS。运行时浏览器需要支持 Web Worker、IndexedDB 与现代 JavaScript，不需要数据库服务或后端 API。

当前资源路径按站点根目录配置。部署到 GitHub Pages 等子路径时，需要统一配置 Vite 的 `base`、HTML 和 manifest 中以 `/` 开头的路径；当前文档不提供未经配置即可使用的子路径部署承诺。

网页提供添加到主屏幕所需的图标和 manifest，当前未实现完整离线缓存。静态网页的访问权限由托管平台管理，与浏览器中的个人练习数据分别处理。

## 开发和打包 Windows 版

桌面开发需要可运行 Electron 的桌面环境：

```bash
npm run desktop
```

推荐在 Windows 环境构建安装程序：

```bash
npm run dist:windows
```

当前版本输出 `release/SQL-Lab-Setup-0.3.0.exe`。[electron-builder.yml](../electron-builder.yml)配置 NSIS 安装向导；[desktop/prepare.mjs](../desktop/prepare.mjs)复制网页构建和许可证到应用目录。

桌面版与网页共用前端和 SQL 引擎。渲染器关闭 Node 集成，启用隔离与沙箱；固定的 `sqllab://app` 来源保持本地存储来源一致，本地协议只读取应用资源，外部链接使用系统浏览器打开 HTTPS 地址。

## 持续检查与发布

- [Checks 工作流](../.github/workflows/ci.yml)：提交和拉取请求触发，安装锁定依赖，运行 `npm test` 与生产构建。
- [Windows installer 工作流](../.github/workflows/windows.yml)：主分支相关源码变更或手动触发，构建安装包、实际安装并启动应用，完成 10 项操作检查后发布 EXE、SHA256 和检查报告。

发布新版本时同步根目录与 `desktop/package.json` 的版本、[下载信息](../lib/release.mjs)、[发布说明](../desktop/release-notes.md)以及文档中的版本描述。`desktop/ui/`、`dist/` 和 `release/` 是生成目录，不作为源码提交。

安装包当前没有 Authenticode 发布者证书。发布验收和未完成的实机验证见 [测试与验收](testing.md)。

新增练习时维护 `lib/sql/lesson-meta.mjs` 的总数与连续题号；原编号保持稳定。附加样本使用题目的 `setup`，通过 `createLessonState` 创建独立副本；同时更新结果判题、保存恢复与 UI 验收。
