const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {CommandInput,matches}=require('../src/command-input.cjs');
async function runChecks(){
  let count=0;
  function prompt(){
    const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};
    let screen='';const output={columns:80,write:text=>{screen+=text;}};
    const editor=new CommandInput({input,output});
    const answer=editor.question();
    return {input,editor,answer,screen:()=>screen};
  }
  assert.deepEqual(matches('/').map(c=>c.name),['/chat','/inspect','/open','/quit','/r']);
  assert.deepEqual(matches('/ch').map(c=>c.name),['/chat']);assert.deepEqual(matches('/send text'),[]);count++;
  {
    const p=prompt();p.input.write('/ch');assert.ok(p.screen().includes('/chat'));
    p.input.write('\t');assert.equal(p.editor.buffer.join(''),'/chat');assert.equal(p.editor.active,true);
    p.input.write('\r');assert.equal(await p.answer,'/chat');assert.equal(p.input.isRaw,false);count++;
  }
  {
    const p=prompt();p.input.write('/');p.input.write('\x1b[B');p.input.write('\r');
    assert.equal(await p.answer,'/inspect');count++;
  }
  {
    const p=prompt();p.input.write('/');p.input.write('\t');p.input.write('\t');p.input.write('\r');
    assert.equal(await p.answer,'/inspect');count++;
  }
  {
    const p=prompt();p.input.write('/op\t');assert.equal(p.editor.buffer.join(''),'/open ');
    p.input.write('2');p.input.write('\r');assert.equal(await p.answer,'/open 2');count++;
  }
  {
    const p=prompt();p.input.write('/r');p.editor.printAbove(()=>{p.editor.output.write('new message\n');});
    assert.equal(p.editor.buffer.join(''),'/r');p.input.write('\r');assert.equal(await p.answer,'/r');count++;
  }
  {
    const p=prompt();p.input.write('ab');p.input.write('\x1b[D');p.input.write('X');p.input.write('\r');
    assert.equal(await p.answer,'aXb');count++;
  }
  {
    const p=prompt();p.input.write('/');p.input.write('\x03');assert.equal(await p.answer,'/quit');
    assert.equal(p.input.listenerCount('keypress'),0);assert.equal(p.input.isRaw,false);count++;
  }
  return count;
}
if(require.main===module)runChecks().then(n=>console.log(`${n} command input checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
