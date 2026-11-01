const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {Notifications}=require('../src/notifications.cjs');
const {watchSnapshots}=require('../extension/live-reader.js');
const {createBridge}=require('../src/bridge.cjs');
const {CommandInput}=require('../src/command-input.cjs');
const {PassThrough}=require('node:stream');
const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
async function runChecks(){
  let screen='',clock=10000;
  const notifications=new Notifications({output:{isTTY:true,write:value=>{screen+=value;}},now:()=>clock});
  const incoming=text=>({sender:'Alice',direction:'incoming',text});
  const outgoing=text=>({sender:'你',direction:'outgoing',text});
  let snapshot={thread:'A',path:'/direct/t/A/',title:'Alice',messages:[incoming('old')],chats:[]};
  const bells=()=>screen.split('\x07').length-1;
  notifications.update(snapshot);assert.equal(bells(),0);
  snapshot={...snapshot,messages:[...snapshot.messages,incoming('new')]};
  assert.equal(notifications.update(snapshot),true);assert.equal(bells(),1);assert.ok(notifications.title.startsWith('● (1)'));
  notifications.update(snapshot);assert.equal(bells(),1);
  clock+=2000;snapshot={...snapshot,messages:[...snapshot.messages,outgoing('reply')]};
  assert.equal(notifications.update(snapshot),false);assert.equal(bells(),1);
  snapshot={...snapshot,messages:[incoming('history'),...snapshot.messages]};
  assert.equal(notifications.update(snapshot),false);assert.equal(bells(),1);
  notifications.acknowledge(snapshot);assert.ok(!notifications.title.includes('●'));
  snapshot={...snapshot,chats:[{key:'row-1',title:'Bob',preview:'2 new messages',unread:true,unreadCount:2}]};
  notifications.update(snapshot);assert.equal(bells(),2);assert.ok(notifications.title.startsWith('● (2)'));
  notifications.update({...snapshot,chats:snapshot.chats.map(c=>({...c,key:'row-999'}))});assert.equal(bells(),2);
  notifications.acknowledge(snapshot);assert.ok(notifications.title.includes('●'));
  notifications.acknowledge({thread:'B',path:'/direct/t/B/',title:'Bob'});assert.ok(!notifications.title.includes('●'));
  const firstUnread=new Notifications({output:{isTTY:true,write:value=>{screen+=value;}}});
  const before=bells();firstUnread.update({path:'/direct/inbox/',chats:[]});firstUnread.update(snapshot);assert.equal(bells(),before);assert.ok(firstUnread.title.includes('● (2)'));
  const silent=new Notifications({output:{isTTY:false,write:()=>assert.fail('no terminal escapes in redirected output')}});
  silent.update(snapshot);silent.close();
  // A DOM burst publishes once; diagnostics alone do not count as new content.
  const jobs=new Map();let next=0,callback,disconnected=false,reads=0;const observed=[],published=[];
  class Observer{constructor(fn){callback=fn;}observe(root){observed.push(root);}disconnect(){disconnected=true;}}
  const shadow={querySelectorAll:()=>[]};let hosts=[];
  const root={querySelectorAll:()=>hosts};
  const stop=watchSnapshots({root,Observer,schedule:fn=>{jobs.set(++next,fn);return next;},cancel:id=>jobs.delete(id),read:()=>{reads++;return {...snapshot,diagnostics:{reads}};},publish:value=>published.push(value)});
  const run=()=>{const [id,fn]=jobs.entries().next().value;jobs.delete(id);fn();};
  run();assert.equal(published.length,1);
  for(let n=0;n<100;n++)callback();assert.equal(jobs.size,1);run();assert.equal(published.length,1);
  hosts=[{shadowRoot:shadow}];snapshot={...snapshot,messages:[...snapshot.messages,incoming('live')]};
  callback();run();assert.equal(published.length,2);assert.ok(observed.includes(shadow));
  callback();stop();assert.equal(jobs.size,0);assert.equal(disconnected,true);
  // A push redraw preserves an in-progress draft and cursor position.
  const stdin=new PassThrough();stdin.isTTY=true;stdin.setRawMode=value=>{stdin.isRaw=value;};
  const editor=new CommandInput({input:stdin,output:{columns:80,rows:24,write(){}}});editor.fullscreen=true;
  const answer=editor.question();stdin.write('草稿?');stdin.write('\x1b[D');
  editor.printAbove(()=>{});assert.equal(editor.buffer.join(''),'草稿?');assert.equal(editor.cursor,2);
  stdin.write('X');stdin.write('\r');assert.equal(await answer,'草稿X?');editor.close();
  // Only the paired top-level Instagram tab may push snapshots.
  let listener,pair=null,posts=[];
  const chrome={runtime:{id:'extension',getURL:()=> 'popup',onMessage:{addListener:fn=>{listener=fn;}}},
    storage:{session:{get:async()=>({pair})}},alarms:{onAlarm:{addListener(){}}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{chrome,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{posts.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};}});
  await flush();pair={token:'token',tabId:5};
  const message={source:'nightchat',type:'snapshotChanged',snapshot};
  const sender={id:'extension',frameId:0,tab:{id:5},url:'https://www.instagram.com/direct/t/A/'};
  listener(message,{...sender,id:'other'},()=>{});
  listener(message,{...sender,frameId:1},()=>{});
  listener(message,{...sender,tab:{id:6}},()=>{});
  listener(message,{...sender,url:'https://evil.test/'},()=>{});
  await flush();assert.equal(posts.length,0);
  await new Promise(resolve=>listener(message,sender,resolve));assert.equal(posts.length,1);assert.equal(posts[0].body.snapshot.thread,'A');
  // Exercise CLI subscription without running its polling interval at all.
  let receive,unsubscribed=false,closed=false,cliScreen='';
  const cliOutput={isTTY:true,rows:24,columns:80,write:value=>{cliScreen+=value;}};
  const original={thread:'A',path:'/direct/t/A/',title:'Alice',messages:[incoming('baseline')],chats:[]};
  const cliBridge={token:'test',connected:true,snapshot:original,listen:async()=>{},close(){closed=true;},onSnapshot(fn){receive=fn;return ()=>{unsubscribed=true;};}};
  class FakeInput{
    printAbove(fn){fn();}
    close(){}
    async question(){
      this.active=true;receive(original);
      receive({...original,messages:[...original.messages,incoming('push-only-message')]});
      assert.ok(cliScreen.includes('push-only-message'));
      assert.ok(cliScreen.includes('● (1)'));assert.ok(cliScreen.includes('\x07'));
      this.active=false;return '/quit';
    }
  }
  const dependencies={
    './bridge.cjs':{createBridge:()=>cliBridge,clean:String},'./command-input.cjs':{CommandInput:FakeInput},
    './notifications.cjs':{Notifications:class extends Notifications{constructor(){super({output:cliOutput});}}},
    './chat-picker.cjs':{},'./view-state.cjs':require('../src/view-state.cjs'),'./chat-view.cjs':require('../src/chat-view.cjs'),'./input-actions.cjs':require('../src/input-actions.cjs'),
  };
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../src/cli.cjs','utf8'),{require:name=>dependencies[name],module:mod,console:{log(){},error(){}},process:{stdout:cliOutput},setInterval:()=>1,clearInterval(){}});
  await mod.exports.main();assert.ok(unsubscribed&&closed);
  // Bridge events arrive immediately and stale poll responses cannot roll back
  // a newer push. No timer or /r is needed to receive this event.
  const bridge=createBridge();
  try{
    const port=await bridge.listen(0),url='http://127.0.0.1:'+port+'/result';
    const headers={Authorization:'Bearer '+bridge.token,'Content-Type':'application/json'};
    let events=0;const unsubscribe=bridge.onSnapshot(()=>{events++;});
    const post=async(revision,startedAt=100)=>{
      const result=await fetch(url,{method:'POST',headers,body:JSON.stringify({snapshot:{...snapshot,stream:{id:'doc-'+startedAt,startedAt,revision}}})});
      assert.equal(result.status,200);
    };
    await post(2);assert.equal(events,1);
    await post(1);assert.equal(events,1);assert.equal(bridge.snapshot.stream.revision,2);
    await post(2);assert.equal(events,1);
    await post(1,200);assert.equal(events,2);
    await post(3,100);assert.equal(events,2);
    unsubscribe();await post(2,200);assert.equal(events,2);
  }finally{bridge.close();}
  return 'live DOM push, shadow roots, immediate bridge events, stale response ordering, draft preservation, notification deduplication, sound and tab badges';
}
if(require.main===module)runChecks().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
