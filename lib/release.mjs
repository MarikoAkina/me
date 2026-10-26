import packageInfo from '../package.json' with {type: 'json'};

const version = packageInfo.version;
const base = `https://github.com/MarikoAkina/sql-lab/releases/download/v${version}`;
export const windowsRelease = Object.freeze({
  version,
  installer: `${base}/SQL-Lab-Setup-${version}.exe`,
  checksums: `${base}/SHA256SUMS.txt`,
  page: `https://github.com/MarikoAkina/sql-lab/releases/tag/v${version}`,
});
