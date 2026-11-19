import { checkRules } from './core.js';

const get = (id) => document.getElementById(id);
const PREVIEW = 100;
const workflow = get('workflow');
let generation = 0;
let ruleGeneration = 0;
let report = null;
let activeWorker = null;
let headerWorker = null;
let pickerHeaders = [];
let exactMode = false;
const headerFields = ['key', 'required', 'compare'];
const hasLineBreak = value => /[\r\n]/.test(value);
const displayHeader = value => JSON.stringify(value);

const delimiter = () => get('delimiter').value === 'tab' ? '\t' : get('delimiter').value;
const names = (value) => value.split(/\r?\n/).filter(line => line.trim() !== '');
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function shapeRules(rules) {
  if (!plain(rules) || rules.version !== 1 ||
      !Array.isArray(rules.key) || !Array.isArray(rules.required) || !plain(rules.columns) ||
      ![...rules.key, ...rules.required].every(value => typeof value === 'string' && value.trim())) {
    throw new Error('Expected a version 1 rules file with key and required arrays of column names, and a columns object.');
  }
  if (rules.compare !== undefined && (!Array.isArray(rules.compare) || rules.compare.some(value => typeof value !== 'string' || !value.trim()))) throw new Error('Comparison columns must be exact column names.');
  checkRules(rules, [...new Set([...rules.key, ...rules.required, ...Object.keys(rules.columns), ...(rules.compare || [])])]);
  return rules;
}

function fieldNames(id) {
  const value = get(id).value;
  if (!exactMode) return names(value);
  if (!value.trim()) return [];
  try {
    const list = JSON.parse(value);
    if (Array.isArray(list) && list.every(name => typeof name === 'string' && name.trim())) return list;
  } catch { /* Include the field name in the error below. */ }
  throw new Error(id + ' must be a JSON array of exact column names.');
}

function setNames(values, exact) {
  exactMode = exact;
  get('exact-names').checked = exact;
  for (const id of headerFields) {
    get(id).value = exact ? JSON.stringify(values[id]) : values[id].join('\n');
    get(id).placeholder = exact ? '[]' : {key: 'SKU', required: 'Quantity', compare: 'Unit Price'}[id];
    get(id + '-format').textContent = exact ?
      (id === 'compare' ? 'JSON array. Leave empty to compare every column.' : 'JSON array of exact column names') :
      (id === 'compare' ? 'Optional. One exact column name per line; blank compares every column.' : 'One column name per line');
  }
}

function updateRules() {
  ruleGeneration++;
  invalidate();
  get('rules-info').textContent = '';
}

function loadHeaders() {
  if (headerWorker) { headerWorker.terminate(); headerWorker = null; }
  pickerHeaders = [];
  const select = get('header-column');
  select.replaceChildren();
  select.disabled = true;
  for (const id of headerFields) get('add-' + id).disabled = true;
  const status = get('header-status');
  const currentFile = get('current').files[0];
  if (!currentFile) {
    status.textContent = 'Choose a current CSV to list its headers.';
    return;
  }
  status.textContent = 'Reading current CSV headers…';
  try {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});
    headerWorker = worker;
    const finish = (data) => {
      if (headerWorker !== worker) return;
      worker.terminate();
      headerWorker = null;
      if (data.error) {
        status.textContent = data.error;
        return;
      }
      pickerHeaders = data.headers;
      pickerHeaders.forEach((header, index) => {
        const option = element('option', displayHeader(header));
        option.value = String(index);
        select.append(option);
      });
      select.disabled = false;
      for (const id of headerFields) get('add-' + id).disabled = false;
      status.textContent = pickerHeaders.length + ' headers available.';
    };
    worker.onmessage = ({data}) => finish(data);
    worker.onerror = () => finish({error: 'Could not read headers. You can still enter names manually.'});
    worker.postMessage({kind: 'headers', currentFile, separator: delimiter()});
  } catch {
    if (headerWorker) { headerWorker.terminate(); headerWorker = null; }
    status.textContent = 'Could not start the header reader. You can still enter names manually.';
  }
}

function rulesFromForm() {
  let columns;
  try { columns = JSON.parse(get('columns').value); }
  catch { throw new Error('Column rules must be valid JSON. Check the quotes, commas, and braces.'); }
  const compare = fieldNames('compare');
  return shapeRules({version: 1, key: fieldNames('key'), required: fieldNames('required'), columns, ...(compare.length ? {compare} : {})});
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
    get('headers-info').textContent = 'Current columns: ' + output.headers.slice(0, 40).map(displayHeader).join(' · ') + (output.headers.length > 40 ? ' · …' : '');
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
  get(id).addEventListener('change', () => { ruleGeneration++; invalidate(); fileInfo(); if (id !== 'baseline') loadHeaders(); });
}
for (const id of ['key', 'required', 'columns', 'compare']) {
  get(id).addEventListener('input', updateRules);
}
get('exact-names').addEventListener('change', () => {
  try {
    const values = Object.fromEntries(headerFields.map(id => [id, fieldNames(id)]));
    if (exactMode && Object.values(values).flat().some(hasLineBreak)) {
      throw new Error('Remove names containing line breaks before returning to one-name-per-line editing.');
    }
    setNames(values, get('exact-names').checked);
    updateRules();
  } catch (error) {
    get('exact-names').checked = exactMode;
    showError(error.message);
  }
});
for (const id of headerFields) get('add-' + id).addEventListener('click', () => {
  try {
    const selected = pickerHeaders[Number(get('header-column').value)];
    if (selected === undefined) return;
    const values = Object.fromEntries(headerFields.map(field => [field, fieldNames(field)]));
    if (values[id].includes(selected)) {
      get('header-status').textContent = displayHeader(selected) + ' is already selected for ' + id + '.';
      return;
    }
    values[id].push(selected);
    setNames(values, exactMode || hasLineBreak(selected));
    updateRules();
    get('header-status').textContent = 'Added ' + displayHeader(selected) + ' to ' + id + '.';
  } catch (error) { showError(error.message); }
});

get('clear-baseline').addEventListener('click', () => {
  get('baseline').value = '';
  invalidate();
  fileInfo();
});
get('clear-workspace').addEventListener('click', () => {
  ruleGeneration++;
  workflow.reset();
  setNames({key: [], required: [], compare: []}, false);
  get('header-picker').open = false;
  loadHeaders();
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
    const values = {key: imported.key, required: imported.required, compare: imported.compare || []};
    const exact = Object.values(values).flat().some(hasLineBreak);
    setNames(values, exact);
    if (exact) get('header-picker').open = true;
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
