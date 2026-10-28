import {schemaCompletionSource,MySQL} from '@codemirror/lang-sql';
import {syntaxTree} from '@codemirror/language';
import {tokens} from './lexer.mjs';
import {FUNCTION_ARITIES} from './functions.mjs';
const keywords='SELECT DISTINCT FROM WHERE AND OR NOT NULL IS AS ORDER BY ASC DESC LIMIT OFFSET GROUP HAVING INNER LEFT JOIN ON IN BETWEEN LIKE INSERT INTO VALUES UPDATE SET DELETE CREATE DATABASE TABLE IF EXISTS USE SHOW DATABASES TABLES DESCRIBE DESC DROP ALTER ADD MODIFY COLUMN TRUNCATE INT VARCHAR TEXT DECIMAL DATE DATETIME PRIMARY KEY UNIQUE DEFAULT AUTO_INCREMENT CASE WHEN THEN ELSE END'.split(' ');
const quote=name=>/^[a-z_][a-z_\d]*$/i.test(name)&&!keywords.includes(name.toUpperCase())?name:'`'+name.replace(/`/g,'``')+'`';
const nsKey=name=>name.replace(/\./g,'\\.');
function columnOption(c,table){const type=c.type==='VARCHAR'?`VARCHAR(${c.length})`:c.type==='DECIMAL'?`DECIMAL(${c.precision},${c.scale})`:c.type;return {label:c.name,type:'property',apply:quote(c.name),primaryKey:!!c.primary,detail:[type,c.primary?'主键':c.unique?'唯一':''].filter(Boolean).join(' · '),info:`${table}.${c.name} · ${type}${c.notNull?' · 不允许 NULL':''}${c.auto?' · 自动递增':''}`};}
export function completionConfig(state){
 const schema=Object.create(null);
 for(const db of Object.values(state?.databases||{})){
  const tables=Object.create(null);
  for(const t of Object.values(db.tables))tables[nsKey(t.name)]={self:{label:t.name,apply:quote(t.name),type:'class',detail:'表'},children:t.columns.map(c=>columnOption(c,t.name))};
  schema[nsKey(db.name)]={self:{label:db.name,apply:quote(db.name),type:'namespace',detail:'数据库'},children:tables};
 }
 return {dialect:MySQL,schema,defaultSchema:state?.current||undefined,upperCaseKeywords:true};
}
// Reuse the application's quote/comment-aware lexer; identify only the containing SELECT scope.
function scopeTables(doc,pos,config){
 const all=tokens(doc);let depth=0;const stack=[];let begin=0,end=doc.length;
 for(const t of all){if(t.value==='('){stack.push(t.start);depth++;}t.depth=depth;t.parents=[...stack];if(t.value===')'){stack.pop();depth--;}if(t.value===';'&&t.start<pos)begin=t.end;if(t.value===';'&&t.start>=pos){end=t.start;break;}}
 const before=all.filter(t=>t.start>=begin&&t.end<=pos);const cursorParents=before.at(-1)?.parents||[];
 const selects=before.filter(t=>t.value.toUpperCase()==='SELECT'&&t.parents.every((p,i)=>cursorParents[i]===p));
 const select=selects.at(-1);const targetDepth=select?.depth||0;if(select)begin=select.start;
 if(targetDepth)end=all.find(t=>t.start>pos&&t.value===')'&&t.depth===targetDepth)?.start??end;
 const ts=all.filter(t=>t.start>=begin&&t.start<end&&t.depth===targetDepth),refs=[];
 const find=(obj,name)=>Object.entries(obj||{}).find(([k])=>k.replace(/\\\./g,'.').toLowerCase()===name.toLowerCase())?.[1];
 for(let i=0;i<ts.length;i++)if(['FROM','JOIN','UPDATE','INTO'].includes(ts[i].value.toUpperCase())){
  let j=i+1,a=ts[j];if(!a||!['word','identifier'].includes(a.kind))continue;
  let db=config.defaultSchema,table=a.value;if(ts[j+1]?.value==='.'){db=table;table=ts[j+2]?.value;j+=2;}if(!table)continue;
  const entry=find(find(config.schema,db||'')?.children,table);if(!entry)continue;
  let alias=table;if(ts[j+1]?.value.toUpperCase()==='AS')j++;
  const next=ts[j+1];if(next&&['word','identifier'].includes(next.kind)&&!keywords.includes(next.value.toUpperCase()))alias=next.value;
  refs.push({alias,table,columns:entry.children});
 }
 return refs;
}
const functions=[...Object.keys(FUNCTION_ARITIES),'COUNT','SUM','AVG','MAX','MIN'].map(label=>({label,type:'function',detail:'函数 · '+label+'()',apply(view,completion,from,to){const existing=view.state.sliceDoc(to,to+1)==='(';view.dispatch({changes:{from,to,insert:label+(existing?'':'()')},selection:{anchor:from+label.length+1},userEvent:'input.complete'});}}));
export function sqlCompletionSource(config){
 const schemaSource=schemaCompletionSource(config);
 return context=>{
  const node=syntaxTree(context.state).resolveInner(context.pos,-1);if(/^(String|LineComment|BlockComment)$/.test(node.name))return null;
  const word=context.matchBefore(/[\p{L}\p{N}_$]+/u),prefix=context.state.sliceDoc(0,word?.from??context.pos);
  const base=schemaSource(context),refs=scopeTables(context.state.doc.toString(),context.pos,config);
  if(prefix.endsWith('.')){
   if(base)return base;
   const tail=tokens(prefix),parents=[];while(tail.at(-1)?.value==='.'&&['word','identifier'].includes(tail.at(-2)?.kind)){tail.pop();parents.unshift(tail.pop().value);}
   const find=(obj,name)=>Object.entries(obj||{}).find(([k])=>k.replace(/\\\./g,'.').toLowerCase()===name?.toLowerCase())?.[1];
   const columns=parents.length===1?(refs.find(r=>r.alias.toLowerCase()===parents[0].toLowerCase())?.columns||find(find(config.schema,config.defaultSchema)?.children,parents[0])?.children):parents.length===2?find(find(config.schema,parents[0])?.children,parents[1])?.children:null;
   return Array.isArray(columns)?{from:word?.from??context.pos,options:columns,validFor:/^[\p{L}\p{N}_$]*$/u}:null;
  }
  if(prefix.endsWith('`'))return base;
  const from=word?.from??context.pos;if(!word&&!context.explicit&&!/\b(?:FROM|JOIN|INTO|UPDATE|USE|DESC|DESCRIBE)\s+$/i.test(prefix))return null;
  let options=[];
  if(/\bUSE\s+$/i.test(prefix))options=Object.values(config.schema).map(n=>n.self);
  else if(/\b(?:FROM|JOIN|INTO|UPDATE|DESC|DESCRIBE|TABLE)\s+$/i.test(prefix))options=(base?.options||[]).filter(o=>['class','namespace'].includes(o.type));
  else{
   const cols=refs.flatMap(r=>r.columns.map(c=>({...c,info:`${r.alias}.${c.label} · ${c.info}`})));
   const duplicates=new Set(cols.filter((c,i)=>cols.findIndex(x=>x.label===c.label)!==i).map(c=>c.label));
   options=refs.flatMap(r=>r.columns.map(c=>duplicates.has(c.label)?{...c,label:r.alias+'.'+c.label,apply:quote(r.alias)+'.'+quote(c.label)}:c));
   options.push(...(base?.options||[]));
   options.push(...[...new Set(keywords)].map(label=>({label,type:'keyword',detail:'关键字'})),...functions);
  }
  const unique=new Map();for(const o of options){const key=o.type+':'+o.label;if(!unique.has(key))unique.set(key,o);}
  return {from,to:base?.to,options:[...unique.values()],validFor:/^[\p{L}\p{N}_$]*$/u};
 };
}
const paths={key:'M8 15a5 5 0 1 1 4-4l-7 7H2v-3l6-6 M15 6h.01',table:'M3 3h18v18H3z M3 9h18 M9 9v12',column:'M5 3h14v18H5z M5 9h14 M5 15h14',namespace:'M4 5c0-4 16-4 16 0s-16 4-16 0v14c0 4 16 4 16 0V5 M4 12c0 4 16 4 16 0',function:'M16 3h-3c-2 0-3 2-3 4l-2 10c0 2-1 4-3 4H3 M6 9h10',keyword:'M8 5l-6 7 6 7 M16 5l6 7-6 7'};
export function completionIcon(option){
 const kind=option.primaryKey?'key':({class:'table',property:'column',namespace:'namespace',function:'function'}[option.type]||'keyword');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','sql-completion-icon sql-completion-'+kind);const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
