# 字段类型与建表（1.1.0）

选择字段类型，就是先约定一列能保存什么值。学号和订单编号可能包含前导零，应作为字符保存；姓名用变长文本；金额需要十进制精确计算。

| 类型 | 适合保存 | 本模拟器的规则 |
| --- | --- | --- |
| CHAR(n) | 固定长度代码、性别、短标记 | n 为 0～255，省略时为 1；按 Unicode 码点计长；取值去掉末尾普通空格 |
| VARCHAR(n) | 姓名、分类、客户名称 | n 为 1～65535；按码点计长，保留末尾空格；超长直接报错 |
| TINYTEXT / TEXT | 备注、说明 | UTF-8 长度分别不超过 255 / 65535 字节，中文通常占 3 字节 |
| MEDIUMTEXT / LONGTEXT | 较长说明 | 类型名保留；仍受单个值 200000 个 UTF-16 代码单元、脚本 200 KB、备份 20 MB 的学习容量限制，不代表能保存数 GB 内容 |
| TINYINT / SMALLINT / MEDIUMINT / INT / BIGINT | 年龄、数量、主键 | 严格整数范围校验；不接受小数，不做静默截断；INTEGER 同义于 INT |
| BOOL / BOOLEAN | 是否启用、是否付款 | 规范化为 TINYINT(1)，TRUE/FALSE 保存为 1/0；它仍是整数，2 也合法 |
| DECIMAL(p,s) | 金额、税率、单价 | 十进制精确值；NUMERIC、DEC、FIXED 同义；p 为 1～65，s 为 0～30 且不超过 p |
| DATE / DATETIME | 日期、记账时间 | 沿用有效 YYYY-MM-DD / YYYY-MM-DD HH:mm:ss，不接受零日期、时区和微秒 |

## 整数范围

| 类型 | 有符号范围 | UNSIGNED 范围 |
| --- | --- | --- |
| TINYINT | -128～127 | 0～255 |
| SMALLINT | -32768～32767 | 0～65535 |
| MEDIUMINT | -8388608～8388607 | 0～16777215 |
| INT / INTEGER | -2147483648～2147483647 | 0～4294967295 |
| BIGINT | -9223372036854775808～9223372036854775807 | 0～18446744073709551615 |

整数类型名与 DECIMAL 可以加 UNSIGNED，禁止负值；SIGNED 表示默认的有符号类型。BOOL / BOOLEAN 语法本身不接 UNSIGNED，需要时写成 TINYINT(1) UNSIGNED。INT(2) 中的 2 是旧式显示宽度，不表示最多两位数；本工具记录 0～255 的宽度，但不补零。BOOL 不是“只能填 0 或 1”的约束。DECIMAL 的 UNSIGNED 和整数显示宽度属于 MySQL 中已弃用的写法，此处为基础课程兼容而保留，优先使用简单类型定义。

所有整数类型均可作为单列 AUTO_INCREMENT 主键。BIGINT 的行值和较大自增计数器以十进制字符串保存；比较、排序、汇总和加法使用 decimal.js，不能先转成 JavaScript Number。自增耗尽时整条语句报错并回退；TRUNCATE 重置计数。MySQL InnoDB 的失败语句可能消耗编号，模拟器沿用完整回退规则。

## 可直接执行的学生字段示例

```sql
CREATE DATABASE IF NOT EXISTS field_practice;
USE field_practice;

CREATE TABLE IF NOT EXISTS student_profiles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_no CHAR(10) NOT NULL UNIQUE,
  name VARCHAR(30) NOT NULL,
  age TINYINT UNSIGNED,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  allowance NUMERIC(10,2) DEFAULT 0,
  note TINYTEXT
);

INSERT INTO student_profiles(student_no,name,age,allowance)
VALUES ('2025000001','张同学',19,300.10),
       ('2025000002','李同学',20,200.20);

DESCRIBE student_profiles;
SELECT student_no,name,age,active,allowance
FROM student_profiles ORDER BY id;
```

第一次执行 INSERT 后，查询得到两条学生记录；再次执行会因学号唯一约束报重复错误。DESCRIBE、左侧字段树、表结构和 SQL 导出都显示规范化后的类型：BOOLEAN 显示 TINYINT(1)，NUMERIC 显示 DECIMAL(10,2)。

CHAR 与 VARCHAR 的对比：

```sql
CREATE TABLE text_lengths (fixed_code CHAR(4), variable_code VARCHAR(4));
INSERT INTO text_lengths VALUES ('A  ','A  ');
SELECT CHAR_LENGTH(fixed_code),CHAR_LENGTH(variable_code) FROM text_lengths;
-- 返回 1、3；CHAR 的末尾普通空格不保留，VARCHAR 保留。
```

已有表可以使用 `ALTER TABLE ... ADD COLUMN code CHAR(4)` 或 `MODIFY COLUMN code VARCHAR(20)`。转换后超长、超范围、产生重复值或不满足 NOT NULL 时，整条语句恢复原结构与数据。

## 保存与兼容边界

- 数据、类型、默认值和较大自增计数器可保存在 IndexedDB、完整 JSON 备份中；旧版 1.0.4 的常规备份可继续读取。本版开始严格检查 TEXT 的 65535 字节上限；如旧备份曾使用超长 TEXT，校验会拒绝恢复且不改写原文件，应保留旧应用与备份，将相应列调整为 MEDIUMTEXT 后再迁移。新类型的备份不能导入不认识这些类型的旧版应用；回退前应保留升级前的 JSON。
- SQL 导出使用规范类型名和精确数字字面量；导入失败整份回退。JSON 用于完整恢复工作台，SQL 主要恢复表结构与数据。
- CHAR 只模拟可观察的去尾空格结果，不模拟磁盘固定宽度、存储页或真实性能；VARCHAR 未模拟字符集带来的整行字节上限，超长尾空格也严格报错。字符比较仍采用区分大小写的 Unicode 比较，不模拟 MySQL 默认排序规则。
- 现有 TEXT 常量默认值与无前缀 UNIQUE/PRIMARY KEY 行为作为模拟器扩展保留，不代表真实 MySQL 对 TEXT 的索引和默认值规则。
- FLOAT / DOUBLE / REAL、BINARY / VARBINARY / BLOB、ENUM / SET、JSON、TIME / YEAR / TIMESTAMP、ZEROFILL、字符集和排序规则、小数秒精度尚未实现，会显示未支持提示；语法结构写错仍按语法错误处理。
- 已按官方文档及固定边界值验证，尚未完成真实 MySQL 8.4 逐条差分和 iPhone Safari 实机验收。

参考：[CHAR 与 VARCHAR](https://dev.mysql.com/doc/refman/8.4/en/char.html)、[整数类型](https://dev.mysql.com/doc/refman/8.4/en/integer-types.html)、[数字语法与别名](https://dev.mysql.com/doc/refman/8.4/en/numeric-type-syntax.html)、[TEXT 类型](https://dev.mysql.com/doc/refman/8.4/en/blob.html)。
