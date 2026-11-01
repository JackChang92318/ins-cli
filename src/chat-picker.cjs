const readline=require('node:readline');
const {clip,width}=require('./terminal-text.cjs');
const clean=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ');
function chatLabel(chat,maxWidth=Infinity){
  const count=chat.unreadCount;
  const badge=Number.isInteger(count)&&count>0?` [未讀 ${count} 則]`:chat.unread===true?' [未讀]':'';
  const title=Number.isFinite(maxWidth)?clip(clean(chat.title),Math.min(32,Math.max(6,maxWidth-width(badge)-2))):clean(chat.title).slice(0,100);
  const preview=clean(chat.preview||'').trim();
  const value=title+badge+(preview?'  — '+preview:'');
  return Number.isFinite(maxWidth)?clip(value,maxWidth):value;
}

async function waitForSnapshot(bridge,predicate,{timeout=20000,interval=150}={}){
  const until=Date.now()+timeout;
  do{
    const snapshot=bridge.snapshot;
    if(snapshot&&predicate(snapshot))return snapshot;
    await new Promise(resolve=>setTimeout(resolve,interval));
  }while(Date.now()<until);
  const s=bridge.snapshot;
  const state=bridge.connected?'擴充套件有連線':'擴充套件未連線或已中斷';
  throw new Error(`等待聊天室列表／對話逾時。${state}；目前頁面：${clean(s?.path||'尚未收到')}；辨識到 ${s?.chats?.length||0} 個聊天室。${bridge.lastError?'\n'+clean(bridge.lastError):''}`);
}

function chooseChat(chats,{input=process.stdin,output=process.stdout,getChats=null}={}){
  if(!chats.length)return Promise.resolve(null);
  if(!input.isTTY)throw new Error('聊天室選單需要互動式終端機，請使用 start.bat 啟動。');
  return new Promise(resolve=>{
    let selected=0,digits='',warning='',done=false,refresh=null;
    const wasRaw=input.isRaw,wasPaused=input.isPaused();
    function draw(){
      const size=Math.max(3,Math.min(15,(output.rows||24)-8));
      const start=Math.max(0,Math.min(selected-Math.floor(size/2),chats.length-size));
      const lines=['選擇聊天室', '↑↓ 選擇，或輸入編號，Enter 開啟；Esc 取消','─'.repeat(50)];
      for(let i=start;i<Math.min(chats.length,start+size);i++){
        const title=chatLabel(chats[i],Math.max(12,(output.columns||80)-9));
        lines.push(`${i===selected?'›':' '} ${String(i+1).padStart(3)}. ${title}`);
      }
      lines.push('─'.repeat(50),`共 ${chats.length} 個聊天室　編號：${digits||'—'}`,warning);
      output.write('\x1b[2J\x1b[H'+lines.join('\n')+'\n');
    }
    function finish(value){
      if(done)return;done=true;
      input.removeListener('keypress',onKey);
      if(refresh)clearInterval(refresh);
      input.setRawMode(Boolean(wasRaw));
      if(wasPaused)input.pause();
      output.write('\n');resolve(value);
    }
    function onKey(value,key={}){
      warning='';
      if(key.name==='escape'||(key.ctrl&&key.name==='c'))return finish(null);
      if(key.name==='up'||key.name==='down'){
        digits='';selected=(selected+(key.name==='up'?-1:1)+chats.length)%chats.length;
      }else if(key.name==='backspace')digits=digits.slice(0,-1);
      else if(key.name==='return'){
        const index=digits?Number(digits)-1:selected;
        if(index>=0&&index<chats.length)return finish(chats[index]);
        warning=`請輸入 1–${chats.length} 的編號。`;
      }else if(/^\d$/.test(value||'')&&digits.length<6){
        digits+=value;
        const index=Number(digits)-1;
        if(index>=0&&index<chats.length)selected=index;
      }
      draw();
    }
    readline.emitKeypressEvents(input);
    input.setRawMode(true);input.resume();input.on('keypress',onKey);draw();
    if(getChats)refresh=setInterval(()=>{
      const current=getChats();if(!Array.isArray(current))return;
      // Freeze order while choosing, so a new conversation cannot change the
      // recipient associated with a number the user is in the middle of typing.
      const byKey=new Map(current.map(chat=>[chat.path||chat.key,chat]));
      let changed=false;
      chats=chats.map(chat=>{
        const latest=byKey.get(chat.path||chat.key);
        if(!latest||latest.unread===chat.unread&&latest.unreadCount===chat.unreadCount&&(latest.preview||'')===(chat.preview||''))return chat;
        changed=true;return {...chat,preview:latest.preview,unread:latest.unread,unreadCount:latest.unreadCount};
      });
      if(changed)draw();
    },1500);
  });
}
module.exports={chooseChat,waitForSnapshot,chatLabel};
