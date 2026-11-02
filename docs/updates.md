# 检查更新与试用站部署

## Windows 使用方法

0.3.2 起，顶部“检查更新”和原生“帮助 → 检查更新”共用更新流程：

1. 保存工作台，检查 `MarikoAkina/sql-lab` 的 GitHub 最新正式 Release。
2. 仅接受更高版本，不降级，不使用草稿或预发布版。
3. 通过 electron-updater 自动下载完整 NSIS 安装包，显示进度并校验 SHA512。
4. 等待当前 SQL 执行完成，再次保存 IndexedDB；保存失败时不重启。
5. 退出并静默安装，完成后重新打开。系统权限提示仍需用户处理。

没有自动检查定时器；下载由用户点击检查触发。网络失败、限流、缺失更新文件、校验失败会显示中文提示，可重试；失败时保留当前程序与工作台。不要在下载期间手动退出；当前版本未启用“退出时自动安装”，重新打开后可以再次检查。

0.3.1 及以前没有更新代码，需要先手动安装一次 1.1.0。更新保持 `SQL LAB` 应用名、`sqllab://app` 来源和用户数据目录；不主动删除数据库、草稿或进度。重要数据仍建议导出完整 JSON 备份。

安装包暂未使用 Authenticode 发布者证书。HTTPS 和发布清单哈希用于传输及文件完整性校验，不等同于发布者签名；不能抵御仓库发布权限被盗后的恶意发布。第三方许可证保持原样。

## 网页的检查更新

网页按钮同时读取同源 `version.json` 和 GitHub 最新正式 Release。管理员已部署更高版本时，保存当前工作台后重新加载；GitHub 已发布、本站未部署时，明确提示等待管理员部署。浏览器不能替换 AWS 服务器文件。

版本按三个非负整数比较，例如 `0.3.10` 高于 `0.3.9`；当前网页更新协议只处理正式 `x.y.z` 版本。检查失败不清空缓存或浏览器数据库。网页没有 Service Worker 离线缓存。

## 让试用站以后自动部署新版（推荐）

网页不能直接改写 AWS 上的文件。现在补充服务器自动更新器：一次安装后，每约 10 分钟从固定仓库检查最新正式 Release，下载网页 ZIP、校验大小与 SHA256、验证资源与子路径、备份旧站点，再发布新入口。重复检查不下载相同版本，不自动降级；下载/校验失败保留旧站，部署异常时尝试恢复旧入口并保留快照。

**网页按钮不会立即触发服务器更新。** 自动部署由服务器定时器执行；服务器完成后，旧网页点击“检查更新”会保存当前浏览器数据并加载新页面。Windows 应用的自动安装仍使用独立的 electron-updater 流程。

先导出浏览器完整 JSON 备份，再在 AWS Ubuntu SSH 终端整段执行一次：

```bash
bash <<'SH'
set -euo pipefail
sudo apt-get install -y python3 ca-certificates curl
sql_lab_updater_dir=$(mktemp -d)
cd "$sql_lab_updater_dir"
sql_lab_updater_source='https://raw.githubusercontent.com/MarikoAkina/sql-lab/main/scripts'
curl -fL --retry 3 "$sql_lab_updater_source/update-web.py" -o update-web.py
curl -fL --retry 3 "$sql_lab_updater_source/install-web-updater.sh" -o install-web-updater.sh
sudo bash install-web-updater.sh
sudo journalctl -u sql-lab-web-update.service -n 20 --no-pager
SH
```

沿用 `/var/www/akinaly/sql-lab`，要求已完成首次部署。安装器会备份已有同名更新器配置，设置每约 10 分钟检查，并立即执行一次检查。它不修改 Nginx、证书或 80/443。使用公开 GitHub HTTPS 下载，无需账号、SSH 私钥或 AI API。

手动立即更新与查看状态：

```bash
sudo systemctl start sql-lab-web-update.service
sudo journalctl -u sql-lab-web-update.service -n 30 --no-pager
sudo systemctl list-timers sql-lab-web-update.timer --no-pager
curl -fsS https://akinaly.top/sql-lab/version.json
```

日志 `status: updated` 表示已更新，并给出旧站快照路径；`status: current` 表示没有更高版本；网络、校验或磁盘错误会使任务失败，旧站保留，定时器下次继续尝试。系统权限与磁盘故障可能导致自动回退本身失败，日志会明确给出人工恢复路径，不应把它解释为已恢复。

自动更新器只写入站点、快照和锁文件目录，保留旧哈希资源以供已打开的页面使用。备份默认在 `/var/backups/sql-lab/before-auto-update-*/site`，不会自动删除。应定期查看磁盘空间并自行保留所需备份。它不更新更新器脚本自身。

暂停自动更新或回滚前先停止定时器和正在执行的服务，否则稍后会再次更新：

```bash
sudo systemctl disable --now sql-lab-web-update.timer
sudo systemctl stop sql-lab-web-update.service
```

随后用日志输出的实际 `site` 快照路径恢复网页；旧版浏览器进度兼容限制仍见下方恢复说明。备份、主程序与历史 Release 均保留。

验证：13 项 Python 专项测试通过，涵盖相同版本/降级、校验失败、无效 ZIP/路径/符号链接、丢失资源、网络失败、失败回退和并发锁；systemd 单元通过 `systemd-analyze verify`。另使用真实 GitHub HTTPS 下载和公开 0.4.0 网页包，在隔离目录实际完成 0.3.3 → 0.4.0 部署并核对备份。**尚未在你的 AWS 上安装或启动定时器**；安装成功与否应以服务器终端输出为准。

## 在 akinaly.top 更新到 1.1.0

先在现有网页“数据与备份”中导出 JSON。下面命令在 AWS 的 Ubuntu SSH 终端执行。它们下载预构建网页，不需要在小内存服务器上安装 Node.js 或编译。

```bash
sudo apt-get install -y unzip rsync curl python3
sql_lab_update_dir=$(mktemp -d)
cd "$sql_lab_update_dir"
curl -fL --retry 3 https://github.com/MarikoAkina/sql-lab/releases/download/v1.1.0/SQL-Lab-Web-1.1.0.zip -o SQL-Lab-Web-1.1.0.zip
curl -fL --retry 3 https://github.com/MarikoAkina/sql-lab/releases/download/v1.1.0/SHA256SUMS.txt -o SHA256SUMS.txt
sha256sum --ignore-missing -c SHA256SUMS.txt
unzip -q SQL-Lab-Web-1.1.0.zip -d site
curl -fL --retry 3 https://raw.githubusercontent.com/MarikoAkina/sql-lab/v1.1.0/scripts/deploy-web.sh -o deploy-web.sh
sudo bash deploy-web.sh "$sql_lab_update_dir/site"
curl -fsS https://akinaly.top/sql-lab/version.json
```

逐条运行；任意一步失败就停止，不要执行后面的部署。版本应显示 `{"version":"1.1.0"}`。默认部署目录沿用 `/var/www/akinaly/sql-lab`，域名和 Nginx `root` 配置需与此前部署一致。不修改 80/443、证书和其他服务，不需要重启 Nginx。

脚本先校验子路径构建及版本，再备份原站点到 `/var/backups/sql-lab/before-update-XXXXXXXX/site`，输出实际路径。先复制资源，再原子替换首页与版本清单；保留旧哈希资源，供尚未刷新的页面继续使用。它不使用 `rsync --delete`。

打开 `https://akinaly.top/sql-lab/?v=1.1.0`，点击顶部圆形箭头“检查更新”，确认显示 1.1.0；执行 SELECT 并刷新，检查原数据库与进度仍在。若有 CDN，应刷新首页和 `version.json` 的缓存。不要用清除网站数据来刷新版本，那会删除当前浏览器的练习数据。

## 恢复服务器旧网页

用部署命令输出的真实备份路径替换下方路径。回滚只恢复网页文件，不回滚当前浏览器的数据。

```bash
sudo rsync -a /var/backups/sql-lab/before-update-XXXXXXXX/site/ /var/www/akinaly/sql-lab/
```

上方 `XXXXXXXX` 是说明占位符，不能直接执行；必须替换为部署时输出的实际目录。如果已在 0.4.0 完成 28–45 题，0.3.x 无法读取这些新题号：回到旧网页前需保留当前 JSON 备份，并恢复升级前导出的旧版备份。仅回滚服务器文件不会逆向迁移学习记录。然后刷新页面。也可以选择重新部署旧标签源码，构建时使用 `npm run build -- --base=/sql-lab/`。

## 维护者发布规则

- 根目录与 `desktop/package.json` 同步升级版本；更新发布说明及测试。
- `npm run dist:windows` 先安装 `desktop/package-lock.json` 锁定的运行依赖，再构建 NSIS。
- 主程序在打包钩子清理可选元数据，安装器配置保持可选署名为空；最终重新读取两种实际 EXE，生成 `latest.yml`（SHA512）和 `SHA256SUMS.txt`；网页 ZIP 也加入 SHA256。
- 不改写 NSIS 生成后的安装器，避免破坏自校验；哈希始终从最终文件生成。
- Windows 工作流通过检查后，将安装包、网页 ZIP、更新清单和报告上传到草稿，最后公开发布。已公开的相同版本拒绝覆盖。
- 未来版本必须继续提供 `latest.yml` 和其所引用的 EXE；仅上传源码或 EXE 不足以支持自动更新。

## 验证边界

自动化检查覆盖比较、重入、进度、下载完成前禁止安装、保存后调用安装、保存失败保护、网络错误、网页未部署提示和最终文件哈希生成。

首批 12 项 Windows 安装检查包含本地更新源下载，使用模拟客户端版本 0.0.0；其报告保持原样。

2026-10-26 已追加公开 **0.3.2 → 0.3.3** 完整升级的独立 Windows CI 验收，**7 项通过，0 项失败**。安装公开旧包后，通过应用真实“检查更新”按钮从 GitHub 下载新版，观察到旧进程退出、安装器替换程序、新进程自动启动；再次打开后，客户数据、SQL 草稿、练习草稿和通过记录恢复。未模拟版本号、未替换更新源，见 [原始报告](../public/windows-upgrade-acceptance.json)与 [工作流](https://github.com/MarikoAkina/sql-lab/actions/runs/40260121753)。

本次升级前确认数据已保存；未落盘草稿的保护由 DOM 检查覆盖。普通 Windows 10/11 用户机器上的权限、UAC、断电与恢复，以及 iPhone Safari 实机仍需补充验证。CI 的成功不替代这些设备与异常情形的验收。

0.4.0 补充验收：公开 0.3.3 → 0.4.0 完整自动升级在 Windows CI 实际执行，**8 项全部通过**，没有模拟版本或更新源。升级保留原数据、草稿和进度，并核对新版 45 题与独立示例数据；[原始报告](../public/windows-upgrade-acceptance-0.4.json) · [工作流](https://github.com/MarikoAkina/sql-lab/actions/runs/40265313715)。
