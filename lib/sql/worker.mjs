import {Engine,validateState,exportSQL} from './engine.mjs';
import {splitSQL,position} from './lexer.mjs';
import {gradeLesson} from './lessons.mjs';
self.onmessage=async({data})=>{const {id,action,state,sql,lesson}=data;try{
 if(action==='grade'){self.postMessage({id,done:true,result:gradeLesson(lesson,sql)});return;}
 if(action==='validate'){self.postMessage({id,done:true,result:validateState(state)});return;}
 if(action==='export'){self.postMessage({id,done:true,result:exportSQL(state)});return;}
 const e=new Engine(state);const parts=splitSQL(sql);if(sql.length>200000||parts.length>100){self.postMessage({id,done:true,result:e.executeScript(sql)});return;}
 const logs=[];for(let i=0;i<parts.length;i++){const part=parts[i],r=e.executeScript(part.sql),l=r.logs[0];if(l){l.index=i+1;l.start=part.start;if(l.error)Object.assign(l.error,position(sql,part.start+l.error.offset));logs.push(l);}if(action!=='import')self.postMessage({id,progress:true,result:{state:r.state,logs:[...logs]}});if(l&&!l.success)break;await new Promise(resolve=>setTimeout(resolve,0));}
 const failed=logs.some(l=>!l.success);self.postMessage({id,done:true,result:{state:action==='import'&&failed?state:e.state,logs,rolledBack:action==='import'&&failed}});
 }catch(e){self.postMessage({id,done:true,error:{message:e.message,code:e.code||'SIM_WORKER'}});}};
