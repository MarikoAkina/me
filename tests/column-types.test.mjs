import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {Engine,emptyState,validateState,exportSQL} from '../lib/sql/engine.mjs';
import {columnTypeEdits,columnTypeLabel} from '../lib/sql/column-types.mjs';
import {tokens} from '../lib/sql/lexer.mjs';
import {saveWorkspace,loadWorkspace,backupEnvelope,validateEnvelope} from '../lib/storage.mjs';

const cell=v=>v&&typeof v==='object'&&'decimal' in v?v.decimal:v;
function run(e,sql){const result=e.executeScript(sql);assert.ok(result.logs.every(l=>l.success),JSON.stringify(result.logs));const log=result.logs.at(-1);return log.rows?.map(row=>row.map(cell))??log;}
function fresh(def){const e=new Engine();run(e,'CREATE DATABASE types_lab; USE types_lab; CREATE TABLE sample ('+def+');');return e;}
function rejects(e,sql,code){const before=JSON.stringify(e.state),result=e.executeScript(sql),error=result.logs.find(l=>!l.success)?.error;assert.equal(error?.code,code,JSON.stringify(result.logs));assert.equal(JSON.stringify(e.state),before);return error;}

test('CHAR trims only ASCII trailing spaces; VARCHAR preserves spaces and Unicode code points',()=>{
 const e=fresh('fixed CHAR(2), variable_value VARCHAR(4)');run(e,"INSERT INTO sample VALUES ('中😀  ','中😀  '),('a\\t','a\\t');");
 assert.deepEqual(run(e,'SELECT fixed,variable_value,CHAR_LENGTH(fixed),CHAR_LENGTH(variable_value) FROM sample;'),[['中😀','中😀  ','2','4'],['a\t','a\t','2','2']]);
 rejects(e,"INSERT INTO sample VALUES ('abc','ok');",1406);rejects(e,"INSERT INTO sample VALUES ('a','12345');",1406);
});
test('CHAR default length, CHAR(0), nullable and invalid length definitions',()=>{
 const e=fresh('one CHAR, empty CHAR(0), note VARCHAR(1)');run(e,"INSERT INTO sample VALUES ('中','  ',NULL);");assert.deepEqual(run(e,'SELECT * FROM sample;'),[['中','',null]]);
 assert.equal(run(e,'DESC sample;')[0][1],'CHAR(1)');rejects(e,'CREATE TABLE bad(x CHAR(256));',1074);rejects(e,'CREATE TABLE bad(x VARCHAR(0));',1074);rejects(e,'CREATE TABLE bad(x VARCHAR);',1074);
});
test('CHAR uniqueness applies after space normalization and multi-row failures roll back',()=>{
 const e=fresh('code CHAR(3) UNIQUE NOT NULL');run(e,"INSERT INTO sample VALUES('a');");rejects(e,"INSERT INTO sample VALUES('b'),('a  ');",1062);rejects(e,'INSERT INTO sample VALUES(NULL);',1048);
});
const bounds=[['TINYINT','-128','127','255'],['SMALLINT','-32768','32767','65535'],['MEDIUMINT','-8388608','8388607','16777215'],['INT','-2147483648','2147483647','4294967295'],['BIGINT','-9223372036854775808','9223372036854775807','18446744073709551615']];
for(const [type,min,max,unsignedMax] of bounds){
 test(type+' enforces signed bounds and retains exact arithmetic/sorting',()=>{
  const e=fresh('value '+type);run(e,`INSERT INTO sample VALUES (${min}),(${max}),(2);`);
  assert.deepEqual(run(e,'SELECT value FROM sample ORDER BY value;'),[[min],['2'],[max]]);
  rejects(e,`INSERT INTO sample VALUES (${BigInt(min)-1n});`,1264);rejects(e,`UPDATE sample SET value=${BigInt(max)+1n};`,1264);rejects(e,'INSERT INTO sample VALUES (1.5);',1366);
 });
 test(type+' UNSIGNED enforces bounds, auto increment and overflow rollback',()=>{
  const e=fresh('id '+type+' UNSIGNED PRIMARY KEY AUTO_INCREMENT');run(e,'INSERT INTO sample VALUES (NULL),(0);');assert.deepEqual(run(e,'SELECT id FROM sample;'),[['1'],['2']]);
  rejects(e,'INSERT INTO sample VALUES (-1);',1264);run(e,`INSERT INTO sample VALUES (${unsignedMax});`);rejects(e,'INSERT INTO sample VALUES (NULL);',1264);
 });
}
test('integer width is display metadata, never a digit limit; BOOLEAN is TINYINT(1)',()=>{
 const e=fresh('n INT(2), flag BOOLEAN DEFAULT TRUE, other BOOL DEFAULT FALSE');run(e,'INSERT INTO sample(n) VALUES (12345); INSERT INTO sample VALUES (9,2,-1);');
 assert.deepEqual(run(e,'SELECT * FROM sample;'),[['12345','1','0'],['9','2','-1']]);assert.deepEqual(run(e,'DESC sample;').map(r=>r[1]),['INT(2)','TINYINT(1)','TINYINT(1)']);rejects(e,'CREATE TABLE bad(x INT(256));',1074);rejects(e,'CREATE TABLE bad(x INT ZEROFILL);','SIM_UNSUPPORTED');
});
test('BOOL/BOOLEAN reject unsigned modifiers; explicit TINYINT(1) UNSIGNED works',()=>{
 const e=fresh('a TINYINT(1) UNSIGNED');run(e,'INSERT INTO sample VALUES (255),(2);');assert.deepEqual(run(e,'SELECT * FROM sample;'),[['255'],['2']]);rejects(e,'UPDATE sample SET a=-1;',1264);assert.equal(run(e,'DESC sample;')[0][1],'TINYINT(1) UNSIGNED');rejects(e,'CREATE TABLE bad(a BOOLEAN UNSIGNED);',1064);rejects(e,'CREATE TABLE bad(a BOOL UNSIGNED);',1064);
});
test('DEC, FIXED and NUMERIC aliases retain precision, defaults, unsigned and exact sums',()=>{
 const e=fresh('amount NUMERIC(12,2), fee DEC(6,2) DEFAULT 1.255, credit FIXED(8,2) UNSIGNED');run(e,'INSERT INTO sample(amount,credit) VALUES(0.1,5),(0.2,6);');
 assert.deepEqual(run(e,'SELECT SUM(amount),SUM(fee),SUM(credit) FROM sample;'),[['0.3','2.52','11']]);assert.equal(run(e,'DESC sample;')[2][1],'DECIMAL(8,2) UNSIGNED');rejects(e,'UPDATE sample SET credit=-0.01;',1264);rejects(e,'CREATE TABLE bad(x NUMERIC(2,3));',1426);
});
test('text-family sizes use UTF-8 bytes and preserve trailing spaces',()=>{
 const e=fresh('small TINYTEXT, normal TEXT, medium MEDIUMTEXT, large LONGTEXT');run(e,`INSERT INTO sample VALUES('${'中'.repeat(85)}','a  ','中😀','x');`);assert.equal(run(e,'SELECT LENGTH(small),normal FROM sample;')[0][0],'255');assert.equal(run(e,'SELECT normal FROM sample;')[0][0],'a  ');
 rejects(e,`INSERT INTO sample(small) VALUES('${'中'.repeat(86)}');`,1406);rejects(e,`UPDATE sample SET normal='${'x'.repeat(65536)}';`,1406);
 run(e,`UPDATE sample SET medium='${'x'.repeat(70000)}';`);assert.equal(run(e,'SELECT LENGTH(medium) FROM sample;')[0][0],'70000');
});
test('large text uses a clear simulator cell budget rather than allocating native LONGTEXT sizes',()=>{
 const e=fresh('large LONGTEXT');assert.throws(()=>e.coerce('x'.repeat(200001),e.state.databases.types_lab.tables.sample.columns[0]),err=>err.code==='SIM_LIMIT');
});
test('BIGINT auto counters stay exact across the safe-number boundary, updates and restarts',()=>{
 const e=fresh('id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT');run(e,'INSERT INTO sample VALUES (9007199254740991),(NULL),(NULL);');
 assert.deepEqual(run(e,'SELECT id FROM sample ORDER BY id;'),[['9007199254740991'],['9007199254740992'],['9007199254740993']]);assert.equal(e.state.databases.types_lab.tables.sample.nextId,'9007199254740994');
 const restored=new Engine(validateState(JSON.parse(JSON.stringify(e.state))));run(restored,'UPDATE sample SET id=18446744073709551614 WHERE id=9007199254740993; INSERT INTO sample VALUES(NULL);');
 assert.equal(run(restored,'SELECT MAX(id) FROM sample;')[0][0],'18446744073709551615');rejects(restored,'INSERT INTO sample VALUES(NULL);',1264);run(restored,'TRUNCATE TABLE sample; INSERT INTO sample VALUES(NULL);');assert.deepEqual(run(restored,'SELECT * FROM sample;'),[['1']]);
});
test('ALTER add/modify converts existing rows; failure restores the entire schema and data',()=>{
 const e=fresh('code VARCHAR(6), quantity SMALLINT');run(e,"INSERT INTO sample VALUES('ab  ',300); ALTER TABLE sample MODIFY code CHAR(3); ALTER TABLE sample ADD enabled BOOL NOT NULL DEFAULT TRUE;");assert.deepEqual(run(e,'SELECT * FROM sample;'),[['ab','300','1']]);
 rejects(e,'ALTER TABLE sample MODIFY quantity TINYINT;',1264);rejects(e,'ALTER TABLE sample MODIFY code CHAR(1);',1406);run(e,'ALTER TABLE sample MODIFY quantity BIGINT UNSIGNED;');assert.equal(run(e,'DESC sample;')[1][1],'BIGINT UNSIGNED');
});
test('SQL export/re-import round-trips all canonical definitions and exact BIGINT values',()=>{
 const e=fresh('id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code CHAR(3) UNIQUE, n SMALLINT(4) UNSIGNED, flag BOOL DEFAULT TRUE, amount DEC(8,2), note TINYTEXT, medium MEDIUMTEXT, large LONGTEXT');
 run(e,"INSERT INTO sample(id,code,n,amount,note) VALUES (9007199254740993,'中',65535,0.10,'原样  ');");const sql=exportSQL(e.state),other=new Engine(emptyState());run(other,sql);assert.deepEqual(validateState(other.state),validateState(e.state));assert.ok(sql.includes('9007199254740993'));assert.ok(sql.includes('CHAR(3)'));
});
test('IndexedDB and full JSON backup restore new fields, large auto counters and existing progress',async()=>{
 const e=fresh('id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code CHAR(4), flag BOOLEAN');run(e,"INSERT INTO sample VALUES(9007199254740993,'财务  ',TRUE);");const w={version:1,db:e.state,tabs:[{id:'t',name:'类型.sql',sql:'SELECT * FROM sample;'}],activeTab:'t',history:[],progress:{1:true,45:true},lessonDrafts:{45:'SELECT 1;'},theme:'light'};
 await saveWorkspace(w);const restored=validateEnvelope(JSON.parse(JSON.stringify(backupEnvelope(await loadWorkspace()))));assert.deepEqual(validateState(restored.db),e.state);assert.deepEqual(restored,w);
});
test('corrupt backup type parameters, suffixes and auto counters are rejected',()=>{
 const e=fresh('id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code CHAR(3), text TINYTEXT');run(e,'INSERT INTO sample(id) VALUES(9007199254740993);');
 for(const change of [t=>t.nextId='9007199254740993',t=>t.nextId='18446744073709551617',t=>t.columns[1].length=256,t=>t.columns[1].unsigned=true,t=>t.columns[0].displayWidth=-1,t=>t.columns[2].type='FLOAT']){const state=structuredClone(e.state);change(state.databases.types_lab.tables.sample);assert.throws(()=>validateState(state));}
});
test('alias adaptation does not touch names, constraints, strings, comments or nested arguments',()=>{
 const sql="CREATE TABLE `BOOL` (`DEC` BOOL, label VARCHAR(20) DEFAULT 'FIXED, BOOL', n FIXED(8,2), CONSTRAINT BOOL UNIQUE (`DEC`));";
 const edits=columnTypeEdits(tokens(sql));assert.deepEqual([...edits.values()],['BOOLEAN','DECIMAL']);const e=new Engine();run(e,'CREATE DATABASE d; USE d; '+sql);run(e,"INSERT INTO `BOOL` (`DEC`,n) VALUES(TRUE,1.25);");assert.deepEqual(run(e,'SELECT * FROM `BOOL`;'),[['1','FIXED, BOOL','1.25']]);
 run(e,"ALTER TABLE `BOOL` ADD COLUMN `FIXED` DEC(4,2) DEFAULT 0, MODIFY `DEC` BOOLEAN;");assert.equal(columnTypeEdits(tokens("SELECT 'BOOL', DEC FROM t;")).size,0);
});
test('adapted type aliases still locate later syntax errors in the original SQL',()=>{
 const e=new Engine(),sql='CREATE TABLE broken(x FIXED(4,2), y BOOL, bad @);';const error=rejects(e,sql,1064);assert.ok(Math.abs(error.offset-sql.indexOf('@'))<3,JSON.stringify(error));
});
test('unsupported valid data types have a simulator unsupported error and leave no table behind',()=>{
 const e=fresh('id INT');for(const type of ['FLOAT','DOUBLE','REAL','TIMESTAMP','JSON','BLOB','ENUM(\'a\',\'b\')'])assert.equal(rejects(e,'CREATE TABLE later(x '+type+');','SIM_UNSUPPORTED').kind,'unsupported');
});
