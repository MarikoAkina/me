const {app, BrowserWindow, Menu, protocol, session, shell, dialog} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {createHandler, isInternalURL, isExternalURL} = require('./protocol.cjs');

app.setName('SQL LAB');
const smoke = process.argv.includes('--smoke-test');
const smokeReport = process.argv.find(a => a.startsWith('--smoke-report='))?.slice('--smoke-report='.length);
if (smoke && (!smokeReport || !path.isAbsolute(smokeReport))) process.exit(2);
const dataDirectory = smoke ? path.join(path.dirname(smokeReport), 'smoke-user-data') : path.join(app.getPath('appData'), 'SQL LAB');
fs.mkdirSync(dataDirectory, {recursive: true});
app.setPath('userData', dataDirectory);
protocol.registerSchemesAsPrivileged([{scheme: 'sqllab', privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true}}]);

let mainWindow;
function external(url) { if (isExternalURL(url)) void shell.openExternal(url); }
function createWindow(url = 'sqllab://app/') {
  const win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 720, minHeight: 540,
    title: 'SQL LAB', backgroundColor: '#f6f8fb', show: false,
    icon: path.join(__dirname, 'ui/icon-192.png'),
    webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: !smoke},
  });
  win.webContents.setWindowOpenHandler(({url: target}) => {
    if (isInternalURL(target)) createWindow(target); else external(target);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (!isInternalURL(target)) {event.preventDefault(); external(target);}
  });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.loadURL(url).catch(error => {
    if (!smoke) dialog.showErrorBox('SQL LAB 无法打开', error.message);
  });
  return win;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {if (mainWindow) {if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus();}});
  app.whenReady().then(async () => {
    protocol.handle('sqllab', createHandler(path.join(__dirname, 'ui')));
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(isInternalURL(contents.getURL()) && permission === 'clipboard-sanitized-write'));
    session.defaultSession.setPermissionCheckHandler((contents, permission) => !!contents && isInternalURL(contents.getURL()) && permission === 'clipboard-sanitized-write');
    session.defaultSession.setDownloadPath(app.getPath('downloads'));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label: '文件', submenu: [{label: '关闭窗口', role: 'close'}, {label: '退出 SQL LAB', role: 'quit'}]},
      {label: '编辑', submenu: [{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
      {label: '视图', submenu: [{role:'reload',label:'重新打开工作台'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]},
      {label: '帮助', submenu: [{label:'项目与下载',click:()=>external('https://github.com/MarikoAkina/sql-lab/releases')},{label:'关于 SQL LAB',click:()=>dialog.showMessageBox({type:'info',title:'SQL LAB',message:`SQL LAB ${app.getVersion()}`,detail:'MySQL 基础学习模拟器\n数据保存在本机；可通过完整 JSON 备份迁移。'})}]},
    ]));
    mainWindow = createWindow();
    if (smoke) {
      try {await require('./smoke.cjs').runSmoke(mainWindow, smokeReport); app.exit(0);}
      catch {app.exit(1);}
    }
  }).catch(error => {if (!smoke) dialog.showErrorBox('SQL LAB 启动失败',error.message); app.exit(1);});
  app.on('window-all-closed', () => app.quit());
}
