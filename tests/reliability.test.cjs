const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PassThrough}=require('node:stream');
const {CommandInput}=require('../src/command-input.cjs');
const {buildMessage}=require('../extension/message-format.js');
const {createBridge}=require('../src/bridge.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
async function runChecks(){
  const stream=new PassThrough();stream.isTTY=true;stream.isRaw=false;
  stream.setRawMode=value=>{stream.isRaw=value;};
  const input=new CommandInput({input:stream,output:{columns:80,rows:24,write(){}}});
  for(const value of ['?','？','\x1b[63;2u']){
    const answer=input.question();stream.write(value);stream.write('\r');
    assert.equal(await answer,value==='？'?'？':'?');
  }
  const release=input.captureDraft();stream.write('?');stream.write('hello');stream.write('\r');
  assert.equal(input.draft,'?hello');release();
  const answer=input.question();assert.equal(input.buffer.join(''),'?hello');stream.write('\r');
  assert.equal(await answer,'?hello');input.close();
  const editorRect={left:100,width:500};
  assert.equal(buildMessage({body:'long',participant:'Bob',bubbleRect:{left:100,width:460},editorRect}).sender,'Bob');
  assert.equal(buildMessage({body:'long',participant:'Bob',bubbleRect:{left:140,width:460},editorRect}).sender,'你');
  assert.equal(buildMessage({body:'center',participant:'Bob',bubbleRect:{left:110,width:480},editorRect}).direction,'unknown');
  assert.equal(buildMessage({body:'message',participant:'在線上',directionHint:'incoming'}).sender,'對方');
  // An old poll must not strand the loop after replacement pairing.
  let pair={token:'a'.repeat(48),tabId:1},listener,oldReply,newPolls=0,resultPosts=0;
  let hang=false;const timers=new Map();let timerId=0;
  const chrome={storage:{session:{get:async()=>({pair}),set:async value=>{pair=value.pair;},remove:async()=>{pair=null;}}},
    runtime:{getURL:()=> 'popup',onMessage:{addListener(fn){listener=fn;}}},
    tabs:{sendMessage:async()=>hang?new Promise(()=>{}):{snapshot:{messages:[]}}},
    alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener(){}}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{
    chrome,AbortSignal,clearTimeout:id=>timers.delete(id),setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},
    fetch:async(url,options)=>{
      if(url.endsWith('/poll')&&options.headers.Authorization==='Bearer '+ 'a'.repeat(48))return new Promise(resolve=>{oldReply=resolve;});
      if(url.endsWith('/poll'))newPolls++;
      if(url.endsWith('/result'))resultPosts++;
      return {ok:true,json:async()=>({type:'snapshot'})};
    }
  });
  await flush();assert.equal(typeof oldReply,'function');
  const paired=new Promise(resolve=>listener({type:'pair',token:'b'.repeat(48),tabId:2},{url:'popup'},resolve));
  assert.equal((await paired).ok,true);
  assert.equal(newPolls,0);
  oldReply({ok:true,json:async()=>({type:'snapshot'})});await flush();
  assert.equal(newPolls,1);assert.equal(resultPosts,1);
  // A sleeping tab's never-settling reply must release the worker for polling.
  hang=true;
  const delay=[...timers].find(([,t])=>t.ms===1500);timers.delete(delay[0]);delay[1].fn();await flush();
  const timeout=[...timers].find(([,t])=>t.ms===5000);assert.ok(timeout);timers.delete(timeout[0]);timeout[1].fn();await flush();
  assert.equal(resultPosts,2);
  const retry=[...timers].find(([,t])=>t.ms===1500);assert.ok(retry);
  pair=null;timers.delete(retry[0]);retry[1].fn();await flush();
  const bridge=createBridge();let usedPort,previousToken;
  try{
    const port=await bridge.listen(0),headers={Authorization:'Bearer '+bridge.token};
    usedPort=port;previousToken=bridge.token;
    const url='http://127.0.0.1:'+port;
    await fetch(url+'/poll',{headers});
    const pending=bridge.command('inspect');
    assert.equal((await fetch(url+'/health',{headers})).status,200);
    const command=await (await fetch(url+'/poll',{headers})).json();
    assert.equal(command.type,'inspect');
    await fetch(url+'/result',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:command.id})});
    await pending;
  }finally{bridge.close();}
  for(let i=0;i<3;i++){
    const reopened=createBridge();
    try{
      await reopened.listen(usedPort);
      const url='http://127.0.0.1:'+usedPort;
      assert.equal((await fetch(url+'/health',{headers:{Authorization:'Bearer '+previousToken}})).status,401);
      assert.equal((await fetch(url+'/health',{headers:{Authorization:'Bearer '+reopened.token}})).status,200);
      previousToken=reopened.token;
    }finally{reopened.close();}
  }
  return 'first question mark, loading drafts, wide bubbles, replacement pairing, sleeping tabs, and non-consuming health check';
}
if(require.main===module)runChecks().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
