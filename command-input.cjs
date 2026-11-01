const readline=require('node:readline');
const {segments,cells,width,clip}=require('./terminal-text.cjs');
const COMMANDS=[
  {name:'/chat',description:'選擇／切換聊天室'},
  {name:'/inspect',description:'查看連線診斷'},
  {name:'/open',description:'開啟聊天室編號',argument:true},
  {name:'/quit',description:'離開'},
  {name:'/r',description:'更新畫面'},
];
const clean=s=>String(s).replace(/[\x00-\x1f\x7f-\x9f]/g,'');
function printable(value,key={}){
  // Some terminal keyboard protocols encode Shift+? instead of sending '?'.
  const encoded=key.sequence?.match(/^\x1b\[(\d+)(?:;(1|2))?u$/);
  if(encoded){
    const code=Number(encoded[1]);
    return code>=32&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?clean(String.fromCodePoint(code)):'';
  }
  return value&&!key.ctrl&&!key.meta?clean(value):'';
}
function matches(value){
  if(!/^\/[a-z]*$/.test(value))return [];
  return COMMANDS.filter(c=>c.name.startsWith(value));
}

class CommandInput{
  constructor({input=process.stdin,output=process.stdout,prompt='› '}={}){
    Object.assign(this,{input,output,prompt,active:false,cursorRow:0,fullscreen:false,status:''});
  }
  panelTop(){return Math.max(1,(this.output.rows||24)-9);}
  erase(){
    this.output.write((this.fullscreen?`\x1b[${this.panelTop()};1H`:(this.cursorRow?`\x1b[${this.cursorRow}A`:''))+'\r\x1b[J');
    this.cursorRow=0;
  }
  setStatus(message){
    this.status=clean(message);
    if(this.active)this.draw();
    else if(this.buffer){
      if(!this.capturing){this.buffer=[];this.cursor=0;this.seed=null;this.hidden=true;}
      this.draw();
    }
  }
  interrupt(line){
    if(!this.active||!this.pendingFinish)return false;
    if(this.buffer.length)this.draft=this.buffer.join('');
    this.pendingFinish(line,false);
    return true;
  }
  captureDraft(){
    if(!this.input.isTTY||this.active)return ()=>{};
    this.capturing=true;
    const wasRaw=this.input.isRaw,wasPaused=this.input.isPaused();
    this.buffer=segments(this.draft||'');this.cursor=this.buffer.length;this.seed=null;this.hidden=true;
    const onKey=(value,key={})=>{
      if(key.name==='backspace'){if(this.buffer.length)this.buffer.pop();}
      else this.buffer.push(...segments(printable(value,key)));
      this.cursor=this.buffer.length;this.draft=this.buffer.join('');this.draw();
    };
    readline.emitKeypressEvents(this.input);this.input.setRawMode(true);
    this.input.on('keypress',onKey);this.input.resume();
    return ()=>{
      this.capturing=false;
      this.input.removeListener('keypress',onKey);
      this.input.setRawMode(Boolean(wasRaw));if(wasPaused)this.input.pause();
    };
  }
  close(){
    this.input.setRawMode?.(false);
    this.input.pause();
    this.output.write('\x1b[0m');
  }
  printAbove(print){if(!this.active){print();return;}this.erase();print();this.draw();}
  question(){
    if(!this.input.isTTY){
      return new Promise(resolve=>{const rl=readline.createInterface({input:this.input,output:this.output});rl.question(this.prompt,line=>{rl.close();resolve(line);});});
    }
    if(this.active)throw new Error('指令輸入已開啟');
    this.active=true;this.buffer=segments(this.draft||'');this.draft='';this.cursor=this.buffer.length;this.selected=0;this.seed=null;this.hidden=false;
    const wasRaw=this.input.isRaw,wasPaused=this.input.isPaused();
    return new Promise(resolve=>{
      let finished=false;
      const finish=(line,echo=true)=>{
        if(finished)return;finished=true;
        this.erase();
        if(echo&&!this.fullscreen)this.output.write(this.prompt+clean(line)+'\n');
        this.pendingFinish=null;
        this.active=false;this.input.removeListener('keypress',onKey);
        this.input.setRawMode(Boolean(wasRaw));if(wasPaused)this.input.pause();resolve(line);
      };
      this.pendingFinish=finish;
      const replace=value=>{this.buffer=segments(value);this.cursor=this.buffer.length;};
      const onKey=(value,key={})=>{
        if(key.ctrl&&(key.name==='c'||key.name==='d'&&!this.buffer.length))return finish('/quit');
        const list=this.suggestions();
        if(key.name==='tab'&&list.length){
          if(this.seed!==null)this.selected=(this.selected+(key.shift?-1:1)+list.length)%list.length;
          else{this.seed=this.buffer.join('');if(key.shift)this.selected=list.length-1;}
          const choice=list[this.selected];replace(choice.name+(choice.argument?' ':''));
        }else if((key.name==='up'||key.name==='down')&&list.length){
          if(this.seed===null)this.seed=this.buffer.join('');
          this.selected=(this.selected+(key.name==='up'?-1:1)+list.length)%list.length;
        }else if(key.name==='return'||key.name==='enter'){
          if(list.length){
            const choice=list[this.selected];
            replace(choice.name+(choice.argument?' ':''));
            if(choice.argument){this.seed=null;this.hidden=false;this.draw();return;}
          }
          return finish(this.buffer.join(''));
        }else if(key.name==='escape'){this.seed=null;this.hidden=true;}
        else{
          this.seed=null;this.selected=0;this.hidden=false;
          if(key.name==='left')this.cursor=Math.max(0,this.cursor-1);
          else if(key.name==='right')this.cursor=Math.min(this.buffer.length,this.cursor+1);
          else if(key.name==='home'||key.ctrl&&key.name==='a')this.cursor=0;
          else if(key.name==='end'||key.ctrl&&key.name==='e')this.cursor=this.buffer.length;
          else if(key.name==='backspace'&&this.cursor>0)this.buffer.splice(--this.cursor,1);
          else if(key.name==='delete')this.buffer.splice(this.cursor,1);
          else if(key.ctrl&&key.name==='u'){this.buffer.splice(0,this.cursor);this.cursor=0;}
          else if(printable(value,key)){
            const before=this.buffer.slice(0,this.cursor).join('')+printable(value,key);
            const after=this.buffer.slice(this.cursor).join('');
            this.buffer=segments(before+after);this.cursor=segments(before).length;
          }
        }
        this.draw();
      };
      readline.emitKeypressEvents(this.input);this.input.setRawMode(true);
      this.input.on('keypress',onKey);this.input.resume();this.draw();
    });
  }
  suggestions(){return this.hidden?[]:matches(this.seed===null?this.buffer.join(''):this.seed);}
  draw(){
    this.erase();
    const columns=Math.max(20,this.output.columns||80),prompt=clip(this.prompt,columns-8);
    const available=columns-width(prompt)-6;
    let start=0;
    while(start<this.cursor&&width(this.buffer.slice(start,this.cursor).join(''))>=available)start++;
    const view=clip(this.buffer.slice(start).join(''),available);
    const candidates=this.suggestions().map((c,i)=>clip(`  ${i===this.selected?'›':' '} ${c.name}  ${c.description}`,columns-2));
    const border='─'.repeat(columns-3);
    const padding=' '.repeat(Math.max(0,columns-5-width(prompt)-width(view)));
    const rows=['╭'+border+'╮','│ '+prompt+view+padding+' │','╰'+border+'╯',
      clip('  Enter 傳送   / 指令   /chat 換聊天室',columns-2),
      clip('  '+this.status,columns-2),...candidates];
    this.output.write(rows.join('\r\n'));
    this.output.write(`\x1b[${rows.length-2}A`);
    const col=2+width(prompt)+width(this.buffer.slice(start,this.cursor).join(''));
    this.output.write('\r'+(col?`\x1b[${col}C`:''));
    this.cursorRow=1;
  }
}
module.exports={CommandInput,matches,segments,cells,width,clip,printable};
