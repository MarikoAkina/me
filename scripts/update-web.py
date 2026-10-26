#!/usr/bin/env python3
"""Fetch only SQL LAB's stable website releases and deploy with a recoverable snapshot."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import urllib.parse
import urllib.request
import zipfile

REPOSITORY = 'MarikoAkina/sql-lab'
API = f'https://api.github.com/repos/{REPOSITORY}/releases/latest'
MAX_ZIP = 25 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
ALLOWED_HOSTS = {'api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}


def version(value):
    if not isinstance(value, str) or len(value) > 60 or not re.fullmatch(r'v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value):
        raise ValueError('无效的正式版本号')
    return tuple(map(int, value.removeprefix('v').split('.')))


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError('拒绝非 GitHub HTTPS 下载地址')


def fetch(url, limit):
    check_url(url)
    req = urllib.request.Request(url, headers={'User-Agent': 'SQL-LAB-web-updater', 'Accept': 'application/json' if url == API else 'application/octet-stream'})
    with urllib.request.build_opener(SafeRedirect()).open(req, timeout=30) as response:
        check_url(response.url)
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('下载文件超过容量限制')
    return data


def safe_directory(path, target=False):
    path = Path(path)
    if not path.is_absolute() or path == Path('/') or (target and (path.name != 'sql-lab' or len(path.parts) < 3)):
        raise ValueError('部署目录必须为绝对路径且目录名为 sql-lab')
    if any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError('部署路径不能经过符号链接')
    return path


def unpack(data, destination, wanted):
    archive = destination.parent / 'website.zip'
    archive.write_bytes(data)
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        if len(entries) > 1024 or sum(i.file_size for i in entries) > MAX_EXPANDED:
            raise ValueError('压缩包展开后超过容量限制')
        paths = set()
        for info in entries:
            raw = info.filename.replace('\\', '/')
            p = PurePosixPath(raw)
            if not raw or p.is_absolute() or ':' in raw or any(part.startswith('.') for part in p.parts) or str(p) in paths:
                raise ValueError('压缩包含不安全或重复路径')
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError('压缩包含符号链接或特殊文件')
            paths.add(str(p))
            out = destination.joinpath(*p.parts)
            if raw.endswith('/'):
                out.mkdir(parents=True, exist_ok=True)
            else:
                out.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as source, out.open('wb') as target:
                    shutil.copyfileobj(source, target)
                out.chmod(0o644)
    if version(json.loads((destination / 'version.json').read_text())['version']) != version(wanted):
        raise ValueError('网页包版本与 Release 不一致')
    html = (destination / 'index.html').read_text()
    if '/sql-lab/assets/' not in html or not (destination / 'manifest.webmanifest').is_file():
        raise ValueError('网页包未配置 /sql-lab/ 子路径或缺少必要文件')
    for reference in re.findall(r'(?:src|href)="(/sql-lab/[^"?]+)', html):
        p = PurePosixPath(reference.removeprefix('/sql-lab/'))
        if '..' in p.parts or not destination.joinpath(*p.parts).is_file():
            raise ValueError('网页包引用了缺失的资源')


def atomic_copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.update-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o644)
        os.replace(name, destination)
    finally:
        Path(name).unlink(missing_ok=True)


def deploy(stage, target, backups):
    if any(p.is_symlink() for p in target.rglob('*')):
        raise ValueError('现有站点含符号链接，未改写任何文件')
    backups.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='before-auto-update-', dir=backups)) / 'site'
    shutil.copytree(target, backup)
    try:
        for source in stage.rglob('*'):
            if source.is_file() and source.relative_to(stage).as_posix() not in ('index.html', 'version.json'):
                atomic_copy(source, target / source.relative_to(stage))
        # Publish entry points last; retain old hashed assets for open tabs.
        atomic_copy(stage / 'index.html', target / 'index.html')
        atomic_copy(stage / 'version.json', target / 'version.json')
    except Exception as error:
        try:
            for source in backup.rglob('*'):
                if source.is_file():
                    atomic_copy(source, target / source.relative_to(backup))
            for name in ('index.html', 'version.json'):
                if not (backup / name).exists():
                    (target / name).unlink(missing_ok=True)
        except Exception:
            raise RuntimeError(f'部署与自动回退均失败；旧站点备份：{backup}') from error
        raise RuntimeError(f'部署失败，已恢复旧文件；备份：{backup}') from error
    return backup


def update(target, backups, download=fetch, check_only=False):
    target, backups = safe_directory(target, True), safe_directory(backups)
    if not target.is_dir():
        raise ValueError('站点目录不存在，请先完成首次部署')
    if backups == target or target in backups.parents:
        raise ValueError('备份目录不能位于站点内部')
    manifest = target / 'version.json'
    if manifest.is_symlink():
        raise ValueError('版本文件不能是符号链接')
    current = json.loads(manifest.read_text())['version'] if manifest.exists() else '0.0.0'
    release = json.loads(download(API, 2 * 1024 * 1024))
    if release.get('draft') is not False or release.get('prerelease') is not False:
        raise ValueError('拒绝草稿或预发布版本')
    tag = release['tag_name']
    wanted = '.'.join(map(str, version(tag)))
    if version(wanted) <= version(current):
        return {'status': 'current', 'current': current, 'latest': wanted, 'message': '无需更新，不执行降级'}
    if check_only:
        return {'status': 'available', 'current': current, 'latest': wanted}
    filename = f'SQL-Lab-Web-{wanted}.zip'
    assets = {a['name']: a for a in release.get('assets', [])}
    if filename not in assets or 'SHA256SUMS.txt' not in assets:
        raise ValueError('正式版缺少网页包或校验文件')
    if not isinstance(assets[filename].get('size'), int) or not 0 < assets[filename]['size'] <= MAX_ZIP:
        raise ValueError('网页包容量无效或超出限制')
    base = f'https://github.com/{REPOSITORY}/releases/download/{tag}/'
    sums = download(base + 'SHA256SUMS.txt', 1024 * 1024).decode('utf-8-sig')
    expected = re.findall(r'^([a-fA-F0-9]{64})  ' + re.escape(filename) + r'\s*$', sums, re.M)
    if len(expected) != 1:
        raise ValueError('网页包校验值缺失或重复')
    data = download(base + filename, MAX_ZIP)
    if len(data) > MAX_ZIP or len(data) != assets[filename].get('size') or hashlib.sha256(data).hexdigest() != expected[0].lower():
        raise ValueError('网页包大小或 SHA256 校验失败，旧站点未变更')
    with tempfile.TemporaryDirectory(prefix='sql-lab-web-update-') as directory:
        stage = Path(directory) / 'site'
        unpack(data, stage, wanted)
        backup = deploy(stage, target, backups)
    return {'status': 'updated', 'previous': current, 'version': wanted, 'backup': str(backup)}


def main():
    parser = argparse.ArgumentParser(description='SQL LAB 网页服务器自动更新')
    parser.add_argument('--target', default='/var/www/akinaly/sql-lab')
    parser.add_argument('--backup-dir', default='/var/backups/sql-lab')
    parser.add_argument('--state-dir', default='/var/lib/sql-lab-updater')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    state = safe_directory(args.state_dir)
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'update.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('另一个更新任务正在运行，本次跳过')
            return
        print(json.dumps(update(args.target, args.backup_dir, check_only=args.check_only), ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'更新未完成：{error}', file=__import__('sys').stderr)
        raise SystemExit(1)
