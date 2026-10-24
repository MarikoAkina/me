import React,{useState,useEffect,useRef,useCallback} from 'react';

// Development-only viewport fixture. Production builds render the application directly.
export default function LayoutReview(){
  const [width,setWidth]=useState(1280),[metrics,setMetrics]=useState(null),frame=useRef(null);
  const measure=useCallback(()=>{const f=frame.current,d=f?.contentDocument;if(!d?.querySelector('.app'))return;const editor=d.querySelector('.code-editor'),grid=d.querySelector('.grid-scroll');setMetrics({viewport:f.contentWindow.innerWidth,page:d.documentElement.scrollWidth,editor:Math.round(editor?.getBoundingClientRect().height||0),result:Math.round(grid?.getBoundingClientRect().height||0),gridWidth:grid?.clientWidth||0,gridScrollWidth:grid?.scrollWidth||0});},[]);
  useEffect(()=>{const timer=setInterval(measure,500);measure();return()=>clearInterval(timer);},[width,measure]);
  return <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#e5e7eb',color:'#28313d',overflow:'auto'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 12px',flexShrink:0,background:'#fff',borderBottom:'1px solid #dce0e5',minWidth:650}}>
      <strong style={{fontSize:13,marginRight:12}}>布局检查</strong>
      {[375,390,430,768,1280].map(w=><button key={w} aria-pressed={width===w} onClick={()=>setWidth(w)} style={{minHeight:36,fontSize:12,padding:'4px 10px',background:width===w?'#edf3fa':'#fff'}}>{w}px</button>)}
      <button onClick={measure} style={{minHeight:36,fontSize:12,padding:'4px 10px'}}>测量布局</button>
      <output data-testid="layout-metrics" style={{fontSize:12,marginLeft:'auto'}}>{metrics?JSON.stringify(metrics):'测量中'}</output>
    </div>
    <div style={{flex:1,minHeight:0,overflow:'auto',display:'flex',alignItems:'flex-start',justifyContent:width<1000?'center':'flex-start'}}>
      <iframe ref={frame} title="SQL Lab 预览视口" src="/?app" style={{width,height:'100%',minHeight:640,flexShrink:0,border:0,background:'#fff'}}/>
    </div>
  </div>;
}
