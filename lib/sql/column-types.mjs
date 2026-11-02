// Shared field metadata for the executor, schema browser and SQL export.
export const INTEGER_BITS=Object.freeze({TINYINT:8,SMALLINT:16,MEDIUMINT:24,INT:32,BIGINT:64});
export const TEXT_BYTES=Object.freeze({TINYTEXT:255,TEXT:65535,MEDIUMTEXT:16777215,LONGTEXT:4294967295});
export const TYPE_ALIASES=Object.freeze({INTEGER:'INT',BOOL:'TINYINT',BOOLEAN:'TINYINT',DEC:'DECIMAL',FIXED:'DECIMAL',NUMERIC:'DECIMAL'});
export const isIntegerType=c=>Object.hasOwn(INTEGER_BITS,c.type);
export const isNumericType=c=>isIntegerType(c)||c.type==='DECIMAL';
export const isTextType=c=>Object.hasOwn(TEXT_BYTES,c.type);
export const SUPPORTED_COLUMN_TYPES='CHAR(n)、VARCHAR(n)、TINYTEXT、TEXT、MEDIUMTEXT、LONGTEXT、TINYINT、SMALLINT、MEDIUMINT、INT / INTEGER、BIGINT、BOOL / BOOLEAN、DECIMAL / DEC / FIXED / NUMERIC、DATE、DATETIME';
export function columnTypeLabel(c){
 let label=c.type;
 if(c.type==='CHAR'||c.type==='VARCHAR')label+=`(${c.length})`;
 else if(c.type==='DECIMAL')label+=`(${c.precision},${c.scale})`;
 else if(isIntegerType(c)&&c.displayWidth!==undefined)label+=`(${c.displayWidth})`;
 return label+(c.unsigned?' UNSIGNED':'');
}
export function columnTypeError(c){
 if(!isNumericType(c)&&!isTextType(c)&&!['CHAR','VARCHAR','DATE','DATETIME'].includes(c.type))return '未知字段类型。';
 if(c.unsigned!==undefined&&(typeof c.unsigned!=='boolean'||!isNumericType(c)))return 'UNSIGNED 仅适用于数字类型。';
 if(c.displayWidth!==undefined&&(!isIntegerType(c)||!Number.isInteger(c.displayWidth)||c.displayWidth<0||c.displayWidth>255))return '整数显示宽度需要为 0～255；它不限制数值位数。';
 if(c.type==='CHAR'&&(!Number.isInteger(c.length)||c.length<0||c.length>255))return 'CHAR 长度需要为 0～255，省略时为 1。';
 if(c.type==='VARCHAR'&&(!Number.isInteger(c.length)||c.length<1||c.length>65535))return 'VARCHAR 长度需要为 1～65535。';
 if(c.type==='DECIMAL'&&(!Number.isInteger(c.precision)||!Number.isInteger(c.scale)||c.precision<1||c.precision>65||c.scale<0||c.scale>30||c.scale>c.precision))return 'DECIMAL 精度需为 1～65，小数位为 0～30，且不大于精度。';
 return null;
}

// Normalize MySQL type synonyms before AST parsing.
// Adapt only the type token of a column definition, never identifiers or values.
export function columnTypeEdits(ts){
 const edits=new Map(),word=(i,w)=>ts[i]?.kind==='word'&&ts[i].value.toUpperCase()===w;
 const candidate=i=>{const name=ts[i-1],t=ts[i],aliases={BOOL:'BOOLEAN',DEC:'DECIMAL',FIXED:'DECIMAL',REAL:'DOUBLE'};if(name?.kind==='word'&&['CONSTRAINT','PRIMARY','UNIQUE','FOREIGN','CHECK','INDEX','KEY','FULLTEXT','SPATIAL'].includes(name.value.toUpperCase()))return;if(t?.kind==='word'&&Object.hasOwn(aliases,t.value.toUpperCase()))edits.set(t.start,aliases[t.value.toUpperCase()]);};
 if(word(0,'CREATE')&&word(1,'TABLE')){
  let depth=0,start=false;
  for(let i=2;i<ts.length;i++){
   const t=ts[i];if(t.kind!=='symbol')continue;
   if(t.raw==='('){depth++;if(!start){start=true;candidate(i+2);}}
   else if(t.raw===')')depth--;
   else if(t.raw===','&&depth===1)candidate(i+2);
  }
 }else if(word(0,'ALTER')&&word(1,'TABLE')){
  let depth=0;
  for(let i=2;i<ts.length;i++){
   const t=ts[i];if(t.kind==='symbol'){if(t.raw==='(')depth++;if(t.raw===')')depth--;}
   if(depth===0&&(word(i,'ADD')||word(i,'MODIFY'))){const name=i+(word(i+1,'COLUMN')?2:1);if(ts[name]?.kind==='identifier'||ts[name]?.kind==='word')candidate(name+1);}
  }
 }
 return edits;
}
