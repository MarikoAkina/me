# SQL 支持范围与兼容限制

[文档目录](README.md) · [新手指南](getting-started.md) · [测试与验收](testing.md)

## 实现与兼容目标

SQL LAB 是基础学习模拟器，兼容目标为 MySQL 8.4 中下列基础语法。它使用 node-sql-parser 的 MySQL 抽象语法树（AST）和自有结构化执行器，不运行真实 MySQL 服务器，也不使用 SQLite。

SQL 在 Web Worker 中执行，金额使用 decimal.js 的 80 位十进制运算。关键字不区分大小写，字符串内容保持原样。

## 已支持的语法

| 类别 | 支持范围 |
| --- | --- |
| 数据库管理 | `CREATE DATABASE`、`SHOW DATABASES`、`USE`、`DROP DATABASE`；创建支持 `IF NOT EXISTS`，删除支持 `IF EXISTS` |
| 表管理 | `CREATE TABLE`、`SHOW TABLES`、`DESC` / `DESCRIBE`、`DROP TABLE`；创建支持 `IF NOT EXISTS`，删除支持 `IF EXISTS` |
| 修改表 | `ALTER TABLE ... ADD COLUMN`、`MODIFY COLUMN`、`DROP COLUMN` 的基础用法 |
| 类型 | `CHAR(n)`、`VARCHAR(n)`、`TINYTEXT` / `TEXT` / `MEDIUMTEXT` / `LONGTEXT`；`TINYINT` / `SMALLINT` / `MEDIUMINT` / `INT` / `INTEGER` / `BIGINT`；`BOOL` / `BOOLEAN`；`DECIMAL` / `DEC` / `FIXED` / `NUMERIC`；`DATE`、`DATETIME`。数字列支持 `UNSIGNED` |
| 约束 | 单列 `PRIMARY KEY`、单列 `UNIQUE`、`NOT NULL`、常量 `DEFAULT`、整数主键 `AUTO_INCREMENT` |
| 插入 | `INSERT INTO ... VALUES ...`，支持指定列、多行插入和基础 `DEFAULT` 值 |
| 修改与删除 | 单表 `UPDATE ... SET ... WHERE ...`、`DELETE FROM ... WHERE ...`、`TRUNCATE TABLE` |
| 查询与表达式 | `SELECT *`、指定列、常量、算术表达式、`AS`、`DISTINCT` |
| 条件 | `=`、`<>`、`!=`、`>`、`<`、`>=`、`<=`；`AND`、`OR`、`NOT` 与括号；`BETWEEN`、`IN`、`LIKE`（`%` 与 `_`）、`IS NULL`、`IS NOT NULL` |
| 排序与分页 | 多列 `ORDER BY`，`ASC` / `DESC`；`LIMIT n`、`LIMIT offset,n`、`LIMIT n OFFSET offset` |
| 聚合与分组 | `COUNT`、`SUM`、`AVG`、`MAX`、`MIN`；`GROUP BY`、`HAVING` |
| 连接 | 两表 `INNER JOIN` / `LEFT JOIN`，表别名与 `ON` 条件 |
| 子查询 | 基础非关联 `IN (SELECT ...)` 和返回单个值的标量子查询 |
| 条件与空值 | 搜索型 `CASE WHEN`、等值型 `CASE 值 WHEN`；`IF`、`IFNULL`、`COALESCE`、`NULLIF` |
| 金额与取整 | `ROUND`、`ABS`、`CEIL` / `CEILING`、`FLOOR`、`MOD` |
| 文本函数 | `CONCAT`、`UPPER`、`LOWER`、`LENGTH`、`CHAR_LENGTH` / `CHARACTER_LENGTH`、`TRIM`、`LTRIM`、`RTRIM`、`LEFT`、`RIGHT`、`SUBSTRING` / `SUBSTR`、`REPLACE` |
| 日期函数 | `YEAR`、`MONTH`、`DAY` / `DAYOFMONTH`、`QUARTER`、`DATE`、`DATEDIFF`、`DATE_FORMAT` |

## 建表字段类型

1.1.0 扩展了字符、整数、布尔与文本类型，详见 [字段类型与建表示例](column-types.md)。CHAR 默认长度 1、最大 255 个字符，读取时不保留末尾普通空格；VARCHAR 保留末尾空格。TINYTEXT / TEXT 按 UTF-8 字节限制；MEDIUMTEXT / LONGTEXT 仍受单值 200,000 个 UTF-16 代码单元的学习容量限制。BIGINT 的数据、自增与运算使用十进制精确值，不经过 JavaScript 浮点数。

BOOL / BOOLEAN 是 TINYINT(1) 的同义写法，允许 -128～127；显示宽度不是位数约束。字段浏览器、DESC 和 SQL 导出显示规范化类型。FLOAT / DOUBLE / REAL、二进制、ENUM / SET、JSON、TIME / YEAR / TIMESTAMP、字符集/排序规则、ZEROFILL 与小数秒不在本轮实现范围内。现有严格类型转换、字符串比较和单条失败回退规则继续适用。

## 首轮函数扩展的边界

- CASE 按顺序返回第一个匹配分支；未写 ELSE 且未匹配时返回 NULL。`CASE NULL WHEN NULL` 不视为相等。IF 的零与 NULL 条件选择假分支。CASE、IF、IFNULL、COALESCE 按需计算所选分支，但仍预先校验所有分支中的字段与函数名称。
- `SUBSTRING(文本,位置[,长度])` 与 `SUBSTRING(文本 FROM 位置 [FOR 长度])` 均支持；SUBSTR 为同义写法。位置从 1 开始，负数从末尾计，位置 0 或非正长度返回空串；非整数位置和长度四舍五入。
- LENGTH 统计 UTF-8 字节；CHAR_LENGTH 和截取函数按 Unicode 码点处理，组合字符不合并为一个视觉字形。TRIM / LTRIM / RTRIM 只移除普通空格，不移除制表符。`TRIM(BOTH ... FROM ...)` 等扩展形式尚未支持。REPLACE 为区分大小写的字面替换。
- 日期参数限有效的 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`，年份 1000–9999；不接受零日期、宽松日期文本、时区或微秒。DATEDIFF 计算第一个日期减去第二个日期，忽略时间部分。
- DATE_FORMAT 仅支持 `%Y %y %m %c %d %e %H %k %h %I %l %i %s %S %p %T %%`。其他格式码返回 SIM_UNSUPPORTED；不支持本地化月份名、星期名或周数。CURDATE、NOW、日期加减与 INTERVAL 尚未支持。
- ABS、CEIL / CEILING、FLOOR、MOD 和 ROUND 使用十进制；ROUND 的位数限 -30～30 的整数。MOD 的结果符号随被除数，除零返回 NULL。

[首轮扩展指南与第 16–27 题](expansion-1.md)提供示例。

## 输入与执行规则

- 支持中文字符串、英文单引号字符串、引号转义、反引号标识符。
- 支持 `--` 注释（后接空白）、`#` 和 `/* ... */` 注释。词法扫描识别字符串和注释中的分号，避免错误切分语句。
- 逻辑条件按优先级与括号计算；不明确的多表字段需要加表名或别名前缀。
- NULL、空字符串与数字零分别处理；`COUNT(*)` 统计全部行，`COUNT(列)` 只统计该列非 NULL 的行。
- 主键、非空、唯一、类型和范围写入校验失败会报错。单条写入失败时恢复原数据，不保留部分插入或修改。
- 普通批量执行遇错停止，保留之前已成功的语句；SQL 文件导入任一语句失败则整份回退。

## 一个建库、建表与写入示例

在工作台执行以下脚本。它会创建并修改 `practice_lab`，可用后续 SELECT 检查实际数据。

```sql
CREATE DATABASE IF NOT EXISTS practice_lab;
USE practice_lab;

CREATE TABLE IF NOT EXISTS budgets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  budget_date DATE
);

INSERT INTO budgets (category, amount, budget_date)
VALUES ('学习', 68.80, '2026-10-01'),
       ('交通', 50.00, '2026-10-02');

SELECT * FROM budgets ORDER BY id;
USE finance_lab;
```

再次执行 INSERT 会再添加记录，`IF NOT EXISTS` 只控制创建操作，不会清空已有表。该示例以不存在同名的其他表结构为前提。

## 与 MySQL 的主要行为差异

| 方面 | 当前模拟器规则 |
| --- | --- |
| 标识符大小写 | 数据库、表、列与别名统一不区分大小写；不模拟 MySQL 不同系统与配置下的全部命名行为 |
| 字符比较 | 字符串区分大小写，按 Unicode 值比较；不模拟 MySQL 默认语言排序规则、重音与尾空格比较 |
| 类型转换 | 严格写入与转换，不隐式把非数字文本当作 0；INT 不自动舍入 |
| 金额 | DECIMAL 写入四舍五入；十进制计算避免明显的二进制浮点误差，但返回精度与显示尺度可能不同 |
| 分组 | 严格 GROUP BY；不推导主键函数依赖或 WHERE 单值依赖，不支持 GROUP BY 列序号 |
| 日期 | 支持基础 DATE / DATETIME 与上述限定函数；无效日期参数直接报 1292，不复现 MySQL 可能返回 NULL 并附警告的所有情况 |
| 条件结果类型 | CASE、IF、IFNULL、COALESCE 返回所选分支的原值；不模拟 MySQL 对所有分支汇总结果类型后转换的行为，混合文本和数字时可能不同 |
| 自增 | 失败写入也恢复自增计数器，与 InnoDB 失败操作可能消耗编号的行为存在差异 |
| 并发与性能 | 浏览器单工作台执行，小数据集教学用途；不模拟锁、索引优化、并发事务与服务器性能 |

`DECIMAL(p,s)` 的精度上限为 65，小数位上限为 30，且小数位不能超过总精度。

## 错误如何区分

| 情况 | 提示方式 |
| --- | --- |
| 可以明确对应的 SQL 错误 | 中文解释、行列位置与相应 MySQL 错误码，例如重复主键 1062、非空写入 1048 |
| 已解析但执行器尚未支持的语法 | `SIM_UNSUPPORTED` 与未支持能力的说明 |
| 执行或容量超限 | `SIM_LIMIT` 与缩小查询或数据范围的提示 |
| 解析器未识别的输入 | 语法错误与问题位置；某些合法 MySQL 语法也可能落入这一情况 |

本项目使用的是基础语法解析器，不能完整识别 MySQL 8.4 的全部合法语法。解析失败不必然表示该语句在真实 MySQL 中也非法；请结合此页的支持范围判断。

## 尚未实现

视图、索引管理、外键、事务、复合约束、CHECK、触发器、权限、存储过程、CTE、UNION、窗口函数、关联子查询、RIGHT / CROSS JOIN、派生表、INSERT SELECT、REPLACE INTO、UPDATE / DELETE 的 ORDER BY / LIMIT、字符集和存储引擎选项、系统表，以及 MySQL 客户端命令。

## 容量与执行上限

| 项目 | 上限 |
| --- | --- |
| 数据库 | 20 个 |
| 每库表数 | 50 张 |
| 每表数据 | 10,000 行 |
| 每批语句 | 100 条 |
| SQL 脚本 | 200 KB |
| 单条执行 | 3 秒或 200 万步 |
| 结果与 JOIN 中间结果 | 10,000 行 |
| 结果分页 | 每页 100 行 |
| 文本函数结果 | 200,000 个 UTF-16 代码单元 |
| 完整 JSON 备份 | 20 MB |

本页描述已实现规则，不表示已经完成真实 MySQL 8.4 逐条对照；当前证据见 [测试与验收](testing.md)。

## 技术参考

- [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser)：SQL 解析与 MySQL AST。
- [decimal.js](https://mikemcl.github.io/decimal.js/)：十进制计算。
- [MySQL 8.4 固定精度类型](https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fixed-point-types.html)。
- [MySQL 8.4 GROUP BY 处理](https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/group-by-handling.html)。

- [MySQL 8.4 条件表达式与函数](https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/flow-control-functions.html)。
- [MySQL 8.4 字符串函数](https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/string-functions.html)。
- [MySQL 8.4 日期与时间函数](https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/date-and-time-functions.html)。
