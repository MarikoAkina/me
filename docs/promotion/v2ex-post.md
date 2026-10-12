# 开源分享：SQL LAB，在手机上练 SQL，带中文财务案例和 Windows 离线版

分享一个面向零基础学习者的 MySQL 基础学习模拟器：SQL LAB。

可以直接在手机或电脑浏览器练习，不需要先配置数据库服务器。SQL 查询与增删改实际作用于浏览器内的模拟数据库，执行和练习批改不依赖 AI API。

目前的主要能力：

- 中文客户、订单、费用和学生成绩示例，包含重复值、NULL 和未匹配记录。
- 15 道渐进练习，从 SELECT、筛选、统计到 JOIN、增删改和建表；查询按实际结果批改，写入题使用独立数据。
- 数据库树、多标签编辑器、语法高亮、补全、格式化、多结果集、日志与 CSV 导出。
- 金额采用十进制计算；数据库、草稿、历史和进度在本地自动保存，可导出完整 JSON 备份。
- Windows 10 / 11 x64 离线安装版。

这是 MySQL 基础学习模拟器，具体支持语法和行为差异见项目文档。目前没有完成真实 MySQL 8.4 的逐条对照，也尚未完成 iPhone Safari 的全部实机验收，欢迎帮忙反馈手机输入、复制和结果浏览的问题。

[在线体验](https://mysql-foundry.marikoakina.chatgpt.site) · [GitHub 源码与文档](https://github.com/MarikoAkina/sql-lab) · [Windows 安装版](https://github.com/MarikoAkina/sql-lab/releases/latest)

![SQL LAB 真实工作台界面](https://raw.githubusercontent.com/MarikoAkina/sql-lab/main/docs/media/workbench.png)

如果愿意试用，可以从 `SELECT * FROM customers;` 开始，再做前三道练习。反馈时请附设备与浏览器，以及能复现问题的 SQL。源码采用 MIT 许可证。
