import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import sys
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('web_updater', Path(__file__).resolve().parents[1] / 'scripts/update-web.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class WebUpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / 'sql-lab'
        (self.target / 'assets').mkdir(parents=True)
        (self.target / 'index.html').write_text('old page')
        (self.target / 'version.json').write_text('{"version":"0.4.0"}')
        (self.target / 'assets/old.js').write_text('old open tab')
        self.backups = self.root / 'backups'
        self.old = self.snapshot()
        self.calls = []
        self.filename = 'SQL-Lab-Web-0.4.1.zip'
        self.release = {'tag_name': 'v0.4.1', 'draft': False, 'prerelease': False, 'assets': [{'name': self.filename, 'size': 0}, {'name': 'SHA256SUMS.txt'}]}
        self.payload = self.archive()
        self.refresh_checksum()

    def snapshot(self):
        return {str(p.relative_to(self.target)): p.read_bytes() for p in self.target.rglob('*') if p.is_file()}

    def archive(self, version='0.4.1', extras=None):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as z:
            for name, content in {'version.json': json.dumps({'version': version}), 'index.html': '<script src="/sql-lab/assets/new.js"></script>', 'manifest.webmanifest': '{}', 'assets/new.js': 'new application', **(extras or {})}.items():
                z.writestr(name, content)
        return stream.getvalue()

    def refresh_checksum(self):
        self.release['assets'][0]['size'] = len(self.payload)
        self.checksums = f'{hashlib.sha256(self.payload).hexdigest()}  {self.filename}\n'.encode()

    def download(self, url, limit):
        self.calls.append(url)
        self.assertTrue(url == updater.API or url.startswith('https://github.com/MarikoAkina/sql-lab/releases/download/v0.4.1/'))
        if url == updater.API:
            return json.dumps(self.release).encode()
        return self.checksums if url.endswith('SHA256SUMS.txt') else self.payload

    def run_update(self, **kwargs):
        return updater.update(self.target, self.backups, download=self.download, **kwargs)

    def test_semantic_versions(self):
        self.assertGreater(updater.version('v0.4.10'), updater.version('0.4.9'))
        for value in ['0.4', 'v00.4.1', '0.4.1-beta', '../1.2.3', None]:
            with self.assertRaises(ValueError):
                updater.version(value)

    def test_success_backs_up_then_publishes_entry_points_and_retains_old_assets(self):
        result = self.run_update()
        self.assertEqual(result['status'], 'updated')
        self.assertEqual(json.loads((self.target / 'version.json').read_text())['version'], '0.4.1')
        backup = Path(result['backup'])
        self.assertEqual({str(p.relative_to(backup)): p.read_bytes() for p in backup.rglob('*') if p.is_file()}, self.old)
        self.assertEqual((self.target / 'assets/old.js').read_text(), 'old open tab')
        self.assertEqual((self.target / 'assets/new.js').read_text(), 'new application')

    def test_equal_version_or_downgrade_downloads_no_assets(self):
        for tag in ['v0.4.0', 'v0.3.3']:
            self.release['tag_name'] = tag
            self.calls.clear()
            self.assertEqual(self.run_update()['status'], 'current')
            self.assertEqual(self.calls, [updater.API])
            self.assertEqual(self.snapshot(), self.old)

    def test_check_only_does_not_download_or_write(self):
        self.assertEqual(self.run_update(check_only=True)['status'], 'available')
        self.assertEqual(self.calls, [updater.API])
        self.assertEqual(self.snapshot(), self.old)

    def test_checksum_failure_does_not_modify_existing_site(self):
        self.checksums = b'0' * 64 + b'  SQL-Lab-Web-0.4.1.zip\n'
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            self.run_update()
        self.assertEqual(self.snapshot(), self.old)
        self.assertFalse(self.backups.exists())

    def test_missing_or_duplicate_checksum_is_rejected(self):
        for data in [b'', self.checksums + self.checksums]:
            self.checksums = data
            with self.assertRaisesRegex(ValueError, '缺失或重复'):
                self.run_update()
        self.assertEqual(self.snapshot(), self.old)

    def test_invalid_manifest_or_missing_resources_is_rejected_before_writes(self):
        self.payload = self.archive(version='0.4.0')
        self.refresh_checksum()
        with self.assertRaisesRegex(ValueError, '版本'):
            self.run_update()
        self.payload = self.archive(extras={'index.html': '<script src="/sql-lab/assets/missing.js"></script>'})
        self.refresh_checksum()
        with self.assertRaisesRegex(ValueError, '缺失的资源'):
            self.run_update()
        self.assertEqual(self.snapshot(), self.old)

    def test_zip_traversal_hidden_files_and_symlinks_are_rejected(self):
        for name in ['../outside', '/absolute', 'C:/outside', 'assets/../../outside', '.env']:
            self.payload = self.archive(extras={name: 'bad'})
            self.refresh_checksum()
            with self.assertRaises(ValueError):
                self.run_update()
        stream = io.BytesIO(self.archive())
        with zipfile.ZipFile(stream, 'a') as z:
            info = zipfile.ZipInfo('symlink')
            info.external_attr = 0o120777 << 16
            z.writestr(info, '/etc/passwd')
        self.payload = stream.getvalue()
        self.refresh_checksum()
        with self.assertRaisesRegex(ValueError, '符号链接'):
            self.run_update()
        self.assertEqual(self.snapshot(), self.old)
        self.assertFalse((self.root / 'outside').exists())

    def test_deployment_error_restores_old_entry_points(self):
        original = updater.atomic_copy
        failed = False
        def fail_once(source, destination):
            nonlocal failed
            if destination == self.target / 'version.json' and not failed:
                failed = True
                raise OSError('simulated write failure')
            original(source, destination)
        with patch.object(updater, 'atomic_copy', side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, '已恢复旧文件'):
                self.run_update()
        self.assertEqual((self.target / 'index.html').read_bytes(), self.old['index.html'])
        self.assertEqual((self.target / 'version.json').read_bytes(), self.old['version.json'])
        self.assertTrue(list(self.backups.glob('before-auto-update-*/site/index.html')))

    def test_network_failure_and_prerelease_preserve_site(self):
        with self.assertRaises(OSError):
            updater.update(self.target, self.backups, download=lambda *args: (_ for _ in ()).throw(OSError('offline')))
        self.release['prerelease'] = True
        with self.assertRaisesRegex(ValueError, '预发布'):
            self.run_update()
        self.assertEqual(self.snapshot(), self.old)

    def test_unsafe_target_symlink_and_backup_location_are_rejected(self):
        link = self.root / 'link'
        link.symlink_to(self.target, target_is_directory=True)
        with self.assertRaises(ValueError):
            updater.update(link, self.backups, download=self.download)
        with self.assertRaises(ValueError):
            updater.update(self.target, self.target / 'backups', download=self.download)
        (self.target / 'assets/link.js').symlink_to(self.root / 'outside')
        with self.assertRaisesRegex(ValueError, '符号链接'):
            self.run_update()

    def test_https_host_allowlist_and_asset_size_limits(self):
        for url in ['http://github.com/a', 'https://evil.example/a', 'https://github.com@evil.example/a', 'https://github.com:4444/a']:
            with self.assertRaises(ValueError):
                updater.check_url(url)
        self.release['assets'][0]['size'] = updater.MAX_ZIP + 1
        with self.assertRaisesRegex(ValueError, '容量'):
            self.run_update()
        self.assertEqual(self.snapshot(), self.old)

    def test_cli_skips_a_second_concurrent_update(self):
        state = self.root / 'state'
        state.mkdir()
        with (state / 'update.lock').open('a') as lock:
            updater.fcntl.flock(lock, updater.fcntl.LOCK_EX | updater.fcntl.LOCK_NB)
            with patch.object(sys, 'argv', ['update-web.py', '--state-dir', str(state)]), patch.object(updater, 'update') as call, patch('builtins.print'):
                updater.main()
                call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
