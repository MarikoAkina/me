// Keep the workbench inside the visible area when a mobile keyboard pans Safari.
export function viewportMetrics({height, offsetTop=0, scale=1, innerHeight, baseline, focused, mobile}) {
  const zoomed=Math.abs(scale-1)>.05;
  const keyboard=mobile&&focused&&!zoomed&&Math.max(innerHeight,baseline)-height>120;
  return {height:zoomed?innerHeight:height,top:keyboard?Math.max(0,offsetTop):0,keyboard};
}

export function observeViewport(win,doc,onResize=()=>{}) {
  const vv=win.visualViewport,root=doc.documentElement;
  let baseline=win.innerHeight,frame=0,settle=0,lastHeight=0;
  const update=()=>{
    frame=0;
    const focused=!!doc.activeElement?.matches('.cm-content,textarea,input:not([type=file])');
    const visible=win.visualViewport;
    const height=visible?.height||win.innerHeight;
    if(!focused)baseline=win.innerHeight;
    const metrics=viewportMetrics({height,offsetTop:visible?.offsetTop,scale:visible?.scale,innerHeight:win.innerHeight,baseline,focused,mobile:win.innerWidth<768||win.matchMedia('(pointer: coarse)').matches});
    root.style.setProperty('--app-height',`${metrics.height}px`);
    root.style.setProperty('--app-top',`${metrics.top}px`);
    root.dataset.keyboard=metrics.keyboard?'open':'closed';
    if(lastHeight!==metrics.height){lastHeight=metrics.height;onResize();}
  };
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update);};
  const focus=()=>{schedule();win.clearTimeout(settle);settle=win.setTimeout(schedule,350);};
  const orientation=()=>{baseline=win.innerHeight;focus();};
  vv?.addEventListener('resize',schedule);vv?.addEventListener('scroll',schedule);
  win.addEventListener('resize',schedule);win.addEventListener('orientationchange',orientation);
  doc.addEventListener('focusin',focus);doc.addEventListener('focusout',focus);update();
  return()=>{win.cancelAnimationFrame(frame);win.clearTimeout(settle);vv?.removeEventListener('resize',schedule);vv?.removeEventListener('scroll',schedule);win.removeEventListener('resize',schedule);win.removeEventListener('orientationchange',orientation);doc.removeEventListener('focusin',focus);doc.removeEventListener('focusout',focus);root.style.removeProperty('--app-height');root.style.removeProperty('--app-top');delete root.dataset.keyboard;};
}
