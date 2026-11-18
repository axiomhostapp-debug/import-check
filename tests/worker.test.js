import {test} from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
const rules={version:1,key:['id'],required:['name'],columns:{}};
function run(input){return new Promise((resolve,reject)=>{
 const url=new URL('../worker.js',import.meta.url).href;
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:value=>parentPort.postMessage(value)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});
 worker.on('message',data=>{worker.terminate();resolve(data);});worker.on('error',reject);worker.postMessage(input);
});}
const file=(text,name='file.csv')=>new File([text],name);
test('worker validates and compares without main-thread parsing',async()=>{const x=await run({currentFile:file('id,name\n2,b\n1,a','current.csv'),baselineFile:file('id,name\n1,a\n2,b','before.csv'),rules,separator:','});assert(x.report.validation.pass);assert.equal(x.report.comparison.unchanged,2);assert.deepEqual(x.headers,['id','name']);});
test('worker preserves current result when baseline malformed',async()=>{const x=await run({currentFile:file('id,name\n1,a'),baselineFile:file('id,name\n"broken'),rules,separator:','});assert(x.report.validation.pass);assert.equal(x.report.comparison.comparable,false);});
test('worker rejects invalid UTF-8 and bad current CSV',async()=>{for(const currentFile of [new File([new Uint8Array([255])],'bad.csv'),file('id,name\n1')]){const x=await run({currentFile,rules,separator:','});assert(x.error);assert.equal(x.report,undefined);}});
