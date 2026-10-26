const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createUpdateController, FEED} = require('../desktop/updater.cjs');
function fixture(enabled = true) {
  const updater = new EventEmitter(), events = [];
  let checks = 0, installs = 0, args;
  updater.setFeedURL = feed => {assert.deepEqual(feed, FEED);};
  updater.checkForUpdates = async () => {checks++;};
  updater.quitAndInstall = (...value) => {installs++; args = value;};
  const controller = createUpdateController({updater, currentVersion: '0.3.2', enabled, publish: s => events.push(s)});
  return {updater, controller, events, checks: () => checks, installs: () => installs, args: () => args};
}
test('updater pins GitHub repository, stable releases and full verified downloads', () => {
  const {updater} = fixture();
  assert.equal(updater.autoDownload, true); assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.disableDifferentialDownload, true); assert.equal(updater.disableWebInstaller, true);
});
test('parallel clicks do not start duplicate update checks', async () => {
  const x = fixture(); await Promise.all([x.controller.check(), x.controller.check()]); assert.equal(x.checks(), 1);
});
test('download progress and ready status do not install before renderer saves', async () => {
  const x = fixture(); await x.controller.check();
  x.updater.emit('update-available', {version: '0.3.3'});
  x.updater.emit('download-progress', {percent: 51});
  assert.equal(x.controller.getState().percent, 51);
  x.updater.emit('update-downloaded', {version: '0.3.3'});
  assert.equal(x.controller.getState().phase, 'ready'); assert.equal(x.installs(), 0);
  x.controller.install(); assert.equal(x.installs(), 1); assert.deepEqual(x.args(), [true, true]);
});
test('install cannot run without a fully downloaded verified update', () => {
  assert.throws(() => fixture().controller.install(), /尚无已校验/);
});
test('no-update and unsupported environments have clear statuses', async () => {
  const x = fixture(); x.updater.emit('update-not-available'); assert.equal(x.controller.getState().phase, 'current');
  const y = fixture(false); assert.equal((await y.controller.check()).phase, 'unsupported'); assert.equal(y.checks(), 0);
});
test('checksum errors stop installation and permit retry', async () => {
  const x = fixture(); x.updater.emit('error', new Error('sha512 checksum mismatch'));
  assert.equal(x.controller.getState().phase, 'error'); assert.match(x.controller.getState().message, /校验失败/);
  assert.throws(() => x.controller.install()); await x.controller.check(); assert.equal(x.checks(), 1);
});
test('rejected checks return an error state and never leak raw paths', async () => {
  const x = fixture(); x.updater.checkForUpdates = async () => {throw new Error('Failed C:/Users/private/temp/file');};
  assert.equal((await x.controller.check()).phase, 'error'); assert.ok(!x.controller.getState().message.includes('C:/'));
});
test('installer invocation failures are reported instead of claiming success', () => {
  const x = fixture(); x.updater.quitAndInstall = () => {throw new Error('permission denied');};
  x.updater.emit('update-downloaded', {version: '0.3.3'}); assert.throws(() => x.controller.install()); assert.equal(x.controller.getState().phase, 'error');
});
