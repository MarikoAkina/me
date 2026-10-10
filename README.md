# SQL LAB · MySQL 基础学习模拟器

这是面向财务管理零基础学习者的手机 SQL 练习工作台。无需连接外部数据库服务器。

## Windows 安装

前往 [Windows 安装包下载页](https://github.com/MarikoAkina/sql-lab/releases/tag/v0.2.1)，下载 `SQL-Lab-Setup-0.2.1.exe`。支持 Windows 10 / 11 的 x64 电脑；按安装向导选择位置，完成后从桌面或开始菜单打开 SQL LAB。

安装后无需数据库、Node.js 或账号，SQL 练习可离线进行。安装包暂未使用 Authenticode 发布者证书，Windows 可能显示“未知发布者”；发布页提供 `SHA256SUMS.txt` 可核验完整性。

桌面版数据位于本机 `%APPDATA%\SQL LAB`，网页版数据位于相应浏览器。通过“数据与备份”导出、恢复完整 JSON 可迁移数据库、草稿、历史和学习进度。升级沿用原数据；卸载不会自动清除练习数据，仍建议定期备份。

桌面版支持原生窗口、菜单、剪切／复制／粘贴与缩放。帮助菜单可打开项目下载页。站点顶部的“Windows 安装版”和“数据与备份”面板都提供安装下载入口。

## 本地运行

需要 Node.js 22.13 或更高版本，以及 npm。首次安装后直接启动，无需配置数据库或密钥。

```bash
git clone https://github.com/MarikoAkina/sql-lab.git sql-lab
cd sql-lab
npm ci
npm run dev
```

打开终端提示的本地网址。若需用同一局域网的手机访问：

```bash
npm run dev -- --host 0.0.0.0
```

手机打开电脑的局域网 IP 与终端显示的端口。开发服务器仅供本地开发。

```bash
npm test
npm run build
npm run preview
```

生产部署时将 `dist/` 目录放在静态网站服务的根路径，通过 HTTPS 访问；浏览器须支持 Web Worker、IndexedDB 和现代 JavaScript。`npm start` 是本地构建预览，并非生产服务器。支持子路径部署时，需统一配置 Vite 的 `base` 与 HTML、manifest 中以 `/` 开头的资源路径。

## 入门

站点默认选择 `finance_lab`。输入并执行：

```sql
SELECT * FROM customers;
SELECT name, city FROM customers WHERE city = '武汉';
```

第一条返回 5 位客户，第二条返回武汉的 3 位客户。切换到“学习练习”按顺序完成 15 题，提示分步展开，参考答案默认折叠。查询批改比较实际结果；写入与建表练习在独立数据中检查最终状态。

## 实现

- React / Vite 静态客户端应用，可部署到任意静态网站托管服务。
- node-sql-parser MySQL AST；自有结构化关系执行器，禁止依赖拼接正则模拟查询。
- decimal.js 80 位十进制运算。列 DECIMAL(p,s) 精度上限 65，小数位上限 30。
- SQL 在 Web Worker 中执行。每条写入先校验副本，失败回退。批量执行保留此前成功结果；文件导入整体回退。
- CodeMirror SQL 编辑器，行号、高亮、补全、格式化、触控选择、符号辅助、撤销与重做。
- IndexedDB 自动保存数据库、脚本草稿、历史和学习记录。首次初始化示例库，刷新不会重新播种。

## 首版语法

数据库：CREATE / DROP DATABASE（IF NOT EXISTS / IF EXISTS）、SHOW DATABASES、USE。

表：CREATE / DROP TABLE、SHOW TABLES、DESC / DESCRIBE，ALTER TABLE ADD / MODIFY / DROP COLUMN。单列 PRIMARY KEY / UNIQUE、NOT NULL、常量 DEFAULT、INT 主键 AUTO_INCREMENT。

类型：INT、INTEGER、VARCHAR(n)、TEXT、DECIMAL(p,s)、DATE、DATETIME。

写入：指定列和多行 INSERT VALUES，单表 UPDATE SET WHERE，DELETE FROM WHERE，TRUNCATE TABLE。

查询：SELECT * / 指定列 / 常量与算术 / AS / DISTINCT；WHERE 比较、AND / OR / NOT、括号、BETWEEN、IN、LIKE（% 与 _）、IS NULL；多列 ORDER BY；三种 LIMIT / OFFSET；COUNT / SUM / AVG / MAX / MIN、GROUP BY、HAVING；两表 INNER / LEFT JOIN ON、别名；非关联 IN 子查询与标量子查询；ROUND / IFNULL / CONCAT / UPPER / LOWER。

输入：关键字不区分大小写；中文、单引号转义、反引号、--（需空白）、# 与 /* */ 注释；词法扫描识别字符串中的分号。

## 兼容限制

产品明确标为基础学习模拟器，不是真正 MySQL 服务器。数据库、表、列与别名统一不区分大小写；字符串比较区分大小写，按 Unicode 值比较，不模拟 MySQL 默认语言排序规则、重音和尾空格规则。严格写入与转换，不隐式把非数字文本当作 0；INT 不自动舍入。DECIMAL 写入四舍五入，计算返回精度与显示尺度可能不同。严格 GROUP BY，不推导主键函数依赖或 WHERE 单值依赖，不支持 GROUP BY 序号。日期不支持时区、零日期和微秒。失败写入也回退自增计数器，与 InnoDB 的编号消耗存在差异。

尚未实现视图、索引管理、外键、事务、复合约束、CHECK、触发器、权限、存储过程、CTE、UNION、窗口函数、关联子查询、RIGHT / CROSS JOIN、派生表、INSERT SELECT、UPDATE / DELETE 的 ORDER BY / LIMIT 等扩展。有效但未支持的 AST 返回 SIM_UNSUPPORTED；语法错误返回中文解释与错误位置。可明确对应时使用 MySQL 错误码。

容量：20 库、每库 50 表、每表 10,000 行；每批 100 条语句，脚本 200 KB；单条最多 3 秒或 200 万步。结果和 JOIN 中间结果限制 10,000 行；界面每页 100 行。JSON 备份最多 20 MB。

## 保存、备份与恢复

数据保存在当前浏览器 IndexedDB，不会跨设备同步。无痕、清除网站数据、换浏览器或 Safari 与独立桌面打开可能使用不同存储空间。多个浏览器标签页请只用一个工作台。

“数据与备份”可导出或恢复完整 JSON，恢复前校验所有结构、约束与行数据，确认后替换；导入 .sql 失败会整体回退。数据库 SQL 导出可恢复空库的结构和数据，但不含完整自增状态、脚本草稿与练习记录。完整恢复请用 JSON。

恢复示例只替换 finance_lab / campus_lab，保留自建库。清空全部数据会删除所有数据、草稿、历史与进度。两项都需要确认。

iPhone Safari：分享 → 添加到主屏幕。提供 PNG 桌面图标、manifest、主题色和安全区布局。

## 测试

运行 `npm run test:acceptance`，或分别运行 `node tests/engine.test.mjs`、`node tests/storage.test.mjs`、`node tests/ui.test.mjs`。

`public/test-report.json` 保存实际结果。DOM 集成测试使用 jsdom、真实 SQL Worker 代码和 fake-indexeddb，验证页面状态与操作，不提供布局引擎，不等同于真实浏览器渲染。375、390、430、768、1280px 检查导航状态与输入配置；样式使用相应断点进行代码校验。

2026-10-09 的独立项目验收：SQL 核心 81 项、保存与备份 5 项、DOM 集成 14 项，总计 100 项通过，生产构建通过。

自动化测试尚未包含真实 MySQL 8.4 服务器对照、真实 iPhone Safari、实机虚拟键盘、触控选择和实际像素溢出验证。不能把 DOM 测试当作 Safari 实测。

参考：

- https://github.com/taozhi8833998/node-sql-parser
- https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fixed-point-types.html
- https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/group-by-handling.html
- https://mikemcl.github.io/decimal.js/

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `app/page.jsx`、`app/globals.css` | 工作台交互与响应式样式 |
| `components/`、`hooks/` | SQL 编辑器、帮助界面与通用组件 |
| `lib/sql/` | 词法处理、关系执行器、示例数据、练习与 Worker |
| `lib/storage.mjs`、`lib/worker-client.mjs` | 本地保存、备份与异步执行 |
| `tests/` | SQL、保存与 DOM 集成验收 |
| `public/` | 图标、移动端配置与测试报告 |
| `vendor/` | 第三方样式和许可证 |

GitHub Actions 在提交和拉取请求中安装锁定依赖，运行验收与生产构建。应用数据库与用户练习记录只存在各自浏览器，不包含在仓库中。

## 贡献与许可证

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。项目源码采用 [MIT License](LICENSE)。第三方软件沿用各自许可证，详情见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 桌面版开发与发布

```bash
npm ci
npm run desktop
```

Windows 环境生成安装程序：

```bash
npm run dist:windows
```

输出为 `release/SQL-Lab-Setup-0.2.1.exe`。`desktop/` 包含桌面主进程、静态资源协议、独立应用清单和安装后的实际操作检查；`electron-builder.yml` 配置 NSIS 安装向导。网页前端与 SQL 引擎保持共享，前端依赖不作为桌面主进程依赖打包。

Windows GitHub Actions 会运行 SQL、DOM 和桌面协议检查，构建 NSIS 安装程序，实际静默安装并启动程序，再检查输入、查询、金额、写入、复制、备份、刷新恢复和下载入口。通过后发布 EXE、SHA256 和 Windows 检查报告。普通版本发布时需同步根目录与 `desktop/package.json` 的版本、下载信息和发布说明。

桌面壳使用固定的本地 `sqllab://app` 来源，IndexedDB 在重新打开后继续使用同一保存位置。渲染器关闭 Node 集成，启用隔离与沙箱；本地协议只读取应用资源。系统浏览器只打开 HTTPS 外部链接。
