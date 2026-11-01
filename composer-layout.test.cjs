const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {CommandInput,cells}=require('./command-input.cjs');
const {renderChat}=require('./chat-view.cjs');
class Screen{
  constructor(){this.rows=24;this.columns=80;this.row=0;this.col=0;this.lines=Array.from({length:24},()=>Array(80).fill(''));this.scrolls=0;}
  write(text){
    for(let i=0;i<text.length;){
      const match=text.slice(i).match(/^\x1b\[([\d;]*)([A-Za-z])/);
      if(match){
        const args=match[1].split(';').map(Number),op=match[2];i+=match[0].length;
        if(op==='H'){this.row=(args[0]||1)-1;this.col=(args[1]||1)-1;}
        if(op==='A')this.row=Math.max(0,this.row-(args[0]||1));
        if(op==='C')this.col+=args[0]||1;
        if(op==='J'){
          if(args[0]===2)this.lines=Array.from({length:24},()=>Array(80).fill(''));
          else{this.lines[this.row].fill('',this.col);for(let r=this.row+1;r<24;r++)this.lines[r].fill('');}
        }
        continue;
      }
      const char=String.fromCodePoint(text.codePointAt(i));i+=char.length;
      if(char==='\r'){this.col=0;continue;}
      if(char==='\n'){
        this.col=0;this.row++;
        if(this.row>=24){this.lines.shift();this.lines.push(Array(80).fill(''));this.row=23;this.scrolls++;}
        continue;
      }
      this.lines[this.row][this.col]=char;this.col+=cells(char);
    }
  }
  line(n){return this.lines[n].join('');}
}
async function runChecks(){
  const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};
  const screen=new Screen();
  screen.write(renderChat({title:'Alice',messages:[{sender:'Alice',text:'hello'}]},{rows:24,columns:80}));
  const editor=new CommandInput({input,output:screen});editor.fullscreen=true;
  const pending=editor.question();
  assert.ok(screen.line(14).startsWith('╭'));assert.ok(screen.line(15).startsWith('│ ›'));
  assert.ok(screen.line(16).startsWith('╰'));assert.ok(screen.line(17).includes('Enter 傳送'));
  editor.setStatus('已送出');assert.ok(screen.line(18).includes('已送出'));
  input.write('/');assert.ok(screen.line(19).includes('/chat'));assert.ok(screen.line(23).includes('/r'));
  assert.equal(screen.row,15);assert.equal(screen.scrolls,0);
  editor.printAbove(()=>screen.write(renderChat({title:'Alice',messages:[{sender:'Alice',text:'new message'}]},{rows:24,columns:80})));
  assert.ok(screen.line(15).includes('/'));assert.equal(editor.buffer.join(''),'/');
  assert.equal(screen.row,15);assert.equal(screen.scrolls,0);
  input.write('\x03');await pending;
  return 13;
}
if(require.main===module)runChecks().then(n=>console.log(`${n} composer layout checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
