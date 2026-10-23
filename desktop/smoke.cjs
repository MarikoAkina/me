const fs = require('node:fs/promises');
const path = require('node:path');
const {clipboard, session, app} = require('electron');

async function runSmoke(win, reportFile) {
  const report = {version: app.getVersion(), platform: process.platform, architecture: process.arch, checks: []};
  const js = async code => {
    const result=await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await (${code})};}catch(error){return {ok:false,error:String(error.stack||error)};}})()`,true);
    if(!result.ok)throw new Error(result.error);return result.value;
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  async function until(code) {for(let i=0;i<160;i++){try{if(await js(code))return;}catch{}await wait(100);}throw new Error('Timed out: '+code);}
  async function click(label) {
    const lookup=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
    await until(`Boolean((${lookup})&&!(${lookup}).disabled)`);
    await js(`(()=>{const b=${lookup};if(!b)throw new Error('Missing button: '+${JSON.stringify(label)});b.click();})()`);
  }
  async function edit(sql) {
    await js("document.querySelector('.cm-content').focus()");
    win.webContents.focus();
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});
    await wait(100);
    await win.webContents.insertText(sql);
    await wait(100);
    const value=await js("document.querySelector('.cm-content').textContent");
    if(value.replace(/\s/g,'')!==sql.replace(/\s/g,''))throw new Error('Editor text mismatch: '+value);
  }
  async function check(name, fn) {try{await fn();report.checks.push({name,pass:true});}catch(error){report.failedCheck=name;throw error;}}
  try {
    await fs.mkdir(path.dirname(reportFile),{recursive:true});
    await check('installed app loads local UI and SQL Worker',async()=>{await until("document.querySelectorAll('.result-grid tbody tr').length===5");});
    await check('native editor input and filtered SQL',async()=>{await edit("SELECT name,city FROM customers WHERE city='武汉';");await click('执行 SQL');await until("document.querySelectorAll('.result-grid tbody tr').length===3");});
    await check('decimal calculation inside packaged Worker',async()=>{await edit('SELECT 0.1 + 0.2 AS amount;');await click('执行 SQL');await until("document.querySelector('.cell-button')?.textContent==='0.3'");});
    await check('multiple statements and persistent write',async()=>{await edit("INSERT INTO customers(name,city) VALUES('桌面测试客户','武汉'); SELECT COUNT(*) AS total FROM customers;");await click('执行全部');await until("document.querySelector('.cell-button')?.textContent==='6'");await until("document.querySelector('.app-footer')?.textContent.includes('已保存')");});
    await check('native clipboard copy',async()=>{await js("document.querySelector('.cell-button').click()");await click('复制单元格');await until("document.querySelector('.toast')?.textContent.includes('已复制')");const text=await clipboard.readText();if(text!=='6')throw new Error('Clipboard mismatch: '+JSON.stringify(text));});
    await check('JSON backup download contains written data',async()=>{
      const file=path.join(path.dirname(reportFile),'smoke-backup.json');
      const downloaded=new Promise((resolve,reject)=>session.defaultSession.once('will-download',(_event,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>state==='completed'?resolve():reject(new Error(state)));}));
      await click('数据与备份');await click('导出完整备份');await Promise.race([downloaded,wait(10000).then(()=>{throw new Error('Backup download timeout');})]);
      const backup=JSON.parse(await fs.readFile(file,'utf8'));if(backup.workspace.db.databases.finance_lab.tables.customers.rows.length!==6)throw new Error('Backup row count mismatch');
      await js("document.querySelector('[data-slot=dialog-close]').click()");
    });
    await check('reload restores IndexedDB data and SQL draft',async()=>{win.webContents.reload();await until("document.querySelectorAll('.result-grid tbody tr').length===6");const draft=await js("document.querySelector('.cm-content').textContent");if(!draft.includes('桌面测试客户'))throw new Error('Draft did not restore');await edit('SELECT COUNT(*) AS total FROM customers;');await click('执行 SQL');await until("document.querySelector('.cell-button')?.textContent==='6'");});
    await check('expanded CASE, dates and exact amounts in packaged Worker',async()=>{
      await edit("SELECT CASE WHEN 1200>=1000 THEN '大额' ELSE '小额' END AS tier,DATE_FORMAT('2026-09-30','%Y-%m') AS month,ABS(-0.1-0.2) AS amount;");
      await click('执行 SQL');await until("JSON.stringify([...document.querySelectorAll('.result-grid tbody .cell-button')].map(c=>c.textContent))===JSON.stringify(['大额','2026-09','0.3'])");
    });
    await check('new monthly lesson grades and restores progress without changing workbench',async()=>{
      await click('学习练习');await click('本轮新增');
      await until("document.querySelectorAll('[data-lesson-id]').length===12");
      const count=await js("document.querySelectorAll('[data-lesson-id]').length");if(count!==12)throw new Error('Expanded lesson count mismatch');
      await js("document.querySelector('[data-lesson-id=\"23\"]').click()");
      await until("document.querySelector('[data-lesson-id=\"23\"]').classList.contains('current-lesson')");
      const answer="SELECT DATE_FORMAT(expense_date,'%Y-%m') AS month,SUM(amount) AS total FROM expenses GROUP BY month ORDER BY month;";
      await edit(answer);await click('执行并批改');await until("document.querySelector('.grade-feedback.passed')&&document.querySelectorAll('.result-grid tbody tr').length===2");
      await until("document.querySelector('.app-footer')?.textContent.includes('已保存')");
      win.webContents.reload();await until("document.querySelector('.cm-content')");await click('学习练习');await click('本轮新增');await js("document.querySelector('[data-lesson-id=\"23\"]').click()");
      await until("document.querySelector('[data-lesson-id=\"23\"] .complete')");
      await until(`document.querySelector('.cm-content').textContent.replace(/\\s/g,'')===${JSON.stringify(answer.replace(/\s/g,''))}`);
      await click('工作台');await edit('SELECT COUNT(*) FROM customers;');await click('执行 SQL');await until("document.querySelector('.cell-button')?.textContent==='6'");
    });
    await check('download dialog links to installer',async()=>{await js("document.querySelector('[aria-label=\"下载 Windows 安装版\"]').click()");await until("document.querySelector('.windows-install-link')?.href.endsWith('/SQL-Lab-Setup-0.3.0.exe')");});
    const image=await win.webContents.capturePage();await fs.writeFile(path.join(path.dirname(reportFile),'desktop-smoke.png'),image.toPNG());
    report.pass=report.checks.length;report.fail=0;report.finishedAt=new Date().toISOString();await fs.writeFile(reportFile,JSON.stringify(report,null,2));
  } catch(error) {
    try{const image=await win.webContents.capturePage();await fs.writeFile(path.join(path.dirname(reportFile),'desktop-smoke.png'),image.toPNG());}catch{}
    report.pass=report.checks.length;report.fail=1;report.error=error.stack;try{await fs.writeFile(reportFile,JSON.stringify(report,null,2));}catch{}throw error;
  }
}
module.exports={runSmoke};
