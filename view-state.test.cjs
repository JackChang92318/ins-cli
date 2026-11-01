const assert=require('node:assert/strict');
const {viewKey,shouldDisplay}=require('./view-state.cjs');
function runChecks(){
  let count=0;
  const original={thread:'123',path:'/direct/t/123/',title:'Friend',messages:[],warning:'尚未辨識到訊息列',chats:[],diagnostics:{totalButtons:10}};
  const key=viewKey(original);
  // Reproduce title/sidebar/diagnostic churn from periodic browser snapshots.
  for(let n=0;n<100;n++){
    const next={...original,title:n%2?'通知通知':'Friend',chats:[{key:'row-'+n,title:'Side '+n}],diagnostics:{totalButtons:n}};
    assert.equal(shouldDisplay(next,key),false);
  }count++;
  assert.equal(shouldDisplay({...original,messages:['new message'],warning:''},key),true);count++;
  assert.equal(shouldDisplay({...original,thread:'other'},key),true);count++;
  assert.equal(shouldDisplay(original,key,{force:true}),true);count++;
  assert.equal(shouldDisplay({path:'/direct/inbox/',thread:null,chats:[]},key,{previousThread:'123'}),false);count++;
  assert.equal(shouldDisplay({path:'/direct/inbox/',thread:null,chats:[{title:'Friend'}]},key,{previousThread:'123'}),true);count++;
  const inbox={path:'/direct/inbox/',chats:[{key:'row-1',title:'Friend'}]};
  assert.equal(viewKey(inbox),viewKey({...inbox,chats:[{key:'row-999',title:'Friend'}]}));count++;
  assert.equal(shouldDisplay({...inbox,chats:[{title:'Other'}]},viewKey(inbox)),true);count++;
  return count;
}
if(require.main===module){try{console.log(`${runChecks()} view update checks passed`);}catch(e){console.error(e);process.exitCode=1;}}
module.exports={runChecks};
