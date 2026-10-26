import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons,lessonPreview,gradeLesson,createLessonState} from '../lib/sql/lessons.mjs';
import {createSeed} from '../lib/sql/seed.mjs';
import {readFile} from 'node:fs/promises';
const cells=rows=>rows.map(row=>row.map(v=>v&&typeof v==='object'&&'decimal' in v?v.decimal:v));
const oldKeys=['id','title','category','db','table','goal','answer','hints','explanation','write','ordered','tables','setup'];
test('all original 27 definitions, answers and rules remain byte-equivalent after normalization',async()=>{
 const original=JSON.parse(await readFile(new URL('../public/lesson-integrity.json',import.meta.url),'utf8'));
 const normalized=lessons.slice(0,27).map(l=>Object.fromEntries(oldKeys.filter(k=>k in l).map(k=>[k,l[k]])));
 // Baseline is independently extracted from the exact pre-change commit.
 const fixture=JSON.parse(await readFile(new URL('./fixtures/lessons-0.3.3.json',import.meta.url),'utf8'));
 assert.deepEqual(normalized,fixture);assert.equal(fixture.length,original.lessons);
});
test('45 unique stable IDs have hints, learning explanations and successful reference execution',()=>{
 assert.deepEqual(lessons.map(l=>l.id),Array.from({length:45},(_,i)=>i+1));
 for(const l of lessons){assert.ok(l.hints.length>=2);assert.ok(l.explanation.length>20);assert.ok(l.difficulty);assert.equal(gradeLesson(l.id,l.answer).pass,true,`lesson ${l.id}`);}
});
test('every reference lists the exact fixture rows and expected writes without altering the workbench',()=>{
 const seed=JSON.stringify(createSeed());
 for(const l of lessons){const p=lessonPreview(l.id),state=createLessonState(l);for(const t of p.sourceTables)assert.deepEqual(t,state.databases[l.db].tables[t.name]);assert.equal(!!p.result,!l.write);if(l.write)assert.ok(p.changes.length);}
 assert.equal(JSON.stringify(createSeed()),seed);
});
test('LEFT JOIN and subquery previews use both source tables and retain unmatched NULLs',()=>{
 const p=lessonPreview(10);assert.deepEqual(p.sourceTables.map(t=>t.name),['customers','orders']);assert.equal(p.result.rows.length,7);assert.equal(p.result.rows.filter(r=>r[1]===null).length,2);
 assert.deepEqual(cells(lessonPreview(35).result.rows),[['4','晴川工作室'],['5','青禾咨询']]);
 assert.deepEqual(cells(lessonPreview(37).result.rows),[['1','晨光商贸'],['2','远山科技'],['3','江城书店']]);
});
test('independent golden output verifies new filters, pagination, exact tax and joined finance totals',()=>{
 assert.deepEqual(cells(lessonPreview(28).result.rows),[['3','江城书店','武汉'],['5','青禾咨询','武汉']]);
 assert.deepEqual(cells(lessonPreview(29).result.rows),[['1','晨光商贸'],['3','江城书店']]);
 assert.deepEqual(cells(lessonPreview(30).result.rows),[['1','1280.5'],['2','860'],['6','75.5'],['7','860']]);
 assert.deepEqual(cells(lessonPreview(31).result.rows),[['5','450'],['3','320.25'],['4','199.9']]);
 assert.deepEqual(cells(lessonPreview(32).result.rows)[0],['1','1280.5','1357.33']);
 assert.deepEqual(cells(lessonPreview(33).result.rows),[['2','2','1720'],['1','1','1280.5']]);
 assert.deepEqual(cells(lessonPreview(38).result.rows),[['晨光商贸','1280.5','320.25'],['远山科技','1720','0'],['江城书店','199.9','0'],['晴川工作室','0','0'],['青禾咨询','0','0']]);
});
test('NULL, empty text and zero stay distinct in source and expected output',()=>{
 assert.deepEqual(cells(lessonPreview(39).result.rows),[['1',1,'未填写',null],['2',0,'','10'],['3',0,'已核对','35.5']]);
 assert.deepEqual(lessonPreview(39).sourceTables[0].rows.map(r=>r.note),[null,'','已核对']);
});
test('write previews show defaults, new columns, changed schema and newly created tables',()=>{
 const added=lessonPreview(40);assert.equal(added.affected,2);assert.deepEqual(added.changes[0].table.rows.slice(-2).map(r=>[r.id,r.status]),[['8','待付款'],['9','待付款']]);
 const changed=lessonPreview(41);assert.equal(changed.affected,2);assert.deepEqual(changed.changes[0].table.rows.filter(r=>r.category==='交通').map(r=>r.amount),['10.00','14.00']);
 const alter=lessonPreview(43);assert.ok(alter.changes[0].table.columns.some(c=>c.name==='note'&&c.type==='TEXT'));assert.ok(alter.changes[0].table.rows.every(r=>r.note===null));
 assert.equal(lessonPreview(44).changes[0].table.columns.find(c=>c.name==='category').length,40);
 assert.equal(lessonPreview(45).changes[0].created,true);assert.equal(lessonPreview(45).changes[0].table.rows[0].amount,'500.00');
});
test('equivalent SQL is accepted while wrong order, duplicate counts and lost unmatched clients fail',()=>{
 assert.equal(gradeLesson(31,'SELECT id,amount FROM orders ORDER BY amount DESC,id LIMIT 3,3;').pass,true);
 assert.equal(gradeLesson(31,'SELECT id,amount FROM orders ORDER BY amount,id LIMIT 3,3;').pass,false);
 assert.equal(gradeLesson(35,'SELECT id,name FROM customers WHERE id IN (4,5) ORDER BY id;').pass,true);
 assert.equal(gradeLesson(36,"SELECT c.id,c.name,o.id FROM customers c LEFT JOIN orders o ON c.id=o.customer_id WHERE o.status='已付款' ORDER BY c.id,o.id;").pass,false);
 assert.equal(gradeLesson(40,"INSERT INTO orders(customer_id,amount,order_date) VALUES (4,100,'2026-09-20');").pass,false);
 assert.equal(gradeLesson(41,"UPDATE expenses SET amount=amount+2;").pass,false);
});
