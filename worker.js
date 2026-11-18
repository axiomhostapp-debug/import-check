import {parseCSV,validate,diffTables} from './core.js';
const LIMIT=20*1024*1024;
async function read(file,label,separator){
 if(file.size>LIMIT)throw new Error(`${label} exceeds the 20 MiB browser limit.`);
 try{return parseCSV(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()),separator);}
 catch(error){throw new Error(`${label}: ${error.message}`);}
}
self.onmessage=async ({data})=>{
 try{
  const {currentFile,baselineFile,rules,separator}=data;
  const current=await read(currentFile,'Current CSV',separator);
  const validation=validate(current,rules);
  let comparison=null;
  if(baselineFile){
   try{comparison=diffTables(await read(baselineFile,'Baseline CSV',separator),current,rules);}
   catch(error){comparison={comparable:false,issues:[{source:'baseline',line:null,column:null,code:'baseline_error',message:error.message}],added:[],removed:[],changed:[],unchanged:0};}
  }
  self.postMessage({report:{version:1,files:{current:currentFile.name,baseline:baselineFile?.name??null},delimiter:separator,rules,validation,comparison},headers:current.headers});
 }catch(error){self.postMessage({error:error.message});}
};
