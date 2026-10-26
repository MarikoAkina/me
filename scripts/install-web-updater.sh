#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo '请通过 sudo bash 执行安装。' >&2; exit 1; fi
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
test -s "$source_dir/update-web.py"
test -d /var/www/akinaly/sql-lab || { echo '缺少 /var/www/akinaly/sql-lab，请先部署站点。' >&2; exit 1; }
python3 - "$source_dir/update-web.py" <<'PY'
from pathlib import Path
import sys
compile(Path(sys.argv[1]).read_text(), 'update-web.py', 'exec')
PY
install -d -m 755 /usr/local/lib/sql-lab-updater /var/lib/sql-lab-updater /var/backups/sql-lab
config_backup=$(mktemp -d /var/backups/sql-lab/updater-config-XXXXXXXX)
for file in /usr/local/lib/sql-lab-updater/update-web.py /etc/systemd/system/sql-lab-web-update.service /etc/systemd/system/sql-lab-web-update.timer; do
  if [[ -f $file ]]; then cp -a "$file" "$config_backup/"; fi
done
echo "原更新器配置备份：$config_backup"
install -m 644 "$source_dir/update-web.py" /usr/local/lib/sql-lab-updater/update-web.py
cat > /etc/systemd/system/sql-lab-web-update.service <<'UNIT'
[Unit]
Description=Update SQL LAB website from verified stable GitHub releases
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/lib/sql-lab-updater/update-web.py
TimeoutStartSec=5min
UMask=0022
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/www/akinaly/sql-lab /var/backups/sql-lab /var/lib/sql-lab-updater
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
UNIT
cat > /etc/systemd/system/sql-lab-web-update.timer <<'UNIT'
[Unit]
Description=Check SQL LAB website releases every ten minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=30s
Unit=sql-lab-web-update.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now sql-lab-web-update.timer
systemctl start sql-lab-web-update.service
systemctl list-timers sql-lab-web-update.timer --no-pager
echo '安装完成：以后每约 10 分钟检查并自动部署新版。网页按钮加载已部署版本；不会立即触发服务器任务。'
