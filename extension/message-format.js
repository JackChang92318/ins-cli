(()=>{
  function emojiAlt(value){
    const alt=String(value||'').trim();
    if(!/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u.test(alt))return '';
    return /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{Mark}|\u200D|[\u{E0020}-\u{E007F}]|[0-9#*]\uFE0F?\u20E3|\s)+$/u.test(alt)?alt:'';
  }
  function shareUrl(href,base){
    try{
      let url=new URL(href,base);
      if(url.hostname==='l.instagram.com'&&url.searchParams.has('u'))url=new URL(url.searchParams.get('u'));
      if(!/^https?:$/.test(url.protocol)||!/(^|\.)instagram\.com$/.test(url.hostname))return null;
      const match=url.pathname.match(/^\/(?:(?<author>[^/]+)\/)?(?<type>reel|reels|p|tv)\/(?<id>[\w-]+)\/?$/);
      if(!match)return null;
      return {kind:/^reels?$/.test(match.groups.type)?'reel':'post',author:match.groups.author||null,url:'https://www.instagram.com'+url.pathname.replace(/\/?$/,'/')};
    }catch{return null;}
  }
  function participantName(value){
    const name=String(value||'').trim();
    return /^(?:在線上|線上|目前在線上|上線中|online|active now|Instagram 對話)$/i.test(name)||/^(?:\d+\s*(?:分鐘|小時|天)前在線上|active \d+.*ago)$/i.test(name)?null:name||null;
  }
  function buildMessage({body='',labels=[],links=[],bubbleRect=null,editorRect=null,participant=null,directionHint=null}={}){
    participant=participantName(participant);
    let sender=null,direction='unknown';
    for(const label of labels.filter(Boolean)){
      if(/(?:^you$|you sent|sent by you|你傳送|你发送|由你傳送)/i.test(label)){sender='你';direction='outgoing';break;}
      const from=label.match(/(?:來自|来自)(.+?)(?:的訊息|的消息|的讯息)/);
      if(from){sender=from[1].trim();direction=sender==='你'?'outgoing':'incoming';break;}
      const match=label.match(/(?:message (?:sent )?by|message from|sent by|傳送者|发送者|來自|来自)\s*[:：]?\s*([^,，\n]+)/i);
      if(match){sender=match[1].trim();direction=/^(you|你)$/i.test(sender)?'outgoing':'incoming';break;}
      const chinese=label.match(/^(.+?)\s*(?:傳送的訊息|发送的消息)/);
      if(chinese){sender=chinese[1].trim();direction=sender==='你'?'outgoing':'incoming';break;}
    }
    const firstLine=body.split('\n')[0].trim();
    if(!sender&&(firstLine==='你'||participant&&firstLine===participant)&&body.includes('\n')){
      sender=firstLine;direction=sender==='你'?'outgoing':'incoming';body=body.slice(body.indexOf('\n')+1).trim();
    }
    if(!sender&&/^你[：:]/.test(body)){sender='你';direction='outgoing';body=body.replace(/^你[：:]\s*/, '');}
    if(!sender&&participant&&body.startsWith(participant+'：')){sender=participant;direction='incoming';body=body.slice(participant.length+1).trim();}
    if(!sender&&directionHint==='outgoing'){sender='你';direction='outgoing';}
    if(!sender&&directionHint==='incoming'){sender=participant||'對方';direction='incoming';}
    if(!sender&&bubbleRect&&editorRect&&bubbleRect.width<editorRect.width*.98){
      const middle=editorRect.left+editorRect.width/2;
      const center=bubbleRect.left+bubbleRect.width/2;
      // Long bubbles can occupy almost the whole pane. Compare their two
      // margins as well as the midpoint, without guessing on centered rows.
      const leftGap=bubbleRect.left-editorRect.left;
      const rightGap=editorRect.left+editorRect.width-bubbleRect.left-bubbleRect.width;
      if(center>middle+25||leftGap>=0&&rightGap>=-12&&leftGap-rightGap>24){sender='你';direction='outgoing';}
      else if(center<middle-25||rightGap>=0&&leftGap>=-12&&rightGap-leftGap>24){sender=participant||'對方';direction='incoming';}
    }
    if(!sender)sender='發送者未辨識';
    const shared=links.map(link=>shareUrl(link.href,'https://www.instagram.com/')).find(Boolean)
      ||(body.match(/https?:\/\/[^\s<>]+/g)||[]).map(href=>shareUrl(href)).find(Boolean);
    if(shared){
      const profile=links.find(link=>{
        try{const u=new URL(link.href,'https://www.instagram.com/');return /(^|\.)instagram\.com$/.test(u.hostname)&&/^\/[\w.]+\/?$/.test(u.pathname)&&!/^\/(direct|explore|accounts|stories|reels?)\/?$/.test(u.pathname)&&link.text?.trim();}catch{return false;}
      });
      const author=shared.author||profile?.text?.trim().split('\n')[0]||null;
      return {sender,direction,kind:shared.kind,author,url:shared.url,text:`傳送了${author?' '+author+' 的':''} ${shared.kind==='reel'?'Reel':'貼文'}`};
    }
    return {sender,direction,kind:'text',text:body.trim()};
  }
  const api={buildMessage,shareUrl,emojiAlt,participantName};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.InsMessageFormat=api;
})();
