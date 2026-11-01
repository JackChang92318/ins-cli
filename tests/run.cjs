const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const files=fs.readdirSync(__dirname).filter(file=>file.endsWith('.test.cjs')).sort();
for(const file of files){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit',windowsHide:true});
  if(result.error){console.error(file+': '+result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`${files.length} test files passed`);
