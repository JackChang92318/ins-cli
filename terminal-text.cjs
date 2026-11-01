const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const segments=text=>Array.from(segmenter.segment(String(text)),part=>part.segment);
function cells(value){
  if(!value||/^[\p{Mark}\p{Format}]+$/u.test(value))return 0;
  if(/\p{Emoji_Presentation}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(value)||/[\uFE0F\u200D]/u.test(value)&&/\p{Extended_Pictographic}/u.test(value))return 2;
  const n=value.codePointAt(0);
  return n>=0x1100&&(n<=0x115f||n>=0x2e80&&n<=0xa4cf||n>=0xac00&&n<=0xd7af||n>=0xf900&&n<=0xfaff||n>=0xfe10&&n<=0xfe6f||n>=0xff00&&n<=0xff60)?2:1;
}
const width=text=>segments(text).reduce((sum,part)=>sum+cells(part),0);
function clip(text,limit){let result='',used=0;for(const part of segments(text)){const size=cells(part);if(used+size>limit)break;result+=part;used+=size;}return result;}
module.exports={segments,cells,width,clip};
