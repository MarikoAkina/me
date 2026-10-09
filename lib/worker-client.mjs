export class WorkerClient {
 constructor(){this.id=0;this.pending=new Map();this.spawn();}
 spawn(){this.worker=new Worker(new URL('./sql/worker.mjs',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;if(data.progress){clearTimeout(p.timer);p.timer=setTimeout(()=>this.timeout(data.id),7000);p.progress?.(data.result);return;}clearTimeout(p.timer);this.pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);};this.worker.onerror=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('执行引擎启动失败，请刷新后重试。'));}this.pending.clear();};}
 timeout(id){const p=this.pending.get(id);if(!p)return;this.worker.terminate();for(const q of this.pending.values()){clearTimeout(q.timer);q.reject(new Error('执行超时，已停止当前语句。已完成的语句仍保留；请简化查询或缩小范围。'));}this.pending.clear();this.spawn();}
 run(action,payload,progress){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.timeout(id),7000);this.pending.set(id,{resolve,reject,timer,progress});this.worker.postMessage({id,action,...payload});});}
 destroy(){this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('执行已关闭。'));}this.pending.clear();}
}
