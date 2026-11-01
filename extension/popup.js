document.querySelector('#connect').onclick=async()=>{
  const status=document.querySelector('#status');
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.url?.startsWith('https://www.instagram.com/'))throw new Error('請先切到 Instagram 分頁。');
    const token=document.querySelector('#token').value.trim();
    if(!/^[a-f0-9]{48}$/.test(token))throw new Error('請貼上 CLI 顯示的完整配對碼。');
    const result=await chrome.runtime.sendMessage({type:'pair',token,tabId:tab.id});
    if(result.error)throw new Error(result.error);
    document.querySelector('#token').value='';status.textContent='已連接，請回到終端機；首次連線會自動顯示聊天室選單。';
  }catch(e){status.textContent=e.message;}
};
document.querySelector('#disconnect').onclick=async()=>{await chrome.runtime.sendMessage({type:'disconnect'});document.querySelector('#status').textContent='已中斷。';};
