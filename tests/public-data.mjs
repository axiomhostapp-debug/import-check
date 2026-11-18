// Release QA against original downloaded USDA exports. Never substitutes generated CSVs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {parseCSV,validate,diffTables} from '../core.js';
const directory=process.argv[2];if(!directory)throw new Error('Usage: node tests/public-data.mjs DIRECTORY_OF_ORIGINAL_USDA_EXPORTS');
const rules=JSON.parse(fs.readFileSync(new URL('../examples/usda-food.rules.json',import.meta.url)));
let tables=[];const files=[];
for(const [name,count] of [['2024-10-31-food.csv',68875],['2025-04-24-food.csv',74175]]){
 const bytes=fs.readFileSync(path.join(directory,name));const table=parseCSV(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const result=validate(table,rules);assert.equal(table.rows.length,count);assert.equal(result.pass,false);assert.equal(result.issues.length,88);assert.equal(result.issues.filter(i=>i.column==='description').length,8);assert.equal(result.issues.filter(i=>i.column==='publication_date').length,80);assert(validate(table,{...rules,required:rules.required.filter(c=>c!=='description'),columns:{fdc_id:{type:'integer',min:1}}}).pass);tables.push(table);files.push({name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),rows:table.rows.length,issues:result.issues.length});
}
const diff=diffTables(tables[0],tables[1],rules);assert.equal(diff.comparable,true);assert.equal(diff.added.length,5300);assert.equal(diff.removed.length,0);assert.equal(diff.changed.length,0);assert.equal(diff.unchanged,68875);
const nutrient=parseCSV(fs.readFileSync(path.join(directory,'2025-04-24-food_nutrient.csv'),'utf8'));
const duplicateResult=validate(nutrient,{version:1,key:['fdc_id'],required:[],columns:{}});
assert.equal(duplicateResult.issues.filter(i=>i.code==='duplicate_key').length,92297);
const airportNames=['airports-2026-11-13.csv','airports-2026-11-18.csv'];
const airports=airportNames.map(n=>parseCSV(fs.readFileSync(path.join(directory,n),'utf8')));
const airportDiff=diffTables(...airports,{version:1,key:['id'],required:['name'],columns:{}});
assert.equal(airportDiff.added.length,17);assert.equal(airportDiff.removed.length,1);assert.equal(airportDiff.changed.length,114);assert.equal(airportDiff.unchanged,86240);
console.log(JSON.stringify({files,usdaDiff:{added:diff.added.length,removed:diff.removed.length,changed:diff.changed.length,unchanged:diff.unchanged},nutrientDuplicateKeyIssues:92297,airportDiff:{added:17,removed:1,changed:114,unchanged:86240}},null,2));
