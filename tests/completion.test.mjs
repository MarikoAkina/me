import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {CompletionContext} from '@codemirror/autocomplete';
import {sql} from '@codemirror/lang-sql';
import {completionConfig,sqlCompletionSource} from '../lib/sql/completion.mjs';
import {createSeed} from '../lib/sql/seed.mjs';
const db=createSeed(),config=completionConfig(db),source=sqlCompletionSource(config);
function complete(text,explicit=true){const pos=text.indexOf('|');const doc=text.replace('|','');return source(new CompletionContext(EditorState.create({doc,extensions:[sql(config)]}),pos,explicit));}
const options=text=>complete(text)?.options||[];
test('table context provides tables and databases, without fields or keywords',()=>{const o=options('SELECT * FROM |');assert.ok(o.some(x=>x.label==='orders'&&x.type==='class'));assert.ok(!o.some(x=>x.label==='SELECT'||x.label==='amount'));});
test('USE offers databases',()=>assert.deepEqual(options('USE |').map(x=>x.label).sort(),Object.values(db.databases).map(d=>d.name).sort()));
test('qualified table field preserves primary key, type and column distinction',()=>{const o=options('SELECT orders.| FROM orders');assert.ok(o.some(x=>x.label==='id'&&x.primaryKey&&x.detail.includes('INT')));assert.ok(o.some(x=>x.label==='amount'&&x.detail.includes('DECIMAL(10,2)')&&!x.primaryKey));assert.ok(!o.some(x=>x.type==='keyword'));});
test('alias before FROM resolves its fields',()=>{const o=options('SELECT o.| FROM orders AS o');assert.ok(o.some(x=>x.label==='customer_id'));assert.ok(!o.some(x=>x.label==='city'));});
test('unqualified fields use the referenced table, even when FROM is after cursor',()=>{const o=options('SELECT am| FROM orders');assert.ok(o.some(x=>x.label==='amount'));assert.ok(!o.some(x=>x.label==='city'));});
test('two joined id columns are qualified to avoid ambiguous suggestions',()=>{const o=options('SELECT | FROM customers c LEFT JOIN orders o ON c.id=o.customer_id');assert.ok(o.some(x=>x.label==='c.id'&&x.primaryKey));assert.ok(o.some(x=>x.label==='o.id'&&x.primaryKey));assert.ok(!o.some(x=>x.label==='id'));});
test('current statement ignores the previous statement table',()=>{const o=options('SELECT * FROM customers; SELECT | FROM orders');assert.ok(o.some(x=>x.label==='amount'));assert.ok(!o.some(x=>x.label==='city'));});
test('inner subquery columns do not leak into outer SELECT',()=>{const o=options('SELECT | FROM customers WHERE id IN (SELECT customer_id FROM orders)');assert.ok(o.some(x=>x.label==='city'));assert.ok(!o.some(x=>x.label==='amount'));});
test('inner subquery uses its own table',()=>{const o=options('SELECT * FROM customers WHERE id IN (SELECT | FROM orders)');assert.ok(o.some(x=>x.label==='amount'));assert.ok(!o.some(x=>x.label==='city'));});
test('strings and both comment styles suppress completion',()=>{for(const s of ["SELECT 'cus|tomers'",'SELECT 1 -- cus|tomers\n','SELECT 1 # cus|tomers\n','SELECT /* cus|tomers */ 1'])assert.equal(complete(s),null,s);});
test('backtick identifiers and database qualification resolve schema',()=>{assert.ok(options('SELECT `orders`.| FROM orders').some(x=>x.label==='amount'));assert.ok(options('SELECT finance_lab.orders.| FROM orders').some(x=>x.primaryKey));});
test('function and keyword suggestions carry explicit types',()=>{const o=options('SEL|');assert.ok(o.some(x=>x.label==='SELECT'&&x.type==='keyword'));assert.ok(o.some(x=>x.label==='ROUND'&&x.type==='function'));});
test('updated metadata reflects ALTER/DROP and database switch',()=>{const changed=structuredClone(db);delete changed.databases.finance_lab.tables.orders;const c=completionConfig(changed);const s=EditorState.create({doc:'SELECT * FROM ',extensions:[sql(c)]});assert.ok(!sqlCompletionSource(c)(new CompletionContext(s,s.doc.length,true)).options.some(x=>x.label==='orders'));changed.current='campus_lab';assert.equal(completionConfig(changed).defaultSchema,'campus_lab');});

test('qualified aliases and database names match without case sensitivity',()=>{assert.ok(options('SELECT O.| FROM orders o').some(c=>c.label==='amount'));assert.ok(options('SELECT FINANCE_LAB.ORDERS.|').some(c=>c.primaryKey));});

test('names shared by keywords and functions keep both meanings',()=>{const o=options('DA|');assert.ok(o.some(x=>x.label==='DATE'&&x.type==='keyword'));assert.ok(o.some(x=>x.label==='DATE'&&x.type==='function'));});
test('function acceptance places cursor in parentheses without duplicating existing brackets',()=>{const f=options('ROU|').find(x=>x.label==='ROUND'&&x.type==='function');for(const doc of ['ROU','ROU()']){const view={state:EditorState.create({doc}),dispatch(spec){this.state=this.state.update(spec).state;}};f.apply(view,f,0,3);assert.equal(view.state.doc.toString(),'ROUND()');assert.equal(view.state.selection.main.head,6);}});
