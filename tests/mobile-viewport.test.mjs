import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {viewportMetrics,observeViewport} from '../lib/mobile-viewport.mjs';
test('keyboard pan follows visual height and top; blur clears stale iOS offset',()=>{
 const args={height:300,offsetTop:85,innerHeight:780,baseline:780,focused:true,mobile:true};
 assert.deepEqual(viewportMetrics(args),{height:300,top:85,keyboard:true});
 assert.equal(viewportMetrics({...args,focused:false}).top,0);
 assert.equal(viewportMetrics({...args,focused:false}).keyboard,false);
});
test('Android resizing both viewports still detects keyboard from focus baseline',()=>assert.equal(viewportMetrics({height:320,innerHeight:320,baseline:800,focused:true,mobile:true}).keyboard,true));
test('browser chrome, desktop resizing and pinch zoom do not trigger compact keyboard mode',()=>{
 assert.equal(viewportMetrics({height:700,innerHeight:780,baseline:780,focused:true,mobile:true}).keyboard,false);
 assert.equal(viewportMetrics({height:300,innerHeight:780,baseline:780,focused:true,mobile:false}).keyboard,false);
 assert.deepEqual(viewportMetrics({height:300,offsetTop:100,scale:2,innerHeight:780,baseline:780,focused:true,mobile:true}),{height:780,top:0,keyboard:false});
});
test('resize/scroll listeners track a panning keyboard and detach on cleanup',async()=>{
 const dom=new JSDOM('<div class="cm-content" contenteditable="true" tabindex="0"></div>',{pretendToBeVisual:true}),{window:w}=dom;
 Object.defineProperty(w,'innerWidth',{value:390,configurable:true});Object.defineProperty(w,'innerHeight',{value:780,configurable:true});w.matchMedia=()=>({matches:false});
 const vv=new w.EventTarget();Object.assign(vv,{height:780,offsetTop:0,scale:1});Object.defineProperty(w,'visualViewport',{value:vv,configurable:true});
 let refreshed=0;const stop=observeViewport(w,w.document,()=>refreshed++);
 w.document.querySelector('.cm-content').focus();vv.height=300;vv.offsetTop=36;vv.dispatchEvent(new w.Event('resize'));await new Promise(r=>w.requestAnimationFrame(r));
 assert.equal(w.document.documentElement.dataset.keyboard,'open');assert.equal(w.document.documentElement.style.getPropertyValue('--app-top'),'36px');
 vv.offsetTop=92;vv.dispatchEvent(new w.Event('scroll'));await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.document.documentElement.style.getPropertyValue('--app-top'),'92px');
 w.document.activeElement.blur();vv.height=780;vv.dispatchEvent(new w.Event('resize'));await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.document.documentElement.dataset.keyboard,'closed');assert.equal(w.document.documentElement.style.getPropertyValue('--app-top'),'0px');assert.ok(refreshed>=3);
 Object.defineProperty(w,'innerHeight',{value:400,configurable:true});vv.height=400;w.dispatchEvent(new w.Event('orientationchange'));await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.document.documentElement.style.getPropertyValue('--app-height'),'400px');assert.equal(w.document.documentElement.dataset.keyboard,'closed');
 stop();vv.height=200;vv.dispatchEvent(new w.Event('resize'));await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.document.documentElement.style.getPropertyValue('--app-height'),'');dom.window.close();
});
