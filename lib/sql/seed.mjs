import {Engine,emptyState} from './engine.mjs';
export const SEED_SQL=`CREATE DATABASE IF NOT EXISTS finance_lab;
USE finance_lab;
CREATE TABLE customers (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(40) NOT NULL, city VARCHAR(20), email VARCHAR(80) UNIQUE);
INSERT INTO customers(name,city,email) VALUES ('晨光商贸','武汉','chenguang@example.cn'),('远山科技','上海','yuanshan@example.cn'),('江城书店','武汉',NULL),('晴川工作室','杭州','qingchuan@example.cn'),('青禾咨询','武汉',NULL);
CREATE TABLE orders (id INT PRIMARY KEY AUTO_INCREMENT, customer_id INT, amount DECIMAL(10,2) NOT NULL, order_date DATE NOT NULL, status VARCHAR(16) DEFAULT '待付款');
INSERT INTO orders(customer_id,amount,order_date,status) VALUES (1,1280.50,'2026-09-01','已付款'),(2,860.00,'2026-09-03','已付款'),(1,320.25,'2026-09-05','待付款'),(3,199.90,'2026-09-08','已付款'),(99,450.00,'2026-09-10','待付款'),(NULL,75.50,'2026-09-12','已付款'),(2,860.00,'2026-09-14','已付款');
CREATE TABLE expenses (id INT PRIMARY KEY AUTO_INCREMENT, category VARCHAR(20) NOT NULL, amount DECIMAL(10,2) NOT NULL, expense_date DATE NOT NULL, note TEXT, recorded_at DATETIME DEFAULT '2026-09-01 09:00:00');
INSERT INTO expenses(category,amount,expense_date,note) VALUES ('餐饮',25.50,'2026-09-01','午餐'),('交通',8.00,'2026-09-01',NULL),('学习',68.80,'2026-09-03','数据库入门书'),('餐饮',18.20,'2026-09-04','晚餐'),('交通',12.00,'2026-09-05','地铁与公交'),('学习',39.90,'2026-09-07','练习笔记本'),('住宿',1200.00,'2026-09-08','本月房租'),('餐饮',25.50,'2026-09-09','午餐');
CREATE DATABASE IF NOT EXISTS campus_lab;
USE campus_lab;
CREATE TABLE students (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(20) NOT NULL, major VARCHAR(30) DEFAULT '财务管理', score INT, city VARCHAR(20));
INSERT INTO students(name,major,score,city) VALUES ('林晓','财务管理',92,'武汉'),('陈晨','财务管理',78,'武汉'),('周宁','会计学',85,'长沙'),('李悦','财务管理',NULL,'杭州'),('王川','会计学',78,'上海'),('赵晴','财务管理',65,'武汉');
USE finance_lab;`;
export function createSeed(){const e=new Engine(emptyState()),r=e.executeScript(SEED_SQL);if(r.logs.some(l=>!l.success))throw new Error(JSON.stringify(r.logs.find(l=>!l.success)));return r.state;}
