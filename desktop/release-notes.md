SQL LAB 0.3.0 · 首轮语法与练习扩展。适用于 Windows 10 / 11 x64。

- 新增 CASE 条件分类与 IF、COALESCE、NULLIF 空值处理。
- 新增中文文本截取、长度、清理与替换；日期年月季度、日期差、按月格式化；金额绝对值、向上／向下取整与取余。
- 新增第 16–27 题，练习总数为 27；提供“本轮新增”筛选、跨月费用分析与条件收款汇总。
- 原有题号、数据库、草稿、通过记录与完整备份保持兼容；练习附加数据只存在于独立副本。
- 安装后可离线执行和批改，不需要 MySQL 服务器、Node.js、账号或 AI API。

下载 `SQL-Lab-Setup-0.3.0.exe`。`SHA256SUMS.txt` 可核验完整性，`desktop-smoke.json` 记录安装后的实际操作检查，`metadata-audit.json` 记录版本字段检查。安装包没有 Authenticode 发布者证书，Windows 可能显示“未知发布者”。第三方许可证保留在安装目录。

本产品是基础学习模拟器，不运行真实 MySQL。条件表达式类型推导、严格日期转换、字符比较等仍有差异；真实 MySQL 8.4 逐条对照与 iPhone Safari 完整实机验收尚未完成。支持范围见 [兼容文档](https://github.com/MarikoAkina/sql-lab/blob/main/docs/sql-compatibility.md)，学习示例见 [首轮扩展指南](https://github.com/MarikoAkina/sql-lab/blob/main/docs/expansion-1.md)。
