(()=>{
  function watchSnapshots({root,read,publish,Observer=globalThis.MutationObserver,schedule=setTimeout,cancel=clearTimeout}={}){
    const watched=new Set();let timer=null,stopped=false,lastKey=null;
    const observer=new Observer(()=>queue());
    function attach(scope){
      if(watched.has(scope))return;
      watched.add(scope);observer.observe(scope,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','data-unread','data-unread-count','href','class','style']});
    }
    function discover(){
      attach(root);
      for(const scope of watched){for(const node of scope.querySelectorAll('*'))if(node.shadowRoot)attach(node.shadowRoot);}
    }
    function flush(){
      timer=null;if(stopped)return;
      try{
        discover();
        const snapshot=read();
        const {path,thread,title,chats,messages,warning}=snapshot;
        // Diagnostics and stream revisions change without a user-visible event.
        const key=JSON.stringify({path,thread,title,chats,messages,warning});
        if(key!==lastKey){lastKey=key;Promise.resolve(publish(snapshot)).catch(()=>{lastKey=null;});}
      }catch{lastKey=null;}
    }
    function queue(){if(!stopped&&timer===null)timer=schedule(flush,120);}
    discover();queue();
    return ()=>{stopped=true;if(timer!==null)cancel(timer);observer.disconnect();watched.clear();};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={watchSnapshots};
  else globalThis.InsLiveReader={watchSnapshots};
})();
