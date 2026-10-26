const http = require('node:http');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const path = require('node:path');
async function hash(file) {
  const digest = createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('base64');
}
async function verifyDownload(installer) {
  const {app} = require('electron'), {NsisUpdater} = require('electron-updater');
  if (!path.isAbsolute(installer) || !/^SQL-Lab-Setup-[\d.]+\.exe$/.test(path.basename(installer))) throw new Error('Invalid smoke installer');
  const size = fs.statSync(installer).size, sha512 = await hash(installer), name = path.basename(installer);
  const manifest = `version: ${app.getVersion()}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: ${size}\npath: ${name}\nsha512: ${sha512}\n`;
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname === '/latest.yml') {res.end(manifest); return;}
    if (new URL(req.url, 'http://localhost').pathname === `/${name}`) {res.setHeader('Content-Length', size); fs.createReadStream(installer).pipe(res); return;}
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const updater = new NsisUpdater({provider: 'generic', url: `http://127.0.0.1:${server.address().port}/`});
    // Isolated CI data; emulate an earlier client to exercise the real NSIS downloader.
    updater.currentVersion = new updater.currentVersion.constructor('0.0.0');
    updater.autoDownload = false; updater.autoInstallOnAppQuit = false;
    updater.disableDifferentialDownload = true; updater.disableWebInstaller = true;
    updater.on('error', () => {});
    const result = await updater.checkForUpdates();
    if (result.updateInfo.version !== app.getVersion()) throw new Error('Unexpected update version');
    const files = await updater.downloadUpdate();
    if (files.length !== 1 || await hash(files[0]) !== sha512) throw new Error('Downloaded installer mismatch');
    return {feed: 'local CI fixture', clientVersion: '0.0.0 (simulated)', targetVersion: result.updateInfo.version, sha512, bytes: size, automaticInstallTested: false};
  } finally {await new Promise(resolve => server.close(resolve));}
}
module.exports = {verifyDownload};
