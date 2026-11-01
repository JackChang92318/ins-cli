// Only compare the content rendered in the terminal, not DOM diagnostics,
// transient page titles, sidebar previews or ephemeral element keys.
function viewKey(snapshot){
  if(!snapshot)return null;
  if(snapshot.thread)return JSON.stringify({
    thread:String(snapshot.thread),
    messages:snapshot.messages||[],
    warning:snapshot.warning||'',
  });
  return JSON.stringify({
    path:snapshot.path,
    chats:(snapshot.chats||[]).map(chat=>({path:chat.path||'',title:chat.title||'',preview:chat.preview||'',unread:chat.unread??null,unreadCount:chat.unreadCount??null})),
    warning:snapshot.warning||'',
  });
}
function shouldDisplay(snapshot,previousKey,{force=false,previousThread=null}={}){
  if(!snapshot)return false;
  // Navigation can briefly publish an empty inbox before the sidebar loads.
  // Do not replace an open conversation with that intermediate state.
  if(!force&&previousThread&&!snapshot.thread&&!snapshot.chats?.length)return false;
  return force||viewKey(snapshot)!==previousKey;
}
module.exports={viewKey,shouldDisplay};
