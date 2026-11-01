const {segments,cells,clip}=require('./terminal-text.cjs');
const safe=value=>String(value??'').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
function wrap(value,columns){
  const result=[];
  for(const paragraph of safe(value).split('\n')){
    let line='',used=0;
    for(const char of segments(paragraph)){
      const size=cells(char);
      if(used+size>columns){result.push(line);line='';used=0;}
      line+=char;used+=size;
    }
    result.push(line);
  }
  return result;
}
function renderChat(snapshot,{columns=80,rows=24}={}){
  const width=Math.max(12,columns-2);
  // The composer occupies the final ten rows (box, hint, status, candidates).
  const contentRows=Math.max(3,rows-10);
  const capacity=Math.max(1,contentRows-2);
  const body=[];
  for(const message of snapshot.messages||[]){
    const item=typeof message==='string'?{sender:'發送者未辨識',text:message}:message;
    const indent=item.direction==='outgoing'?'    ':'  ';
    const name=safe(item.sender||'發送者未辨識');
    const lines=wrap((item.text||'')+(item.url?'\n'+item.url:''),Math.max(4,width-indent.length));
    body.push({name,text:clip(name+'：',width)},...lines.map(line=>({name,text:indent+line})),{name,text:''});
  }
  if(!body.length)body.push(...wrap(snapshot.warning||'等待訊息…',width).map(text=>({name:null,text})));
  if(body.at(-1)?.text==='')body.pop();
  const clipped=body.length>capacity;
  const visible=body.slice(-capacity);
  if(clipped&&visible[0]?.name&&visible[0].text!==clip(visible[0].name+'：',width))visible[0]={...visible[0],text:clip(visible[0].name+'（接續）：',width)};
  const title=/^(在線上|在线|online|active now)$/i.test(snapshot.title||'')?'聊天室':snapshot.title||'聊天室';
  const lines=[clip('ins-cli  /  '+safe(title),width),'',...visible.map(line=>line.text)];
  // Fixed composer position, independent of the number of loaded messages.
  while(lines.length<contentRows)lines.push('');
  return '\x1b[2J\x1b[H'+lines.join('\n')+'\n';
}
module.exports={renderChat,wrap};
