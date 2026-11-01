const entries=require('./emoji-data.json');
const aliases=new Map(),names=new Map();
const normalize=value=>value.replace(/\uFE0F/g,'');
for(const [emoji,list] of entries){
  for(const name of list)aliases.set(name.toLowerCase(),emoji);
  names.set(normalize(emoji),list[0]);
}
// Familiar Discord-style aliases in addition to gemoji's canonical names.
for(const [alias,target] of Object.entries({thumbsup:'+1',thumbs_up:'+1',thumbsdown:'-1',thumbs_down:'-1',pleading:'pleading_face',rofl:'rofl',flag_tw:'taiwan'})){
  if(aliases.has(target))aliases.set(alias,aliases.get(target));
}
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
function addTone(emoji,tone){
  if(!tone||! /\p{Emoji_Modifier_Base}/u.test(emoji))return emoji;
  return emoji.replace(/\p{Emoji_Modifier_Base}/u,char=>char+String.fromCodePoint(0x1f3fb+Number(tone)-2));
}
function fromShortcodes(text){
  return String(text).replace(/:([a-z0-9_+\-]+):(?::skin[-_]tone[-_]([2-6]):)?/gi,(whole,name,tone)=>{
    const emoji=aliases.get(name.toLowerCase());
    if(emoji)return addTone(emoji,tone);
    if(/^unicode_(?:[0-9a-f]{2,6}_)*[0-9a-f]{2,6}$/i.test(name)){
      try{
        const value=String.fromCodePoint(...name.slice(8).split('_').map(code=>parseInt(code,16)));
        if(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(value)&&/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{Mark}|\u200D|[\u{E0020}-\u{E007F}])+$/u.test(value))return value;
      }catch{}
    }
    // Unknown shortcode is ordinary text, not a reason to drop the message.
    return whole;
  });
}
function toShortcodes(text){
  return Array.from(segmenter.segment(String(text)),part=>{
    const value=part.segment,key=normalize(value);
    const exact=names.get(key);
    if(exact)return ':'+exact+':';
    const modifiers=[...value.matchAll(/\p{Emoji_Modifier}/gu)];
    const base=value.replace(/\p{Emoji_Modifier}/gu,'');
    const name=names.get(normalize(base));
    if(name&&modifiers.length===1){
      const tone=modifiers[0][0].codePointAt(0)-0x1f3fb+2;
      if(normalize(addTone(aliases.get(name),tone))===key)return `:${name}::skin-tone-${tone}:`;
    }
    // Keep newer/unmapped emoji recoverable without inventing a Unicode name.
    if(/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value))return ':unicode_'+Array.from(value,c=>c.codePointAt(0).toString(16)).join('_')+':';
    return value;
  }).join('');
}
module.exports={fromShortcodes,toShortcodes};
