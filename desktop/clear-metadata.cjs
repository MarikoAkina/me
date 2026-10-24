const fs = require('node:fs/promises');
const path = require('node:path');
const {NtExecutable, NtExecutableResource, Resource} = require('resedit');
const optionalFields = ['Author', 'LastModifiedBy', 'CompanyName', 'Comments', 'Creator', 'Producer', 'Software', 'LegalCopyright'];
async function inspect(file, clear = false) {
  const original = await fs.readFile(file);
  const exe = NtExecutable.from(original);
  const resources = NtExecutableResource.from(exe);
  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) throw new Error('Missing executable version resource');
  for (const version of versions) {
    for (const language of version.getAllLanguagesForStringValues()) {
      if (clear) for (const field of optionalFields) version.removeStringValue(language, field);
      const values = version.getStringValues(language);
      for (const field of optionalFields) {
        if (values[field]) throw new Error(`Nonempty optional metadata: ${path.basename(file)} / ${field}`);
      }
    }
    if (clear) version.outputToResourceEntries(resources.entries);
  }
  if (clear) {
    resources.outputResource(exe);
    await fs.writeFile(file, Buffer.from(exe.generate()));
    await inspect(file);
  }
  return {file: path.basename(file), optionalIdentityFields: 'empty', versionResources: versions.length};
}
module.exports = async context => {
  if (context.electronPlatformName === 'win32') {
    await inspect(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`), true);
  }
};
module.exports.inspect = inspect;
if (require.main === module) {
  const verify = process.argv[2] === '--verify';
  const files = process.argv.slice(verify ? 3 : 2);
  if (!files.length) throw new Error('Executable path required');
  Promise.all(files.map(file => inspect(file, !verify)))
    .then(results => console.log(JSON.stringify(results)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
