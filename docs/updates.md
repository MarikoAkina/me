# 检查更新与试用站部署

## Windows 使用方法

0.3.2 起，顶部“检查更新”和原生“帮助 → 检查更新”共用更新流程：

1. 保存工作台，检查 `MarikoAkina/sql-lab` 的 GitHub 最新正式 Release。
2. 仅接受更高版本，不降级，不使用草稿或预发布版。
3. 通过 electron-updater 自动下载完整 NSIS 安装包，显示进度并校验 SHA512。
4. 等待当前 SQL 执行完成，再次保存 IndexedDB；保存失败时不重启。
5. 退出并静默安装，完成后重新打开。系统权限提示仍需用户处理。

没有自动检查定时器；下载由用户点击检查触发。网络失败、限流、缺失更新文件、校验失败会显示中文提示，可重试；失败时保留当前程序与工作台。不要在下载期间手动退出；当前版本未启用“退出时自动安装”，重新打开后可以再次检查。

0.3.1 及以前没有更新代码，需要先手动安装一次 0.3.2。更新保持 `SQL LAB` 应用名、`sqllab://app` 来源和用户数据目录；不主动删除数据库、草稿或进度。重要数据仍建议导出完整 JSON 备份。

安装包暂未使用 Authenticode 发布者证书。HTTPS 和发布清单哈希用于传输及文件完整性校验，不等同于发布者签名；不能抵御仓库发布权限被盗后的恶意发布。第三方许可证保持原样。

## 网页的检查更新

网页按钮同时读取同源 `version.json` 和 GitHub 最新正式 Release。管理员已部署更高版本时，保存当前工作台后重新加载；GitHub 已发布、本站未部署时，明确提示等待管理员部署。浏览器不能替换 AWS 服务器文件。

版本按三个非负整数比较，例如 `0.3.10` 高于 `0.3.9`；当前网页更新协议只处理正式 `x.y.z` 版本。检查失败不清空缓存或浏览器数据库。网页没有 Service Worker 离线缓存。

## 在 akinaly.top 更新到 0.3.2

先在现有网页“数据与备份”中导出 JSON。下面命令在 AWS 的 Ubuntu SSH 终端执行。它们下载预构建网页，不需要在小内存服务器上安装 Node.js 或编译。

```bash
sudo apt-get install -y unzip rsync curl python3
sql_lab_update_dir=$(mktemp -d)
cd "$sql_lab_update_dir"
curl -fL --retry 3 https://github.com/MarikoAkina/sql-lab/releases/download/v0.3.2/SQL-Lab-Web-0.3.2.zip -o SQL-Lab-Web-0.3.2.zip
curl -fL --retry 3 https://github.com/MarikoAkina/sql-lab/releases/download/v0.3.2/SHA256SUMS.txt -o SHA256SUMS.txt
sha256sum --ignore-missing -c SHA256SUMS.txt
unzip -q SQL-Lab-Web-0.3.2.zip -d site
curl -fL --retry 3 https://raw.githubusercontent.com/MarikoAkina/sql-lab/v0.3.2/scripts/deploy-web.sh -o deploy-web.sh
sudo bash deploy-web.sh "$sql_lab_update_dir/site"
curl -fsS -H 'Host: akinaly.top' http://127.0.0.1/sql-lab/version.json
```

逐条运行；任意一步失败就停止，不要执行后面的部署。版本应显示 `{"version":"0.3.2"}`。默认部署目录沿用 `/var/www/akinaly/sql-lab`，域名和 Nginx `root` 配置需与此前部署一致。不修改 80/443、证书和其他服务，不需要重启 Nginx。

脚本先校验子路径构建及版本，再备份原站点到 `/var/backups/sql-lab/before-update-XXXXXXXX/site`，输出实际路径。先复制资源，再原子替换首页与版本清单；保留旧哈希资源，供尚未刷新的页面继续使用。它不使用 `rsync --delete`。

打开 `https://akinaly.top/sql-lab/?v=0.3.2`，点击顶部圆形箭头“检查更新”，确认显示 0.3.2；执行 SELECT 并刷新，检查原数据库与进度仍在。若有 CDN，应刷新首页和 `version.json` 的缓存。不要用清除网站数据来刷新版本，那会删除当前浏览器的练习数据。

## 恢复服务器旧网页

用部署命令输出的真实备份路径替换下方路径。回滚只恢复网页文件，不回滚当前浏览器的数据。

```bash
sudo rsync -a /var/backups/sql-lab/before-update-XXXXXXXX/site/ /var/www/akinaly/sql-lab/
```

上方 `XXXXXXXX` 是说明占位符，不能直接执行；必须替换为部署时输出的实际目录。然后刷新页面。也可以选择重新部署旧标签源码，构建时使用 `npm run build -- --base=/sql-lab/`。

## 维护者发布规则

- 根目录与 `desktop/package.json` 同步升级版本；更新发布说明及测试。
- `npm run dist:windows` 先安装 `desktop/package-lock.json` 锁定的运行依赖，再构建 NSIS。
- 主程序在打包钩子清理可选元数据，安装器配置保持可选署名为空；最终重新读取两种实际 EXE，生成 `latest.yml`（SHA512）和 `SHA256SUMS.txt`；网页 ZIP 也加入 SHA256。
- 不改写 NSIS 生成后的安装器，避免破坏自校验；哈希始终从最终文件生成。
- Windows 工作流通过检查后，将安装包、网页 ZIP、更新清单和报告上传到草稿，最后公开发布。已公开的相同版本拒绝覆盖。
- 未来版本必须继续提供 `latest.yml` 和其所引用的 EXE；仅上传源码或 EXE 不足以支持自动更新。

## 验证边界

自动化检查覆盖比较、重入、进度、下载完成前禁止安装、保存后调用安装、保存失败保护、网络错误、网页未部署提示和最终文件哈希生成。

Windows CI 配置真实安装与本地更新源下载检查：将测试客户端版本模拟为 0.0.0，使用真实 NsisUpdater 下载本次构建的安装包并核对 SHA512。它不等于已验证两次不同公开版本之间的完整自动替换和重新启动；普通 Windows 10/11 的完整升级、UAC、断电恢复，以及 iPhone Safari 实机仍需补充验证。以实际 CI 报告为准。
