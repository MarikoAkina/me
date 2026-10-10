const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {resolveAsset, isInternalURL, isExternalURL, createHandler} = require('../desktop/protocol.cjs');

test('desktop scheme keeps a fixed local storage origin', () => {
  assert.equal(isInternalURL('sqllab://app/'),true);
  for(const url of ['file:///etc/passwd','https://app/','sqllab://other/','sqllab://user@app/','sqllab://app:123/'])assert.equal(isInternalURL(url),false);
});
test('only HTTPS external links can leave the desktop app', () => {
  assert.equal(isExternalURL('https://github.com/MarikoAkina/me/releases'),true);
  for(const url of ['file:///C:/Windows','javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.equal(isExternalURL(url),false);
});
test('desktop asset paths cannot escape the packaged UI directory', () => {
  const root=path.resolve('desktop/ui');
  assert.equal(resolveAsset(root,'sqllab://app/'),path.join(root,'index.html'));
  assert.equal(resolveAsset(root,'sqllab://app/assets/worker.js'),path.join(root,'assets/worker.js'));
  for(const url of ['sqllab://app/%2e%2e%2fsecret.json','sqllab://app/%5c..%5csecret.js','sqllab://app/a%00.js','sqllab://app/package.cjs','sqllab://app/%ZZ'])assert.equal(resolveAsset(root,url),null);
});
test('desktop asset paths ignore query and fragment without changing the file', () => {
  const root=path.resolve('desktop/ui');assert.equal(resolveAsset(root,'sqllab://app/assets/app.js?v=2#top'),path.join(root,'assets/app.js'));
});
test('packaged module responses preserve code and correct MIME type', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sql-lab-assets-'));
  try{await fs.writeFile(path.join(dir,'app.js'),'export const value = 3;');const r=await createHandler(dir)(new Request('sqllab://app/app.js'));assert.equal(r.status,200);assert.equal(await r.text(),'export const value = 3;');assert.match(r.headers.get('content-type'),/text\/javascript/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-security-policy'),/object-src 'none'/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('missing packaged files fail rather than falling back to arbitrary HTML', async () => {
  assert.equal((await createHandler(os.tmpdir())(new Request('sqllab://app/nonexistent-worker.js'))).status,404);
});
test('desktop protocol accepts HEAD and rejects write requests', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sql-lab-head-'));
  try{await fs.writeFile(path.join(dir,'index.html'),'<div>ok</div>');const handle=createHandler(dir);const head=await handle(new Request('sqllab://app/',{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal((await handle(new Request('sqllab://app/',{method:'POST'}))).status,405);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
