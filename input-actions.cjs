const {fromShortcodes}=require('./emoji-codec.cjs');
function parseInput(value,thread){
  const text=value.trim();
  if(!text)return {type:'refresh'};
  if(text==='/chat'||text==='/chats')return {type:'chat'};
  if(text==='/quit')return {type:'quit'};
  if(text==='/r')return {type:'refresh'};
  if(text==='/inspect')return {type:'inspect'};
  if(text.startsWith('/open '))return {type:'open',index:Number(text.slice(6))-1};
  if(text.startsWith('/'))return {type:'error',message:'未知指令。輸入 / 選擇操作；聊天室內直接輸入文字即可傳送。'};
  if(!thread)return {type:'error',message:'請先用 /chat 選擇聊天室，再輸入訊息。'};
  return {type:'send',thread,text:fromShortcodes(text)};
}
module.exports={parseInput};
