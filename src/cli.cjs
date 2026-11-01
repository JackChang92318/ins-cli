const {createBridge,clean}=require('./bridge.cjs');
const {chooseChat,waitForSnapshot}=require('./chat-picker.cjs');
const {CommandInput}=require('./command-input.cjs');
const {viewKey,shouldDisplay}=require('./view-state.cjs');
const {renderChat}=require('./chat-view.cjs');
const {parseInput}=require('./input-actions.cjs');
const {Notifications}=require('./notifications.cjs');
async function main(){
  const bridge=createBridge();
  try{await bridge.listen();}catch(e){console.error(e.code==='EADDRINUSE'?'17361 埠已被使用，請先關閉另一個 ins-cli。':clean(e.message));process.exitCode=1;return;}
  const input=new CommandInput();
  const notifications=new Notifications();
  let shown=null,lastKey=null,selecting=false,busy=false,stopped=false,initialMenuOpened=false;
  const notice=message=>{
    if(stopped)return;
    const value=clean(message);
    if(!value.includes('\n')&&input.setStatus)input.setStatus(value);
    else input.printAbove(()=>console.log(value));
  };
  function display(s,force=false){
    if(!s){notice('尚未收到網頁，請先配對。');return;}
    if(!shouldDisplay(s,lastKey,{force,previousThread:shown?.thread}))return;
    shown=s;lastKey=viewKey(s);
    input.fullscreen=Boolean(s.thread);
    input.printAbove(()=>{
      if(s.thread)process.stdout.write(renderChat(s,{columns:process.stdout.columns||80,rows:process.stdout.rows||24}));
      else console.log('ins-cli · 用 /chat 選擇聊天室');
    });
  }
  // Sends/diagnostics wait for the browser without taking ownership of stdin.
  function remote(type,payload,handle){
    if(busy){notice('上一個操作正在處理，請稍候；訊息會保留在輸入列。');return false;}
    busy=true;
    bridge.command(type,payload).then(result=>{if(!stopped)handle(result);})
      .catch(e=>notice(e.message)).finally(()=>{busy=false;});
    return true;
  }
  async function openChoice(choice,sourcePath){
    // Keep collecting a draft while Instagram opens the selected conversation.
    // Enter during loading never sends to a conversation not yet displayed.
    const release=input.captureDraft?.()||(()=>{});
    try{
    if(choice.key){
      const result=await bridge.command('openChat',{key:choice.key,sourcePath});
      if(!result.snapshot?.thread)throw new Error('未取得開啟的對話，請查看網頁。');
      display(result.snapshot,true);
      notifications.acknowledge(result.snapshot);
    }else{
      await bridge.command('navigate',{path:choice.path});
      const expected=choice.path.match(/^\/direct\/t\/([^/]+)/)?.[1];
      const opened=await waitForSnapshot(bridge,s=>Boolean(expected)&&s.thread===expected);
      display(opened,true);notifications.acknowledge(opened);
    }
    }finally{release();}
  }
  async function chatMenu(){
    if(busy){notice('上一個操作正在處理，完成後再用 /chat 切換。');return;}
    selecting=true;
    try{
      notice('正在載入私訊聊天室列表…');
      const previous=bridge.snapshot;
      let inbox=previous;
      if(inbox?.thread||!/^\/direct\/inbox\/?$/.test(inbox?.path||'')||!inbox?.chats?.length){
        await bridge.command('navigate',{path:'/direct/inbox/'});
        inbox=await waitForSnapshot(bridge,s=>s!==previous&&!s.thread&&/^\/direct\/inbox\/?$/.test(s.path)&&s.chats?.length);
      }
      const choice=await chooseChat(inbox.chats.map(c=>({...c})),{getChats:()=>{
        const current=bridge.snapshot;
        return current?.path===inbox.path&&!current.thread?current.chats:null;
      }});
      if(choice)await openChoice(choice,inbox.path);
      else{notice('已取消選擇。');shown=inbox;lastKey=null;}
    }finally{selecting=false;}
  }
  console.log('ins-cli · 瀏覽器橋接');
  console.log('在 Instagram 分頁打開 ins-cli，貼上本次配對碼：\n'+bridge.token);
  console.log('配對成功後會自動顯示聊天室選單；之後用 /chat 切換。');
  function receive(snapshot){
    if(stopped||!snapshot)return;
    notifications.update(snapshot);
    if(!selecting&&input.active)display(snapshot);
  }
  const unsubscribe=bridge.onSnapshot?.(receive);
  const timer=setInterval(()=>{
    receive(bridge.snapshot);
    if(!selecting&&!busy&&!initialMenuOpened&&bridge.connected&&bridge.snapshot&&input.active&&input.interrupt&&!input.buffer?.length){
      initialMenuOpened=input.interrupt('/chat');
      return;
    }
  },1500);
  try{
    while(!stopped){
      const line=await input.question();
      notifications.acknowledge(shown);
      const action=parseInput(line,shown?.thread);
      if(action.type==='quit')break;
      try{
        if(action.type==='refresh')display(bridge.snapshot,true);
        else if(action.type==='chat'){initialMenuOpened=true;await chatMenu();}
        else if(action.type==='inspect')remote('inspect',{},result=>{
          if(!result.diagnostics){notice('請重新載入擴充套件並重新整理 Instagram。');return;}
          notice(JSON.stringify({connected:bridge.connected,lastError:bridge.lastError,path:bridge.snapshot?.path,...result.diagnostics},null,2));
        });
        else if(action.type==='open'){
          const choice=bridge.snapshot?.chats?.[action.index];
          if(!Number.isInteger(action.index)||!choice)throw new Error('請用 /chat 選擇聊天室。');
          selecting=true;try{await openChoice(choice,bridge.snapshot.path);}finally{selecting=false;}
        }else if(action.type==='send'){
          if(!remote('send',{thread:action.thread,text:action.text},result=>notice(result.notice||'已操作送出。')))input.draft=action.text;
        }
        else notice(action.message);
      }catch(e){notice(e.message);}
    }
  }finally{stopped=true;unsubscribe?.();clearInterval(timer);notifications.close();input.close?.();bridge.close();}
}
if(require.main===module)main().catch(e=>{console.error(clean(e.message));process.exitCode=1;});
module.exports={main};
