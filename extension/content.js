(()=>{
  const stream={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),startedAt:Date.now(),revision:0};
  const visible=e=>!!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e.innerText || e.textContent || e.shadowRoot?.textContent || '').trim();
  function messageText(root){
    const emojiAlt=globalThis.InsMessageFormat.emojiAlt;
    if(!queryAll(root,'img').some(img=>visible(img)&&emojiAlt(img.alt)))return text(root);
    function read(node){
      if(node.nodeType===3)return node.nodeValue||'';
      const tag=node.tagName?.toUpperCase();
      if(tag==='IMG')return visible(node)?emojiAlt(node.alt):'';
      if(node!==root&&node.nodeType===1&&!visible(node))return '';
      if(tag==='BR')return '\n';
      if(/^(SCRIPT|STYLE|NOSCRIPT)$/.test(tag||''))return '';
      let children=[...(node.childNodes||[])];
      if(node.shadowRoot)children.push(...node.shadowRoot.childNodes);
      if(tag==='SLOT'&&node.assignedNodes){const assigned=node.assignedNodes({flatten:true});if(assigned.length)children=assigned;}
      const value=children.map(read).join('');
      return /^(DIV|P|LI|ARTICLE|BLOCKQUOTE)$/.test(tag||'')?'\n'+value+'\n':value;
    }
    return read(root).replace(/\n{3,}/g,'\n\n').trim();
  }
  function queryAll(root,selector){
    const scopes=[root],visited=new Set(scopes),found=new Set();
    for(let i=0;i<scopes.length;i++){
      const scope=scopes[i];
      for(const node of scope.querySelectorAll(selector))found.add(node);
      for(const node of [scope,...scope.querySelectorAll('*')]){
        if(node.shadowRoot&&!visited.has(node.shadowRoot)){visited.add(node.shadowRoot);scopes.push(node.shadowRoot);}
      }
    }
    return [...found];
  }
  const thread=()=>location.pathname.match(/^\/direct\/t\/([^/]+)\/?$/)?.[1] || null;
  const editors=()=>queryAll(document,'[contenteditable="true"][role="textbox"],textarea[placeholder]').filter(visible);
  const rowKeys=new WeakMap();
  const senderCache=new WeakMap();
  let rememberedTitle=null;
  let nextKey=0,chatRows=new Map(),openedTitle=null;
  const rowTitle=e=>text(e).split('\n').map(s=>s.trim()).find(Boolean)||'';
  function conversationRow(row){
    // A thread link may wrap only the name. Its unread dot can be a sibling.
    // Expand only within a single short conversation row, never the whole list.
    for(let parent=row.parentElement,depth=0;parent&&depth<4;parent=parent.parentElement,depth++){
      const r=parent.getBoundingClientRect?.();
      if(!r||r.height>170||r.width>700)break;
      const current=row.getBoundingClientRect?.();
      if(current&&current.height>=35&&r.height>current.height+12)break;
      const links=queryAll(parent,'a[href]').filter(a=>/\/direct\/t\//.test(a.href));
      const paths=new Set(links.map(a=>new URL(a.href,location.href).pathname));
      if(paths.size>1)break;
      if(r.width>=180&&r.height>=35)row=parent;
    }
    return row;
  }
  function chatDetails(row){
    const scope=conversationRow(row);
    const title=rowTitle(row)||'對話';
    const summary=globalThis.InsUnread?.summarizeChatText?.({rowText:messageText(scope),title})||{title,preview:''};
    return {...summary,...unreadInfo(scope,summary.preview)};
  }
  function unreadInfo(row,preview=''){
    const nodes=[row,...queryAll(row,'[aria-label],[title],[data-unread-count],[data-unread],svg title')];
    const labels=[];let count=null,state=null;
    for(const node of nodes){
      if(node!==row&&node.tagName?.toUpperCase()!=='TITLE'&&!visible(node))continue;
      for(const attribute of ['aria-label','title']){const value=node.getAttribute?.(attribute);if(value)labels.push(value);}
      if(node.tagName?.toUpperCase()==='TITLE')labels.push(text(node));
      const value=node.getAttribute?.('data-unread-count');if(count===null&&value!==null&&value!==undefined)count=value;
      const flag=node.getAttribute?.('data-unread');if(state===null&&flag!==null&&flag!==undefined)state=flag;
    }
    const badges=queryAll(row,'[role="status"],[data-unread-count]').filter(visible).map(text);
    let visualUnread=false;
    if(globalThis.InsUnread?.looksLikeUnreadDot&&row.getBoundingClientRect){
      const container=row.getBoundingClientRect();
      visualUnread=queryAll(row,'span,div').some(node=>{
        if(!visible(node))return false;
        const style=getComputedStyle(node);
        return globalThis.InsUnread.looksLikeUnreadDot({tag:node.tagName,text:text(node),rect:node.getBoundingClientRect(),container,color:style.backgroundColor,radius:style.borderRadius});
      });
    }
    return globalThis.InsUnread?.parseUnreadEvidence({count,state,labels,badges,visualUnread,preview})||{unread:null,unreadCount:null};
  }
  function inspectStructure(){
    const documents=[];
    function report(doc,where,depth){
      const all=[...doc.querySelectorAll('*')];
      const roles={};
      for(const node of all){const role=node.getAttribute('role');if(role)roles[role]=(roles[role]||0)+1;}
      const headings=all.filter(node=>visible(node)&&/^(訊息|消息|消息列表|messages)$/i.test(text(node)));
      const controls=[...doc.querySelectorAll('[role="button"],button,[role="row"],[role="listitem"],[tabindex]')].filter(visible);
      const frameElements=[...doc.querySelectorAll('iframe')];
      const frames=frameElements.map(frame=>{
        let page='unknown',child=null;
        try{const u=new URL(frame.src||'about:blank',location.href);page=/^(https?:|about:)$/.test(u.protocol)?(u.origin+u.pathname).slice(0,180):u.protocol;}catch{}
        try{child=frame.contentDocument;}catch{}
        return {page,readable:Boolean(child),visible:visible(frame)};
      });
      documents.push({where,readyState:doc.readyState,elements:all.length,roles,
        messageHeadings:headings.slice(0,5).map(node=>{const r=node.getBoundingClientRect();return {tag:node.tagName,role:node.getAttribute('role'),left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};}),
        controls:controls.length,
        controlShapes:controls.slice(0,30).map(node=>{const r=node.getBoundingClientRect();return {tag:node.tagName,role:node.getAttribute('role'),tabindex:node.getAttribute('tabindex'),left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height),textLength:text(node).length};}),
        shadowHosts:all.filter(node=>node.shadowRoot).length,frames});
      if(depth>=2)return;
      for(let i=0;i<frameElements.length;i++){
        try{const child=frameElements[i].contentDocument;if(child)report(child,where+'/iframe['+i+']',depth+1);}catch{}
      }
      const hosts=all.filter(node=>node.shadowRoot);
      for(let i=0;i<hosts.length;i++)report(hosts[i].shadowRoot,where+'/shadow['+i+']',depth+1);
    }
    report(document,'top',0);
    return {readerVersion:'0.5.0-live',liveUpdates:Boolean(globalThis.InsLiveReader),documents};
  }
  function sidebarRows(){
    chatRows=new Map();
    // Read text and clickable rows only; no avatars or image URLs are used.
    // Anchor below Messages to exclude notes and global navigation controls.
    const headings=queryAll(document,'h1,h2,h3,[role="heading"],span,div')
      .filter(e=>visible(e)&&/^(訊息|消息|消息列表|messages)$/i.test(text(e)))
      .map(e=>e.getBoundingClientRect()).filter(r=>r.width>=28&&r.height>10&&r.height<80&&r.left>=60&&r.left<innerWidth/2)
      .sort((a,b)=>b.top-a.top);
    const header=headings[0];
    if(!header)return [];
    const result=[];
    const candidates=queryAll(document,'[role="button"],button,[role="row"],[role="listitem"],[tabindex="0"]').filter(row=>{
      if(!visible(row))return false;
      const r=row.getBoundingClientRect();
      return r.top>=header.bottom&&r.left>=header.left-45&&r.left<=header.left+100&&r.width>=180&&r.width<=Math.min(700,innerWidth*.6)&&r.height>=35&&r.height<=170&&Boolean(rowTitle(row));
    });
    // When both an outer row and an inner button match, use the inner control.
    for(const row of candidates.filter(row=>!candidates.some(other=>other!==row&&row.contains(other)))){
      const label=rowTitle(row);
      if(!rowKeys.has(row))rowKeys.set(row,'row-'+(++nextKey));
      const key=rowKeys.get(row);
      chatRows.set(key,{element:row,title:label});
      result.push({key,source:'text-row',...chatDetails(row)});
    }
    return result;
  }
  function snapshot(){
    const main=queryAll(document,'main,[role="main"]')[0] || document.body;
    const chats=[];const seen=new Set();
    for(const a of queryAll(document,'a[href]')){
      const url=new URL(a.href,location.href);
      if(url.origin!==location.origin||!/^\/direct\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))continue;
      const path=url.pathname.replace(/\/?$/,'/');
      if(visible(a)&&!seen.has(path)){seen.add(path);chats.push({path,...chatDetails(a)});}
    }
    const id=thread();
    const linkCount=chats.length;
    if(!chats.length)chats.push(...sidebarRows());
    // Instagram virtualizes history; only the rows currently loaded in the DOM exist here.
    // Current Instagram message bubbles use articles, not grid rows.
    // Prefer these explicit message containers and avoid nested duplicates.
    const boxes=editors();
    const editorRect=boxes[0]?.getBoundingClientRect?.();
    let rows=id?queryAll(main,'[role="article"],article').filter(node=>{
      if(!visible(node)||boxes.some(box=>node.contains?.(box)))return false;
      if(editorRect&&node.getBoundingClientRect){
        const r=node.getBoundingClientRect();
        // Sidebar previews sit wholly to the left of the conversation input.
        if(r.left+r.width<editorRect.left-80)return false;
      }
      return true;
    }):[];
    const articles=rows;
    rows=articles.filter(node=>!articles.some(other=>other!==node&&other.contains?.(node)));
    const messageSource=rows.length?'article':'row';
    if(!rows.length)rows=queryAll(main,'[role="grid"] [role="row"]').filter(visible);
    if(!rows.length)rows=queryAll(main,'[role="row"]').filter(visible);
    const headings=queryAll(main,'h1,h2,[role="heading"]').filter(visible);
    const selected=chats.find(c=>c.path===location.pathname)?.title;
    const paneHeading=headings.find(node=>{
      const r=node.getBoundingClientRect();return editorRect&&r.left>=editorRect.left-120&&r.top<editorRect.top&&text(node);
    });
    const candidate=(openedTitle?.thread===id?openedTitle.title:null)||selected||(paneHeading?text(paneHeading):null);
    const usableTitle=globalThis.InsMessageFormat.participantName?.(candidate)||null;
    if(id&&usableTitle)rememberedTitle={thread:id,title:usableTitle};
    const title=usableTitle||(rememberedTitle?.thread===id?rememberedTitle.title:null)||'Instagram 對話';
    const messages=rows.slice(-100).map(row=>{
      let value=messageText(row);
      if(queryAll(row,'video').length)value+=' [影片]';
      if(queryAll(row,'audio').length)value+=' [語音]';
      if(!value&&queryAll(row,'img').length)value='[圖片／貼圖]';
      if(!value.trim())return null;
      const labels=[];
      for(let node=row,depth=0;node&&depth<3;node=node.parentElement,depth++){
        if(node===main||node===document.body)break;
        const label=node.getAttribute?.('aria-label');if(label)labels.push(label);
      }
      for(const node of queryAll(row,'[aria-label]')){
        const label=node.getAttribute('aria-label');
        if(label&&/(message (?:from|by)|sent by|傳送者|发送者|的訊息|的消息)/i.test(label))labels.push(label);
      }
      const links=queryAll(row,'a[href]').map(a=>({href:a.href,text:text(a)}));
      const fragments=queryAll(row,'[dir="auto"]').filter(node=>visible(node)&&text(node));
      const bubble=fragments.sort((a,b)=>text(b).length-text(a).length)[0]||row;
      let directionHint=null;
      for(let node=bubble;node&&node!==row;node=node.parentElement){
        const style=getComputedStyle(node),parent=node.parentElement&&getComputedStyle(node.parentElement);
        if(parent?.display==='flex'&&/^column/.test(parent.flexDirection||'')&&/^(flex-)?(start|end)$/.test(style.alignSelf||'')){
          directionHint=/end$/.test(style.alignSelf)?'outgoing':'incoming';break;
        }
      }
      const result=globalThis.InsMessageFormat.buildMessage({body:value,labels,links,bubbleRect:bubble.getBoundingClientRect?.(),editorRect,participant:title,directionHint});
      const known=senderCache.get(row);
      if(result.direction==='unknown'&&known?.thread===id&&known.body===value){result.sender=known.sender;result.direction=known.direction;}
      if(result.direction!=='unknown')senderCache.set(row,{thread:id,body:value,sender:result.sender,direction:result.direction});
      return result;
    }).filter(Boolean);
    return {stream:{...stream,revision:++stream.revision},path:location.pathname,thread:id,title,chats,messages,
      warning:id&&!messages.length?'尚未辨識到訊息列。請在網頁打開對話；若仍空白，使用 /inspect 回報頁面結構。':(!id&&!chats.length?'請在這個分頁開啟 Instagram 私訊收件匣。':''),
      diagnostics:{readerVersion:'0.5.0-live',liveUpdates:Boolean(globalThis.InsLiveReader),readyState:document.readyState,messageSource,messages:messages.length,unidentifiedSenders:messages.filter(m=>m.direction==='unknown').length,rows:rows.length,grids:queryAll(main,'[role="grid"]').length,editors:boxes.length,chatLinks:linkCount,chatRows:chats.filter(c=>c.key).length,unreadChats:chats.filter(c=>c.unread===true).length,unreadCountsAvailable:chats.filter(c=>c.unreadCount!==null&&c.unreadCount!==undefined).length,totalAnchors:queryAll(document,'a[href]').length,totalButtons:queryAll(document,'button,[role="button"]').length,frames:queryAll(document,'iframe').length}};
  }
  async function execute(command){
    if(command.type==='snapshot')return {snapshot:snapshot()};
    if(command.type==='inspect')return {diagnostics:inspectStructure()};
    if(command.type==='openChat'){
      if(command.sourcePath!==location.pathname)throw new Error('網頁已切換，請重新輸入 /chats 選擇。');
      const entry=chatRows.get(command.key);
      if(!entry||!entry.element.isConnected||!visible(entry.element)||rowTitle(entry.element)!==entry.title)throw new Error('聊天室列表已改變，請重新輸入 /chats；未點選任何項目。');
      const previousThread=thread();
      entry.element.click();
      const until=Date.now()+8000;
      do{
        await new Promise(resolve=>setTimeout(resolve,100));
        const id=thread();
        if(id&&id!==previousThread){openedTitle={thread:id,title:entry.title};return {snapshot:snapshot()};}
      }while(Date.now()<until);
      throw new Error('已點選列表，但未取得對話網址。請確認網頁是否切換；沒有傳送訊息。');
    }
    if(command.type==='navigate'){
      if(!/^\/direct\/(?:inbox|t\/[A-Za-z0-9_-]+)\/$/.test(command.path))throw new Error('不允許的對話路徑');
      if(command.path==='/direct/inbox/'){
        setTimeout(()=>location.assign('/direct/inbox/'),100);
        return {notice:'正在開啟私訊收件匣。'};
      }
      const a=queryAll(document,'a[href]').find(a=>{const url=new URL(a.href,location.href);return url.origin===location.origin&&url.pathname.replace(/\/?$/,'/')===command.path&&visible(a);});
      if(a){a.click();return {notice:'已選取對話，等待頁面更新。'};}
      // Return before navigating so the command is acknowledged exactly once.
      setTimeout(()=>location.assign(command.path),100);
      return {notice:'正在開啟收件匣。'};
    }
    if(command.type==='send'){
      if(!command.thread||thread()!==command.thread)throw new Error('網頁對話與 CLI 顯示不同，已取消送出；請 /r 更新。');
      if(typeof command.text!=='string'||!command.text.trim()||command.text.length>10000)throw new Error('訊息為空或過長');
      const boxes=editors();
      if(boxes.length!==1)throw new Error('無法唯一辨識訊息輸入框，未送出。');
      const box=boxes[0];
      if((box.value||box.textContent||'').trim())throw new Error('網頁已有草稿，為避免覆蓋，請先處理草稿。');
      box.focus();
      if(box.tagName==='TEXTAREA'){
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,command.text);
        box.dispatchEvent(new Event('input',{bubbles:true}));
      }else if(!document.execCommand('insertText',false,command.text))throw new Error('無法填入文字，未送出。');
      await new Promise(resolve=>setTimeout(resolve,250));
      if(thread()!==command.thread)throw new Error('對話已切換，未送出。');
      if((box.value||box.textContent||'').trim()!==command.text.trim())throw new Error('輸入框內容不符，未送出，請檢查網頁。');
      const scope=box.closest('main,[role="main"]')||document.body;
      const buttons=queryAll(scope,'button,[role="button"]').filter(e=>visible(e)&&e.getAttribute('aria-disabled')!=='true'&&!e.disabled&&/^(send|傳送|发送|發送|送出)$/i.test((e.getAttribute('aria-label')||text(e)).trim()));
      if(buttons.length!==1)throw new Error('無法唯一辨識傳送按鈕，文字保留在網頁草稿，未點擊送出。');
      buttons[0].click();
      return {notice:'已點擊網頁的傳送按鈕；請核對對話是否出現訊息，程式不會重送。'};
    }
    throw new Error('不支援的指令');
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||message.source!=='nightchat')return;
    execute(message.command).then(reply,e=>reply({error:e.message}));return true;
  });
  if(globalThis.InsLiveReader&&typeof MutationObserver!=='undefined'){
    globalThis.InsLiveReader.watchSnapshots({root:document,read:snapshot,publish:snapshot=>chrome.runtime.sendMessage({source:'nightchat',type:'snapshotChanged',snapshot})});
  }
})();
