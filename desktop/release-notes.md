SQL LAB 1.1.0 · 扩展建表字段类型。

- 新增 CHAR(n)，保留 VARCHAR(n)，正确区分末尾空格和中文字符长度。
- 支持 TINYINT、SMALLINT、MEDIUMINT、INT / INTEGER、BIGINT 与 UNSIGNED；整数主键均支持 AUTO_INCREMENT。
- BIGINT 数据、排序、运算和超过安全整数范围的自增计数保持十进制精确值。
- 支持 BOOL / BOOLEAN、NUMERIC / DEC / FIXED，以及 TINYTEXT / MEDIUMTEXT / LONGTEXT。
- 字段树、表结构、DESC、ALTER、SQL 导出和完整 JSON 恢复同步支持新类型；失败写入与结构转换整条回退。
- 保留初代原生补全、手机同屏练习和全部 45 题。

使用示例与边界见 docs/column-types.md。FLOAT / DOUBLE / REAL 等近似数类型、二进制、ENUM、JSON、TIME / YEAR / TIMESTAMP 仍未实现。TEXT 现按 65535 个 UTF-8 字节校验；MEDIUMTEXT / LONGTEXT 受模拟器容量限制。旧版常规备份可读取；新类型备份不能导入旧应用，升级前请导出完整 JSON。旧发布与安装包保留。真实 MySQL 8.4 差分与 iPhone Safari 实机仍待验证。
