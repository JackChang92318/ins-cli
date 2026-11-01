const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PassThrough}=require('node:stream');
const {CommandInput}=require('./command-input.cjs');
async function runChecks(){
  const stream=new PassThrough();stream.isTTY=true;stream.setRawMode=value=>{stream.isRaw=value;};
  let output='';const input=new CommandInput({input:stream,output:{write:text=>{output+=text;},columns:80,rows:24}});
  const waiting=input.question();
  assert.equal(input.interrupt('/chat'),true);assert.equal(await waiting,'/chat');
  assert.equal(stream.listenerCount('keypress'),0);assert.ok(!output.includes('› /chat'));
  input.setStatus('正在載入私訊聊天室列表…');assert.ok(output.includes('正在載入私訊聊天室列表'));
  let tick,picks=0,questions=0;const calls=[];
  const bridge={connected:true,token:'test',snapshot:{thread:null,path:'/direct/inbox/',chats:[{key:'B',title:'Bob'}]},listen:async()=>{},close(){},command:async(type,payload)=>{
    calls.push({type,payload});return {snapshot:{thread:'B',path:'/direct/t/B/',title:'Bob',messages:[]}};
  }};
  class FakeInput{
    constructor(){this.active=false;this.buffer=[];}
    printAbove(fn){fn();}setStatus(){}
    interrupt(line){if(!this.active)return false;this.active=false;this.resolve(line);return true;}
    question(){questions++;this.active=true;return new Promise(resolve=>{this.resolve=resolve;tick();if(this.active){this.active=false;resolve('/quit');}});}
  }
  const dependencies={
    './notifications.cjs':require('./notifications.cjs'),
    './bridge.cjs':{createBridge:()=>bridge,clean:String},'./command-input.cjs':{CommandInput:FakeInput},
    './chat-picker.cjs':{chooseChat:async chats=>{picks++;return chats[0];},waitForSnapshot:async()=>assert.fail('already loaded inbox should not wait')},
    './view-state.cjs':require('./view-state.cjs'),'./chat-view.cjs':{renderChat:()=>''},'./input-actions.cjs':require('./input-actions.cjs'),
  };
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/cli.cjs','utf8'),{require:name=>dependencies[name],module:mod,console:{log(){},error(){}},process:{stdout:{write(){},rows:24,columns:80}},setInterval:fn=>{tick=fn;return 1;},clearInterval(){}});
  await mod.exports.main();assert.equal(picks,1);assert.equal(questions,2);
  assert.equal(calls.length,1);assert.equal(calls[0].type,'openChat');
  // Worker navigation must reply even when the content script is absent.
  let completed=false,updated=0,report;let done;
  const finished=new Promise(resolve=>{done=resolve;});
  const chrome={storage:{session:{get:async()=>({pair:completed?null:{token:'test',tabId:7}})}},
    tabs:{update:async(id,options)=>{assert.equal(id,7);assert.equal(options.url,'https://www.instagram.com/direct/inbox/');updated++;},sendMessage:()=>assert.fail('do not ask reloading content script to navigate')},
    runtime:{onMessage:{addListener(){}},getURL:()=>''},alarms:{onAlarm:{addListener(){}}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/extension/background.js','utf8'),{chrome,AbortSignal,clearTimeout,setTimeout:fn=>setTimeout(fn,0),fetch:async(url,options)=>{
    if(url.endsWith('/result')){report=JSON.parse(options.body);completed=true;done();}
    return {ok:true,json:async()=>({type:'navigate',path:'/direct/inbox/',id:'nav'})};
  }});
  await finished;assert.equal(updated,1);assert.equal(report.id,'nav');assert.ok(!report.error);
  return 12;
}
if(require.main===module)runChecks().then(n=>console.log(`${n} startup/menu checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
