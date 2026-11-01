(()=>{
  function summarizeChatText({rowText='',title=''}={}){
    const lines=String(rowText).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const name=String(title||lines[0]||'對話').split(/\r?\n/)[0].trim();
    let rest=lines.join(' ');
    if(rest.startsWith(name))rest=rest.slice(name.length).trim();
    // Remove only a trailing list timestamp, preserving the actual message.
    const time='(?:\\d+\\s*(?:秒(?:鐘)?|分鐘|分钟|小时|小時|天|週|周|月|年|seconds?|minutes?|hours?|days?|weeks?|months?|years?|[smhdw])(?:前)?|剛剛|刚刚|just now)';
    rest=rest.replace(new RegExp('\\s*[·•]\\s*'+time+'\\s*$','i'),'').trim();
    return {title:name.slice(0,180),preview:rest.slice(0,500)};
  }
  function previewUnread(preview){
    const value=String(preview||'').trim();
    const match=value.match(/^(\d+)\s+(?:new|unread)\s+messages?$/i)
      ||value.match(/^(?:有\s*)?(\d+)\s*(?:則|条|個|个)?\s*(?:新|未讀|未读)(?:訊息|消息)$/);
    if(!match)return null;
    const count=Number(match[1]);return Number.isSafeInteger(count)?count:null;
  }
  function looksLikeUnreadDot({tag='',text='',rect,container,color='',radius='0'}={}){
    if(!/^(SPAN|DIV)$/i.test(tag)||text.trim()||!rect||!container)return false;
    const {width,height,left,top}=rect;
    if(width<4||width>14||height<4||height>14||width/height<.75||width/height>1.34)return false;
    if(left<container.left+container.width*.6||left+width>container.left+container.width+2||top<container.top||top+height>container.top+container.height+2)return false;
    const rgb=color.match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
    if(!rgb||rgb[4]!==undefined&&Number(rgb[4])<.5)return false;
    const [,red,green,blue]=rgb.map(Number);
    return red<100&&green>=50&&green<=190&&blue>=180&&blue-green>=40&&parseFloat(radius)>=Math.min(width,height)*.4;
  }
  function parseUnreadEvidence({count=null,state=null,labels=[],badges=[],visualUnread=false,preview=''}={}){
    const previewCount=previewUnread(preview);
    if(previewCount!==null)return {unread:previewCount>0,unreadCount:previewCount};
    if(typeof count==='string'&&/^\d+$/.test(count.trim())){
      const value=Number(count);if(Number.isSafeInteger(value))return {unread:value>0,unreadCount:value};
    }
    if(state==='false'||state==='0')return {unread:false,unreadCount:0};
    let unread=state==='true'||state==='1'||visualUnread?true:null;
    for(const original of labels){
      const label=String(original||'').trim();
      if(/mark\s+as\s+(?:unread|read)|(?:標示|标记|標記).{0,4}(?:未讀|未读|已讀|已读)/i.test(label))continue;
      const match=label.match(/(\d+)\s*(?:則|条|個|个)?\s*(?:未讀|未读)(?:訊息|消息)?|(?:未讀|未读)(?:訊息|消息)?(?:數|数)?\s*[:：]?\s*(\d+)|(\d+)\s+(?:unread|new)\s+messages?|unread\s+messages?\s*[:：]?\s*(\d+)/i);
      if(match){const value=Number(match.slice(1).find(v=>v!==undefined));return {unread:value>0,unreadCount:value};}
      if(/未讀|未读|\bunread\b/i.test(label))unread=true;
    }
    if(unread){
      const badge=badges.map(String).find(s=>/^\d+$/.test(s.trim()));
      if(badge!==undefined){const value=Number(badge);return {unread:value>0,unreadCount:value};}
    }
    return {unread,unreadCount:null};
  }
  const api={parseUnreadEvidence,looksLikeUnreadDot,summarizeChatText,previewUnread};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.InsUnread=api;
})();
