import { checkRules } from './core.js';

const get = (id) => document.getElementById(id);
const PREVIEW = 100;
const workflow = get('workflow');
let generation = 0;
let ruleGeneration = 0;
let report = null;
let activeWorker = null;

const delimiter = () => get('delimiter').value === 'tab' ? '\t' : get('delimiter').value;
const names = (value) => value.split(/\r?\n/).filter(line => line.trim() !== '');
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function shapeRules(rules) {
  if (!plain(rules) || rules.version !== 1 ||
      !Array.isArray(rules.key) || !Array.isArray(rules.required) || !plain(rules.columns) ||
      ![...rules.key, ...rules.required].every(value => typeof value === 'string' && value.trim() && !/[\r\n]/.test(value))) {
    throw new Error('Expected a version 1 rules file with key and required arrays of column names, and a columns object.');
  }
  if (rules.compare !== undefined && (!Array.isArray(rules.compare) || rules.compare.some(value => typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)))) throw new Error('Comparison columns must be exact single-line column names.');
  checkRules(rules, [...new Set([...rules.key, ...rules.required, ...Object.keys(rules.columns), ...(rules.compare || [])])]);
  return rules;
}

function rulesFromForm() {
  let columns;
  try { columns = JSON.parse(get('columns').value); }
  catch { throw new Error('Column rules must be valid JSON. Check the quotes, commas, and braces.'); }
  const compare = names(get('compare').value);
  return shapeRules({version: 1, key: names(get('key').value), required: names(get('required').value), columns, ...(compare.length ? {compare} : {})});
}

function invalidate() {
  if (activeWorker) { activeWorker.terminate(); activeWorker = null; }
  get('headers-info').hidden = true;
  generation++;
  report = null;
  get('results').hidden = true;
  get('report').replaceChildren();
  get('error').hidden = true;
  get('run').disabled = false;
  get('run').textContent = 'Run preflight';
}

function showError(message) {
  get('error').textContent = message;
  get('error').hidden = false;
}

function fileInfo() {
  get('headers-info').hidden = true;
  get('headers-info').textContent = '';
  const current = get('current').files[0];
  const baseline = get('baseline').files[0];
  get('clear-baseline').disabled = !baseline;
  get('file-info').textContent = current || baseline ?
    [current && ('Current: ' + current.name), baseline && ('Baseline: ' + baseline.name)].filter(Boolean).join(' · ') :
    'Choose UTF-8 files up to 20 MiB each.';
}

function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function element(tag, value, cls) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (cls) node.className = cls;
  return node;
}

function section(parent, heading, description) {
  const target = element('section', undefined, 'result-section');
  target.append(element('h3', heading));
  if (description) target.append(element('p', description));
  parent.append(target);
  return target;
}

function table(parent, columns, rows, total = rows.length) {
  const wrap = element('div', undefined, 'table-wrap');
  wrap.tabIndex = 0;
  wrap.setAttribute('aria-label', 'Scrollable results table');
  const grid = element('table');
  const head = element('thead');
  const hr = element('tr');
  for (const column of columns) {
    const th = element('th', column);
    th.scope = 'col';
    hr.append(th);
  }
  head.append(hr);
  const body = element('tbody');
  for (const row of rows.slice(0, PREVIEW)) {
    const tr = element('tr');
    for (const value of row) tr.append(element('td', value ?? ''));
    body.append(tr);
  }
  grid.append(head, body);
  wrap.append(grid);
  parent.append(wrap);
  if (total > PREVIEW) parent.append(element('p', 'Showing the first ' + PREVIEW + ' of ' + total + '. Download the report for all entries.', 'hint'));
}

function issues(parent, entries, includeSide = false) {
  const columns = [...(includeSide ? ['File'] : []), 'Line', 'Column', 'What to fix'];
  table(parent, columns, entries.slice(0, PREVIEW).map(entry => [
    ...(includeSide ? [entry.source ?? entry.side ?? entry.file ?? ''] : []),
    entry.line ?? '—', entry.column ?? '—', entry.message
  ]), entries.length);
}

function keyLabel(key) {
  return typeof key === 'string' ? key : JSON.stringify(key);
}

function render() {
  const target = get('report');
  target.replaceChildren();
  const check = report.validation;
  get('results-title').textContent = !check.pass ? 'Needs attention' : report.comparison && !report.comparison.comparable ? 'Validation passed; comparison blocked' : 'Passed validation';
  const validation = section(target, 'Current export',
    report.files.current + ' · ' + check.rowCount + ' data rows · ' + check.issues.length + ' issues');
  validation.append(element('span', check.pass ? 'PASS' : 'FAIL', 'badge strong-badge'));
  if (check.issues.length) issues(validation, check.issues);
  else validation.append(element('p', report.rules.key.length || report.rules.required.length || Object.keys(report.rules.columns).length ? 'No issues found by the selected checks.' : 'CSV structure is valid. No row rules were selected.'));
  if (report.comparison === null) {
    section(target, 'Comparison', 'No baseline selected.');
    return;
  }
  const diff = report.comparison;
  section(target, 'Comparison scope', report.rules.compare ? 'Changed values checked only in: ' + report.rules.compare.join(', ') + '. Unchanged means unchanged within this scope. Added/removed rows and schema checks still apply.' : 'All columns compared.');
  if (!diff.comparable) {
    const blocked = section(target, 'Comparison unavailable', 'Fix the key or schema issues below and run the check again. No row changes are reported until matching is reliable.');
    if (diff.issues?.length) issues(blocked, diff.issues, true);
    return;
  }
  const compare = section(target, 'Changes from baseline',
    report.files.baseline + ' · ' + diff.added.length + ' added · ' + diff.removed.length + ' removed · ' +
    diff.changed.length + ' changed · ' + diff.unchanged + ' unchanged');
  if (diff.issues?.length) issues(compare, diff.issues, true);
  for (const [label, keys] of [['Added keys', diff.added], ['Removed keys', diff.removed]]) {
    if (!keys.length) continue;
    const part = section(compare, label);
    table(part, ['Key'], keys.slice(0, PREVIEW).map(key => [keyLabel(key)]), keys.length);
  }
  if (diff.changed.length) {
    const part = section(compare, 'Changed values');
    const rows = [];
    let total = 0;
    for (const {key, fields} of diff.changed) {
      total += fields.length;
      for (const field of fields) {
        if (rows.length === PREVIEW) break;
        rows.push([keyLabel(key), field.column, field.before, field.after]);
      }
    }
    table(part, ['Key', 'Column', 'Before', 'After'], rows, total);
  }
}

function runWorker(input) {
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});
    activeWorker = worker;
    worker.onmessage = ({data}) => { worker.terminate(); if(activeWorker === worker) activeWorker = null; data.error ? reject(new Error(data.error)) : resolve(data); };
    worker.onerror = () => { worker.terminate(); if(activeWorker === worker) activeWorker = null; reject(new Error('The local processing worker failed. Try a smaller file or reload the page.')); };
    worker.postMessage(input);
  });
}

workflow.addEventListener('submit', async event => {
  event.preventDefault();
  invalidate();
  const thisRun = generation;
  const currentFile = get('current').files[0];
  const baselineFile = get('baseline').files[0];
  if (!currentFile) return showError('Choose a current CSV first.');
  get('run').disabled = true;
  get('run').textContent = 'Checking…';
  try {
    const rules = rulesFromForm();
    const separator = delimiter();
    const output = await runWorker({currentFile,baselineFile,rules,separator});
    if (thisRun !== generation) return;
    report = output.report;
    get('headers-info').textContent = 'Current columns: ' + output.headers.join(' · ');
    get('headers-info').hidden = false;
    render();
    get('results').hidden = false;
    get('results').focus();
  } catch (error) {
    if (thisRun === generation) {
      report = null;
      showError(error.message);
    }
  } finally {
    if (thisRun === generation) {
      get('run').disabled = false;
      get('run').textContent = 'Run preflight';
    }
  }
});

for (const id of ['current', 'baseline', 'delimiter']) {
  get(id).addEventListener('change', () => { invalidate(); fileInfo(); });
}
for (const id of ['key', 'required', 'columns', 'compare']) {
  get(id).addEventListener('input', () => { ruleGeneration++; invalidate(); get('rules-info').textContent = ''; });
}
get('clear-baseline').addEventListener('click', () => {
  get('baseline').value = '';
  invalidate();
  fileInfo();
});
get('clear-workspace').addEventListener('click', () => {
  ruleGeneration++;
  workflow.reset();
  invalidate();
  get('rules-info').textContent = '';
  get('advanced').open = false;
  fileInfo();
  get('current').focus();
});
get('rules-file').addEventListener('change', async () => {
  const file = get('rules-file').files[0];
  if (!file) return;
  const thisImport = ++ruleGeneration;
  invalidate();
  get('rules-file').value = '';
  try {
    if (file.size > 256 * 1024) throw new Error('Rules files must be 256 KiB or smaller.');
    const imported = shapeRules(JSON.parse(await file.text()));
    if (thisImport !== ruleGeneration) return;
    get('key').value = imported.key.join('\n');
    get('required').value = imported.required.join('\n');
    get('compare').value = (imported.compare || []).join('\n');
    get('columns').value = JSON.stringify(imported.columns, null, 2);
    invalidate();
    get('rules-info').textContent = 'Loaded rules from ' + file.name + '.';
  } catch (error) {
    if (thisImport === ruleGeneration) showError('Rules file: ' + error.message);
  }
});
get('export-rules').addEventListener('click', () => {
  get('error').hidden = true;
  try { download(rulesFromForm(), 'import-check-rules.json'); }
  catch (error) { showError(error.message); }
});
get('download-report').addEventListener('click', () => {
  if (report) download(report, 'import-check-report.json');
});
fileInfo();
