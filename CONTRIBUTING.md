# 贡献指南

[仓库首页](README.md) · [文档目录](docs/README.md) · [开发指南](docs/development.md) · [报告问题](https://github.com/MarikoAkina/sql-lab/issues/new/choose)

欢迎改进 SQL 正确性、手机操作、中文讲解和财务练习。项目面向零基础学习者，文案应先解释语句用途，再解释结果和常见错误。

## 反馈问题或提出建议

请使用 [GitHub 问题表单](https://github.com/MarikoAkina/sql-lab/issues/new/choose)，选择错误报告或功能建议。

SQL 问题请提供能独立复现的最小建表、数据与查询，以及预期结果和实际结果。界面问题请注明设备、系统、浏览器和使用方式，列出复现步骤。可以附经过处理的截图。

反馈前查看 [支持范围](docs/sql-compatibility.md)和 [测试边界](docs/testing.md)。不要上传包含真实客户、财务资料或个人信息的备份；请用虚构数据复现。

## 选择合适的入口

| 修改内容 | 常用入口 | 同步检查 |
| --- | --- | --- |
| SQL 行为 | `lib/sql/engine.mjs`、`lib/sql/lexer.mjs` | 对应 SQL 验收、兼容文档与帮助说明 |
| 练习与示例 | `lib/sql/lessons.mjs`、`lib/sql/seed.mjs` | 参考答案、替代正确写法与写入影响范围 |
| 手机与编辑器 | `app/`、`components/sql-editor.jsx` | 实际设备上的输入、执行、结果和复制流程 |
| 备份与恢复 | `lib/storage.mjs`、工作台数据面板 | 保存、校验、恢复与失败回退 |
| Windows 包装 | `desktop/`、`electron-builder.yml` | 桌面协议和安装后的实际操作 |
| 使用文档 | `README.md`、`docs/` | 相对链接、目录、版本、命令与当前实现是否一致 |

## 开始开发

创建自己的分支，按 [开发指南](docs/development.md)安装 Node.js 22.13 或更高版本并运行项目。

```bash
npm ci
npm run dev
```

代码修改提交前运行适合变更的检查。完整检查命令为：

```bash
npm test
npm run build
```

纯文档修改应核对链接、示例、目录和版本信息，无需为文字调整编写功能测试。界面自动化检查不能替代真实浏览器的触控、键盘与布局验证。

## SQL 与教学内容要求

- 新增或修改语法时，使用结构化解析和实际数据计算，补充能区分正确与错误行为的案例。
- 校验实际结果、NULL、重复行、约束、金额和失败写入回退；不要仅比较 SQL 字符串。
- 金额继续使用十进制值，避免转成 JavaScript 浮点数。
- 查询练习接受不同的正确 SQL，只有明确要求排序的题目才校验行顺序。
- 写入练习使用独立可恢复的数据，不能通过修改工作台来影响判题。
- 题目提供目标、相关结构、分步提示、默认折叠答案与通俗解释。
- 未实现的能力和兼容差异同时写入文档及帮助界面，不把待验证行为描述为已验收。

## 提交拉取请求

标题说明具体改进，正文描述问题、修改后的行为，以及实际完成的验证。SQL 或界面变化可附一个简短的前后示例；文档变化说明新的阅读入口和核对范围即可。

贡献代码默认与项目采用相同的 [MIT 许可证](LICENSE)。第三方版权及许可证声明应继续保留，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
