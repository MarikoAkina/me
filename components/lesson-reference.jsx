"use client";
import {columnTypeLabel} from '@/lib/sql/column-types.mjs';
const text=v=>v===null?'NULL':v&&typeof v==='object'&&'decimal' in v?v.decimal:String(v);
const type=columnTypeLabel;

function DataGrid({columns,rows,label}){
 return <div className="lesson-table-scroll" tabIndex={0} role="region" aria-label={label}><table className="lesson-data-grid"><caption>{label} · {rows.length} 行</caption><thead><tr>{columns.map((c,i)=><th key={i} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j} className={v===null?'lesson-null':''}>{v===null?<em>NULL</em>:v===''?<span className="empty-cell">空字符串</span>:text(v)}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="lesson-empty">0 行，表中没有记录。</p>}</div>;
}
function Schema({table}){
 return <details className="lesson-schema"><summary>表结构 · {table.name}</summary><div className="lesson-table-scroll"><table className="lesson-structure"><thead><tr><th>字段</th><th>类型与约束</th></tr></thead><tbody>{table.columns.map(c=><tr key={c.name}><td><code>{c.name}</code></td><td>{type(c)}{c.primary?' · PK':''}{c.notNull?' · NOT NULL':''}{c.unique?' · UNIQUE':''}{c.auto?' · AUTO_INCREMENT':''}{c.hasDefault?` · DEFAULT ${text(c.default)}`:''}</td></tr>)}</tbody></table></div></details>;
}
export default function LessonReference({lesson,preview,error}){
 if(error)return <p className="lesson-reference-error" role="alert">示例暂时无法加载：{error}。请重新选择本题。</p>;
 if(!preview)return <p className="lesson-loading" role="status">正在准备示例表和预期结果…</p>;
 return <div className="lesson-reference"><section aria-label="本题示例数据"><h3>示例数据</h3><p className="reference-note">以下为本题开始时的数据，批改始终使用这份独立副本。</p>{preview.sourceTables.length?preview.sourceTables.map(table=><div className="lesson-source" key={table.name}><h4>{lesson.db}.{table.name}</h4><DataGrid columns={table.columns.map(c=>c.name)} rows={table.rows.map(row=>table.columns.map(c=>row[c.name]))} label={`${table.name} 示例数据`}/><Schema table={table}/></div>):<p className="lesson-empty">{lesson.write?'本题创建新表，无需已有数据表。':'本题只计算常量表达式，无需读取数据表。'}</p>}</section><section className="lesson-expected" aria-label="预期输出"><h3>{lesson.write?'预期操作结果':'预期输出'}</h3><p className="reference-note">{lesson.write?'执行成功后，下列表的数据或结构应变为这样；其他表保持原样。':lesson.ordered?'本题要求排序；列的先后与行的顺序均参与批改。':'列的先后参与批改；行的顺序不限，重复行数量与 NULL 必须一致。'}{!lesson.write&&' 结果列别名不限。'}</p>{preview.result&&<DataGrid {...preview.result} label="预期查询结果"/>}{preview.changes.map(change=><div className="lesson-change" key={change.name}><h4>{change.name} · {change.removed?'已删除':change.created?'新建表':'修改后'}</h4>{!change.removed&&<><DataGrid columns={change.table.columns.map(c=>c.name)} rows={change.table.rows.map(row=>change.table.columns.map(c=>row[c.name]))} label={`${change.name} 预期数据`}/><Schema table={change.table}/></>}</div>)}{lesson.write&&<p className="reference-note">{preview.affected} 行受影响。建表和改表的 0 行表示未直接增删数据。</p>}</section></div>;
}
