# 用客户订单和费用记录入门 SQL：从筛选到 LEFT JOIN

刚开始学数据库时，可以先用熟悉的业务记录理解 SQL：客户来自哪些城市、钱花在哪些类别、哪些客户还没有订单。本文用 SQL LAB 的虚构财务示例完成四个小练习。

[打开公开练习网页](https://mysql-foundry.marikoakina.chatgpt.site)，工作台默认选择 `finance_lab`。SQL LAB 是开源的 MySQL 基础学习模拟器，查询和写入由浏览器本地执行。本文使用的语法在当前支持范围内，真实 MySQL 的字符比较等行为可能因配置有所不同。

## 1. 先看表，再筛选客户

```sql
SELECT * FROM customers;
```

初始示例有 5 位客户。把数据库理解成一组账簿，表像工作表：一行是一位客户，一列是姓名、城市或邮箱这样的字段。

```sql
SELECT name, city
FROM customers
WHERE city = '武汉';
```

`SELECT` 选择列，`FROM` 指定表，`WHERE` 筛选行。初始数据返回晨光商贸、江城书店、青禾咨询三位武汉客户。中文文本放在英文单引号里。

## 2. 按类别汇总费用

```sql
SELECT category, SUM(amount) AS total
FROM expenses
GROUP BY category
ORDER BY total DESC;
```

`GROUP BY category` 按费用类别分组，`SUM(amount)` 对每组金额求和，`AS total` 给结果列起别名，`DESC` 让大额类别排在前面。

| category | total |
| --- | ---: |
| 住宿 | 1200.00 |
| 学习 | 108.70 |
| 餐饮 | 69.20 |
| 交通 | 20.00 |

表中统一按两位小数列示；界面中的 108.7 与 108.70 表示同一个数值。示例金额字段采用 DECIMAL，模拟器使用十进制运算，适合核对金额合计。

再试着只保留总费用大于 50 的类别：

```sql
SELECT category, SUM(amount) AS total
FROM expenses
GROUP BY category
HAVING SUM(amount) > 50
ORDER BY total DESC;
```

`WHERE` 筛选分组前的记录，`HAVING` 筛选分组后的结果。这里会保留住宿、学习和餐饮三类。

## 3. 连接客户与订单，保留没有订单的客户

```sql
SELECT c.name, o.amount
FROM customers AS c
LEFT JOIN orders AS o ON c.id = o.customer_id
ORDER BY c.id, o.id;
```

`c` 和 `o` 是表别名。`ON` 指定匹配关系：客户的 id 等于订单中的 customer_id。

初始数据返回 7 行：晨光商贸和远山科技各有两张订单，江城书店有一张，晴川工作室与青禾咨询没有订单，订单金额显示 NULL。LEFT JOIN 保留左表全部客户，因此不会把没有订单的客户漏掉。

这并不表示已经定义外键约束。当前模拟器尚未实现外键；这里通过字段值与 ON 条件理解表间关联。

## 4. COUNT(*) 与 COUNT(列) 为什么不同

```sql
SELECT COUNT(*) AS customers_count,
       COUNT(email) AS email_count
FROM customers;
```

结果是 5 和 3。`COUNT(*)` 统计全部客户行；`COUNT(email)` 只统计邮箱不是 NULL 的行。两个客户的邮箱未知，不能把 NULL 当作空字符串或数字 0。

## 把练习接起来

完成以上查询后，可以进入“学习练习”，依次做筛选、排序、统计、连接、插入、修改、删除和预算表设计，共 15 道题。每题有目标、表结构、分步提示与折叠答案。

查询按实际结果批改，可以接受不同的正确 SQL。修改数据的题目使用独立练习副本，不会改变工作台记录。工作台本身的写入会自动保存，重要进度可以在“数据与备份”中导出完整 JSON。

![SQL LAB 真实工作台界面](https://raw.githubusercontent.com/MarikoAkina/sql-lab/main/docs/media/workbench.png)

[在线练习](https://mysql-foundry.marikoakina.chatgpt.site) · [源码与完整文档](https://github.com/MarikoAkina/sql-lab) · [Windows 离线版](https://github.com/MarikoAkina/sql-lab/releases/latest)

源码采用 MIT 许可证。SQL LAB 是基础学习模拟器；[语法支持与差异](https://github.com/MarikoAkina/sql-lab/blob/main/docs/sql-compatibility.md)和[验收边界](https://github.com/MarikoAkina/sql-lab/blob/main/docs/testing.md)均公开说明，尚未完成真实 MySQL 8.4 逐条对照及全部 iPhone Safari 实机流程验收。
