const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PassThrough}=require('node:stream');
const unread=require('../extension/unread.js');
const {width,clip}=require('../src/terminal-text.cjs');
const {CommandInput}=require('../src/command-input.cjs');
const {renderChat,wrap}=require('../src/chat-view.cjs');
async function runChecks(){
  const container={left:100,top:350,width:400,height:80};
  const rect={left:470,top:380,width:8,height:8};
  const dot={tag:'SPAN',text:'',rect,container,color:'rgb(0, 149, 246)',radius:'50%'};
  assert.equal(unread.looksLikeUnreadDot(dot),true);
  assert.equal(unread.looksLikeUnreadDot({...dot,color:'rgb(0, 200, 80)'}),false);
  assert.equal(unread.looksLikeUnreadDot({...dot,tag:'SVG'}),false);
  assert.equal(unread.looksLikeUnreadDot({...dot,radius:'0px'}),false);
  assert.equal(unread.looksLikeUnreadDot({...dot,rect:{...rect,left:120}}),false);
  assert.deepEqual(unread.parseUnreadEvidence({visualUnread:true}),{unread:true,unreadCount:null});
  assert.deepEqual(unread.parseUnreadEvidence({visualUnread:true,state:'false'}),{unread:false,unreadCount:0});
  for(const emoji of ['🥺','❤️','👍🏽','🇹🇼','👨‍👩‍👧‍👦']){
    assert.equal(width(emoji),2);assert.equal(clip(emoji,1),'');assert.equal(clip(emoji,2),emoji);
    assert.deepEqual(wrap(emoji+'a',2),[emoji,'a']);
  }
  const screen=renderChat({title:'Friend',messages:[{sender:'Friend',text:'🥺❤️'}]},{rows:24,columns:80});
  assert.ok(screen.includes('🥺❤️'));assert.ok(!screen.includes(':pleading_face:'));
  const stream=new PassThrough();stream.isTTY=true;stream.setRawMode=()=>{};
  const input=new CommandInput({input:stream,output:{write(){},rows:24,columns:80}});
  const line=input.question();stream.write('A👨‍👩‍👧‍👦');assert.equal(input.buffer.length,2);
  stream.write('\x7f\r');assert.equal(await line,'A');
  // Regression: the dot is a sibling of the anchor, not inside it.
  const base={getClientRects:()=>[{}],getAttribute:()=>null};
  const dotNode={...base,tagName:'SPAN',innerText:'',getBoundingClientRect:()=>rect};
  const anchor={...base,tagName:'A',innerText:'Friend',href:'https://www.instagram.com/direct/t/123/',getBoundingClientRect:()=>({left:150,top:360,width:60,height:20}),querySelectorAll:()=>[]};
  const row={...base,tagName:'DIV',getBoundingClientRect:()=>container,querySelectorAll(selector){if(selector==='*')return [anchor,dotNode];if(selector==='a[href]')return [anchor];if(selector==='span,div')return [dotNode];return [];}};
  anchor.parentElement=row;
  const main={querySelectorAll:()=>[]};
  const document={body:main,title:'Instagram',readyState:'complete',querySelectorAll:selector=>selector==='*'?[anchor,row,main]:selector==='a[href]'?[anchor]:selector==='main,[role="main"]'?[main]:[]};
  let listener;
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/content.js','utf8'),{document,InsMessageFormat:require('../extension/message-format.js'),InsUnread:unread,chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}},location:{pathname:'/direct/inbox/',href:'https://www.instagram.com/direct/inbox/',origin:'https://www.instagram.com'},getComputedStyle:node=>node===dotNode?{visibility:'visible',backgroundColor:'rgb(0, 149, 246)',borderRadius:'50%'}:{visibility:'visible'},URL});
  const result=await new Promise(resolve=>listener({source:'nightchat',command:{type:'snapshot'}},{id:'test'},resolve));
  assert.equal(result.snapshot.chats[0].unread,true);assert.equal(result.snapshot.chats[0].unreadCount,null);
  return 'native emoji and grapheme editing, blue unread dot, and unread siblings outside links';
}
if(require.main===module)runChecks().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
