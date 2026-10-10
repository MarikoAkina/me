import {Download, ExternalLink} from 'lucide-react';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {windowsRelease} from '@/lib/release.mjs';

export default function WindowsDownload({open, onOpenChange}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="windows-download-dialog">
      <DialogTitle>SQL LAB · Windows 桌面版</DialogTitle>
      <DialogDescription>Windows 10 / 11 · 64 位 x64 · v{windowsRelease.version}</DialogDescription>
      <p>安装后即可离线练习，无需安装 MySQL、Node.js 或登录账号。</p>
      <a className="windows-install-link" href={windowsRelease.installer} target="_blank" rel="noreferrer"><Download size={19}/>下载安装程序 .exe</a>
      <ol><li>在 Windows 电脑下载并打开安装程序。</li><li>选择安装位置，完成后从桌面或开始菜单打开 SQL LAB。</li><li>执行 <code>SELECT * FROM customers;</code>，开始练习。</li></ol>
      <p>桌面版与网页版分别保存数据。在原工作台导出“完整 JSON 备份”，再在新工作台恢复，即可迁移数据库、草稿与学习进度。</p>
      <p className="installer-note">安装包未带发布者数字证书，Windows 可能提示“未知发布者”。下载页提供校验文件，可核对 SHA256。</p>
      <div className="installer-links"><a href={windowsRelease.page} target="_blank" rel="noreferrer">版本与测试记录 <ExternalLink size={13}/></a><a href={windowsRelease.checksums} target="_blank" rel="noreferrer">SHA256 校验文件</a></div>
    </DialogContent>
  </Dialog>;
}
