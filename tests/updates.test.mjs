import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {checkWebUpdates, newerVersion, stableVersion, saveAndApplyUpdate, RELEASE_API} from '../lib/updates.mjs';
const mock = (site, release, observe = () => {}) => async (url, options) => {
  observe(url, options);
  if (url === RELEASE_API && release instanceof Error) throw release;
  const value = url === RELEASE_API ? release : site;
  return {ok: true, json: async () => value};
};
const check = fetcher => checkWebUpdates({current: '0.3.2', pageURL: 'https://akinaly.top/sql-lab/?old=1', fetcher});
test('semantic versions handle numeric components and never downgrade', () => {
  assert.equal(newerVersion('v0.3.10', '0.3.9'), true);
  assert.equal(newerVersion('0.10.0', '0.9.9'), true);
  assert.equal(newerVersion('0.3.2', '0.3.2'), false);
  assert.equal(newerVersion('0.3.1', '0.3.2'), false);
});
test('only stable release tags are accepted', () => {
  assert.equal(stableVersion('v0.3.2'), '0.3.2');
  for (const v of ['0.3.2-beta', '0.3', 'v01.2.3', null, '<script>']) assert.equal(stableVersion(v), null);
});
test('same versions report current', async () => {
  assert.equal((await check(mock({version: '0.3.2'}, {tag_name: 'v0.3.2'}))).phase, 'current');
});
test('GitHub newer than server requires deployment, not a misleading browser update', async () => {
  const r = await check(mock({version: '0.3.2'}, {tag_name: 'v0.3.3'}));
  assert.equal(r.phase, 'deployment-needed'); assert.match(r.message, /管理员/);
});
test('deployed version is reloadable even while GitHub is unreachable', async () => {
  const r = await check(mock({version: '0.3.3'}, new Error('offline')));
  assert.equal(r.phase, 'ready'); assert.equal(r.version, '0.3.3');
});
test('version requests preserve the subpath and bypass browser cache', async () => {
  const calls = [];
  await check(mock({version: '0.3.2'}, {tag_name: 'v0.3.2'}, (url, options) => calls.push({url, options})));
  assert.equal(new URL(calls[0].url).pathname, '/sql-lab/version.json');
  assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.credentials, 'omit');
});
test('missing manifests and invalid releases report failure without inventing a new version', async () => {
  for (const release of [{tag_name: 'v0.3.3', draft: true}, {tag_name: 'v0.3.3', prerelease: true}, {tag_name: 'broken'}]) {
    await assert.rejects(() => check(mock({}, release)), /无法完整读取/);
  }
});
test('rate limited updates are a recoverable error', async () => {
  await assert.rejects(() => check(async () => ({ok: false, status: 429})), /无法完整读取/);
});
test('data flush completes before install or reload', async () => {
  const steps = [];
  await saveAndApplyUpdate({save: async () => {steps.push('save'); await Promise.resolve(); steps.push('saved');}, apply: () => steps.push('install')});
  assert.deepEqual(steps, ['save', 'saved', 'install']);
});
test('failed data save prevents installing or reloading', async () => {
  let installed = false;
  await assert.rejects(() => saveAndApplyUpdate({save: async () => {throw new Error('disk full');}, apply: () => {installed = true;}}));
  assert.equal(installed, false);
});
test('update manifest hashes describe the final installer and are re-readable', async () => {
  const require = createRequire(import.meta.url), {manifest} = require('../desktop/update-manifest.cjs');
  const {version} = require('../desktop/package.json');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqllab-manifest-'));
  try {
    const bytes = Buffer.from('final installer after metadata cleanup');
    await fs.writeFile(path.join(dir, `SQL-Lab-Setup-${version}.exe`), bytes);
    const r = await manifest(dir), text = await fs.readFile(path.join(dir, 'latest.yml'), 'utf8');
    assert.equal(r.sha512, createHash('sha512').update(bytes).digest('base64'));
    assert.ok(text.includes(`sha512: ${r.sha512}`)); assert.ok(text.includes(`size: ${bytes.length}`));
    assert.ok((await fs.readFile(path.join(dir, 'SHA256SUMS.txt'), 'utf8')).includes(r.sha256));
  } finally {await fs.rm(dir, {recursive: true, force: true});}
});
