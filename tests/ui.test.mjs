// DOM integration tests; this is not a browser or Safari rendering test.
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {Worker as NodeWorker} from 'node:worker_threads';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import assert from 'node:assert/strict';
const cases=[];const test=(name,fn)=>cases.push({name,fn});let cleanup;test.after=fn=>cleanup=fn;
import fs from 'node:fs/promises';
await fs.mkdir('tests/.cache',{recursive:true});
await build({entryPoints:['tests/ui-entry.jsx'],bundle:true,format:'esm',platform:'node',outfile:'tests/.cache/ui.mjs',jsx:'automatic',logLevel:'silent'});
await build({entryPoints:['tests/ui-worker-entry.mjs'],bundle:true,format:'esm',platform:'node',outfile:'tests/.cache/worker.mjs',logLevel:'silent'});
const dom=new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#fff"></head><body><div id="root"></div></body></html>',{url:'https://example.test',pretendToBeVisual:true});
const {window}=dom;
for(const name of ['window','document','Window','Document','HTMLElement','Element','Node','MutationObserver','DOMRect','Range','HTMLInputElement','HTMLTextAreaElement','getComputedStyle','Event','MouseEvent','PointerEvent','CustomEvent','KeyboardEvent','DOMParser','DocumentFragment','NodeFilter'])globalThis[name]=name==='window'?window:name==='document'?window.document:window[name];
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.indexedDB=window.indexedDB=indexedDB;globalThis.IDBKeyRange=window.IDBKeyRange=IDBKeyRange;
window.matchMedia=q=>({matches:q.includes('max-width')?window.innerWidth<768:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
window.ResizeObserver=globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
window.IntersectionObserver=globalThis.IntersectionObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,top:0,bottom:0,right:0,width:0,height:0});window.HTMLElement.prototype.scrollIntoView=()=>{};
let copied='';Object.defineProperty(window.navigator,'clipboard',{value:{async writeText(t){copied=t;}}});
const registered=new Map();window.document.modelContext={registerTool(t,options){registered.set(t.name,t);options?.signal?.addEventListener('abort',()=>registered.delete(t.name));}};
class WebWorker {constructor(){this.worker=new NodeWorker(new URL('./.cache/worker.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}postMessage(data){this.worker.postMessage(data);}terminate(){this.worker.terminate();}}
globalThis.Worker=window.Worker=WebWorker;
const {mount,unmount,act,EditorView}=await import('./.cache/ui.mjs');
const tick=async(ms=40)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
async function waitFor(fn){for(let i=0;i<90;i++){if(fn())return;await tick();}throw new Error('等待 UI 超时：'+document.body.textContent.slice(0,1000));}
const byText=(s)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===s);
const byLabel=s=>document.querySelector(`button[aria-label="${s}"]`);
async function click(b){assert.ok(b,'按钮需存在');await act(async()=>{b.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));b.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,button:0}));b.dispatchEvent(new window.MouseEvent('click',{bubbles:true,button:0}));});await tick();}
async function inputSQL(sql){const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));assert.ok(view);await act(async()=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:sql},selection:{anchor:0}}));}
await mount();
await waitFor(()=>document.querySelector('.result-grid'));
test('工作台实际挂载，首次 SELECT 返回 5 位客户',()=>{assert.ok(document.querySelector('.cm-editor'));assert.equal(document.querySelectorAll('.result-grid tbody tr').length,5);assert.ok(document.body.textContent.includes('晨光商贸'));});
test('输入辅助、执行、查看结果、复制和再次编辑完整流程',async()=>{await inputSQL("SELECT name,city FROM customers WHERE city='武汉';");await click(byText('执行 SQL'));await waitFor(()=>document.querySelectorAll('.result-grid tbody tr').length===3);await click(document.querySelector('.cell-button'));await click(byText('复制单元格'));assert.equal(copied,'晨光商贸');await click(byLabel('输入 ;'));assert.ok(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().startsWith(';'));await click(byLabel('撤销输入'));assert.ok(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().startsWith('SELECT'));});
test('多条查询保留多个可切换结果集',async()=>{await inputSQL('SELECT 1 AS first; SELECT 2 AS second;');await click(byText('执行全部'));await waitFor(()=>document.querySelectorAll('.result-selector>button').length===2);await click(document.querySelectorAll('.result-selector>button')[1]);assert.equal(document.querySelector('.cell-button').textContent,'2');});
test('增删改后数据库树行数同步并可查看结构',async()=>{await inputSQL("INSERT INTO customers(name,city) VALUES ('新增客户','深圳');");await click(byText('执行 SQL'));await waitFor(()=>document.querySelector('.tree-table .table-row small')?.textContent==='6');await click(byText('表结构'));assert.ok(document.querySelector('.structure-content').textContent.includes('AUTO_INCREMENT'));});
test('错误语法显示日志和位置',async()=>{await inputSQL('SELECT bad_name FROM customers;');await click(byText('执行 SQL'));await waitFor(()=>document.querySelector('.log-entry.failed'));assert.ok(document.querySelector('.log-entry.failed').textContent.includes('错误 1054'));});
test('SQL 标签新建和草稿保存',async()=>{await click(byLabel('新建 SQL 标签'));await inputSQL('SELECT 99 AS saved_draft;');assert.equal(document.querySelectorAll('.script-tab').length,2);await tick(400);});
test('学习练习实际批改，独立数据与进度保存',async()=>{await click(byText('学习练习'));await inputSQL('SELECT * FROM customers;');await click(byText('执行并批改'));await waitFor(()=>document.querySelector('.grade-feedback.passed'));assert.ok(document.querySelector('.grade-feedback').textContent.includes('练习通过'));assert.ok(document.querySelector('.lesson-number.complete'));assert.equal(document.querySelectorAll('.result-grid tbody tr').length,5);assert.ok(document.querySelector('.mobile-feedback .grade-feedback.passed'));await click(byText('继续编辑'));assert.equal(document.querySelector('.app').dataset.view,'editor');});
test('练习提示、参考答案默认折叠与重新开始',async()=>{assert.equal(document.querySelector('.answer-area').open,false);await click(byText('查看下一步提示'));assert.ok(document.querySelector('.hint-area p'));await click(byText('重新开始本题'));assert.equal(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString(),'');});
test('统一列表保留 45 个唯一题号，跨月练习可执行并批改',async()=>{const ids=[...document.querySelectorAll('[data-lesson-id]')].map(b=>Number(b.dataset.lessonId));assert.deepEqual(ids,Array.from({length:45},(_,i)=>i+1));assert.equal(new Set(ids).size,45);assert.equal(document.querySelector('.lesson-filter'),null);assert.equal(byText('全部练习'),undefined);assert.equal(byText('本轮新增'),undefined);await click(document.querySelector('[data-lesson-id="23"]'));assert.equal(document.querySelector('.answer-area').open,false);assert.ok(document.querySelector('.mobile-goal').textContent.includes('10 月'));await inputSQL("SELECT DATE_FORMAT(expense_date,'%Y-%m') AS month,SUM(amount) AS total FROM expenses GROUP BY month ORDER BY month;");await click(byText('执行并批改'));await waitFor(()=>document.querySelector('.grade-feedback.passed'));assert.equal(document.querySelectorAll('.result-grid tbody tr').length,2);assert.ok(document.querySelector('.result-grid').textContent.includes('2026-10'));assert.ok(document.querySelector('.app-footer').textContent.includes('/ 45 题完成'));});
 test('关联练习同时显示客户和订单表结构，并按原样恢复新题草稿',async()=>{await click(document.querySelector('[data-lesson-id="19"]'));assert.ok(document.querySelector('.lesson-schema').textContent.includes('customers'));assert.ok([...document.querySelectorAll('.lesson-schema')].some(e=>e.textContent.includes('orders')));await click(document.querySelector('[data-lesson-id="23"]'));assert.ok(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('DATE_FORMAT'));assert.equal(document.querySelectorAll('.lesson-list>button').length,45);});
 test('新增 SQL 输入辅助可插入并撤销 CASE',async()=>{await inputSQL('SELECT ');const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));await act(async()=>view.dispatch({selection:{anchor:view.state.doc.length}}));await click(byText('CASE'));assert.equal(view.state.doc.toString(),'SELECT CASE ');await click(byLabel('撤销输入'));assert.equal(view.state.doc.toString(),'SELECT ');});
 test('375/390/430/768/1280px 的区域导航状态与输入属性',async()=>{for(const width of [375,390,430,768,1280]){Object.defineProperty(window,'innerWidth',{value:width,configurable:true});await act(async()=>window.dispatchEvent(new window.Event('resize')));const editor=document.querySelector('.cm-content');assert.equal(editor.getAttribute('autocapitalize'),'off');assert.equal(editor.getAttribute('autocorrect'),'off');assert.equal(editor.getAttribute('spellcheck'),'false');await click(byText('练习')||byText('数据库'));assert.equal(document.querySelector('.app').dataset.view,'database');await click(byText('编辑器'));assert.equal(document.querySelector('.app').dataset.view,'editor');}});
test('数据面板恢复示例需要确认，可取消',async()=>{await click(byText('工作台'));await click(byText('数据与备份'));await click(byText('恢复示例数据库'));assert.ok(document.querySelector('[role=alertdialog]'));await click(byText('取消'));assert.equal(document.querySelector('[role=alertdialog]'),null);await click(document.querySelector('[data-slot=dialog-close]'));});
test('WebMCP 注册、有效操作和错误参数路径',async()=>{assert.deepEqual([...registered.keys()].sort(),['execute_workspace_sql','inspect_sql_workspace']);const info=registered.get('inspect_sql_workspace').execute({});assert.equal(info.current,'finance_lab');assert.ok(info.databases[0].tables);assert.throws(()=>registered.get('inspect_sql_workspace').execute({extra:1}));await assert.rejects(()=>registered.get('execute_workspace_sql').execute({sql:''}));let r;await act(async()=>{r=await registered.get('execute_workspace_sql').execute({sql:'SELECT COUNT(*) FROM customers;'});});assert.equal(r.logs[0].rows[0][0].decimal,'6');assert.ok(document.querySelector('.result-grid'));});
test('卸载再挂载等价刷新：数据、草稿、历史、进度恢复',async()=>{await unmount();await mount();await waitFor(()=>document.querySelector('.cm-editor'));assert.ok(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('saved_draft'));await click(byText('历史'));assert.ok(document.querySelectorAll('.history-entry').length>=7);await click(byText('学习练习'));assert.ok(document.querySelector('.lesson-number.complete'));await click(byText('工作台'));await click(byText('编辑器'));await inputSQL('SELECT COUNT(*) FROM customers;');await click(byText('执行 SQL'));await waitFor(()=>document.querySelector('.cell-button')?.textContent==='6');});

async function chooseFile(name,text){const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[{name,size:new TextEncoder().encode(text).length,text:async()=>text}],configurable:true});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));}
test('SQL 文件失败导入全部回退，合法文件可导入',async()=>{await click(byText('数据与备份'));await click(byText('导入 .sql 文件'));await chooseFile('bad.sql',"INSERT INTO customers(name) VALUES('应回退'); SELECT wrong FROM customers;");await waitFor(()=>document.querySelector('[role=alertdialog]'));await click(byText('确认导入'));await waitFor(()=>document.querySelector('.log-entry.failed'));assert.equal(document.querySelector('.tree-table .table-row small').textContent,'6');await click(byText('数据与备份'));await click(byText('导入 .sql 文件'));await chooseFile('good.sql',"INSERT INTO customers(name) VALUES('导入成功'); SELECT COUNT(*) FROM customers;");await waitFor(()=>document.querySelector('[role=alertdialog]'));await click(byText('确认导入'));await waitFor(()=>document.querySelector('.tree-table .table-row small')?.textContent==='7');assert.ok(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('导入成功'));});
test('完整备份恢复实际替换数据库与脚本，损坏备份拒绝',async()=>{const {loadWorkspace,backupEnvelope}=await import('../lib/storage.mjs');await tick(400);const backup=backupEnvelope(await loadWorkspace());backup.workspace.db.databases.finance_lab.tables.customers.rows[0].city='恢复城市';backup.workspace.tabs[0].sql='SELECT 88 AS restored;';backup.workspace.activeTab=backup.workspace.tabs[0].id;await click(byText('数据与备份'));await click(byText('恢复 JSON 备份'));await chooseFile('restore.json',JSON.stringify(backup));await waitFor(()=>document.querySelector('[role=alertdialog]'));await click(byText('确认'));await waitFor(()=>EditorView.findFromDOM(document.querySelector('.cm-editor'))?.state.doc.toString().includes('restored'));await click(byText('数据与备份'));await click(byText('恢复 JSON 备份'));await chooseFile('broken.json','{"bad":true}');await waitFor(()=>document.querySelector('.toast')?.textContent.includes('无法导入'));assert.equal(document.querySelector('[role=alertdialog]'),null);await click(document.querySelector('[data-slot=dialog-close]'));});
test('Windows 安装入口和下载链接可在数据面板打开',async()=>{await click(byText('数据与备份'));await click(byText('下载 Windows 安装版'));assert.ok(document.querySelector('.windows-download-dialog'));const link=document.querySelector('.windows-install-link');assert.ok(link.href.endsWith('/SQL-Lab-Setup-1.0.2.exe'));assert.equal(link.target,'_blank');assert.ok(document.querySelector('.windows-download-dialog').textContent.includes('JSON 备份'));await click(document.querySelector('[data-slot=dialog-close]'));});
test('网页检查按钮保存尚未延时落盘的草稿并显示最新状态',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('api.github.com')?{tag_name:'v1.0.2'}:{version:'1.0.2'}});
  try{await inputSQL('SELECT 123 AS update_draft;');await click(byLabel('检查更新'));await waitFor(()=>document.querySelector('.update-status')?.textContent.includes('未落后'));const {loadWorkspace}=await import('../lib/storage.mjs');assert.ok((await loadWorkspace()).tabs.some(t=>t.sql==='SELECT 123 AS update_draft;'));await click(document.querySelector('[data-slot=dialog-close]'));}finally{globalThis.fetch=original;}
});
test('GitHub 新版但站点未部署时明确提示管理员部署',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('api.github.com')?{tag_name:'v1.0.3'}:{version:'1.0.2'}});
  try{await click(byLabel('检查更新'));await waitFor(()=>document.querySelector('.update-status')?.textContent.includes('需管理员先部署'));assert.ok(document.querySelector('.update-status').textContent.includes('1.0.3'));await click(document.querySelector('[data-slot=dialog-close]'));}finally{globalThis.fetch=original;}
});
test('更新网络失败后保留草稿并可再次检查',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline');};
  try{await click(byLabel('检查更新'));await waitFor(()=>document.querySelector('.update-status')?.textContent.includes('无法完整读取'));assert.equal(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString(),'SELECT 123 AS update_draft;');assert.equal(byText('再次检查').disabled,false);await click(document.querySelector('[data-slot=dialog-close]'));}finally{globalThis.fetch=original;}
});
test('桌面保存最新草稿后才调用安装，安装异步失败后可再次重试',async()=>{
  await unmount();let installCount=0, updateListener;
  window.sqlLabUpdates={getState:async()=>({phase:'idle',currentVersion:'1.0.2'}),subscribe:callback=>{updateListener=callback;return()=>{};},onCheckRequested:()=>()=>{},check:async()=>({phase:'ready',version:'1.0.3'}),install:async()=>{const {loadWorkspace}=await import('../lib/storage.mjs');assert.ok((await loadWorkspace()).tabs.some(t=>t.sql==='SELECT 456 AS before_install;'));installCount++;return {phase:'installing'};}};
  try{await mount();await waitFor(()=>document.querySelector('.cm-editor'));await inputSQL('SELECT 456 AS before_install;');await click(byLabel('检查更新'));await waitFor(()=>installCount===1);assert.equal(installCount,1);await act(async()=>updateListener({phase:'error',message:'模拟安装失败'}));await tick();await click(byText('再次检查'));await waitFor(()=>installCount===2);assert.equal(installCount,2);}finally{await unmount();delete window.sqlLabUpdates;await mount();await waitFor(()=>document.querySelector('.cm-editor'));}
});
test('每题展示初始示例与预期查询结果，工作台修改不污染练习',async()=>{
 await click(byText('学习练习'));await waitFor(()=>document.querySelector('.lesson-source'));
 assert.equal(document.querySelector('.app').dataset.view,'editor');
 assert.equal(document.querySelectorAll('.lesson-source .lesson-data-grid tbody tr').length,5);
 assert.equal(document.querySelectorAll('.lesson-expected .lesson-data-grid tbody tr').length,5);
 assert.ok(document.querySelector('.lesson-source').textContent.includes('晨光商贸'));
 assert.ok(!document.querySelector('.lesson-source').textContent.includes('恢复城市'));
 assert.equal(document.querySelector('.answer-area').open,false);
 await click(byText('编写 SQL'));assert.equal(document.querySelector('.app').dataset.view,'editor');
});
test('练习知识点与难度筛选不更改题号、草稿或通过记录',async()=>{
 const select=document.querySelector('[aria-label="筛选练习知识点"]');await act(async()=>{select.value='数据库设计';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.deepEqual([...document.querySelectorAll('[data-lesson-id]')].map(b=>Number(b.dataset.lessonId)),[15,43,44]);
 await click(document.querySelector('[data-lesson-id="43"]'));await waitFor(()=>document.querySelector('.lesson-expected').textContent.includes('note'));
 assert.ok(document.querySelector('.lesson-expected').textContent.includes('预期操作结果'));
 assert.ok(document.querySelector('.lesson-source').textContent.includes('budgets'));
 await act(async()=>{select.value='全部知识点';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelectorAll('[data-lesson-id]').length,45);
});
test('新增建表题实际批改并保存第45题草稿与进度',async()=>{
 await click(document.querySelector('[data-lesson-id="45"]'));await waitFor(()=>document.querySelector('.lesson-expected').textContent.includes('receivables'));
 assert.ok(document.querySelector('.lesson-reference').textContent.includes('无需已有数据表'));
 const {lessons}=await import('../lib/sql/lessons.mjs');await inputSQL(lessons[44].answer);await click(byText('执行并批改'));await waitFor(()=>document.querySelector('.grade-feedback.passed'));
 assert.ok(document.querySelector('[data-lesson-id="45"] .complete'));await tick(400);await unmount();await mount();await waitFor(()=>document.querySelector('.cm-editor'));await click(byText('学习练习'));await click(document.querySelector('[data-lesson-id="45"]'));assert.ok(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('receivables'));assert.ok(document.querySelector('[data-lesson-id="45"] .complete'));
});
test('纯常量题明确没有源表，空字符串与NULL预览分别显示',async()=>{
 await click(document.querySelector('[data-lesson-id="21"]'));await waitFor(()=>document.querySelector('.lesson-reference')?.textContent.includes('只计算常量'));assert.equal(document.querySelectorAll('.lesson-source').length,0);
 await click(document.querySelector('[data-lesson-id="39"]'));await waitFor(()=>document.querySelector('.lesson-source')?.textContent.includes('null_examples'));assert.ok(document.querySelector('.lesson-source .empty-cell'));assert.ok(document.querySelector('.lesson-source .lesson-null'));assert.equal(document.querySelectorAll('.lesson-expected .lesson-data-grid tbody tr').length,3);
});
test('手机键盘高度与平移变化保持可执行，收起后恢复导航状态',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'innerWidth',{value:390,configurable:true});
 const vv=new window.EventTarget();Object.assign(vv,{height:window.innerHeight,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
 try{await click(byText('编写 SQL'));await inputSQL("SELECT id,note IS NULL,IFNULL(note,'未填写'),amount+10 FROM null_examples ORDER BY id;");vv.height=300;vv.offsetTop=52;await act(async()=>window.dispatchEvent(new window.Event('resize')));await tick();assert.equal(document.documentElement.dataset.keyboard,'open');assert.equal(document.documentElement.style.getPropertyValue('--app-top'),'52px');const run=document.querySelector('.keyboard-actions .run-button');assert.equal(run.disabled,false);await click(run);await waitFor(()=>document.querySelector('.grade-feedback.passed'));assert.equal(document.querySelector('.app').dataset.view,'editor');vv.height=window.innerHeight;vv.offsetTop=0;await act(async()=>window.dispatchEvent(new window.Event('resize')));await tick();assert.equal(document.documentElement.dataset.keyboard,'closed');}finally{if(descriptor)Object.defineProperty(window,'visualViewport',descriptor);else delete window.visualViewport;await act(async()=>window.dispatchEvent(new window.Event('resize')));}
});
test('手机参考面板可切换结果并保存高度，所有题目都有详细讲解',async()=>{
 await click(byText('学习练习'));await click(document.querySelector('[data-lesson-id="5"]'));await waitFor(()=>document.querySelector('.study-dock'));
 const handle=document.querySelector('.study-resize [role=separator]');assert.ok(handle.querySelector('svg'));assert.equal(document.querySelector('.study-resize input'),null);assert.equal(document.querySelector('.study-resize').textContent,'');
 const before=Number(handle.getAttribute('aria-valuenow'));await act(async()=>handle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));assert.equal(Number(handle.getAttribute('aria-valuenow')),before+3);await tick(400);
 await unmount();await mount();await waitFor(()=>document.querySelector('.cm-editor'));await click(byText('学习练习'));await click(document.querySelector('[data-lesson-id="5"]'));assert.equal(Number(document.querySelector('.study-resize [role=separator]').getAttribute('aria-valuenow')),before+3);
 await inputSQL('SELECT id,amount FROM orders ORDER BY amount DESC,id LIMIT 2;');await click(document.querySelector('.keyboard-actions .run-button'));await waitFor(()=>document.querySelector('.dock-feedback.passed'));assert.equal(document.querySelector('.app').dataset.view,'editor');assert.equal(document.querySelectorAll('.dock-grid tbody tr').length,2);
 await click(byText('题目要求'));assert.ok(document.querySelector('.study-dock-body').textContent.includes('从高到低'));assert.equal(EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString(),'SELECT id,amount FROM orders ORDER BY amount DESC,id LIMIT 2;');
 const {lessons}=await import('../lib/sql/lessons.mjs');assert.ok(lessons.every(l=>l.guide.steps.length===3&&l.guide.requirements.length>50&&l.guide.pitfall.length>5));
});
test('补全按钮显示别名字段和SVG主键图标，Enter接受且可撤销',async()=>{
 await click(byText('工作台'));await click(byText('编辑器'));await inputSQL('SELECT o. FROM orders AS o;');const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));await act(async()=>view.dispatch({selection:{anchor:9}}));await click(byLabel('SQL 智能补全'));await waitFor(()=>document.querySelector('.cm-tooltip-autocomplete'));
 const items=[...document.querySelectorAll('.cm-tooltip-autocomplete li')];assert.ok(items.some(x=>x.textContent.includes('id')&&x.querySelector('.sql-completion-key')));assert.ok(items.some(x=>x.textContent.includes('amount')&&x.textContent.includes('DECIMAL')));
 await act(async()=>document.querySelector('.cm-content').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true})));await inputSQL('SEL');await act(async()=>view.dispatch({selection:{anchor:3}}));await click(byLabel('SQL 智能补全'));await waitFor(()=>document.querySelector('.cm-tooltip-autocomplete'));await tick(150);await act(async()=>document.querySelector('.cm-content').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true})));assert.equal(view.state.doc.toString(),'SELECT');await click(byLabel('撤销输入'));assert.equal(view.state.doc.toString(),'SEL');
});
test('输入时自动弹出候选，原生选区层不回退',async()=>{
 await inputSQL('SE');const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));await act(async()=>{view.focus();view.dispatch({selection:{anchor:2}});view.dispatch({changes:{from:2,insert:'L'},selection:{anchor:3},userEvent:'input.type'});});await waitFor(()=>document.querySelector('.cm-tooltip-autocomplete'));assert.ok(document.querySelector('.cm-tooltip-autocomplete').textContent.includes('SELECT'));assert.equal(document.querySelector('.cm-selectionLayer'),null);
});
test.after(async()=>{await unmount();dom.window.close();});

let passed=0;for(const t of cases){const start=performance.now();try{await t.fn();console.log('PASS',t.name,Math.round(performance.now()-start)+'ms');passed++;}catch(e){console.error('FAIL',t.name,e.stack);}}
try{await Promise.race([cleanup(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('cleanup timeout')),2000))]);}catch(e){console.error('CLEANUP',e.message);}
console.log(JSON.stringify({tests:cases.length,pass:passed,fail:cases.length-passed}));
process.exit(cases.length===passed?0:1);
