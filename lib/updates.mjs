export const RELEASE_API = 'https://api.github.com/repos/MarikoAkina/sql-lab/releases/latest';
export function stableVersion(value) {
  const match = typeof value === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  return match && value.length < 60 ? match.slice(1).join('.') : null;
}
export function newerVersion(candidate, current) {
  const a = stableVersion(candidate), b = stableVersion(current);
  if (!a || !b) throw new Error('版本信息无效，未执行更新。');
  const left = a.split('.').map(BigInt), right = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}
async function json(url, fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetcher(url, {cache: 'no-store', credentials: 'omit', signal: controller.signal, headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? '服务拒绝请求或达到访问限额，请稍后重试。' : `更新服务返回 HTTP ${response.status}。`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
export async function checkWebUpdates({current, pageURL, fetcher = globalThis.fetch}) {
  const url = new URL('version.json', pageURL);
  url.searchParams.set('check', String(Date.now()));
  const [site, release] = await Promise.allSettled([json(url.href, fetcher), json(RELEASE_API, fetcher)]);
  const siteVersion = site.status === 'fulfilled' && stableVersion(site.value.version);
  const releaseVersion = release.status === 'fulfilled' && !release.value.draft && !release.value.prerelease && stableVersion(release.value.tag_name);
  if (siteVersion && newerVersion(siteVersion, current)) return {phase: 'ready', version: siteVersion, message: `站点 ${siteVersion} 已部署，正在保存数据并重新加载。`};
  if (releaseVersion && newerVersion(releaseVersion, current)) return {phase: 'deployment-needed', version: releaseVersion, message: `GitHub 已发布 ${releaseVersion}，当前网页为 ${current}。本站尚未提供该版本，需管理员先部署；浏览器不能改写服务器文件。`};
  if (!siteVersion || !releaseVersion) throw new Error('无法完整读取站点或 GitHub 的版本信息。请检查网络后重试；当前数据和版本保持不变。');
  return {phase: 'current', version: current, message: `当前版本 ${current} 未落后于站点和 GitHub 正式版。`};
}

export async function saveAndApplyUpdate({save, apply}) {
  await save();
  return apply();
}
