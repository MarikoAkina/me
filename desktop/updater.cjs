const FEED = Object.freeze({provider: 'github', owner: 'MarikoAkina', repo: 'sql-lab', private: false});
const active = new Set(['checking', 'available', 'downloading', 'ready', 'installing']);
function publicError(error) {
  const text = String(error?.message || error || '');
  if (/sha512|checksum|signature|digest/i.test(text)) return '安装包完整性或签名校验失败，已停止更新。请重试或从项目发布页下载。';
  if (/latest\.yml|404|No published versions/i.test(text)) return 'GitHub 尚未提供可用的正式更新文件，请稍后重试。';
  if (/403|429|rate limit/i.test(text)) return 'GitHub 拒绝请求或达到访问限额，请稍后重试。';
  return '更新失败：请检查网络、磁盘空间或安装权限后重试。当前版本和学习数据保持不变。';
}
function createUpdateController({updater, currentVersion, enabled, publish = () => {}}) {
  let state = {phase: 'idle', currentVersion, message: '点击检查后，发现新版将自动下载；保存数据后自动重启安装。'};
  const set = update => {state = {...state, ...update}; publish({...state});};
  if (enabled) {
    updater.setFeedURL(FEED);
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    updater.on('checking-for-update', () => set({phase: 'checking', message: '正在检查 GitHub 最新正式版…'}));
    updater.on('update-not-available', () => set({phase: 'current', message: `当前版本 ${currentVersion} 无需更新。`}));
    updater.on('update-available', info => set({phase: 'available', version: info.version, message: `发现 ${info.version}，准备自动下载…`}));
    updater.on('download-progress', progress => set({phase: 'downloading', percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)), message: '正在下载安装包，下载完成后自动保存并安装。'}));
    updater.on('update-downloaded', info => set({phase: 'ready', version: info.version, percent: 100, message: '安装包已校验，等待工作台保存后重启安装。'}));
    updater.on('error', error => set({phase: 'error', message: publicError(error)}));
  }
  return {
    getState: () => ({...state}),
    async check() {
      if (!enabled) {set({phase: 'unsupported', message: '自动安装仅支持安装后的 Windows 版；开发环境及其他系统请从发布页手动安装。'}); return {...state};}
      if (active.has(state.phase)) return {...state};
      set({phase: 'checking', percent: 0, message: '正在检查 GitHub 最新正式版…'});
      try {await updater.checkForUpdates();} catch (error) {set({phase: 'error', message: publicError(error)});}
      return {...state};
    },
    install() {
      if (state.phase !== 'ready') throw new Error('尚无已校验的安装包。');
      set({phase: 'installing', message: '数据已保存，正在重启安装…'});
      try {updater.quitAndInstall(true, true);} catch (error) {set({phase: 'error', message: publicError(error)}); throw new Error(state.message);}
      return {...state};
    },
  };
}
module.exports = {createUpdateController, publicError, FEED};
