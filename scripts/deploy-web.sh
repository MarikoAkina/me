#!/usr/bin/env bash
set -euo pipefail
source_dir=$(realpath "${1:?Usage: sudo bash deploy-web.sh DIST_DIRECTORY [TARGET_DIRECTORY]}")
target_dir=${2:-/var/www/akinaly/sql-lab}
if [[ $EUID -ne 0 ]]; then echo '请通过 sudo 执行部署。' >&2; exit 1; fi
if [[ $target_dir != /* || $target_dir == / || $(basename "$target_dir") != sql-lab ]]; then echo '目标必须是绝对路径，且目录名为 sql-lab。' >&2; exit 1; fi
target_dir=$(realpath -m "$target_dir")
if [[ $target_dir == / || $(basename "$target_dir") != sql-lab ]]; then echo '拒绝不安全的部署路径。' >&2; exit 1; fi
if [[ $source_dir == "$target_dir" ]]; then echo '构建目录不能与部署目录相同。' >&2; exit 1; fi
for file in index.html version.json manifest.webmanifest; do
  test -s "$source_dir/$file" || { echo "缺少构建文件：$file" >&2; exit 1; }
done
python3 - "$source_dir" <<'PY'
from pathlib import Path
import json, re, sys
p = Path(sys.argv[1])
v = json.loads((p/'version.json').read_text())['version']
assert re.fullmatch(r'\d+\.\d+\.\d+', v), '版本信息无效'
assert '/sql-lab/assets/' in (p/'index.html').read_text(), '请使用 --base=/sql-lab/ 构建'
assert not any(f.is_symlink() for f in p.rglob('*')), '构建中不允许符号链接'
print('待部署版本：'+v)
PY
mkdir -p /var/backups/sql-lab "$(dirname "$target_dir")"
backup_dir=$(mktemp -d /var/backups/sql-lab/before-update-XXXXXXXX)
if [[ -d $target_dir ]]; then cp -a "$target_dir" "$backup_dir/site"; fi
mkdir -p "$target_dir"
# Retain previous hashed assets so open browser tabs keep their matching Worker code.
rsync -a --chmod=D755,F644 --exclude=index.html --exclude=version.json "$source_dir/" "$target_dir/"
install -m 644 "$source_dir/index.html" "$target_dir/.index-next.html"
mv -f "$target_dir/.index-next.html" "$target_dir/index.html"
install -m 644 "$source_dir/version.json" "$target_dir/.version-next.json"
mv -f "$target_dir/.version-next.json" "$target_dir/version.json"
printf '部署完成。原站点备份：%s/site\n' "$backup_dir"
printf '检查：https://akinaly.top/sql-lab/version.json\n'
