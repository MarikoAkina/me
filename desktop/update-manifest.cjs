const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
async function manifest(directory) {
  const {version} = require('./package.json');
  const name = `SQL-Lab-Setup-${version}.exe`;
  const file = await fs.readFile(path.join(directory, name));
  const sha512 = createHash('sha512').update(file).digest('base64');
  const sha256 = createHash('sha256').update(file).digest('hex');
  // Read the final cleaned installer so update hashes cannot describe an earlier build.
  const text = `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: ${file.length}\npath: ${name}\nsha512: ${sha512}\n`;
  await fs.writeFile(path.join(directory, 'latest.yml'), text);
  let checksums = `${sha256}  ${name}\n`;
  const web = `SQL-Lab-Web-${version}.zip`;
  try {const bytes = await fs.readFile(path.join(directory, web)); checksums += `${createHash('sha256').update(bytes).digest('hex')}  ${web}\n`;} catch (error) {if (error.code !== 'ENOENT') throw error;}
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums);
  if (await fs.readFile(path.join(directory, 'latest.yml'), 'utf8') !== text) throw new Error('Update manifest readback failed');
  return {version, sha256, sha512, size: file.length};
}
module.exports = {manifest};
if (require.main === module) manifest(path.resolve(process.argv[2] || 'release')).then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error.message); process.exitCode = 1;});
