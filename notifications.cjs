const safe=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,100);
const fingerprint=message=>JSON.stringify(typeof message==='string'?message:[message.text||'',message.url||'',message.kind||'text']);
const chatKey=chat=>chat.path||chat.title;
const signature=chat=>JSON.stringify([chat.unread===true,chat.unreadCount??null,chat.preview||'']);
class Notifications{
  constructor({output=process.stdout,now=Date.now}={}){
    Object.assign(this,{output,now,chats:new Map(),threads:new Map(),pending:new Map(),acknowledged:new Map(),title:null,lastBell:-Infinity,initialized:false});
  }
  update(snapshot){
    if(!snapshot)return false;
    if(!snapshot.thread&&!snapshot.chats?.length){this.render(snapshot);return false;}
    let fresh=false;
    for(const chat of snapshot.chats||[]){
      const key=chatKey(chat);if(!key)continue;
      const previous=this.chats.get(key);
      if(this.initialized&&chat.unread===true&&!/^\s*(?:你|you)\s*[:：]/i.test(chat.preview||'')){
        if(!previous||previous.unread!==true||Number(chat.unreadCount)>Number(previous.unreadCount)||(chat.preview&&chat.preview!==previous.preview))fresh=true;
      }
      this.chats.set(key,{...chat});
    }
    if(snapshot.thread){
      const list=snapshot.messages||[],previous=this.threads.get(snapshot.thread);
      const keys=list.map(fingerprint);
      if(previous?.length&&keys.length){
        // Only an append after an overlapping tail is a new message. Loading
        // history, changing chats and an initial snapshot are silent.
        let overlap=0;
        for(let n=Math.min(previous.length,keys.length);n>0;n--){
          if(previous.slice(-n).every((key,i)=>key===keys[i])){overlap=n;break;}
        }
        if(overlap){
          const incoming=list.slice(overlap).filter(message=>message.direction==='incoming').length;
          if(incoming){fresh=true;this.pending.set(snapshot.thread,(this.pending.get(snapshot.thread)||0)+incoming);}
        }
      }
      // Preserve the last real tail across temporary empty loading frames.
      if(keys.length||!previous)this.threads.set(snapshot.thread,keys);
    }
    this.initialized=true;
    this.render(snapshot);
    if(fresh&&this.output.isTTY&&this.now()-this.lastBell>=1500){this.output.write('\x07');this.lastBell=this.now();}
    return fresh;
  }
  acknowledge(snapshot){
    if(!snapshot?.thread)return;
    this.pending.delete(snapshot.thread);
    for(const [key,chat] of this.chats){
      if(chat.path===snapshot.path||chat.title===snapshot.title)this.acknowledged.set(key,signature(chat));
    }
    this.render(snapshot);
  }
  render(snapshot){
    let count=0,approximate=false;
    const pending=new Map(this.pending);
    for(const [key,chat] of this.chats){
      if(chat.unread!==true||this.acknowledged.get(key)===signature(chat))continue;
      const thread=chat.path?.match(/^\/direct\/t\/([^/]+)/)?.[1];
      const local=thread?pending.get(thread)||0:chat.title===snapshot?.title?pending.get(snapshot.thread)||0:0;
      count+=Math.max(Number.isInteger(chat.unreadCount)&&chat.unreadCount>0?chat.unreadCount:1,local);
      if(!Number.isInteger(chat.unreadCount))approximate=true;
      if(thread)pending.delete(thread);else if(chat.title===snapshot?.title)pending.delete(snapshot.thread);
    }
    count+=[...pending.values()].reduce((a,b)=>a+b,0);
    const title=(count?`● (${count}${approximate?'+':''}) `:'')+'ins-cli'+(snapshot?.thread?' · '+safe(snapshot.title||'聊天室'):'');
    if(title!==this.title){
      this.title=title;
      if(this.output.isTTY)this.output.write('\x1b]2;'+title+'\x1b\\');
    }
  }
  close(){if(this.output.isTTY)this.output.write('\x1b]2;ins-cli\x1b\\');}
}
module.exports={Notifications};
