const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const fs=require('node:fs');
const vm=require('node:vm');
const {createBridge,clean}=require('./bridge.cjs');
function call(bridge,method,url,body,headers={}){
  return new Promise(resolve=>{
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
    Object.assign(req,{method,url,headers:{host:'127.0.0.1:17361',authorization:'Bearer '+bridge.token,...headers}});
    const res={writeHead(status){this.status=status;},end(text){this.writableEnded=true;resolve({status:this.status,body:JSON.parse(text)});}};
    bridge.server.address=()=>({port:17361});
    bridge.server.emit('request',req,res);
  });
}
test('bridge rejects missing pairing token, browser page origin and wrong host',async()=>{
  const b=createBridge();
  assert.equal((await call(b,'GET','/poll',null,{authorization:''})).status,401);
  assert.equal((await call(b,'GET','/poll',null,{origin:'https://www.instagram.com'})).status,403);
  assert.equal((await call(b,'GET','/poll',null,{host:'evil.test'})).status,403);
});
test('bridge accepts authenticated extension snapshot, without filesystem storage',async()=>{
  const b=createBridge();
  const s={thread:'123',messages:['hello']};
  assert.equal((await call(b,'POST','/result',{snapshot:s},{origin:'chrome-extension://'+'a'.repeat(32)})).status,200);
  assert.deepEqual(b.snapshot,s);assert.equal(b.connected,true);
});
test('send command is delivered once; only matching result resolves it',async()=>{
  const b=createBridge();await call(b,'GET','/poll');
  const done=b.command('send',{thread:'123',text:'hello'});
  const {body:command}=await call(b,'GET','/poll');
  assert.equal(command.type,'send');assert.equal(command.thread,'123');
  assert.equal((await call(b,'GET','/poll')).body.type,'snapshot');
  await call(b,'POST','/result',{id:'wrong',error:'ignored'});
  await call(b,'POST','/result',{id:command.id,notice:'done'});
  assert.equal((await done).notice,'done');
});
test('timeout never requeues a send',async()=>{
  const b=createBridge({commandTimeout:15});await call(b,'GET','/poll');
  const done=b.command('send',{thread:'123',text:'hello'});
  await assert.rejects(done,/操作逾時/);
  assert.equal((await call(b,'GET','/poll')).body.type,'snapshot');
});
test('unpaired bridge cannot enqueue commands',async()=>{
  await assert.rejects(createBridge().command('send'),/尚未連線/);
});
test('terminal sanitizes control sequences',()=>assert.ok(!clean('\x1b[2J hello').includes('\x1b')));
function contentHarness({path='/direct/t/123/',draft='',buttons=1}={}){
  let listener,clicked=0,inserted=0;
  const box={tagName:'DIV',textContent:draft,getClientRects:()=>[{}],focus(){},closest:()=>scope};
  const button={getClientRects:()=>[{}],getAttribute:name=>name==='aria-label'?'Send':null,click(){clicked++;}};
  const scope={querySelectorAll:()=>Array.from({length:buttons},()=>({...button}))};
  const document={body:scope,querySelector:()=>scope,querySelectorAll:selector=>selector.includes('contenteditable')?[box]:[],execCommand(type,ui,text){inserted++;box.textContent=text;return true;}};
  const chrome={runtime:{id:'extension',onMessage:{addListener(fn){listener=fn;}}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'extension','content.js'),'utf8'),{document,chrome,location:{pathname:path},getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>setTimeout(fn,0),URL,Event:class{}});
  return {run:command=>new Promise(resolve=>listener({source:'nightchat',command},{id:'extension'},resolve)),stats:()=>({clicked,inserted,draft:box.textContent})};
}
test('page rejects send after user switches conversations',async()=>{
  const h=contentHarness();const result=await h.run({type:'send',thread:'other',text:'hello'});
  assert.match(result.error,/不同/);assert.equal(h.stats().inserted,0);assert.equal(h.stats().clicked,0);
});
test('page preserves existing drafts',async()=>{
  const h=contentHarness({draft:'existing'});const result=await h.run({type:'send',thread:'123',text:'hello'});
  assert.match(result.error,/草稿/);assert.equal(h.stats().draft,'existing');assert.equal(h.stats().clicked,0);
});
test('page sends only after verifying filled editor and unique send button',async()=>{
  const h=contentHarness();const result=await h.run({type:'send',thread:'123',text:'hello'});
  assert.ok(result.notice);assert.equal(h.stats().clicked,1);assert.equal(h.stats().draft,'hello');
});
test('ambiguous send buttons leave a draft instead of clicking',async()=>{
  const h=contentHarness({buttons:2});const result=await h.run({type:'send',thread:'123',text:'hello'});
  assert.match(result.error,/傳送按鈕/);assert.equal(h.stats().clicked,0);
});
test('navigation cannot open arbitrary destinations',async()=>{
  const h=contentHarness();assert.match((await h.run({type:'navigate',path:'https://evil.test'})).error,/路徑/);
});
