'use strict';
//@file 定数・DOM/日付/文字列ヘルパー・単語/ユニットデータ
/* ================= 基本 ================= */
const APP_V=1, KEY='eitan.v1', IDLE_MS=60000;
const PENDING_V=3;
const LEARN_ROUNDS=3;
const STEP_ORDER=['review','todayWords','learn','check1','useRead','useCloze','useOrder','check2','spell'];
const STEP_NAMES={review:'復習',todayWords:'ユニットの単語一覧',learn:'覚える',check1:'確認①',useRead:'例文を読もう',useCloze:'単語を選ぼう',useOrder:'英文をつくろう',check2:'確認②',spell:'スペル'};
const STEP_NUMBERS={todayWords:'1',learn:'2',check1:'3',useRead:'4.1',useCloze:'4.2',useOrder:'4.3',check2:'5',spell:'6'};
const INTERVALS=[0,1,3,7,14,30];   // 箱1〜5 → 次の復習までの日数
const WD=['日','月','火','水','木','金','土'];
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const $=(s,el=document)=>el.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const num=(x,d=0)=>{x=Number(x);return Number.isFinite(x)&&x>=0?x:d;};

function h(tag,attrs,...kids){
  const e=document.createElement(tag);
  if(attrs) for(const [k,v] of Object.entries(attrs)){
    if(v==null||v===false) continue;
    if(k==='class') e.className=v;
    else if(k.startsWith('on')) e.addEventListener(k.slice(2),v);
    else if(v===true) e.setAttribute(k,'');
    else e.setAttribute(k,v);
  }
  for(const kid of kids.flat(Infinity)){
    if(kid==null||kid===false) continue;
    e.append(kid.nodeType?kid:document.createTextNode(String(kid)));
  }
  return e;
}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const wordRe=w=>new RegExp('\\b'+esc(w)+(/[A-Za-z0-9]$/.test(w)?'\\b':'(?=$|[^A-Za-z0-9])'),'i');
function hl(sentence,word){
  const m=sentence.match(wordRe(word)); if(!m) return [sentence];
  return [sentence.slice(0,m.index),h('span',{class:'mark'},m[0]),sentence.slice(m.index+m[0].length)];
}
function ymd(d=new Date()){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function addDays(s,n){const [y,m,d]=s.split('-').map(Number);return ymd(new Date(y,m-1,d+n));}
function fmtDur(ms){const s=Math.round(ms/1000);return Math.floor(s/60)+':'+pad(s%60);}
function fmtDurJp(ms){const s=Math.round(ms/1000),m=Math.floor(s/60);return m>0?m+'分'+pad(s%60)+'秒':s+'秒';}

const WORDS=window.EITAN_WORDS;
const WORD_BOOKS=window.EITAN_BOOKS;
const BYWORD=Object.fromEntries(WORDS.map(w=>[w.id,w]));
const WORD_UNITS=WORD_BOOKS.flatMap(book=>{
  const units=[];
  for(let offset=0;offset<book.words.length;offset+=5){
    const number=units.length+1;
    units.push({id:book.id+'-unit-'+number,bookId:book.id,bookTitle:book.title,number,
      words:book.words.slice(offset,offset+5).map(word=>word.id)});
  }
  return units;
});
const BYUNIT=Object.fromEntries(WORD_UNITS.map(unit=>[unit.id,unit]));
