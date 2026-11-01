const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function runChecks(){
  let listener;
  const base={getClientRects:()=>[{}],getAttribute:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:20,height:20})};
  const heading={...base,tagName:'SPAN',innerText:'訊息'};
  const control={...base,tagName:'DIV',innerText:'private conversation',getAttribute:name=>name==='role'?'button':null};
  const child={readyState:'complete',querySelectorAll:selector=>selector==='*'?[heading,control]:selector.includes('[role="button"]')?[control]:[]};
  const frame={...base,src:'https://www.instagram.com/embedded/?token=SECRET',contentDocument:child};
  const blocked={...base,src:'https://other.example/widget?secret=SECRET',get contentDocument(){throw new Error('blocked');}};
  const document={readyState:'complete',querySelectorAll:selector=>selector==='*'?[frame,blocked]:selector==='iframe'?[frame,blocked]:[]};
  const chrome={runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/content.js','utf8'),{document,chrome,location:{href:'https://www.instagram.com/direct/inbox/'},getComputedStyle:()=>({visibility:'visible'}),URL});
  const result=await new Promise(resolve=>listener({source:'nightchat',command:{type:'inspect'}},{id:'test'},resolve));
  assert.equal(result.diagnostics.documents.length,2);
  assert.equal(result.diagnostics.documents[0].frames[0].readable,true);
  assert.equal(result.diagnostics.documents[0].frames[1].readable,false);
  assert.equal(result.diagnostics.documents[1].messageHeadings.length,1);
  assert.equal(result.diagnostics.documents[1].roles.button,1);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.ok(!JSON.stringify(result).includes('private conversation'));
  return 7;
}
if(require.main===module)runChecks().then(n=>console.log(`${n} inspection checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
