const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');

// Destructive fixture process cleanup is restricted to an ephemeral hosted CI runner.
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Run only in the Windows upgrade acceptance workflow.');
const exe = process.env.SQL_LAB_UPGRADE_EXE;
if (!exe || !path.isAbsolute(exe) || !exe.includes('sql-lab-upgrade-test')) throw new Error('Isolated fixture executable required.');
const target = require('../package.json').version;
const report = {from: '0.3.2', to: target, platform: process.platform, mockedVersion: false, mockedFeed: false, startedAt: new Date().toISOString(), checks: []};
const output = path.resolve('upgrade-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const compact = value => String(value).replace(/\s/g, '');
const shell = code => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], {encoding: 'utf8', timeout: 10000});
const installedVersion = () => shell('(Get-Item -LiteralPath $env:SQL_LAB_UPGRADE_EXE).VersionInfo.ProductVersion').trim().split('.').slice(0,3).join('.');
const appProcesses = () => {
  const value = shell('Get-Process -Name "SQL LAB" -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:SQL_LAB_UPGRADE_EXE } | Select-Object -ExpandProperty Id').trim();
  return value ? value.split(/\s+/).map(Number) : [];
};
const stopFixture = () => shell('Get-Process -Name "SQL LAB" -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:SQL_LAB_UPGRADE_EXE } | Stop-Process -Force -ErrorAction SilentlyContinue');
async function until(fn, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {try {const value = await fn(); if (value) return value;} catch (error) {if (error.fatal) throw error; last = error.message;} await wait(250);}
  throw new Error(`Timeout: ${label}${last ? ' / '+last : ''}`);
}
class Client {
  constructor(socket) {
    this.socket = socket; this.next = 1; this.pending = new Map(); this.closed = false;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)), task = this.pending.get(message.id);
      if (!task) return;
      this.pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    });
    socket.addEventListener('close', () => {this.closed = true; for (const task of this.pending.values()) {clearTimeout(task.timer); task.reject(new Error('Application disconnected'));} this.pending.clear();});
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.closed) {reject(new Error('Application disconnected')); return;}
      const id = this.next++, timer = setTimeout(() => {this.pending.delete(id); reject(new Error(`Protocol timeout: ${method}`));}, 15000);
      this.pending.set(id, {resolve, reject, timer}); this.socket.send(JSON.stringify({id, method, params}));
    });
  }
  async js(expression) {
    const value = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  }
}
async function connect(port) {
  const page = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {signal: AbortSignal.timeout(1500)});
    return (await response.json()).find(page => page.type === 'page' && page.url.startsWith('sqllab://app/'));
  }, 'local fixture renderer');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', () => reject(new Error('Local fixture connection failed')), {once: true});});
  const client = new Client(socket); await client.send('Page.bringToFront'); return client;
}
async function click(client, label) {
  const lookup = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
  await until(() => client.js(`!!(${lookup})&&!(${lookup}).disabled`), label);
  await client.js(`(()=>{const b=${lookup};b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));b.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));b.click();})()`);
}
async function edit(client, sql) {
  await client.js("document.querySelector('.cm-content').focus()");
  await client.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65});
  await client.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65});
  await client.send('Input.insertText', {text: sql});
  await until(async () => compact(await client.js("document.querySelector('.cm-content').textContent")) === compact(sql), 'editor input');
}
async function check(name, task) {await task(); report.checks.push({name, pass: true}); console.log('PASS', name);}
async function main() {
  await fs.mkdir(output, {recursive: true});
  let client;
  try {
    await check('published old installer has real version 0.3.2', async () => assert.equal(installedVersion(), '0.3.2'));
    const child = spawn(exe, ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'], {stdio: 'ignore'});
    client = await connect(9222);
    await check('published old app loads its real updater and SQL Worker', async () => {
      await until(() => client.js("document.querySelectorAll('.result-grid tbody tr').length===5"), 'initial rows');
      assert.equal((await client.js('window.sqlLabUpdates.getState()')).currentVersion, '0.3.2');
    });
    await check('workspace write, SQL draft and exercise progress are saved before upgrading', async () => {
      await edit(client, "INSERT INTO customers(name,city) VALUES('升级回归客户','武汉'); SELECT COUNT(*) FROM customers;");
      await click(client, '执行全部');
      await until(() => client.js("document.querySelector('.cell-button')?.textContent==='6'"), 'written customer count');
      await click(client, '学习练习'); await edit(client, 'SELECT * FROM customers;'); await click(client, '执行并批改');
      await until(() => client.js("!!document.querySelector('.grade-feedback.passed')"), 'lesson grade');
      await click(client, '工作台'); await edit(client, "SELECT name,city FROM customers WHERE name='升级回归客户';");
      await until(() => client.js("document.querySelector('.app-footer').textContent.includes('已保存')"), 'saved workspace');
    });
    await check('real update button downloads the published newer version and exits', async () => {
      await client.js("document.querySelector('[aria-label=\"检查更新\"]').click()");
      const phases = [];
      await until(async () => {
        if (client.closed) return true;
        const state = await client.js('window.sqlLabUpdates.getState()');
        if (phases.at(-1) !== state.phase) {phases.push(state.phase); console.log('Update phase:', state.phase);}
        if (['error', 'current', 'unsupported'].includes(state.phase)) {const error = new Error(`Update did not advance: ${state.message}`); error.fatal = true; throw error;}
        return false;
      }, 'automatic update exit', 240000);
      report.observedUpdatePhases = phases;
    });
    await check('installer replaces the executable and automatically relaunches the app', async () => {
      await until(() => installedVersion() === target && appProcesses().some(id => id !== child.pid), 'updated binary and automatic restart', 120000);
      report.automaticRestartObserved = true;
    });
    stopFixture(); await wait(1500);
    spawn(exe, ['--remote-debugging-port=9223', '--remote-debugging-address=127.0.0.1'], {stdio: 'ignore'});
    client = await connect(9223);
    await check('new version restores the written customer and unsaved-timer SQL draft', async () => {
      await until(() => client.js("document.querySelectorAll('.result-grid tbody tr').length===6"), 'restored customer rows');
      assert.equal((await client.js('window.sqlLabUpdates.getState()')).currentVersion, target);
      assert.ok((await client.js("document.querySelector('.result-grid').textContent")).includes('升级回归客户'));
      assert.ok((await client.js("document.querySelector('.cm-content').textContent")).includes('升级回归客户'));
    });
    await check('new version restores exercise draft and passing progress', async () => {
      await click(client, '学习练习'); await until(() => client.js("!!document.querySelector('[data-lesson-id=\"1\"] .complete')"), 'restored progress');
      assert.equal(compact(await client.js("document.querySelector('.cm-content').textContent")), compact('SELECT * FROM customers;'));
    });
    const image = await client.send('Page.captureScreenshot', {format: 'png'});
    await fs.writeFile(path.join(output, 'upgraded-workspace.png'), Buffer.from(image.data, 'base64'));
    report.pass = report.checks.length; report.fail = 0;
  } catch (error) {
    report.pass = report.checks.length; report.fail = 1;
    report.error = error.message.replaceAll(process.env.RUNNER_TEMP || '<unused>', '[临时测试目录]');
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(output, 'windows-upgrade-acceptance.json'), JSON.stringify(report, null, 2)+'\n');
    client?.socket.close(); try {stopFixture();} catch {}
    console.log(JSON.stringify({from: report.from, to: report.to, pass: report.pass, fail: report.fail, error: report.error}));
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
