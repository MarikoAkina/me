import {useCallback, useEffect, useRef, useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {windowsRelease} from '@/lib/release.mjs';
import {checkWebUpdates, saveAndApplyUpdate} from '@/lib/updates.mjs';

export default function CheckUpdates({busy, save}) {
  const [open, setOpen] = useState(false), [state, setState] = useState({phase: 'idle', message: '检查 GitHub 最新正式版本。'});
  const api = window.sqlLabUpdates, applying = useRef(false), checking = useRef(false);
  const current = state.currentVersion || windowsRelease.version;
  const apply = useCallback(async () => {
    if (busy || applying.current) return;
    applying.current = true;
    try {
      await saveAndApplyUpdate({save, apply: () => {
        if (api) return api.install();
        const url = new URL(window.location.href);
        url.searchParams.set('sql_lab_update', state.version);
        window.location.replace(url.href);
      }});
    } catch {
      applying.current = false;
      setState(s => ({...s, phase: 'save-failed', message: '更新已就绪，但保存或安装未成功。未主动关闭工作台，请先导出完整备份，再重试。'}));
    }
  }, [api, busy, save, state.version]);
  useEffect(() => {
    if (state.phase === 'ready' && !busy) void apply();
  }, [state.phase, busy, apply]);
  const check = useCallback(async () => {
    if (busy || checking.current) return;
    setOpen(true);
    if (['ready', 'save-failed'].includes(state.phase)) {void apply(); return;}
    checking.current = true;
    setState(s => ({...s, phase: 'checking', message: '正在检查更新…'}));
    try {
      await save();
      const result = api ? await api.check() : await checkWebUpdates({current: windowsRelease.version, pageURL: window.location.href});
      setState(result);
    } catch (error) {setState(s => ({...s, phase: 'error', message: error.message || '无法检查更新，请稍后重试。'}));}
    finally {checking.current = false;}
  }, [api, busy, save, state.phase, apply]);
  const latest = useRef(check); latest.current = check;
  useEffect(() => {
    if (!api) return;
    let live = true;
    void api.getState().then(value => {if (live) setState(value);}).catch(() => {});
    const off = api.subscribe(value => {setState(value); if (value.phase === 'ready') setOpen(true);});
    const offMenu = api.onCheckRequested(() => latest.current());
    return () => {live = false; off(); offMenu();};
  }, [api]);
  const active = ['checking', 'available', 'downloading', 'installing'].includes(state.phase);
  return <>
    <button className="check-updates-button" aria-label="检查更新" title="检查更新" disabled={busy || active} onClick={check}><RefreshCw size={17}/><span>检查更新</span></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="update-dialog">
      <DialogTitle>检查更新</DialogTitle><DialogDescription>当前版本 {current} · {api ? 'Windows 桌面版' : '网页试用版'}</DialogDescription>
      <p className="update-status" role="status" aria-live="polite">{state.message}</p>
      {state.phase === 'downloading' && <><progress max="100" value={state.percent} aria-label="更新下载进度"/><span>{Math.floor(state.percent)}%</span></>}
      <p>{api ? '发现更高的正式版本后自动下载，校验安装包，保存当前工作台，再退出并安装。系统权限提示仍需你处理。' : '本站部署新版后会保存工作台并重新加载。GitHub 发布版本不会自动替换服务器上的网页。'}</p>
      {busy && state.phase === 'ready' && <p>等待 SQL 执行完成后继续更新。</p>}
      <div className="update-actions"><button disabled={busy || active} onClick={check}>{state.phase === 'save-failed' ? '重试保存并更新' : '再次检查'}</button><a href="https://github.com/MarikoAkina/sql-lab/releases/latest" target="_blank" rel="noreferrer">查看 GitHub 发布页</a></div>
    </DialogContent></Dialog>
  </>;
}
