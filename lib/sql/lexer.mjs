// Token-aware splitting: semicolons inside quoted values and comments remain intact.
export function tokens(sql) {
  const out=[];let i=0;
  while(i<sql.length){
    const start=i,c=sql[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==='#'||(c==='-'&&sql[i+1]==='-'&&(/\s/.test(sql[i+2]||' ')))){while(i<sql.length&&sql[i]!=='\n')i++;continue;}
    if(c==='/'&&sql[i+1]==='*'){i+=2;while(i<sql.length&&!(sql[i]==='*'&&sql[i+1]==='/'))i++;i=Math.min(i+2,sql.length);continue;}
    if(c==="'"||c==='"'||c==='`'){
      const quote=c;let value='';i++;let closed=false;
      while(i<sql.length){if(sql[i]==='\\'&&quote!=='`'){value+=sql[i]+(sql[i+1]||'');i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){value+=quote+quote;i+=2;continue;}i++;closed=true;break;}value+=sql[i++];}
      out.push({kind:quote==='`'?'identifier':'string',value:quote==='`'?value.replace(/``/g,'`'):value,raw:sql.slice(start,i),start,end:i,closed});continue;
    }
    const num=sql.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if(num){i+=num[0].length;out.push({kind:'number',value:num[0],raw:num[0],start,end:i});continue;}
    const word=sql.slice(i).match(/^[\p{L}_$][\p{L}\p{N}_$]*/u);
    if(word){i+=word[0].length;out.push({kind:'word',value:word[0],raw:word[0],start,end:i});continue;}
    const op=['>=','<=','<>','!=','||','&&'].find(x=>sql.startsWith(x,i));i+=op?2:1;out.push({kind:'symbol',value:op||c,raw:op||c,start,end:i});
  }return out;
}
export function splitSQL(sql){
 const parts=[];let start=0,i=0,quote=null,line=false,block=false;
 while(i<sql.length){const c=sql[i],n=sql[i+1];
  if(line){if(c==='\n')line=false;i++;continue;}
  if(block){if(c==='*'&&n==='/'){block=false;i+=2;}else i++;continue;}
  if(quote){if(c==='\\'&&quote!=='`'){i+=2;continue;}if(c===quote){if(n===quote){i+=2;continue;}quote=null;}i++;continue;}
  if(c==='#'||(c==='-'&&n==='-'&&/\s/.test(sql[i+2]||' '))){line=true;i+=c==='#'?1:2;continue;}
  if(c==='/'&&n==='*'){block=true;i+=2;continue;}
  if(c==="'"||c==='"'||c==='`'){quote=c;i++;continue;}
  if(c===';'){if(tokens(sql.slice(start,i)).length)parts.push({sql:sql.slice(start,i),start,end:i});start=i+1;}i++;
 }if(tokens(sql.slice(start)).length||quote||block)parts.push({sql:sql.slice(start),start,end:sql.length});return parts;
}
export function position(sql,offset){const prefix=sql.slice(0,offset);return {line:prefix.split('\n').length,column:offset-(prefix.lastIndexOf('\n')+1)+1,offset};}
export function decodeString(s,quote="'"){
 let out='';for(let i=0;i<s.length;i++){const c=s[i];if(c===quote&&s[i+1]===quote){out+=quote;i++;continue;}if(c==='\\'&&i+1<s.length){const n=s[++i];out+=({0:'\0',b:'\b',n:'\n',r:'\r',t:'\t',Z:'\x1a',"'":"'",'"':'"','\\':'\\','%':'\\%','_':'\\_'}[n]??n);}else out+=c;}return out;
}
