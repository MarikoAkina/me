import Decimal from 'decimal.js';

export const FUNCTION_ARITIES = Object.freeze({
  ROUND:[1,2], IFNULL:[2,2], CONCAT:[1,Infinity], UPPER:[1,1], LOWER:[1,1],
  IF:[3,3], COALESCE:[1,Infinity], NULLIF:[2,2],
  ABS:[1,1], CEIL:[1,1], CEILING:[1,1], FLOOR:[1,1], MOD:[2,2],
  LENGTH:[1,1], CHAR_LENGTH:[1,1], CHARACTER_LENGTH:[1,1],
  TRIM:[1,1], LTRIM:[1,1], RTRIM:[1,1], LEFT:[2,2], RIGHT:[2,2],
  SUBSTRING:[2,3], SUBSTR:[2,3], REPLACE:[3,3],
  YEAR:[1,1], MONTH:[1,1], DAY:[1,1], DAYOFMONTH:[1,1], QUARTER:[1,1],
  DATE:[1,1], DATEDIFF:[2,2], DATE_FORMAT:[2,2],
});

export const FUNCTION_GROUPS = Object.freeze([
  ['条件与空值','IF、IFNULL、COALESCE、NULLIF；CASE WHEN / CASE 值'],
  ['金额与取整','ROUND、ABS、CEIL / CEILING、FLOOR、MOD'],
  ['文本处理','CONCAT、UPPER、LOWER、LENGTH、CHAR_LENGTH / CHARACTER_LENGTH、TRIM、LTRIM、RTRIM、LEFT、RIGHT、SUBSTRING / SUBSTR、REPLACE'],
  ['日期分析','YEAR、MONTH、DAY / DAYOFMONTH、QUARTER、DATE、DATEDIFF、DATE_FORMAT'],
]);

// Bound generated text before allocation; this is independent of SQL script size.
export const MAX_FUNCTION_TEXT = 200000;
const text = value => Decimal.isDecimal(value) ? value.toFixed() : typeof value==='boolean' ? (value?'1':'0') : String(value);
function number(value,raise){
  try {const n=new Decimal(typeof value==='boolean'?(value?1:0):value);if(n.isFinite())return n;}catch{}
  raise('SIM_TYPE','这个函数需要合法的数字参数。');
}
function bounded(value,raise){if(value.length>MAX_FUNCTION_TEXT)raise('SIM_LIMIT','函数生成的文本超过 200,000 个字符，请缩小输入。');return value;}
function dateParts(value,raise){
  const s=text(value),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  if(m){const [y,mo,d,h,mi,se]=m.slice(1).map(v=>Number(v??0));const ms=Date.UTC(y,mo-1,d,h,mi,se),x=new Date(ms);
    if(y>=1000&&y<=9999&&mo>=1&&mo<=12&&d>=1&&h<24&&mi<60&&se<60&&x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d)return {s,y,mo,d,h,mi,se,day:Date.UTC(y,mo-1,d)};
  }
  raise(1292,'日期函数需要有效的 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss；不支持零日期、时区或微秒。');
}
function formatDate(d,pattern,raise){
  const pad=n=>String(n).padStart(2,'0');
  const codes={Y:String(d.y),y:pad(d.y%100),m:pad(d.mo),c:String(d.mo),d:pad(d.d),e:String(d.d),H:pad(d.h),k:String(d.h),h:pad(d.h%12||12),I:pad(d.h%12||12),l:String(d.h%12||12),i:pad(d.mi),s:pad(d.se),S:pad(d.se),p:d.h<12?'AM':'PM',T:`${pad(d.h)}:${pad(d.mi)}:${pad(d.se)}`,'%':'%'};
  let result='';for(let i=0;i<pattern.length;i++){
    if(pattern[i]!=='%'){result+=pattern[i];continue;}
    const code=pattern[++i];if(code===undefined||!Object.hasOwn(codes,code))raise('SIM_UNSUPPORTED',`DATE_FORMAT 格式 ${code===undefined?'末尾 %':'%'+code} 尚未支持。支持年月日、时分秒、AM/PM 和 %%；详见语法说明。`);
    result+=codes[code];if(result.length>MAX_FUNCTION_TEXT)raise('SIM_LIMIT','日期格式化结果过长。');
  }return bounded(result,raise);
}

// Conditional functions are evaluated lazily in Engine.expr; values here are eager scalars.
export function evaluateScalar(name,values,raise){
  if(values.includes(null))return null;
  if(name==='CONCAT'){
    const parts=values.map(text);if(parts.reduce((n,p)=>n+p.length,0)>MAX_FUNCTION_TEXT)raise('SIM_LIMIT','CONCAT 结果超过 200,000 个字符，请缩小输入。');return parts.join('');
  }
  if(name==='UPPER'||name==='LOWER')return bounded(name==='UPPER'?text(values[0]).toUpperCase():text(values[0]).toLowerCase(),raise);
  if(name==='ROUND'){
    const places=values.length===2?number(values[1],raise):new Decimal(0);
    if(!places.isInteger()||places.abs().gt(30))raise('SIM_RANGE','ROUND 小数位需要为 -30～30 的整数。');
    const n=number(values[0],raise),p=places.toNumber();return p<0?n.div(new Decimal(10).pow(-p)).toDecimalPlaces(0).times(new Decimal(10).pow(-p)):n.toDecimalPlaces(p);
  }
  if(['ABS','CEIL','CEILING','FLOOR'].includes(name)){
    const n=number(values[0],raise);return name==='ABS'?n.abs():name==='FLOOR'?n.floor():n.ceil();
  }
  if(name==='MOD'){const a=number(values[0],raise),b=number(values[1],raise);return b.isZero()?null:a.mod(b);}
  if(['LENGTH','CHAR_LENGTH','CHARACTER_LENGTH'].includes(name))return new Decimal(name==='LENGTH'?new TextEncoder().encode(text(values[0])).length:[...text(values[0])].length);
  if(['TRIM','LTRIM','RTRIM'].includes(name)){
    let s=text(values[0]);if(name!=='RTRIM')s=s.replace(/^ +/,'');if(name!=='LTRIM')s=s.replace(/ +$/,'');return s;
  }
  if(['LEFT','RIGHT','SUBSTRING','SUBSTR'].includes(name)){
    const chars=[...text(values[0])],position=number(values[1],raise).toDecimalPlaces(0);
    if(name==='LEFT'||name==='RIGHT'){
      if(position.lte(0))return '';if(position.gte(chars.length))return chars.join('');const n=position.toNumber();return (name==='LEFT'?chars.slice(0,n):chars.slice(-n)).join('');
    }
    if(position.isZero()||position.abs().gt(chars.length))return '';
    const at=position.isNegative()?chars.length+position.toNumber():position.toNumber()-1;
    if(values.length===2)return chars.slice(at).join('');
    const count=number(values[2],raise).toDecimalPlaces(0);if(count.lte(0))return '';return chars.slice(at,count.gte(chars.length)?undefined:at+count.toNumber()).join('');
  }
  if(name==='REPLACE'){
    const [source,find,replacement]=values.map(text);if(find==='')return source;const parts=source.split(find);
    if(source.length+(parts.length-1)*(replacement.length-find.length)>MAX_FUNCTION_TEXT)raise('SIM_LIMIT','REPLACE 结果超过 200,000 个字符，请缩小输入。');return parts.join(replacement);
  }
  if(name==='DATEDIFF'){const a=dateParts(values[0],raise),b=dateParts(values[1],raise);return new Decimal((a.day-b.day)/86400000);}
  if(['YEAR','MONTH','DAY','DAYOFMONTH','QUARTER','DATE','DATE_FORMAT'].includes(name)){
    const d=dateParts(values[0],raise);
    if(name==='DATE')return d.s.slice(0,10);if(name==='DATE_FORMAT')return formatDate(d,text(values[1]),raise);
    return new Decimal(name==='YEAR'?d.y:name==='MONTH'?d.mo:name==='QUARTER'?Math.ceil(d.mo/3):d.d);
  }
  raise('SIM_UNSUPPORTED',`函数 ${name} 尚未支持。`);
}
