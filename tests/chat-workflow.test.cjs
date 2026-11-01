const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PassThrough}=require('node:stream');
const {parseInput}=require('../src/input-actions.cjs');
const {CommandInput}=require('../src/command-input.cjs');
const {chooseChat}=require('../src/chat-picker.cjs');
const {buildMessage,shareUrl}=require('../extension/message-format.js');
const {renderChat}=require('../src/chat-view.cjs');
async function runChecks(){
  assert.deepEqual(parseInput('/chat','A'),{type:'chat'});
  assert.deepEqual(parseInput('/chats','A'),{type:'chat'});
  assert.deepEqual(parseInput('你好','A'),{type:'send',thread:'A',text:'你好'});
  assert.equal(parseInput('你好',null).type,'error');
  assert.equal(parseInput('/unknown','A').type,'error');
  assert.equal(parseInput('/send hello','A').type,'error');
  const sent=buildMessage({body:'hello',labels:['Message sent by You']});
  const received=buildMessage({body:'hi',labels:['Message from Alice']});
  assert.equal(sent.sender,'你');assert.equal(received.sender,'Alice');
  assert.equal(buildMessage({body:'hi',labels:['來自 小明 的訊息']}).sender,'小明');
  const reel=buildMessage({body:'VERY LONG CAPTION',labels:['Message from Alice'],links:[{href:'https://www.instagram.com/artist/reel/ABC/?igsh=SECRET',text:'caption'}]});
  assert.equal(reel.author,'artist');assert.equal(reel.kind,'reel');assert.ok(!reel.text.includes('CAPTION'));
  assert.equal(reel.url,'https://www.instagram.com/artist/reel/ABC/');
  const post=buildMessage({body:'caption',links:[{href:'https://www.instagram.com/p/ABC/?x=1',text:''},{href:'https://www.instagram.com/artist/',text:'artist'}]});
  assert.equal(post.kind,'post');assert.equal(post.author,'artist');
  assert.equal(shareUrl('https://instagram.com.evil.test/reel/ABC/'),null);
  assert.equal(buildMessage({body:'unknown'}).sender,'發送者未辨識');
  const screen=renderChat({title:'Alice',messages:[sent,received,reel]},{rows:40,columns:100});
  assert.ok(screen.includes('你：\n    hello'));assert.ok(screen.includes('Alice：\n  hi'));
  assert.ok(screen.includes('https://www.instagram.com/artist/reel/ABC/'));assert.ok(!screen.includes('VERY LONG CAPTION'));
  const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};
  const output={columns:80,rows:24,write(){}};
  const editor=new CommandInput({input,output});
  for(let i=0;i<30;i++){
    const answer=editor.question();assert.equal(input.listenerCount('keypress'),1);
    input.write('測試'+i);editor.printAbove(()=>{});input.write('\r');
    assert.equal(await answer,'測試'+i);assert.equal(input.listenerCount('keypress'),0);assert.equal(input.isRaw,false);
    const chosen=chooseChat([{title:'Alice'}],{input,output});input.write('\r');
    assert.equal((await chosen).title,'Alice');assert.equal(input.listenerCount('keypress'),0);
  }
  // Exercise actual CLI routing with a fake transport; no real messages are sent.
  async function cliScenario(actions,{pendingSend=false}={}){
    let tick,questions=0;const calls=[];
    const bridge={snapshot:{thread:'A',path:'/direct/t/A/',title:'Alice',messages:[],chats:[{key:'bad',title:'Notifications'}]},connected:true,listen:async()=>{},close(){},command(type,payload){
      calls.push({type,payload});
      if(type==='navigate'){bridge.snapshot={thread:null,path:'/direct/inbox/',chats:[{key:'B',title:'Bob'}]};return Promise.resolve({});}
      if(type==='openChat'){bridge.snapshot={thread:'B',path:'/direct/t/B/',title:'Bob',messages:[]};return Promise.resolve({snapshot:bridge.snapshot});}
      if(pendingSend)return new Promise(()=>{});
      return Promise.resolve({notice:'sent'});
    }};
    class FakeInput{constructor(){this.active=false;}printAbove(fn){fn();}async question(){this.active=true;tick();questions++;const line=actions.shift()||'/quit';this.active=false;return line;}}
    const dependencies={
      './notifications.cjs':require('../src/notifications.cjs'),
      './bridge.cjs':{createBridge:()=>bridge,clean:String},'./command-input.cjs':{CommandInput:FakeInput},
      './chat-picker.cjs':{chooseChat:async chats=>chats[0],waitForSnapshot:async(b,predicate)=>{assert.ok(predicate(b.snapshot));return b.snapshot;}},
      './view-state.cjs':require('../src/view-state.cjs'),'./chat-view.cjs':{renderChat:()=>''},'./input-actions.cjs':{parseInput},
    };
    const mod={exports:{}};
    vm.runInNewContext(fs.readFileSync(__dirname+'/../src/cli.cjs','utf8'),{require:n=>dependencies[n],module:mod,console:{log(){},error(){}},process:{stdout:{write(){},rows:24,columns:80}},setInterval:fn=>{tick=fn;return 1;},clearInterval(){}});
    await mod.exports.main();return {calls,questions};
  }
  const switched=await cliScenario(['/chat','hello','/quit']);
  assert.equal(switched.calls[0].type,'navigate');assert.equal(switched.calls[0].payload.path,'/direct/inbox/');
  assert.equal(switched.calls[1].payload.key,'B');
  assert.equal(switched.calls[2].payload.thread,'B');assert.equal(switched.calls[2].payload.text,'hello');
  const pending=await cliScenario(['hello','/quit'],{pendingSend:true});
  assert.equal(pending.questions,2);assert.equal(pending.calls.length,1);
  // Inbox navigation must not click a similarly labelled notifications link.
  let navListener,assigned;
  const navChrome={runtime:{id:'test',onMessage:{addListener(fn){navListener=fn;}}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/content.js','utf8'),{chrome:navChrome,
    document:{querySelectorAll(){throw new Error('Should not click page navigation controls');}},
    location:{assign:path=>{assigned=path;}},setTimeout:fn=>{fn();},URL});
  const navResult=await new Promise(resolve=>navListener({source:'nightchat',command:{type:'navigate',path:'/direct/inbox/'}},{id:'test'},resolve));
  assert.equal(assigned,'/direct/inbox/');assert.ok(!navResult.error);
  return 'sender/share formatting, routing, 30 keyboard/menu cycles, and live input during pending send';
}
if(require.main===module)runChecks().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
