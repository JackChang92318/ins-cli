const BASE='http://127.0.0.1:17361';
let running=false,generation=0;
function tabRequest(tabId,command){
  let timer;
  return Promise.race([
    chrome.tabs.sendMessage(tabId,{source:'nightchat',command}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Instagram 分頁未回應，請確認分頁沒有被休眠；送出不會重試。')),command.type==='snapshot'?5000:9500);})
  ]).finally(()=>clearTimeout(timer));
}
async function request(route,token,body){
  const response=await fetch(BASE+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!response.ok){const error=new Error(response.status===401?'配對碼無效，請重新貼上 CLI 的配對碼。':'CLI 連線失敗：'+response.status);error.status=response.status;throw error;}
  return response.json();
}
async function loop(){
  if(running)return;running=true;const current=generation;
  try{
    while(current===generation){
      const {pair}=await chrome.storage.session.get('pair');if(!pair)break;
      let command;
      try{
        command=await request('/poll',pair.token);
        if(current!==generation)break;
        if(command.type==='navigate'&&command.path==='/direct/inbox/'){
          // The worker survives the page reload; the old content script does not.
          // Acknowledge from here so navigation cannot lose its reply mid-reload.
          await chrome.tabs.update(pair.tabId,{url:'https://www.instagram.com/direct/inbox/'});
          await request('/result',pair.token,{id:command.id,notice:'正在開啟私訊收件匣。'});
          await new Promise(resolve=>setTimeout(resolve,1500));
          continue;
        }
        const result=await tabRequest(pair.tabId,command);
        await request('/result',pair.token,{...result,id:command.id});
      }catch(e){
        if(command)await request('/result',pair.token,{id:command.id,error:'無法操作分頁：'+e.message+'。若分頁正在載入，程式將自動恢復讀取；送出不會重試。'}).catch(()=>{});
        // Full-page navigation temporarily removes the content script. Keep
        // polling new commands/snapshots; never replay the failed command.
        if(e.status===401)break;
      }
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }finally{
    running=false;
    // A replacement pairing may arrive while the old poll is still awaiting
    // its reply. Start its loop when the old one actually releases ownership.
    if(current!==generation)loop();
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.source==='nightchat'&&message.type==='snapshotChanged'){
    if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.tab||!sender.url?.startsWith('https://www.instagram.com/'))return;
    (async()=>{
      const {pair}=await chrome.storage.session.get('pair');
      if(!pair||sender.tab.id!==pair.tabId)return {ignored:true};
      await request('/result',pair.token,{snapshot:message.snapshot});
      return {ok:true};
    })().then(reply,e=>reply({error:e.message}));
    return true;
  }
  // Pair only from this extension's popup, never from webpage content scripts.
  if(sender.url!==chrome.runtime.getURL('popup.html'))return;
  if(message.type==='pair'){
    (async()=>{
      if(!/^[a-f0-9]{48}$/.test(message.token)||!Number.isInteger(message.tabId))throw new Error('無效配對資料');
      await request('/health',message.token);
      await tabRequest(message.tabId,{type:'snapshot'});
      generation++;await chrome.storage.session.set({pair:{token:message.token,tabId:message.tabId}});
      await chrome.alarms.create('reconnect',{periodInMinutes:0.5});
      loop();return {ok:true};
    })().then(reply,e=>reply({error:e.message}));return true;
  }
  if(message.type==='disconnect'){
    generation++;chrome.storage.session.remove('pair').then(()=>chrome.alarms.clear('reconnect')).then(()=>reply({ok:true}));return true;
  }
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='reconnect')loop();});
loop();
