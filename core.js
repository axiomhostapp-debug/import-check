/** Strict CSV parsing and explicit, reusable pre-import rules. No network or storage. */
export function parseCSV(text, delimiter = ',') {
  if (typeof text !== 'string') throw new Error('CSV input must be text.');
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('Choose comma, semicolon or tab delimiter.');
  text = text.replace(/^\uFEFF/, '');
  if (text.length > 20 * 1024 * 1024) throw new Error('CSV exceeds the 20 MiB text limit.');
  const records = []; let cells = [], cell = '', state = 'start', line = 1, start = 1, touched = false;
  const pushCell = () => { cells.push(cell); cell = ''; state = 'start'; };
  const pushRow = () => { pushCell(); records.push({line:start,cells}); cells=[]; touched=false; };
  for (let i=0;i<text.length;i++) {
    const c=text[i]; touched=true;
    if(state==='quoted') {
      if(c==='"') { if(text[i+1]==='"'){cell+='"';i++;} else state='closed'; }
      else {cell+=c;if(c==='\n'||(c==='\r'&&text[i+1]!=='\n')) line++;}
    } else if(c===delimiter) pushCell();
    else if(c==='\r'||c==='\n') {
      pushRow(); if(c==='\r'&&text[i+1]==='\n')i++; line++;start=line;
    } else if(state==='closed') throw new Error(`Line ${line}: unexpected text after closing quote.`);
    else if(c==='"') {if(state!=='start')throw new Error(`Line ${line}: quote inside unquoted field.`);state='quoted';}
    else {cell+=c;state='plain';}
    if(records.length>200001)throw new Error('CSV exceeds the 200,000 data-row limit.');
  }
  if(state==='quoted')throw new Error(`Line ${start}: unterminated quoted field.`);
  if(touched||cells.length||cell)pushRow();
  if(!records.length)throw new Error('CSV is empty.');
  const headers=records.shift().cells;
  if(headers.some(h=>!h.trim()))throw new Error('Every header must have a name.');
  if(new Set(headers).size!==headers.length)throw new Error('Duplicate column headers are ambiguous. Rename them before import.');
  const rows=records.map(record=>{
    if(record.cells.length!==headers.length)throw new Error(`Line ${record.line}: expected ${headers.length} columns, found ${record.cells.length}. Check the delimiter or missing cells.`);
    const values=Object.create(null);headers.forEach((h,i)=>values[h]=record.cells[i]);return {line:record.line,values};
  });
  if(rows.length>200000)throw new Error('CSV exceeds the 200,000 data-row limit.');
  return {headers,rows};
}
const DATE_FORMATS=['YYYY-MM-DD','M/D/YYYY'];
function calendarDate(value,format){
  if(format==='YYYY-MM-DD'){
    const d=new Date(value+'T00:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
  }
  const parts=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if(!parts||parts[0]!==value)return false;
  const [month,day,year]=parts.slice(1).map(Number);
  if(year===0||month<1||month>12||day<1)return false;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
function issue(line,column,code,message){return {line,column,code,message};}
export function checkRules(rules, headers) {
  if(!rules||typeof rules!=='object'||Array.isArray(rules)||rules.version!==1)throw new Error('Rules must be an object with version: 1.');
  for(const k of Object.keys(rules))if(!['version','key','required','columns','compare'].includes(k))throw new Error(`Unknown rule setting: ${k}.`);
  for(const key of ['key','required']) {
    if(!Array.isArray(rules[key])||rules[key].some(c=>typeof c!=='string')||new Set(rules[key]).size!==rules[key].length)throw new Error(`${key} must be an array of distinct column names.`);
  }
  if(!rules.columns||typeof rules.columns!=='object'||Array.isArray(rules.columns))throw new Error('columns must be an object.');
  if(rules.compare!==undefined&&(!Array.isArray(rules.compare)||!rules.compare.length||rules.compare.some(c=>typeof c!=='string')||new Set(rules.compare).size!==rules.compare.length))throw new Error('compare must be a nonempty array of distinct column names, or omitted for all columns.');
  const referenced=new Set([...rules.key,...rules.required,...Object.keys(rules.columns),...(rules.compare||[])]);
  const missing=[...referenced].filter(c=>!headers.includes(c));
  if(missing.length)throw new Error(`Rules reference missing columns: ${missing.join(', ')}.`);
  for(const [column,r] of Object.entries(rules.columns)){
    if(!r||typeof r!=='object'||Array.isArray(r))throw new Error(`Invalid rule for ${column}.`);
    for(const k of Object.keys(r))if(!['type','min','max','enum','formats','unique'].includes(k))throw new Error(`Unknown ${column} rule: ${k}.`);
    if(!['string','number','integer','date'].includes(r.type))throw new Error(`Choose string, number, integer or date for ${column}.`);
    if(r.unique!==undefined&&typeof r.unique!=='boolean')throw new Error(`${column}: unique must be true or false.`);
    if(r.formats!==undefined&&(r.type!=='date'||!Array.isArray(r.formats)||!r.formats.length||r.formats.some(f=>!DATE_FORMATS.includes(f))||new Set(r.formats).size!==r.formats.length))throw new Error(`${column}: formats requires a date rule and a nonempty list of distinct formats: YYYY-MM-DD or M/D/YYYY.`);
    for(const k of ['min','max'])if(r[k]!==undefined&&(!['number','integer'].includes(r.type)||typeof r[k]!=='number'||!Number.isFinite(r[k])))throw new Error(`${column}: ${k} requires a finite numeric bound and numeric type.`);
    if(r.min!==undefined&&r.max!==undefined&&r.min>r.max)throw new Error(`${column}: min exceeds max.`);
    if(r.enum!==undefined&&(!Array.isArray(r.enum)||r.enum.length===0||r.enum.some(v=>typeof v!=='string')))throw new Error(`${column}: enum must contain strings.`);
  }
}
function keyIndex(table, rules) {
  const map=new Map(),issues=[];
  for(const row of table.rows){
    if(rules.key.some(c=>!row.values[c].trim())){issues.push(issue(row.line,rules.key.join(', '),'missing_key','Fill every key field; this row cannot be matched.'));continue;}
    const key=JSON.stringify(rules.key.map(c=>row.values[c]));
    if(map.has(key)){issues.push(issue(row.line,rules.key.join(', '),'duplicate_key',`Duplicate key ${key}; first seen on line ${map.get(key).line}.`));}
    else map.set(key,row);
  }
  return {map,issues};
}
export function validate(table,rules) {
  checkRules(rules,table.headers);const issues=[];
  const seen=new Map(Object.entries(rules.columns).filter(([,r])=>r.unique).map(([column])=>[column,new Map()]));
  if(rules.key.length)issues.push(...keyIndex(table,rules).issues);
  for(const row of table.rows){
    for(const column of rules.required)if(!row.values[column].trim())issues.push(issue(row.line,column,'required','A value is required.'));
    for(const [column,r] of Object.entries(rules.columns)){
      const value=row.values[column];if(!value.trim())continue;
      if(seen.has(column)){
        const index=seen.get(column);
        if(index.has(value))issues.push(issue(row.line,column,'duplicate_value',`Duplicate value ${JSON.stringify(value)}; first seen on line ${index.get(value)}.`));
        else index.set(value,row.line);
      }
      let valid=true;
      if(r.type==='number'||r.type==='integer'){
        valid=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value));
        if(r.type==='integer')valid=valid&&Number.isSafeInteger(Number(value));
        if(!valid)issues.push(issue(row.line,column,'type',`Expected a finite ${r.type}${r.type==='integer'?' within JavaScript safe integer range':''}; found ${JSON.stringify(value)}.`));
        else for(const bound of ['min','max'])if(r[bound]!==undefined&&(bound==='min'?Number(value)<r[bound]:Number(value)>r[bound]))issues.push(issue(row.line,column,'range',`Value must be ${bound==='min'?'at least':'at most'} ${r[bound]}.`));
      }
      if(r.type==='date'){
        const formats=r.formats??['YYYY-MM-DD'];
        if(!formats.some(f=>calendarDate(value,f)))issues.push(issue(row.line,column,'type',`Expected a real calendar date in ${formats.join(' or ')} format.`));
      }
      if(r.enum&&!r.enum.includes(value))issues.push(issue(row.line,column,'enum',`Choose one of: ${r.enum.join(', ')}.`));
    }
  }
  return {pass:issues.length===0,issues,rowCount:table.rows.length};
}
export function diffTables(baseline,current,rules){
  checkRules(rules,baseline.headers);checkRules(rules,current.headers);
  const scope=rules.compare||current.headers;
  const empty={comparable:false,issues:[],added:[],removed:[],changed:[],unchanged:0,comparedColumns:[...scope],comparisonScope:rules.compare?'selected':'all'};
  if(!rules.key.length)return {...empty,issues:[issue(null,'','key_required','Choose one or more key columns to compare exports.')]};
  if(baseline.headers.length!==current.headers.length||baseline.headers.some(h=>!current.headers.includes(h)))return {...empty,issues:[issue(null,'','schema_change','Column sets differ. Align export schemas before comparison.')]};
  const a=keyIndex(baseline,rules),b=keyIndex(current,rules);
  const issues=[...a.issues.map(i=>({...i,source:'baseline'})),...b.issues.map(i=>({...i,source:'current'}))];
  if(issues.length)return {...empty,issues};
  const result={...empty,comparable:true,issues};
  for(const [key,row] of b.map){
    if(!a.map.has(key)){result.added.push(key);continue;}
    const before=a.map.get(key);const fields=scope.filter(c=>row.values[c]!==before.values[c]).map(column=>({column,before:before.values[column],after:row.values[column]}));
    if(fields.length)result.changed.push({key,fields});else result.unchanged++;
  }
  for(const key of a.map.keys())if(!b.map.has(key))result.removed.push(key);
  return result;
}
