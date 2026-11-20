// Release QA against original downloaded USDA exports. Never substitutes generated CSVs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {parseCSV,validate,diffTables} from '../core.js';
import {Worker} from 'node:worker_threads';
const directory=process.argv[2];if(!directory)throw new Error('Usage: node tests/public-data.mjs DIRECTORY_OF_ORIGINAL_USDA_EXPORTS');
const rules=JSON.parse(fs.readFileSync(new URL('../examples/usda-food.rules.json',import.meta.url)));
function runWorker(input){
 const url=new URL('../worker.js',import.meta.url).href;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:value=>parentPort.postMessage(value)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data}))); `,{eval:true});
  const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Worker timed out'));},30000);
  worker.once('message',data=>{clearTimeout(timeout);worker.terminate();resolve(data);});
  worker.once('error',error=>{clearTimeout(timeout);worker.terminate();reject(error);});worker.postMessage(input);
 });
}
const mixed={...rules,columns:{...rules.columns,publication_date:{type:'date',formats:['YYYY-MM-DD','M/D/YYYY']}}};
let tables=[];const files=[];const mixedDates=[];

for(const [name,count] of [['2024-10-31-food.csv',68875],['2025-04-24-food.csv',74175]]){
 const bytes=fs.readFileSync(path.join(directory,name));const table=parseCSV(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const result=validate(table,rules);assert.equal(table.rows.length,count);assert.equal(result.pass,false);assert.equal(result.issues.length,88);assert.equal(result.issues.filter(i=>i.column==='description').length,8);assert.equal(result.issues.filter(i=>i.column==='publication_date').length,80);assert(validate(table,{...rules,required:rules.required.filter(c=>c!=='description'),columns:{fdc_id:{type:'integer',min:1}}}).pass);const originalHash=crypto.createHash('sha256').update(bytes).digest('hex');
 const expectedHash={'2024-10-31-food.csv':'ffa9c883d4563f3d0d46b7744e0993f6cf447a34086cd67ea879b4c43d5fde62','2025-04-24-food.csv':'81e8e248be6e4a0624ffd573d5f0eb7dbe009c8099325da0747cbf80b14edbbc'}[name];
 assert.equal(originalHash,expectedHash);
 const file=new File([bytes],name);
 const strict=await runWorker({currentFile:file,rules,separator:','});
 assert.deepEqual(strict.report.validation,result);
 const compatible=await runWorker({currentFile:file,rules:JSON.parse(JSON.stringify(mixed)),separator:','});
 assert.deepEqual(compatible.report.rules,mixed);
 assert.deepEqual(compatible.report.validation.issues,result.issues.filter(i=>i.column!=='publication_date'));
 assert.equal(compatible.report.validation.issues.length,8);
 mixedDates.push({name,rows:count,strictDateIssues:80,optInDateIssues:0,remainingDescriptionIssues:8});
 tables.push(table);files.push({name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),rows:table.rows.length,issues:result.issues.length});
}
const diff=diffTables(tables[0],tables[1],rules);assert.equal(diff.comparable,true);assert.equal(diff.added.length,5300);assert.equal(diff.removed.length,0);assert.equal(diff.changed.length,0);assert.equal(diff.unchanged,68875);
const nutrient=parseCSV(fs.readFileSync(path.join(directory,'2025-04-24-food_nutrient.csv'),'utf8'));
const duplicateResult=validate(nutrient,{version:1,key:['fdc_id'],required:[],columns:{}});
assert.equal(duplicateResult.issues.filter(i=>i.code==='duplicate_key').length,92297);
const airportNames=['airports-2026-11-13.csv','airports-2026-11-18.csv'];
const airports=airportNames.map(n=>parseCSV(fs.readFileSync(path.join(directory,n),'utf8')));
const airportDiff=diffTables(...airports,{version:1,key:['id'],required:['name'],columns:{}});
assert.equal(airportDiff.added.length,17);assert.equal(airportDiff.removed.length,1);assert.equal(airportDiff.changed.length,114);assert.equal(airportDiff.unchanged,86240);
console.log(JSON.stringify({files,mixedDates,usdaDiff:{added:diff.added.length,removed:diff.removed.length,changed:diff.changed.length,unchanged:diff.unchanged},nutrientDuplicateKeyIssues:92297,airportDiff:{added:17,removed:1,changed:114,unchanged:86240}},null,2));
