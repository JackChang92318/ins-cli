const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const unread=require('../extension/unread.js');
const {chatLabel}=require('../src/chat-picker.cjs');
const {viewKey}=require('../src/view-state.cjs');
async function runChecks(){
  const leo=unread.summarizeChatText({rowText:'Leo\n2 new messages · 2分鐘',title:'Leo'});
  assert.deepEqual(leo,{title:'Leo',preview:'2 new messages'});
  assert.deepEqual(unread.parseUnreadEvidence({preview:leo.preview}),{unread:true,unreadCount:2});
  const other=unread.summarizeChatText({rowText:'林子揚\n全對\n·\n36分鐘',title:'林子揚'});
  assert.equal(other.preview,'全對');
  assert.equal(unread.parseUnreadEvidence({preview:other.preview}).unread,null);
  assert.equal(unread.previewUnread('你: 2 new messages'),null);
  assert.equal(unread.previewUnread('我有 2 new messages 要處理'),null);
  assert.equal(unread.previewUnread('23分鐘前在線上'),null);
  assert.equal(unread.previewUnread('3 則新訊息'),3);
  assert.equal(unread.previewUnread('1 new message'),1);
  assert.equal(unread.summarizeChatText({title:'Friend',rowText:'Friend\n你: 晚點見 · 2 hours'}).preview,'你: 晚點見');
  assert.equal(chatLabel({...leo,unread:true,unreadCount:2}),'Leo [未讀 2 則]  — 2 new messages');
  assert.equal(chatLabel(other),'林子揚  — 全對');
  assert.notEqual(viewKey({path:'/direct/inbox/',chats:[{...leo}]}),viewKey({path:'/direct/inbox/',chats:[{...leo,preview:'hello'}]}));
  // DOM regression: unread summary is visible row text with no ARIA marker,
  // unread badge, custom data attribute, or CSS dot to inspect.
  let listener;
  const base={getClientRects:()=>[{}],getAttribute:()=>null};
  const anchor={...base,innerText:'Leo',href:'https://www.instagram.com/direct/t/123/',querySelectorAll:()=>[]};
  const row={...base,innerText:'Leo\n2 new messages · 2分鐘',getBoundingClientRect:()=>({left:100,top:350,width:400,height:80}),querySelectorAll:selector=>selector==='*'||selector==='a[href]'?[anchor]:[]};
  anchor.parentElement=row;
  const main={querySelectorAll:()=>[]};
  const document={body:main,title:'Instagram',readyState:'complete',querySelectorAll:selector=>selector==='*'?[row,main]:selector==='a[href]'?[anchor]:selector==='main,[role="main"]'?[main]:[]};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/content.js','utf8'),{document,InsUnread:unread,InsMessageFormat:require('../extension/message-format.js'),chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}},location:{pathname:'/direct/inbox/',href:'https://www.instagram.com/direct/inbox/',origin:'https://www.instagram.com'},getComputedStyle:()=>({visibility:'visible'}),URL});
  const result=await new Promise(resolve=>listener({source:'nightchat',command:{type:'snapshot'}},{id:'test'},resolve));
  const chat=result.snapshot.chats[0];assert.equal(chat.title,'Leo');assert.equal(chat.preview,'2 new messages');assert.equal(chat.unreadCount,2);
  return 16;
}
if(require.main===module)runChecks().then(n=>console.log(`${n} chat preview checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
