# 首轮扩展：条件、文本与日期分析

[文档目录](README.md) · [兼容限制](sql-compatibility.md) · [测试记录](testing.md)

0.3.0 在原有 15 题之后增加 12 题，共 27 题。打开 **学习练习 → 本轮新增**，从第 16 题继续；手机上先切到底部 **数据库**，再选择题目。每题保留独立数据、分步提示、默认折叠的参考答案和可选解释。

## 新增学习路线

| 题号 | 内容 | 实际练习 |
| --- | --- | --- |
| 16 | CASE 条件分类 | 按订单金额区分大额、中额、小额 |
| 17 | IF 与空值 | 为学生成绩标记达标、待提升、未录入 |
| 18 | COALESCE | 优先显示邮箱，再显示城市，最后显示占位文字 |
| 19 | NULLIF、LEFT JOIN | 计算客户平均订单金额，保留无订单客户 |
| 20 | LEFT、CHAR_LENGTH | 截取中文客户简称并统计字符数 |
| 21 | TRIM、REPLACE | 清理两端空格，替换费用编号分隔符 |
| 22 | YEAR、MONTH、QUARTER | 拆出订单的年份、月份和季度 |
| 23 | DATE_FORMAT 与分组 | 按月份汇总费用 |
| 24 | DATEDIFF | 计算订单到固定核对日的天数 |
| 25 | CASE 与聚合 | 分别核对已付款、待付款金额和笔数 |
| 26 | CEIL / CEILING | 按十元向上安排预算 |
| 27 | 综合费用分析 | 按指定月份生成类别、笔数、总额、均额与重点标记 |

第 23、27 题额外加入 10 月学习费 100 元、交通费 20 元。它们只存在于题目副本，帮助检查分组与月份筛选，不修改原工作台。重新开始本题会重建该副本；原有数据库、草稿、题号和通过记录保留。

## 在工作台试一条条件分类

选择 `finance_lab` 后执行：

```sql
SELECT id, amount,
       CASE
         WHEN amount >= 1000 THEN '大额'
         WHEN amount >= 500 THEN '中额'
         ELSE '小额'
       END AS amount_group
FROM orders
ORDER BY id;
```

CASE 从上往下检查条件，返回第一个匹配的结果。把大额条件放在前面，才能避免大额订单先被中额条件选中。没有任何条件匹配且未写 ELSE 时，结果为 NULL。

## 生成一张月份费用表

```sql
SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month,
       COUNT(*) AS entries,
       SUM(amount) AS total,
       ROUND(AVG(amount), 2) AS average
FROM expenses
GROUP BY month
ORDER BY month;
```

原始工作台的费用都在 2026 年 9 月，会返回一行、8 笔、合计 1397.90、平均 174.74。第 23 题副本额外有 10 月记录，会返回两个月。修改过数据时，以实际记录为准。

## 继续处理空值、文本和金额

```sql
SELECT name, COALESCE(email, city, '待补充') AS contact,
       LEFT(name, 2) AS short_name,
       CHAR_LENGTH(name) AS characters
FROM customers
ORDER BY id;

SELECT id, amount, CEIL(amount / 10) * 10 AS budget
FROM expenses
ORDER BY id;
```

COALESCE 返回第一个非 NULL 值，空字符串和零仍算有效值。CHAR_LENGTH 统计 Unicode 字符，LENGTH 统计 UTF-8 字节；中文和 emoji 的字节数通常大于字符数。CEIL 向上取整，FLOOR 向下取整，ABS 取绝对值，MOD 取余。

## 判题与兼容边界

判题比较执行结果，接受 CASE 与 IF、CEIL 与 CEILING 等不同正确写法。金额按数值比较，NULL 与空串保持区分，重复行参与比较；题目要求排序时检查顺序，列别名不限。查询题不能通过先修改数据来绕过目标。

本轮新增 CASE 和 27 个函数名称（包含同义名称），完整清单在 [兼容文档](sql-compatibility.md)。日期格式码有限、TRIM 仅支持基础形式、条件分支不模拟 MySQL 的统一结果类型推导。未加入 UNION、视图、索引、外键或事务；这些能力继续明确标为尚未支持。
