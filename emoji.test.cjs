const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const format=require('./extension/message-format.js');
async function runChecks(){
  for(const emoji of ['😂','❤️','👍🏽','👨‍👩‍👧‍👦','🇹🇼','1️⃣'])assert.equal(format.emojiAlt(emoji),emoji);
  for(const alt of ['Profile picture','photo of Alice',':smile:','hello 😂'])assert.equal(format.emojiAlt(alt),'');
  const txt=value=>({nodeType:3,nodeValue:value,textContent:value});
  function element(tag,children=[],alt=''){
    const node={nodeType:1,tagName:tag,childNodes:children,alt,getAttribute:()=>null,getClientRects:()=>[{}],contains:other=>children.includes(other),getBoundingClientRect:()=>({left:600,top:200,width:200,height:40})};
    Object.defineProperty(node,'textContent',{get:()=>children.map(c=>c.textContent||'').join('')});
    node.querySelectorAll=selector=>{
      const all=[];function visit(parent){for(const child of parent.childNodes||[]){if(child.nodeType===1){all.push(child);visit(child);}}}visit(node);
      if(selector==='*')return all;
      if(selector==='img')return all.filter(e=>e.tagName==='IMG');
      return [];
    };
    return node;
  }
  const emoji=alt=>element('IMG',[],alt);
  const rows=[element('ARTICLE',[emoji('😂')]),element('ARTICLE',[txt('太好笑'),emoji('😂'),txt('了')]),
    element('ARTICLE',[emoji('❤️'),emoji('👍🏽'),emoji('🇹🇼')]),
    element('ARTICLE',[emoji('Alice profile picture'),txt('嗨'),emoji('👨‍👩‍👧‍👦')]),
    element('ARTICLE',[emoji('photo of scenery')])];
  const main={querySelectorAll:selector=>selector==='*'?rows:selector==='[role="article"],article'?rows:[]};
  const document={body:main,title:'Instagram',readyState:'complete',querySelectorAll:selector=>selector==='*'?[main]:selector==='main,[role="main"]'?[main]:[]};
  let listener;
  const chrome={runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/extension/content.js','utf8'),{InsMessageFormat:format,document,chrome,location:{pathname:'/direct/t/123/',href:'https://www.instagram.com/direct/t/123/',origin:'https://www.instagram.com'},getComputedStyle:()=>({visibility:'visible'}),innerWidth:1400,URL});
  const result=await new Promise(resolve=>listener({source:'nightchat',command:{type:'snapshot'}},{id:'test'},resolve));
  assert.deepEqual(Array.from(result.snapshot.messages,m=>m.text),['😂','太好笑😂了','❤️👍🏽🇹🇼','嗨👨‍👩‍👧‍👦','[圖片／貼圖]']);
  return 11;
}
if(require.main===module)runChecks().then(n=>console.log(`${n} emoji checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={runChecks};
