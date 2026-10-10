# 测试与验收

[文档目录](README.md) · [开发指南](development.md) · [SQL 兼容限制](sql-compatibility.md)

## 现有测试记录

版本 **0.2.1** 的 [仓库报告](../public/test-report.json)记录于 **2026-10-10**，共 **108 项通过，0 项失败**。

| 检查组 | 数量 | 主要覆盖 |
| --- | --- | --- |
| SQL 核心 | 81 | 建库建表、约束、自增、筛选与排序、聚合、连接、子查询、金额、NULL、注释、错误与原子写入、练习判题 |
| 存储与备份 | 5 | IndexedDB 保存和恢复、完整备份、结构校验与相关状态 |
| DOM 集成 | 15 | 编辑与执行、手机导航状态、结果操作、练习、数据面板与下载入口 |
| 桌面协议 | 7 | 静态资源解析、路径限制、MIME 与 HTTPS 外部链接规则 |
| 合计 | 108 | 以上四组检查 |

该记录是已保存的验收快照。后续提交的检查状态以 [GitHub Actions](https://github.com/MarikoAkina/sql-lab/actions)为准。

## 在本地检查

```bash
npm test
npm run build
```

`npm test` 运行全部四组检查。针对具体变更，也可选择：

```bash
npm run test:engine
npm run test:storage
npm run test:ui
npm run test:desktop
```

`npm run test:acceptance` 只包含 SQL、存储与 DOM 三组，不包含桌面协议检查。

## Windows 安装后操作检查

Windows 工作流构建 NSIS 安装包，实际静默安装并启动程序。[0.2.1 安装检查报告](https://github.com/MarikoAkina/sql-lab/releases/download/v0.2.1/desktop-smoke.json)记录 **8 项通过，0 项失败**。

1. 安装后的应用加载本地界面和 SQL Worker。
2. 编辑器输入与条件查询返回正确结果。
3. 打包后的 Worker 完成十进制计算。
4. 多语句执行与写入。
5. 原生剪贴板复制。
6. 下载 JSON 备份并确认包含写入数据。
7. 刷新后恢复 IndexedDB 数据与 SQL 草稿。
8. 下载面板指向正确安装程序。

这 8 项是在 Windows CI 环境运行已安装应用的检查，单独记录，不并入 108 项。它们不等同于在普通 Windows 10 / 11 实机覆盖全部使用场景，也不代表已经验收退出进程后再次启动的全部行为。

## 自动化检查的边界

DOM 集成测试使用 jsdom、真实 SQL Worker 代码与 fake-indexeddb。它能验证状态和交互逻辑，但没有真实浏览器布局引擎。

375、390、430、768、1280px 的检查覆盖导航状态与输入配置，并检查响应式样式；不能据此认定已经完成真实 iPhone Safari、触控、虚拟键盘或像素溢出验收。

SQL 测试检查当前执行器的实际结果和状态，尚未完成与真实 MySQL 8.4 服务器的逐条对照。现有测试通过不表示实现了完整 MySQL 兼容。

## 尚待完成的验收

| 验收 | 需要确认的内容 |
| --- | --- |
| MySQL 8.4 对照 | 在固定字符集、排序规则和 SQL mode 下比较结果、NULL、金额、分组、约束和失败写入；记录允许存在的差异 |
| iPhone Safari 实机 | 输入 SQL、弹出键盘、执行、查看宽表、触控选择、复制、再次编辑与恢复记录 |
| 屏幕与方向 | 五种目标宽度下的实际渲染、横竖屏、安全区域与页面溢出 |
| Windows 实机 | 普通 Windows 10 / 11 上的安装、升级、关闭重开与卸载后的数据行为 |

补充验收时请记录设备、浏览器或系统版本、测试 SQL、结果与执行时间。问题反馈入口见 [贡献指南](../CONTRIBUTING.md)。
