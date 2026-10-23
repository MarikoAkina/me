import parserModule from 'node-sql-parser/build/mysql.js';
import Decimal from 'decimal.js';
import {tokens,splitSQL,position,decodeString} from './lexer.mjs';
import {FUNCTION_ARITIES,evaluateScalar} from './functions.mjs';
const {Parser}=parserModule;const parser=new Parser();
Decimal.set({precision:80,rounding:Decimal.ROUND_HALF_UP,toExpNeg:-80,toExpPos:80});
export const LIMITS={rows:10000,databases:20,tables:50,statements:100,sqlBytes:200000,operations:2000000,milliseconds:3000,resultRows:10000};
export const emptyState=()=>({version:1,current:null,databases:{}});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), norm=s=>String(s).toLowerCase(), clone=s=>JSON.parse(JSON.stringify(s));
const isNum=x=>Decimal.isDecimal(x);const num=x=>isNum(x)?x:new Decimal(x);
const display=x=>isNum(x)?x.toFixed():typeof x==='boolean'?(x?1:0):x;
const output=x=>isNum(x)?{decimal:x.toFixed()}:typeof x==='boolean'?(x?1:0):x;
const unpack=(x,c)=>x===null?null:c.type==='INT'||c.type==='DECIMAL'?num(x):x;
const truth=x=>x===null?null:isNum(x)?!x.isZero():typeof x==='string'?Number.parseFloat(x)!==0&&!Number.isNaN(Number.parseFloat(x)):!!x;
const negate=x=>x===null?null:!truth(x);
function compare(a,b){if(a===null||b===null)return null;if(isNum(a)||isNum(b)){try{return num(a).cmp(num(b));}catch{throw new SQLError('SIM_TYPE','不能把非数字字符串与数字比较；请使用同类数据。');}}return String(a)<String(b)?-1:String(a)>String(b)?1:0;}
const key=x=>JSON.stringify(x.map(v=>isNum(v)?['n',v.toFixed()]:[v===null?'null':typeof v,v]));
const expressionChildren=e=>e?.type==='case'?[e.expr,...(e.args||[]).flatMap(a=>[a.cond,a.result])]:[e?.left,e?.right,e?.expr,...(e?.args?.value||[]),...(e?.type==='expr_list'?e.value:[])];
export class SQLError extends Error{constructor(code,message,node=null,kind='sql'){super(message);this.code=code;this.kind=kind;this.offset=node?.loc?.start?.offset??node?.start??0;}}
const fail=(code,message,node)=>{throw new SQLError(code,message,node);};
const unsupported=(message,node)=>{throw new SQLError('SIM_UNSUPPORTED',message,node,'unsupported');};
function validateName(n,node){if(typeof n!=='string'||!n.length||n.length>64||n==='.'||n==='__proto__'||/[\0/\\]/.test(n))fail(1103,'名称需要为 1～64 个字符，且不含路径符号。',node);return n;}
function findName(map,n){return Object.keys(map).find(k=>norm(k)===norm(n));}
function literalString(s,quote="'"){return decodeString(s,quote);}
function numericLiteral(n){try{const x=new Decimal(n);if(!x.isFinite())fail(1264,'数值超出范围。');return x;}catch(e){if(e instanceof SQLError)throw e;fail(1366,'不是有效数字。');}}
export class Engine{
 constructor(state=emptyState()){this.state=clone(state);this.budget=0;this.deadline=0;this.cache=new Map();}
 tick(n=1){this.budget+=n;if(this.budget>LIMITS.operations||(this.budget%64===0&&performance.now()>this.deadline))fail('SIM_LIMIT','执行超出 3 秒或 200 万步上限。请缩小数据范围、简化 JOIN，或增加 LIMIT。');}
 db(name=this.state.current,node){if(!name)fail(1046,'尚未选择数据库。请先执行 USE 数据库名。',node);const k=findName(this.state.databases,name);if(!k)fail(1049,`数据库「${name}」不存在。`,node);return this.state.databases[k];}
 table(ref){const db=this.db(ref.db||this.state.current,ref);const k=findName(db.tables,ref.table);if(!k)fail(1146,`表「${ref.table}」不存在，请检查当前数据库。`,ref);return db.tables[k];}
 parse(sql){
  const ts=tokens(sql);for(const t of ts){if(t.closed===false)fail(1064,'引号没有闭合。',t);}
  // Exact integer literals avoid the parser's JavaScript-number precision limit.
  let normalized='',last=0;const map=[];
  // Adapt the standard SUBSTRING(str FROM pos FOR len) spelling using lexer tokens.
  // Strings, comments, identifiers and nested function arguments remain untouched.
  const argumentEdits=new Map(),frames=[];
  for(let i=0;i<ts.length;i++){const t=ts[i];if(t.raw==='(')frames.push(norm(ts[i-1]?.value));else if(t.raw===')')frames.pop();else if(t.kind==='word'&&['substring','substr'].includes(frames.at(-1))&&['from','for'].includes(norm(t.value)))argumentEdits.set(t.start,',');}
  const valuesToken=norm(ts[0]?.value)==='insert'?ts.find(t=>norm(t.value)==='values'):null;
  for(const t of ts.filter(t=>argumentEdits.has(t.start)||(t.kind==='number'&&/^\d{16,}$/.test(t.value))||(valuesToken&&t.start>valuesToken.start&&t.kind==='word'&&norm(t.value)==='default'))){const replacement=argumentEdits.get(t.start)??(t.kind==='number'?`__SQLLAB_EXACT('${t.value}')`:'__SQLLAB_DEFAULT()');normalized+=sql.slice(last,t.start);normalized+=replacement;map.push({at:t.start,normalizedAt:normalized.length-replacement.length,delta:replacement.length-t.raw.length});last=t.end;}
  normalized+=sql.slice(last);
  try{const ast=parser.astify(normalized,{database:'MySQL',parseOptions:{includeLocations:true}});
   const remap=node=>{if(!node||typeof node!=='object')return;if(node.loc){for(const end of ['start','end']){const off=node.loc[end].offset;let delta=0;for(const m of map)if(off>m.normalizedAt)delta+=m.delta;Object.assign(node.loc[end],position(sql,Math.max(0,off-delta)));}}for(const [k,v]of Object.entries(node))if(k!=='loc'&&v&&typeof v==='object'){if(Array.isArray(v))v.forEach(remap);else remap(v);}};remap(ast);return ast;
  }catch(e){if(e instanceof SQLError)throw e;
   if(e.message?.includes("column count doesn't match value count"))fail(1136,'VALUES 值的数量与字段数量不一致。',{start:ts.find(t=>norm(t.value)==='values')?.start||0});
   let offset=e.location?.start?.offset||0;for(const m of map)if(offset>m.at)offset-=m.delta;
   const found=sql.slice(offset,offset+22).split('\n')[0];fail(1064,`SQL 语法错误${found?`，请检查「${found}」附近`:''}。检查关键字、括号、逗号和引号。`,{start:offset});
  }
 }
 executeScript(sql,{atomic=false}={}){
  const original=clone(this.state);const logs=[];if(sql.length>LIMITS.sqlBytes)return {state:this.state,logs:[{success:false,sql:'',error:{code:'SIM_LIMIT',kind:'sql',message:'脚本超过 200 KB，请分批导入。',line:1,column:1,offset:0},milliseconds:0}],rolledBack:false};
  const parts=splitSQL(sql);if(parts.length>LIMITS.statements)return {state:this.state,logs:[{success:false,sql:'',error:{code:'SIM_LIMIT',message:'一次最多执行 100 条语句。',line:1,column:1,offset:0},milliseconds:0}],rolledBack:false};
  for(let i=0;i<parts.length;i++){
   const p=parts[i],before=clone(this.state),start=performance.now();this.budget=0;this.deadline=start+LIMITS.milliseconds;this.cache=new Map();
   try{const ast=this.parse(p.sql);const result=this.execute(ast);logs.push({success:true,sql:p.sql.trim(),index:i+1,start:p.start,milliseconds:performance.now()-start,...result});}
   catch(e){this.state=before;const se=e instanceof SQLError?e:new SQLError('SIM_INTERNAL','模拟器无法完成此语句，请检查支持说明或缩小查询范围。');logs.push({success:false,sql:p.sql.trim(),index:i+1,start:p.start,milliseconds:performance.now()-start,error:{code:se.code,kind:se.kind,message:se.message,...position(sql,p.start+se.offset)}});break;}
  }
  const rolledBack=atomic&&logs.some(l=>!l.success);if(rolledBack)this.state=original;return {state:clone(this.state),logs,rolledBack};
 }
 execute(a){if(Array.isArray(a)){if(a.length!==1)unsupported('请用分号分隔各条语句。');a=a[0];}
  if(!a)fail(1064,'请输入 SQL。');
  if(a.type==='select')return {kind:'query',...this.select(a),affected:0,message:'查询完成'};
  if(a.type==='show'){
   if(a.expr)unsupported('SHOW 的筛选子句尚未支持。',a);
   if(a.keyword==='databases')return this.grid(['Database'],Object.keys(this.state.databases).map(n=>[n]));
   if(a.keyword==='tables')return this.grid([`Tables_in_${this.state.current}`],Object.keys(this.db().tables).map(n=>[n]));
   unsupported('仅支持 SHOW DATABASES 和 SHOW TABLES。',a);
  }
  if(a.type==='use'){this.db(a.db);this.state.current=findName(this.state.databases,a.db);return this.done(0,`已切换到 ${this.state.current}`);}
  if(a.type==='desc'||a.type==='describe'){
   const t=this.table({table:a.table});return this.grid(['Field','Type','Null','Key','Default','Extra'],t.columns.map(c=>[c.name,this.typeLabel(c),c.notNull?'NO':'YES',c.primary?'PRI':c.unique?'UNI':'',c.hasDefault?c.default:null,c.auto?'auto_increment':'']));
  }
  if(a.type==='create')return this.create(a);
  if(a.type==='drop')return this.drop(a);
  if(a.type==='alter')return this.alter(a);
  if(a.type==='insert')return this.insert(a);
  if(a.type==='update')return this.update(a);
  if(a.type==='delete')return this.delete(a);
  if(a.type==='truncate'){if(a.name.length!==1)unsupported('一次只能清空一张表。',a);const t=this.table(a.name[0]);const count=t.rows.length;t.rows=[];t.nextId=1;return this.done(count,'表已清空，自增值重置为 1');}
  unsupported('此语句尚未支持。视图、索引、外键、事务、权限和存储过程不在首版范围内。',a);
 }
 done(affected,message){return {kind:'write',affected,message};}
 grid(columns,rows){return {kind:'query',columns,rows,affected:0,message:'查询完成'};}
 typeLabel(c){return c.type==='VARCHAR'?`VARCHAR(${c.length})`:c.type==='DECIMAL'?`DECIMAL(${c.precision},${c.scale})`:c.type;}
 column(d){
  const t=d.definition;const type=t?.dataType?.toUpperCase();if(!['INT','INTEGER','VARCHAR','TEXT','DECIMAL','DATE','DATETIME'].includes(type))unsupported(`字段类型 ${type||''} 尚未支持。请用 INT、VARCHAR、TEXT、DECIMAL、DATE 或 DATETIME。`,d.column);
  for(const p of ['reference_definition','collate','character_set','check','column_format','storage','comment'])if(d[p])unsupported(`字段选项 ${p} 尚未支持。`,d.column);
  if(t.suffix?.length)unsupported('UNSIGNED、ZEROFILL 和时区类型后缀尚未支持。',d.column);
  const c={name:validateName(d.column.column,d.column),type:type==='INTEGER'?'INT':type,notNull:d.nullable?.type==='not null'||!!d.primary_key,primary:!!d.primary_key,unique:!!d.unique,auto:!!d.auto_increment,hasDefault:!!d.default_val};
  if(type==='VARCHAR'){c.length=t.length;if(!Number.isInteger(c.length)||c.length<1||c.length>65535)fail(1074,'VARCHAR 长度需要为 1～65535。',d.column);}
  if(type==='DECIMAL'){c.precision=t.length??10;c.scale=t.scale??0;if(c.precision<1||c.precision>65||c.scale<0||c.scale>30||c.scale>c.precision)fail(1426,'DECIMAL 精度需为 1～65，小数位为 0～30，且不大于精度。',d.column);}
  if(c.hasDefault){const def=d.default_val.value;if(!['number','single_quote_string','double_quote_string','null','bool','boolean','unary_expr'].includes(def.type)&&!(def.type==='function'&&this.funcName(def)==='__SQLLAB_EXACT'))unsupported('DEFAULT 只支持常量值。',d.column);c.default=this.coerce(this.expr(def,{bindings:[]}),c);}
  return c;
 }
 validateTable(t){
  if(t.columns.length===0)fail(1113,'一张表至少需要一列。');if(new Set(t.columns.map(c=>norm(c.name))).size!==t.columns.length)fail(1060,'字段名重复。');
  const ps=t.columns.filter(c=>c.primary);if(ps.length>1)fail(1068,'只能有一个单列主键；复合主键尚未支持。');
  for(const c of t.columns){if(c.primary)c.notNull=true;if(c.auto&&(!c.primary||c.type!=='INT'))fail(1075,'AUTO_INCREMENT 仅支持 INT 单列主键。');if(c.hasDefault&&c.default===null&&c.notNull)fail(1067,`字段 ${c.name} 不能同时 NOT NULL 和 DEFAULT NULL。`);}
  for(const row of t.rows){for(const c of t.columns)row[c.name]=this.coerce(unpack(row[c.name]??null,c),c);}
  for(const c of t.columns.filter(c=>c.primary||c.unique)){
   const seen=new Set();for(const r of t.rows){this.tick();const v=r[c.name];if(v===null&&!c.primary)continue;const k=JSON.stringify(v);if(seen.has(k))fail(1062,`字段「${c.name}」的值「${v}」重复，违反 ${c.primary?'PRIMARY KEY':'UNIQUE'} 约束。`);seen.add(k);}
  }
 }
 coerce(v,c){
  if(v===undefined||v===null){if(c.notNull||c.primary)fail(1048,`字段「${c.name}」不能为 NULL。`);return null;}
  if(c.type==='INT'||c.type==='DECIMAL'){
   let d;try{if(typeof v==='string'&&!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim()))throw new Error();d=num(typeof v==='boolean'?(v?1:0):v);}catch{fail(1366,`字段「${c.name}」需要合法的数字。`);}
   if(!d.isFinite())fail(1264,`字段 ${c.name} 的数字超出范围。`);
   if(c.type==='INT'){if(!d.isInteger())fail(1366,`字段 ${c.name} 需要整数，本模拟器不会自动舍入。`);if(d.lt(-2147483648)||d.gt(2147483647))fail(1264,`字段 ${c.name} 超出有符号 INT 范围。`);return d.toFixed(0);}
   d=d.toDecimalPlaces(c.scale);if(d.abs().gte(new Decimal(10).pow(c.precision-c.scale)))fail(1264,`金额超出 DECIMAL(${c.precision},${c.scale}) 范围。`);return d.toFixed(c.scale);
  }
  const s=String(display(v));if(c.type==='VARCHAR'&&[...s].length>c.length)fail(1406,`字段「${c.name}」最多 ${c.length} 个字符。`);
  if(c.type==='DATE'||c.type==='DATETIME'){
   const rx=c.type==='DATE'?/^(\d{4})-(\d{2})-(\d{2})$/:/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;const m=s.match(rx);let valid=!!m;
   if(m){const y=+m[1],mo=+m[2],day=+m[3],date=new Date(Date.UTC(y,mo-1,day));valid=y>=1000&&y<=9999&&date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===day&&(!m[4]||(+m[4]<24&&+m[5]<60&&+m[6]<60));}
   if(!valid)fail(1292,`字段 ${c.name} 需要有效的 ${c.type==='DATE'?'YYYY-MM-DD':'YYYY-MM-DD HH:mm:ss'} 日期。`);
  }return s;
 }
 create(a){
  if(a.keyword==='database'||a.keyword==='schema'){
   if(a.create_definitions?.length)unsupported('数据库字符集和排序规则选项尚未支持。',a);
   const n=validateName(typeof a.database==='string'?a.database:a.database?.schema?.[0]?.value,a);if(Object.keys(this.state.databases).length>=LIMITS.databases&&!findName(this.state.databases,n))fail('SIM_LIMIT','最多建立 20 个数据库。');
   if(findName(this.state.databases,n)){if(a.if_not_exists)return this.done(0,'数据库已存在，已跳过');fail(1007,`数据库 ${n} 已存在。`);}Object.defineProperty(this.state.databases,n,{value:{name:n,tables:{}},writable:true,enumerable:true,configurable:true});return this.done(0,`已创建数据库 ${n}`);
  }
  if(a.keyword!=='table')unsupported('首版只支持 CREATE DATABASE 和 CREATE TABLE。',a);
  if(a.temporary||a.like||a.query_expr||a.table_options?.length)unsupported('临时表、CREATE TABLE AS / LIKE、存储引擎和排序规则选项尚未支持。',a);
  const ref=a.table[0],db=this.db(ref.db||this.state.current),name=validateName(ref.table,ref);if(findName(db.tables,name)){if(a.if_not_exists)return this.done(0,'表已存在，已跳过');fail(1050,`表 ${name} 已存在。`,ref);}if(Object.keys(db.tables).length>=LIMITS.tables)fail('SIM_LIMIT','每个数据库最多 50 张表。');
  const defs=a.create_definitions||[],columns=defs.filter(d=>d.resource==='column').map(d=>this.column(d));const t={name,columns,rows:[],nextId:1};
  for(const d of defs.filter(d=>d.resource!=='column')){
   if(d.resource!=='constraint'||!['primary key','unique','unique key','unique index'].includes(d.constraint_type)||d.definition.length!==1)unsupported('仅支持单列 PRIMARY KEY 和 UNIQUE；索引、外键、CHECK 和复合约束尚未支持。',d);
   const c=columns.find(c=>norm(c.name)===norm(d.definition[0].column));if(!c)fail(1072,'约束使用了不存在的字段。',d.definition[0]);if(d.constraint_type==='primary key'){if(c.primary)fail(1068,'重复定义了主键。');c.primary=true;c.notNull=true;}else c.unique=true;
  }
  this.validateTable(t);Object.defineProperty(db.tables,name,{value:t,writable:true,enumerable:true,configurable:true});return this.done(0,`已创建表 ${name}`);
 }
 drop(a){
  if(a.keyword==='database'||a.keyword==='schema'){const n=typeof a.name==='string'?a.name:a.name[0]?.value;const k=findName(this.state.databases,n);if(!k){if(a.prefix)return this.done(0,'数据库不存在，已跳过');fail(1008,`数据库 ${n} 不存在。`);}delete this.state.databases[k];if(norm(this.state.current)===norm(k))this.state.current=null;return this.done(0,`已删除数据库 ${k}`);}
  if(a.keyword!=='table')unsupported('只支持 DROP DATABASE / TABLE。',a);for(const ref of a.name){const db=this.db(ref.db||this.state.current),k=findName(db.tables,ref.table);if(!k){if(a.prefix)continue;fail(1051,`表 ${ref.table} 不存在。`,ref);}delete db.tables[k];}return this.done(0,'表已删除');
 }
 alter(a){
  if(a.table.length!==1)unsupported('ALTER 一次只能修改一张表。',a);const t=this.table(a.table[0]);
  for(const d of a.expr){if(d.resource!=='column'||!['add','modify','drop'].includes(d.action)||d.suffix)unsupported('ALTER 仅支持 ADD / MODIFY / DROP COLUMN，不支持位置或其他选项。',d);
   const i=t.columns.findIndex(c=>norm(c.name)===norm(d.column.column));if(d.action==='add'){
    if(i>=0)fail(1060,`字段 ${d.column.column} 已存在。`,d.column);const c=this.column(d);if(c.auto&&t.rows.length)unsupported('非空表上添加自增列尚未支持。',d.column);t.columns.push(c);for(const r of t.rows){if(c.notNull&&!c.hasDefault)fail('SIM_ALTER','已有数据时，新增 NOT NULL 列需要常量 DEFAULT。',d.column);r[c.name]=c.hasDefault?c.default:null;}
   }else{if(i<0)fail(1091,`字段 ${d.column.column} 不存在。`,d.column);const old=t.columns[i];if(d.action==='drop'){t.columns.splice(i,1);for(const r of t.rows)delete r[old.name];}else{const c=this.column(d);c.name=old.name;c.primary=old.primary||c.primary;c.unique=old.unique||c.unique;t.columns[i]=c;for(const r of t.rows)r[c.name]=this.coerce(unpack(r[c.name],old),c);}}
  }this.validateTable(t);return this.done(0,'表结构已更新');
 }
 binding(ref,row,t=this.table(ref)){return {alias:ref.as||ref.table,name:ref.table,columns:t.columns,row};}
 insert(a){if(a.on_duplicate_update||a.partition||!a.values||a.values.type!=='values'||a.table.length!==1)unsupported('INSERT 仅支持指定列或全列的 VALUES 多行插入。',a);
  const t=this.table(a.table[0]),names=a.columns||t.columns.map(c=>c.name),cs=names.map(n=>{const c=t.columns.find(c=>norm(c.name)===norm(n));if(!c)fail(1054,`字段 ${n} 不存在。`);return c;});if(new Set(cs.map(c=>norm(c.name))).size!==cs.length)fail(1110,'INSERT 的字段列表重复。');
  if(t.rows.length+a.values.values.length>LIMITS.rows)fail('SIM_LIMIT','每张表最多保存 10,000 行。');
  for(const list of a.values.values){this.tick();if(list.value.length!==cs.length)fail(1136,'VALUES 值的数量与字段数量不一致。');const row={};
   for(let i=0;i<cs.length;i++){const c=cs[i],v=list.value[i];row[c.name]=(v.type==='default'||v.type==='function'&&this.funcName(v)==='__SQLLAB_DEFAULT')?(c.hasDefault?c.default:null):this.expr(v,{bindings:[]});}
   for(const c of t.columns){const present=own(row,c.name);if(c.auto&&(!present||row[c.name]===null||this.coerce(row[c.name],c)==='0')){row[c.name]=num(t.nextId);t.nextId++;}else if(!present){if(c.hasDefault)row[c.name]=c.default;else if(c.notNull||c.primary)fail(1364,`字段 ${c.name} 没有默认值，必须指定。`);else row[c.name]=null;}
    row[c.name]=this.coerce(row[c.name],c);if(c.auto&&Number(row[c.name])>=t.nextId)t.nextId=Number(row[c.name])+1;
   }t.rows.push(row);
  }this.validateTable(t);return this.done(a.values.values.length,`已插入 ${a.values.values.length} 行`);
 }
 update(a){if(a.table.length!==1||a.orderby||a.limit||a.with)unsupported('UPDATE 仅支持单表 SET ... WHERE ...。',a);const ref=a.table[0],t=this.table(ref),sets=a.set.map(s=>{const c=t.columns.find(c=>norm(c.name)===norm(s.column));if(!c)fail(1054,`字段 ${s.column} 不存在。`);return {c,s};});const template={bindings:[this.binding(ref,Object.fromEntries(t.columns.map(c=>[c.name,null])),t)]};this.validateExpr(a.where,template);sets.forEach(({s})=>this.validateExpr(s.value,template));let affected=0,matched=0;
  for(const r of t.rows){this.tick();const ctx={bindings:[this.binding(ref,r,t)]};if(a.where&&truth(this.expr(a.where,ctx))!==true)continue;matched++;const before=JSON.stringify(r);for(const {c,s} of sets){r[c.name]=this.coerce(s.value.type==='default'?(c.hasDefault?c.default:null):this.expr(s.value,ctx),c);if(c.auto&&Number(r[c.name])>=t.nextId)t.nextId=Number(r[c.name])+1;}if(JSON.stringify(r)!==before)affected++;}
  this.validateTable(t);return {...this.done(affected,`匹配 ${matched} 行，实际修改 ${affected} 行`),matched};
 }
 delete(a){if(a.from.length!==1||a.orderby||a.limit||a.with||a.table?.length>1)unsupported('DELETE 仅支持单表 FROM ... WHERE ...。',a);const ref=a.from[0],t=this.table(ref);this.validateExpr(a.where,{bindings:[this.binding(ref,Object.fromEntries(t.columns.map(c=>[c.name,null])),t)]});const count=t.rows.length;t.rows=t.rows.filter(r=>{this.tick();return a.where&&truth(this.expr(a.where,{bindings:[this.binding(ref,r,t)]}))!==true;});return this.done(count-t.rows.length,`已删除 ${count-t.rows.length} 行`);}
 resolve(e,ctx,aliases=true){
  const n=typeof e.column==='string'?e.column:e.column?.expr?.value;if(!e.table&&aliases&&ctx.aliases&&own(ctx.aliases,norm(n)))return ctx.aliases[norm(n)];
  const bs=ctx.bindings.filter(b=>!e.table||norm(b.alias)===norm(e.table));const hits=bs.flatMap(b=>b.columns.filter(c=>norm(c.name)===norm(n)).map(c=>({b,c})));if(hits.length===0)fail(1054,`字段「${e.table?e.table+'.':''}${n}」不存在。`,e);if(hits.length>1)fail(1052,`字段「${n}」有歧义，请写成 表别名.${n}。`,e);return unpack(hits[0].b.row[hits[0].c.name]??null,hits[0].c);
 }
 funcName(e){return typeof e.name==='string'?e.name.toUpperCase():e.name?.name?.map(n=>n.value).join('.').toUpperCase();}
 checkFunction(e){
  const f=this.funcName(e),args=e.args?.value||[],arity=f==='NOT'||f==='__SQLLAB_EXACT'?[1,1]:FUNCTION_ARITIES[f];
  if(!arity)unsupported(`函数 ${f} 尚未支持。`,e);
  if(e.over)unsupported('窗口函数尚未支持。',e);
  if(f==='TRIM'&&args.some(a=>a.type==='origin'))unsupported('本轮 TRIM 仅支持 TRIM(文本)；自定义移除字符和 LEADING / TRAILING / BOTH 尚未支持。',e);
  if(args.length<arity[0]||args.length>arity[1])fail(1582,`${f} 参数数量不正确，需要 ${arity[0]===arity[1]?arity[0]:arity[1]===Infinity?'至少 '+arity[0]:arity[0]+'～'+arity[1]} 个参数。`,e);
  return f;
 }
 validateExpr(e,ctx,inside=false){if(!e)return;if(e.ast){const locals=(e.ast.from||[]).map(r=>norm(r.as||r.table));const outer=ctx.bindings.map(b=>norm(b.alias));const walk=x=>{if(!x||typeof x!=='object')return;if(x.type==='column_ref'&&x.table&&outer.includes(norm(x.table))&&!locals.includes(norm(x.table)))unsupported('关联子查询尚未支持。请让内层查询独立执行。',x);for(const [k,v]of Object.entries(x))if(k!=='loc'&&v&&typeof v==='object'){if(Array.isArray(v))v.forEach(walk);else walk(v);}};walk(e.ast);this.select(e.ast,true);return;}if(e.type==='column_ref'){if(e.column!=='*')this.resolve(e,ctx);return;}if(e.type==='aggr_func'){if(inside)fail(1111,'聚合函数不能嵌套。',e);if(!['COUNT','SUM','AVG','MAX','MIN'].includes(e.name)||e.over)unsupported('仅支持 COUNT、SUM、AVG、MAX、MIN，暂不支持窗口函数。',e);this.validateExpr(e.args.expr,ctx,true);return;}if(e.type==='function')this.checkFunction(e);
  if(e.type==='binary_expr'&&!['AND','OR','=','<>','!=','>','<','>=','<=','IS','IS NOT','IN','NOT IN','BETWEEN','NOT BETWEEN','LIKE','NOT LIKE','+','-','*','/','%','DIV'].includes(e.operator.toUpperCase()))unsupported(`运算符 ${e.operator} 尚未支持。`,e);
  if(e.type==='unary_expr'&&!['NOT','-','+','!'].includes(e.operator.toUpperCase()))unsupported(`一元运算 ${e.operator} 尚未支持。`,e);
  if(!['number','single_quote_string','double_quote_string','null','bool','boolean','column_ref','aggr_func','function','binary_expr','unary_expr','expr_list','star','default','case'].includes(e.type))unsupported(`表达式 ${e.type} 尚未支持。`,e);
  for(const x of expressionChildren(e))this.validateExpr(x,ctx,inside);
 }
 expr(e,ctx={bindings:[]}){
  this.tick();if(!e)return null;if(e.ast){const r=this.subquery(e.ast);if(r.columns.length!==1)fail(1241,'标量子查询必须返回一列。',e);if(r.rows.length>1)fail(1242,'标量子查询返回了多行，请使用聚合或 LIMIT 1。',e);return r.rows[0]?.[0]??null;}
  switch(e.type){case 'number':return numericLiteral(e.value);case 'single_quote_string':case 'double_quote_string':return literalString(e.value,e.type==='double_quote_string'?'\"':"'");case 'null':return null;case 'bool':case 'boolean':return !!e.value;case 'column_ref':return this.resolve(e,ctx);case 'expr_list':return e.value.map(v=>this.expr(v,ctx));case 'unary_expr':{const v=this.expr(e.expr,ctx);if(['NOT','!'].includes(e.operator.toUpperCase()))return negate(v);if(v===null)return null;return e.operator==='-'?num(v).neg():num(v);}
   case 'aggr_func':{if(!ctx.group)fail(1111,'此位置不能使用聚合函数。',e);let vs=e.args.expr.type==='star'?ctx.group.map(()=>num(1)):ctx.group.map(c=>this.expr(e.args.expr,c)).filter(v=>v!==null);if(e.args.distinct)vs=[...new Map(vs.map(v=>[key([v]),v])).values()];if(e.name==='COUNT')return num(vs.length);if(!vs.length)return null;if(e.name==='MIN'||e.name==='MAX')return vs.reduce((a,b)=>compare(a,b)*(e.name==='MIN'?1:-1)<=0?a:b);const sum=vs.reduce((s,v)=>s.plus(num(v)),num(0));return e.name==='AVG'?sum.div(vs.length):sum;}
   case 'case':{const subject=e.expr?this.expr(e.expr,ctx):null;for(const branch of e.args){if(branch.type==='else')return this.expr(branch.result,ctx);const condition=this.expr(branch.cond,ctx);if(e.expr?compare(subject,condition)===0:truth(condition)===true)return this.expr(branch.result,ctx);}return null;}
   case 'function':{const f=this.checkFunction(e),args=e.args?.value||[];
    if(f==='__SQLLAB_EXACT')return numericLiteral(this.expr(args[0],ctx));
    if(f==='NOT')return negate(this.expr(args[0],ctx));
    if(f==='IF'){const condition=this.expr(args[0],ctx);return this.expr(args[truth(condition)===true?1:2],ctx);}
    if(f==='IFNULL'){const a=this.expr(args[0],ctx);return a===null?this.expr(args[1],ctx):a;}
    if(f==='COALESCE'){for(const arg of args){const value=this.expr(arg,ctx);if(value!==null)return value;}return null;}
    if(f==='NULLIF'){const a=this.expr(args[0],ctx),b=this.expr(args[1],ctx);return compare(a,b)===0?null:a;}
    return evaluateScalar(f,args.map(x=>this.expr(x,ctx)),(code,message)=>{if(code==='SIM_UNSUPPORTED')unsupported(message,e);fail(code,message,e);});
   }
   case 'binary_expr':return this.binary(e,ctx);
   default:unsupported(`表达式 ${e.type} 尚未支持。`,e);
  }
 }
 subquery(ast){if(this.cache.has(ast))return this.cache.get(ast);const r=this.select(ast,false,true);this.cache.set(ast,r);return r;}
 binary(e,ctx){const op=e.operator.toUpperCase(),a=this.expr(e.left,ctx);
  if(op==='AND'||op==='OR'){const av=truth(a);if(op==='AND'&&av===false)return false;if(op==='OR'&&av===true)return true;const bv=truth(this.expr(e.right,ctx));return op==='AND'?(bv===false?false:av===null||bv===null?null:true):(bv===true?true:av===null||bv===null?null:false);}
  if(op==='IS'||op==='IS NOT'){const b=this.expr(e.right,ctx);if(b!==null)unsupported('IS 仅支持 NULL。',e);return op==='IS'?a===null:a!==null;}
  if(op==='IN'||op==='NOT IN'){let vs=[];for(const v of e.right.value){if(v.ast){const r=this.subquery(v.ast);if(r.columns.length!==1)fail(1241,'IN 子查询必须返回一列。',v);vs.push(...r.rows.map(r=>r[0]));}else vs.push(this.expr(v,ctx));}const r=a===null?null:vs.some(v=>v!==null&&compare(a,v)===0)?true:vs.includes(null)?null:false;return op==='NOT IN'?negate(r):r;}
  if(op==='BETWEEN'||op==='NOT BETWEEN'){const lo=this.expr(e.right.value[0],ctx),hi=this.expr(e.right.value[1],ctx);const x=a===null||lo===null||hi===null?null:compare(a,lo)>=0&&compare(a,hi)<=0;return op==='NOT BETWEEN'?negate(x):x;}
  const b=this.expr(e.right,ctx);if(a===null||b===null)return null;
  if(op==='LIKE'||op==='NOT LIKE'){let pattern='^',escaped=false;for(const c of String(display(b))){if(escaped){pattern+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');escaped=false;}else if(c==='\\')escaped=true;else if(c==='%')pattern+='[\\s\\S]*';else if(c==='_')pattern+='[\\s\\S]';else pattern+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}if(escaped)pattern+='\\\\';pattern+='$';if(pattern.length>2048)fail('SIM_LIMIT','LIKE 模式过长。',e);const v=new RegExp(pattern,'u').test(String(display(a)));return op==='NOT LIKE'?!v:v;}
  if(['=','!=','<>','>','<','>=','<='].includes(op)){const c=compare(a,b);return op==='='?c===0:op==='!='||op==='<>'?c!==0:op==='>'?c>0:op==='<'?c<0:op==='>='?c>=0:c<=0;}
  try{const x=num(a),y=num(b);if((op==='/'||op==='%'||op==='DIV')&&y.isZero())return null;return op==='+'?x.plus(y):op==='-'?x.minus(y):op==='*'?x.times(y):op==='/'?x.div(y):op==='DIV'?x.div(y).trunc():x.mod(y);}catch{fail('SIM_TYPE','算术运算需要数字。',e);}
 }
 hasAggregate(e){if(!e||e.ast)return false;return e.type==='aggr_func'||expressionChildren(e).some(x=>this.hasAggregate(x));}
 cleanExpr(e,ctx){if(!e)return null;if(e.type==='column_ref'&&e.column!=='*'&&ctx){const bs=ctx.bindings.filter(b=>!e.table||norm(b.alias)===norm(e.table));const hits=bs.flatMap(b=>b.columns.filter(c=>norm(c.name)===norm(e.column)).map(c=>({b,c})));if(hits.length===1)return {type:'column_ref',table:norm(hits[0].b.alias),column:norm(hits[0].c.name)};}const c={};for(const k of Object.keys(e)){if(['loc','parentheses','collate'].includes(k))continue;const v=e[k];c[k]=Array.isArray(v)?v.map(x=>typeof x==='object'?this.cleanExpr(x,ctx):x):v&&typeof v==='object'?this.cleanExpr(v,ctx):typeof v==='string'&&['column','table','name'].includes(k)?norm(v):v;}return c;}
 sameExpr(a,b,ctx){return JSON.stringify(this.cleanExpr(a,ctx))===JSON.stringify(this.cleanExpr(b,ctx));}
 groupedExpr(e,groups,aliases,ctx){if(!e||e.ast||e.type==='aggr_func')return true;if(groups.some(g=>this.sameExpr(g,e,ctx)))return true;if(e.type==='column_ref'){if(!e.table&&aliases&&own(aliases,norm(e.column)))return this.groupedExpr(aliases[norm(e.column)],groups,null,ctx);return false;}return expressionChildren(e).every(x=>this.groupedExpr(x,groups,aliases,ctx));}
 select(a,validateOnly=false,raw=false){
  if(a.with||a._next||a.window||a.locking_read||a.into?.position||a.options?.length)unsupported('CTE、UNION、窗口函数、锁和 SELECT INTO 尚未支持。',a);
  const refs=a.from||[];if(!Array.isArray(refs)||refs.length>2||refs.some(r=>!r.table||r.expr))unsupported('FROM 仅支持单表或两表 INNER / LEFT JOIN，不支持派生表。',a);
  if(refs.length===2&&(!['INNER JOIN','LEFT JOIN','JOIN'].includes(refs[1].join)||!refs[1].on||refs[1].using))unsupported('两表查询请使用 INNER JOIN / LEFT JOIN ... ON 条件。',refs[1]);
  const tables=refs.map(r=>this.table(r));if(new Set(refs.map(r=>norm(r.as||r.table))).size!==refs.length)fail(1066,'表别名重复。');
  const template={bindings:refs.map((r,i)=>this.binding(r,Object.fromEntries(tables[i].columns.map(c=>[c.name,null])),tables[i]))};
  const cols=[];for(const c of a.columns){if(c.expr.type==='column_ref'&&c.expr.column==='*'){
   const bs=template.bindings.filter(b=>!c.expr.table||norm(b.alias)===norm(c.expr.table));if(!bs.length)fail(1054,'星号使用了不存在的表别名。',c.expr);for(const b of bs)for(const field of b.columns)cols.push({expr:{type:'column_ref',table:b.alias,column:field.name},as:field.name});
  }else cols.push(c);}
  const aliasExpr={};for(const c of cols)if(c.as)aliasExpr[norm(typeof c.as==='string'?c.as:c.as.value)]=c.expr;
  for(const c of cols)this.validateExpr(c.expr,template);this.validateExpr(a.where,template);if(this.hasAggregate(a.where))fail(1111,'WHERE 不能使用聚合函数，请使用 HAVING。',a.where);
  if(refs[1]){this.validateExpr(refs[1].on,template);if(this.hasAggregate(refs[1].on))fail(1111,'ON 不能使用聚合函数。',refs[1].on);}
  let groups=(a.groupby?.columns||[]).map(g=>g.type==='column_ref'&&!g.table&&own(aliasExpr,norm(g.column))?aliasExpr[norm(g.column)]:g);
  if(a.groupby?.modifiers?.some(Boolean))unsupported('GROUP BY 修饰符尚未支持。',a.groupby);groups.forEach(g=>{this.validateExpr(g,template);if(this.hasAggregate(g))fail(1111,'GROUP BY 不能使用聚合函数。',g);});
  const agg=groups.length>0||cols.some(c=>this.hasAggregate(c.expr))||this.hasAggregate(a.having)||(a.orderby||[]).some(o=>this.hasAggregate(o.expr));
  const aliasTemplate={...template,aliases:Object.fromEntries(Object.keys(aliasExpr).map(k=>[k,null]))};this.validateExpr(a.having,aliasTemplate);(a.orderby||[]).forEach(o=>this.validateExpr(o.expr,aliasTemplate));
  if(agg){for(const e of [...cols.map(c=>c.expr),a.having,...(a.orderby||[]).map(o=>o.expr)])if(!this.groupedExpr(e,groups,aliasExpr,template))fail(groups.length?1055:1140,'非聚合字段需要出现在 GROUP BY 中。本模拟器采用严格分组校验。',e);}
  if(a.distinct){const selected=cols.map(c=>c.expr);for(const o of a.orderby||[]){let expr=o.expr;if(expr.type==='number')continue;if(expr.type==='column_ref'&&!expr.table&&own(aliasExpr,norm(expr.column)))expr=aliasExpr[norm(expr.column)];if(!this.groupedExpr(expr,selected,null,template))fail(3065,'DISTINCT 查询的排序字段必须出现在 SELECT 结果中。',o.expr);}}
  const names=cols.map(c=>c.as?(typeof c.as==='string'?c.as:c.as.value):c.expr.type==='column_ref'?c.expr.column:this.label(c.expr));
  if(validateOnly)return {columns:names,rows:[]};
  let contexts;
  if(!refs.length)contexts=[{bindings:[]}];else contexts=tables[0].rows.map(r=>({bindings:[this.binding(refs[0],r,tables[0])]}));
  if(refs.length===2){const joined=[];for(const c of contexts){let hit=false;for(const row of tables[1].rows){this.tick();const ctx={bindings:[...c.bindings,this.binding(refs[1],row,tables[1])]};if(truth(this.expr(refs[1].on,ctx))===true){joined.push(ctx);hit=true;}if(joined.length>LIMITS.resultRows)fail('SIM_LIMIT','连接产生超过 10,000 行中间结果，请缩小连接范围。');}if(!hit&&refs[1].join==='LEFT JOIN')joined.push({bindings:[...c.bindings,this.binding(refs[1],Object.fromEntries(tables[1].columns.map(c=>[c.name,null])),tables[1])]});}contexts=joined;}
  if(a.where)contexts=contexts.filter(c=>truth(this.expr(a.where,c))===true);
  if(agg){const gs=new Map();for(const c of contexts){const k=key(groups.map(g=>this.expr(g,c)));if(!gs.has(k))gs.set(k,[]);gs.get(k).push(c);}if(!groups.length&&!gs.size)gs.set('empty',[]);contexts=[...gs.values()].map(group=>({bindings:group[0]?.bindings||template.bindings,group}));}
  let projected=contexts.map(ctx=>{this.tick();const values=cols.map(c=>this.expr(c.expr,ctx));const aliases={};cols.forEach((c,i)=>{if(c.as)aliases[norm(typeof c.as==='string'?c.as:c.as.value)]=values[i];});return {values,ctx:{...ctx,aliases}};});
  if(a.having)projected=projected.filter(p=>truth(this.expr(a.having,p.ctx))===true);
  if(a.distinct){const seen=new Set();projected=projected.filter(p=>{const k=key(p.values);if(seen.has(k))return false;seen.add(k);return true;});}
  if(a.orderby){const order=a.orderby;projected.forEach(p=>p.sorts=order.map(o=>o.expr.type==='number'?p.values[Number(o.expr.value)-1]:this.expr(o.expr,p.ctx)));for(const o of order)if(o.expr.type==='number'&&(Number(o.expr.value)<1||Number(o.expr.value)>names.length))fail(1054,'ORDER BY 列序号超出范围。',o.expr);projected.sort((x,y)=>{this.tick();for(let i=0;i<order.length;i++){const av=x.sorts[i],bv=y.sorts[i];const c=av===null?(bv===null?0:-1):bv===null?1:compare(av,bv);if(c)return c*(order[i].type==='DESC'?-1:1);}return 0;});}
  if(a.limit){const vs=a.limit.value.map(v=>Number(display(this.expr(v,template))));if(vs.some(n=>!Number.isSafeInteger(n)||n<0))fail(1064,'LIMIT 和 OFFSET 必须是非负整数。',a.limit);const offset=vs.length===1?0:a.limit.seperator===','?vs[0]:vs[1],count=vs.length===1?vs[0]:a.limit.seperator===','?vs[1]:vs[0];projected=projected.slice(offset,offset+count);}
  if(projected.length>LIMITS.resultRows)fail('SIM_LIMIT','结果超过 10,000 行，请加 LIMIT。');return {columns:names,rows:projected.map(p=>p.values.map(raw?v=>v:output))};
 }
 label(e){try{return parser.exprToSQL(e,{database:'MySQL'}).replace(/`/g,'');}catch{return e.name||'表达式';}}
}
export function validateState(input){
 if(!input||input.version!==1||!input.databases||typeof input.databases!=='object'||Array.isArray(input.databases))fail('SIM_BACKUP','备份格式不正确或版本不受支持。');
 const engine=new Engine(input);engine.deadline=performance.now()+5000;
 if(Object.keys(engine.state.databases).length>LIMITS.databases)fail('SIM_BACKUP','备份数据库数量超限。');
 for(const [name,db] of Object.entries(engine.state.databases)){validateName(name);if(!db||db.name!==name||!db.tables||typeof db.tables!=='object'||Array.isArray(db.tables))fail('SIM_BACKUP','数据库结构无效。');if(Object.keys(db.tables).length>LIMITS.tables)fail('SIM_BACKUP','表数量超限。');for(const [name,t] of Object.entries(db.tables)){validateName(name);if(!t||t.name!==name||!Array.isArray(t.columns)||!Array.isArray(t.rows)||t.rows.length>LIMITS.rows||!Number.isSafeInteger(t.nextId)||t.nextId<1)fail('SIM_BACKUP','表或自增信息无效。');for(const c of t.columns){validateName(c.name);if(!['INT','VARCHAR','TEXT','DECIMAL','DATE','DATETIME'].includes(c.type))fail('SIM_BACKUP','备份包含未知类型。');if(c.type==='VARCHAR'&&(!Number.isInteger(c.length)||c.length<1||c.length>65535))fail('SIM_BACKUP','VARCHAR 定义无效。');if(c.type==='DECIMAL'&&(!Number.isInteger(c.precision)||!Number.isInteger(c.scale)||c.precision<1||c.precision>65||c.scale<0||c.scale>30||c.scale>c.precision))fail('SIM_BACKUP','DECIMAL 定义无效。');}for(const c of t.columns)if(c.hasDefault)c.default=engine.coerce(unpack(c.default,c),c);for(const r of t.rows)if(!r||typeof r!=='object'||Array.isArray(r)||t.columns.some(c=>!own(r,c.name))||Object.keys(r).some(k=>!t.columns.some(c=>c.name===k)))fail('SIM_BACKUP','备份行数据与表结构不一致。');engine.validateTable(t);const ac=t.columns.find(c=>c.auto);if(ac){const max=Math.max(0,...t.rows.map(r=>Number(r[ac.name])));if(t.nextId<=max)fail('SIM_BACKUP','自增计数器无效。');}}}
 if(engine.state.current!==null&&!findName(engine.state.databases,engine.state.current))fail('SIM_BACKUP','当前数据库无效。');return engine.state;
}
export function exportSQL(state){const ident=n=>'`'+n.replace(/`/g,'``')+'`';const value=(v,c)=>v===null?'NULL':['INT','DECIMAL'].includes(c.type)?v:"'"+String(v).replace(/\\/g,'\\\\').replace(/'/g,"''").replace(/\0/g,'\\0').replace(/\n/g,'\\n').replace(/\r/g,'\\r')+"'";const e=new Engine(state);let lines=['-- SQL LAB 完整 SQL 导出；在空环境导入可还原结构与数据。'];for(const db of Object.values(state.databases)){lines.push(`CREATE DATABASE IF NOT EXISTS ${ident(db.name)};`,`USE ${ident(db.name)};`);for(const t of Object.values(db.tables)){lines.push(`CREATE TABLE ${ident(t.name)} (\n${t.columns.map(c=>'  '+ident(c.name)+' '+e.typeLabel(c)+(c.notNull?' NOT NULL':'')+(c.primary?' PRIMARY KEY':'')+(c.unique?' UNIQUE':'')+(c.auto?' AUTO_INCREMENT':'')+(c.hasDefault?' DEFAULT '+value(c.default,c):'')).join(',\n')}\n);`);for(let i=0;i<t.rows.length;i+=200){const rs=t.rows.slice(i,i+200);lines.push(`INSERT INTO ${ident(t.name)} (${t.columns.map(c=>ident(c.name)).join(', ')}) VALUES\n${rs.map(r=>'('+t.columns.map(c=>value(r[c.name],c)).join(', ')+')').join(',\n')};`);}}}if(state.current)lines.push(`USE ${ident(state.current)};`);return lines.join('\n\n');}
