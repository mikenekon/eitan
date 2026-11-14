'use strict';
/* ================= 基本 ================= */
const APP_V=1, KEY='eitan.v1', IDLE_MS=60000;
const STEP_ORDER=['review','learn','check1','useRead','useCloze','useOrder','check2','spell'];
const STEP_NAMES={review:'復習',learn:'覚える',check1:'確認①',useRead:'例文を読もう',useCloze:'単語を選ぼう',useOrder:'英文をつくろう',check2:'確認②',spell:'スペル'};
const STEP_NUMBERS={learn:'1',check1:'2',useRead:'3.1',useCloze:'3.2',useOrder:'3.3',check2:'4',spell:'5'};
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
const wordRe=w=>new RegExp('\\b'+esc(w)+'\\b','i');
function hl(sentence,word){
  const m=sentence.match(wordRe(word)); if(!m) return [sentence];
  return [sentence.slice(0,m.index),h('span',{class:'mark'},m[0]),sentence.slice(m.index+m[0].length)];
}
function ymd(d=new Date()){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function addDays(s,n){const [y,m,d]=s.split('-').map(Number);return ymd(new Date(y,m-1,d+n));}
function fmtDur(ms){const s=Math.round(ms/1000);return Math.floor(s/60)+':'+pad(s%60);}
function fmtDurJp(ms){const s=Math.round(ms/1000),m=Math.floor(s/60);return m>0?m+'分'+pad(s%60)+'秒':s+'秒';}
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

const WORDS=window.EITAN_WORDS;
const BYWORD=Object.fromEntries(WORDS.map(w=>[w.word,w]));

/* ================= 保存データ ================= */
function defaultState(){return {app:'eitan',v:APP_V,settings:{perDay:10,parentPhone:'',practiceWaitSec:1.5},words:{},sessions:[]};}
function cleanSession(s){
  const sm={}; for(const k of STEP_ORDER) sm[k]=num(s.stepMs&&s.stepMs[k]);
  const cleanWords=a=>Array.isArray(a)?Array.from(new Set(a.filter(w=>typeof w==='string'&&Object.prototype.hasOwnProperty.call(BYWORD,w)))).slice(0,WORDS.length):[];
  return {id:String(s.id||'').slice(0,40),date:s.date,finishedAt:num(s.finishedAt),newN:num(s.newN),reviewN:num(s.reviewN),
    stepMs:sm,totalMs:num(s.totalMs),correct:num(s.correct),total:num(s.total),
    legacyUseMs:num(s.legacyUseMs||s.stepMs&&s.stepMs.use),mode:s.mode==='repeat'?'repeat':'normal',
    newWords:cleanWords(s.newWords),reviewWords:cleanWords(s.reviewWords),
    metricVersion:s.metricVersion===1?1:0,avgAnswerMs:num(s.avgAnswerMs),
    responseTimeScore:s.metricVersion===1&&s.responseTimeScore!=null?Math.min(100,num(s.responseTimeScore)):null,
    effortScore:s.metricVersion===1&&s.effortScore!=null?Math.min(100,num(s.effortScore)):null};
}
function validateBackup(o){
  if(!o||typeof o!=='object'||Array.isArray(o)) return {ok:false,error:'データの形式が正しくありません'};
  if(o.app!=='eitan') return {ok:false,error:'えいたんのバックアップではありません'};
  if(o.v!==APP_V) return {ok:false,error:'このバックアップは読み込めません(バージョンがちがいます)'};
  const st=defaultState(), se=(o.settings&&typeof o.settings==='object')?o.settings:{};
  st.settings.perDay=se.perDay===15?15:10;
  st.settings.parentPhone=typeof se.parentPhone==='string'?se.parentPhone.replace(/[^0-9+]/g,'').slice(0,20):'';
  st.settings.practiceWaitSec=[1,1.5,2].includes(Number(se.practiceWaitSec))?Number(se.practiceWaitSec):1.5;
  if(o.words!==undefined&&(o.words===null||typeof o.words!=='object'||Array.isArray(o.words))) return {ok:false,error:'単語の記録がこわれています'};
  for(const [k,w] of Object.entries(o.words||{})){
    if(!/^[A-Za-z][A-Za-z' -]{0,39}$/.test(k)||!w||typeof w!=='object') continue;
    const box=Math.floor(Number(w.box)), due=String(w.due||'');
    if(!(box>=1&&box<=5)||!DATE_RE.test(due)) continue;
    st.words[k]={box,due,learnedOn:DATE_RE.test(String(w.learnedOn))?w.learnedOn:due};
  }
  if(o.sessions!==undefined&&!Array.isArray(o.sessions)) return {ok:false,error:'学習の記録がこわれています'};
  for(const s of (o.sessions||[])){
    if(!s||typeof s!=='object'||!DATE_RE.test(String(s.date))) continue;
    st.sessions.push(cleanSession(s));
  }
  st.sessions=st.sessions.slice(-2000);
  return {ok:true,state:st};
}
let LOAD_WARN=false;
function load(){
  let raw=null;
  try{raw=localStorage.getItem(KEY);}catch(e){return defaultState();}
  if(!raw) return defaultState();
  try{const r=validateBackup(JSON.parse(raw)); if(r.ok) return r.state;}catch(e){}
  // 読み込めない記録は、消さずに別のキーへ退避してから初期化する
  try{localStorage.setItem(KEY+'.broken',raw);}catch(e){}
  LOAD_WARN=true;return defaultState();
}
let S=load();
const PENDING_KEY=KEY+'.pending';
function cleanPending(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const cleanWords=a=>Array.isArray(a)?Array.from(new Set(a.filter(w=>typeof w==='string'&&Object.prototype.hasOwnProperty.call(BYWORD,w)))).slice(0,WORDS.length):[];
  const newWords=cleanWords(raw.newWords),reviewWords=cleanWords(raw.reviewWords);
  const steps=[...(reviewWords.length?['review']:[]),...(newWords.length?['learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  if(!steps.length) return null;
  const currentStepIndex=Math.min(Math.floor(num(raw.currentStepIndex)),steps.length);
  const stageResults={};
  for(const key of STEP_ORDER){
    const values=raw.stageResults&&raw.stageResults[key];
    if(!values||typeof values!=='object'||Array.isArray(values)) continue;
    stageResults[key]=Object.fromEntries(Object.entries(values).filter(([word,value])=>
      BYWORD[word]&&(typeof value==='boolean'||['ok','maybe','ng','skip'].includes(value))));
  }
  const stageResponseMs={};
  for(const key of STEP_ORDER){
    const values=raw.stageResponseMs&&raw.stageResponseMs[key];
    if(values&&typeof values==='object'&&!Array.isArray(values)){
      stageResponseMs[key]=Object.fromEntries(Object.entries(values).filter(([word,value])=>
        BYWORD[word]&&Number.isFinite(Number(value))&&Number(value)>=0).map(([word,value])=>[word,num(value)]));
    }
  }
  const ms={};for(const key of STEP_ORDER) ms[key]=num(raw.timeMs&&raw.timeMs[key]);
  return {newWords,reviewWords,repeat:raw.repeat===true,steps,currentStepIndex,
    phase:raw.phase==='summary'?'summary':'running',
    stageStartCorrect:num(raw.stageStartCorrect),stageStartTotal:num(raw.stageStartTotal),
    correct:num(raw.correct),total:num(raw.total),stageResults,stageResponseMs,timeMs:ms};
}
function loadPending(){
  try{
    const raw=localStorage.getItem(PENDING_KEY);
    if(!raw)return null;
    const pending=cleanPending(JSON.parse(raw));
    if(!pending)LOAD_WARN=true;
    return pending;
  }catch(e){LOAD_WARN=true;return null;}
}
let pendingSession=loadPending();
function savePending(){
  if(!session)return;
  Time.tick();
  const data={newWords:session.newWords,reviewWords:session.reviewWords,repeat:session.repeat,
    currentStepIndex:session.currentStepIndex,phase:session.phase,stageStartCorrect:session.stageStartCorrect,
    stageStartTotal:session.stageStartTotal,correct:session.correct,total:session.total,
    stageResults:session.stageResults,stageResponseMs:session.stageResponseMs,timeMs:Time.ms};
  try{localStorage.setItem(PENDING_KEY,JSON.stringify(data));pendingSession=cleanPending(data);}
  catch(e){toast('学習の進み具合を保存できませんでした');}
}
function clearPending(){
  try{localStorage.removeItem(PENDING_KEY);}catch(e){toast('中断した学習を削除できませんでした');}
  pendingSession=null;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){toast('保存できませんでした');}}

function streak(){
  const days=new Set(S.sessions.map(s=>s.date)); let d=ymd(); if(!days.has(d)) d=addDays(d,-1);
  let n=0; while(days.has(d)){n++; d=addDays(d,-1);} return n;
}
function pickNew(n){return WORDS.filter(w=>!S.words[w.word]).slice(0,n).map(w=>w.word);}
function dueWords(){
  const t=ymd();
  return Object.entries(S.words).filter(([k,v])=>v.due<=t&&BYWORD[k]).sort((a,b)=>a[1].due<b[1].due?-1:a[1].due>b[1].due?1:0)
    .map(([k])=>k).slice(0,10);
}

/* ================= 表示の道具 ================= */
function mount(node){$('#app').replaceChildren(node);window.scrollTo(0,0);}
function toast(msg){const t=h('div',{class:'toast'},msg);document.body.append(t);setTimeout(()=>t.remove(),2200);}
function showIdle(){$('#layer').replaceChildren(h('div',{class:'idle',onclick:hideIdle},'ちょっと休けい中。タップでつづけるよ'));}
function hideIdle(){$('#layer').replaceChildren();}
/* ================= 学習時間(画面が見えていて、操作がある間だけ数える) ================= */
const Time={
  step:null,ms:{},last:0,lastActive:0,paused:false,timer:null,
  start(initial={}){this.ms={};for(const k of STEP_ORDER)this.ms[k]=num(initial[k]);this.last=this.lastActive=performance.now();this.paused=false;
    clearInterval(this.timer);this.timer=setInterval(()=>this.tick(),500);},
  setStep(k){this.tick();this.step=k;},
  touch(src){this.lastActive=performance.now();this.paused=false;if(src!=='p')hideIdle();},
  tick(){
    const now=performance.now(),dt=Math.min(now-this.last,1000);this.last=now;
    if(!this.step) return;
    const vis=document.visibilityState==='visible',idle=(now-this.lastActive)>IDLE_MS;
    if(vis&&!idle) this.ms[this.step]+=dt;
    else if(vis&&idle&&!this.paused){this.paused=true;showIdle();}
  },
  total(){return STEP_ORDER.reduce((a,k)=>a+(this.ms[k]||0),0);},
  stop(){clearInterval(this.timer);this.timer=null;this.step=null;this.paused=false;hideIdle();}
};
document.addEventListener('pointerdown',()=>Time.touch('p'),true);
document.addEventListener('keydown',()=>Time.touch('k'),true);

/* ================= 読み上げ ================= */
const TTS={
  pick(){
    const vs=speechSynthesis.getVoices(); if(!vs.length) return null;
    const en=vs.filter(v=>/^en[-_]US/i.test(v.lang));
    return en.find(v=>/samantha|ava|allison|nicky|karen/i.test(v.name))||en[0]||vs.find(v=>/^en/i.test(v.lang))||null;
  },
  unlock(){try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}catch(e){}},
  stop(){try{speechSynthesis.cancel();}catch(e){}},
  speak(text,rate=0.85){
    return new Promise(res=>{
      if(!('speechSynthesis' in window)){res();return;}
      try{
        if(speechSynthesis.speaking||speechSynthesis.pending) speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=rate;
        const v=this.pick();if(v)u.voice=v;
        let done=false;
        const fin=()=>{if(done)return;done=true;clearTimeout(tm);res();};
        u.onend=fin;u.onerror=fin;
        const tm=setTimeout(fin,2000+text.length*150);
        speechSynthesis.speak(u);
      }catch(e){res();}
    });
  }
};
if('speechSynthesis' in window) speechSynthesis.onvoiceschanged=()=>{};

/* ================= 学習セッション ================= */
let session=null;
function stepLabel(stepKey){
  const number=STEP_NUMBERS[stepKey];
  return (number?number+(number.includes('.')?' ':'. '):'')+STEP_NAMES[stepKey];
}
function waitUI(fn){
  if(session.quit) return Promise.reject(new Error('abort'));
  return new Promise((resolve,reject)=>{
    session.reject=reject;
    fn(value=>{
      savePending();
      resolve(value);
    });
  });
}
function askQuit(){
  showTodayStudyList();
}
function chrome(stepKey,pos,total,...body){
  const steps=session.steps,idx=steps.indexOf(stepKey);
  session.currentStep=stepKey;
  return h('div',{class:'screen'},
    h('div',{class:'top'},
      h('button',{class:'x','aria-label':'今日の学習一覧へ',onclick:askQuit},'×'),
      h('div',{class:'ttl'},stepLabel(stepKey)),
      h('div',{class:'pos'},total?pos+' / '+total:'')),
    h('div',{class:'strip'},steps.map((k,i)=>h('i',{class:i<idx?'done':i===idx?'now':''}))),
    body);
}
function addAcc(good){session.total++;if(good)session.correct++;}
function activeStepTime(stepKey){
  Time.tick();
  return Time.ms[stepKey]||0;
}
function elapsedStepTime(stepKey,start){
  return Math.max(0,activeStepTime(stepKey)-start);
}

/* 音声を聞いたあと、音声の長さを目安に練習時間を確保する */
function practiceDuration(text,rate=0.85){
  const words=Math.max(1,text.trim().split(/\s+/).length);
  return Math.round(words*350/rate);
}
function makeGate(onPass, skip=false){
  const bar=h('b'),meter=h('div',{class:'meter'},bar),msg=h('div',{class:'gmsg'});
  const el=h('div',{class:'gate'},msg,meter);
  let timer=null,finished=false,started=0,need=0;
  function finish(){
    clearInterval(timer);timer=null;finished=true;
    bar.style.width='100%';meter.classList.add('ok');msg.textContent='つぎへ進めるよ';onPass();
  }
  function reset(){
    clearInterval(timer);timer=null;finished=false;started=0;need=0;
    if(skip){
      bar.style.width='100%';meter.classList.add('ok');msg.textContent='つぎへ進めるよ';
      return;
    }
    bar.style.width='0%';meter.classList.remove('ok');msg.textContent='音声を聞いてね';
  }
  function wait(duration){
    if(skip){finish();return;}
    if(finished) return;
    need=Math.max(duration,Number(S.settings.practiceWaitSec||1.5)*1000);
    started=performance.now();msg.textContent='声に出して練習してね';
    timer=setInterval(()=>{
      const progress=Math.min(1,(performance.now()-started)/need);
      bar.style.width=Math.round(progress*100)+'%';
      if(progress>=1){
        finish();
      }
    },40);
  }
  function complete(){
    if(skip){finish();return;}
    finish();
  }
  reset();
  return {el,wait,reset,complete,destroy(){finished=true;clearInterval(timer);timer=null;}};
}

/* ① 覚える:単語+意味を、音を聞いて声に出す ×3周 */
async function stepLearn(){
  Time.setStep('learn');
  const rounds=3;
  if(!session.learnCards){
    session.learnCards=[];
    for(let r=1;r<=rounds;r++){
      const order=r===1?session.newWords.slice():shuffle(session.newWords);
      order.forEach((word,index)=>session.learnCards.push({word,round:r,position:index+1,roundTotal:order.length}));
    }
  }
  const cards=session.learnCards,total=cards.length;
  let index=Math.min(session.learnIndex||0,Math.max(total-1,0));
  while(index<total){
    session.learnIndex=index;
    const card=cards[index];
    const action=await learnCard(card.word,card.position,card.roundTotal,card.round,rounds,index>0,!!session.learnDone[index],index);
    if(action==='prev'){index=Math.max(0,index-1);continue;}
    index++;
  }
  session.learnIndex=Math.max(0,total-1);
}
function learnCard(word,n,total,r,rounds,canGoBack,wasDone,cardIndex){
  const d=BYWORD[word];
  const activeSession=session;
  return waitUI(resolve=>{
    let playId=0,finished=false;
    const finish=action=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(action);};
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:true,onclick:()=>finish(wasDone?'next':'done')},'つぎへ');
    const gate=makeGate(()=>{
      if(session!==activeSession||activeSession.quit) return;
      activeSession.learnDone[cardIndex]=true;next.disabled=false;
    },true);
    gate.el.style.display='none';
    const play=async()=>{
      const id=++playId;session.learnDone[cardIndex]=false;next.disabled=true;gate.reset();TTS.stop();
      await TTS.speak(d.word);
      if(id===playId&&!finished&&session===activeSession&&!activeSession.quit){
        activeSession.learnDone[cardIndex]=true;next.disabled=false;
        gate.complete();
      }
    };
    mount(chrome('learn',n,total,
      h('div',{class:'note'},r+'周目 / '+rounds+'周　今日の単語 '+n+'/'+total),
      h('div',{class:'card'},h('div',{class:'en'},h('span',{class:'mark'},d.word)),h('div',{class:'jp'},d.meaning)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:play},'🔊 もういちど聞く')),
      h('div',{class:'hint'},'音を聞いて、英語と日本語の意味を声に出して言おう'),
      gate.el,h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
    if(wasDone) gate.complete(); else play();
  });
}

/* フラッシュカード(赤シート):日本語を見て英語を思い出す → 赤シートをタップして答え合わせ → ◯△× */
function flashCard(stepKey,word,pos,total,mode,state,canGoBack){
  const d=BYWORD[word];
  const responseStart=activeStepTime(stepKey);
  return waitUI(resolve=>{
    let finished=false;
    const fin=r=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(r);};
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>fin('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',style:'display:none',onclick:()=>fin('next')},'つぎへ');
    const choose=r=>{state.result=r;fin(r);};
    const rate=h('div',{class:'rate',style:'visibility:hidden'},
      h('button',{class:'btn good','aria-pressed':'false',onclick:()=>choose('ok')},'◯ 言えた'),
      h('button',{class:'btn sub','aria-pressed':'false',onclick:()=>choose('maybe')},'△ あやしい'),
      h('button',{class:'btn sub','aria-pressed':'false',onclick:()=>choose('ng')},'× わからない'));
    const sheet=h('button',{class:'sheet'},'タップして答えを見る');
    const skipGate=stepKey==='check1' || stepKey==='check2';
    const gate=makeGate(()=>{state.gateDone=true;rate.style.visibility='visible';previous.disabled=!canGoBack;},skipGate);
    gate.el.style.display='none';
    let playId=0;
    const play=async()=>{
      const id=++playId;gate.reset();gate.el.style.display=skipGate?'none':'';rate.style.visibility='hidden';TTS.stop();
      await TTS.speak(d.word);
      let duration=practiceDuration(d.word);
      if(mode==='sentence'){
        await TTS.speak(d.ex1,0.8);duration+=practiceDuration(d.ex1,0.8);
      }
      if(id===playId&&!finished) gate.wait(duration);
    };
    sheet.addEventListener('click',()=>{
      if(state.revealed) return;
      if(state.responseMs===undefined) state.responseMs=elapsedStepTime(stepKey,responseStart);
      state.revealed=true;previous.disabled=true;sheet.classList.add('off');play();
    });
    const front=mode==='sentence'?[h('div',{class:'jp'},d.meaning),h('div',{class:'jp2'},d.tr1)]:[h('div',{class:'jp'},d.meaning)];
    const back=mode==='sentence'?[h('div',{class:'en'},h('span',{class:'mark'},d.word)),h('div',{class:'sent'},hl(d.ex1,d.word))]
                                :[h('div',{class:'en'},h('span',{class:'mark'},d.word))];
    mount(chrome(stepKey,pos,total,
      h('div',{class:'note'},mode==='sentence'?'英語の単語と例文を声に出して思い出そう':'英語を声に出して思い出そう'),
      h('div',{class:'card'},front),
      h('div',{class:'sheet-wrap'},h('div',{class:'back'},back),sheet),
      gate.el,h('div',{class:'grow'}),rate,h('div',{class:'row2'},previous,next)));
    if(state.revealed){
      sheet.classList.add('off');gate.el.style.display=skipGate?'none':'';
      if(state.gateDone) gate.complete(); else play();
    }
    if(state.result){
      [...rate.children].forEach((button,i)=>{
        const selected=['ok','maybe','ng'][i]===state.result;
        button.disabled=true;button.setAttribute('aria-pressed',String(selected));
      });
      rate.style.visibility='visible';next.style.display='';
      previous.disabled=!canGoBack;
    }
  });
}
async function runCards(stepKey,words,mode){
  const queue=shuffle(words).map(word=>({word,attempt:1,processed:false,result:null,revealed:false,gateDone:false,position:0}));
  const first={},total=words.length;let done=0,index=0;
  const responseTimes=session.stageResponseMs[stepKey]||(session.stageResponseMs[stepKey]={});
  while(index<queue.length){
    const item=queue[index];
    if(!item.position) item.position=Math.min(done+1,total);
    const r=await flashCard(stepKey,item.word,item.position,total,mode,item,index>0);
    if(r==='prev'){index--;continue;}
    if(r==='next'){index++;continue;}
    if(item.processed){index++;continue;}
    item.processed=true;
    if(first[item.word]===undefined){
      first[item.word]=r;
      if(!Object.prototype.hasOwnProperty.call(responseTimes,item.word)){
        responseTimes[item.word]=item.responseMs||0;
        addAcc(r==='ok');
      }
    }
    if(r==='ok'||item.attempt>=3) done++;
    else queue.splice(Math.min(queue.length,index+4),0,{word:item.word,attempt:item.attempt+1,processed:false,result:null,revealed:false,gateDone:false,position:item.position});
    index++;
  }
  return first;
}
async function stepReview(){Time.setStep('review');return runCards('review',session.reviewWords,'meaning');}
async function stepCheck1(){Time.setStep('check1');return runCards('check1',session.newWords,'meaning');}
async function stepCheck2(){Time.setStep('check2');return runCards('check2',session.newWords,'sentence');}

/* ③ 使ってみよう:例文を読む → 穴埋め → 並べ替え */
function ensureUseTasks(){
  if(session.useTasks) return;
  const words=session.newWords;
  session.useTasks={
    useRead:[],
    useCloze:[],
    useOrder:[]
  };
  for(let k=1;k<=2;k++) for(const word of shuffle(words)) session.useTasks.useRead.push({word,round:k,state:{done:false}});
  for(const word of shuffle(words)) session.useTasks.useCloze.push({word,state:{attempted:false,solved:false,wrong:[]}});
  for(const word of shuffle(words)) session.useTasks.useOrder.push({word,state:{attempted:false,solved:false,picked:[],revealedCount:0}});
}
async function runUseTasks(stepKey,tasks){
  const total=tasks.length;
  let index=Math.min(session.useIndex[stepKey]||0,Math.max(total-1,0));
  while(index<total){
    session.useIndex[stepKey]=index;
    const task=tasks[index];
    let action;
    if(stepKey==='useRead') action=await readCard(task.word,task.round,index+1,total,task.state,index>0);
    else if(stepKey==='useCloze') action=await clozeCard(task.word,session.newWords,index+1,total,task.state,index>0);
    else action=await orderCard(task.word,index+1,total,task.state,index>0);
    if(action==='prev'){index=Math.max(0,index-1);continue;}
    index++;
  }
  session.useIndex[stepKey]=Math.max(0,total-1);
}
async function stepUseRead(){
  Time.setStep('useRead');ensureUseTasks();await runUseTasks('useRead',session.useTasks.useRead);
}
async function stepUseCloze(){
  Time.setStep('useCloze');ensureUseTasks();await runUseTasks('useCloze',session.useTasks.useCloze);
  if(!session.stageResponseMs.useCloze){
    session.stageResponseMs.useCloze=Object.fromEntries(session.useTasks.useCloze.map(task=>[task.word,task.state.firstResponseMs||0]));
  }
  return Object.fromEntries(session.useTasks.useCloze.map(task=>[task.word,!!task.state.firstCorrect]));
}
async function stepUseOrder(){
  Time.setStep('useOrder');ensureUseTasks();await runUseTasks('useOrder',session.useTasks.useOrder);
  if(!session.stageResponseMs.useOrder){
    session.stageResponseMs.useOrder=Object.fromEntries(session.useTasks.useOrder.map(task=>[task.word,task.state.firstResponseMs||0]));
  }
  return Object.fromEntries(session.useTasks.useOrder.map(task=>[task.word,!!task.state.firstCorrect]));
}
function readCard(word,k,n,total,state,canGoBack){
  const d=BYWORD[word];
  return waitUI(resolve=>{
    let playId=0,finished=false;
    const finish=action=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(action);};
    const wasDone=state.done;
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!wasDone,onclick:()=>finish(wasDone?'next':'done')},'つぎへ');
    const gate=makeGate(()=>{state.done=true;next.disabled=false;});
    const play=async()=>{
      const id=++playId;state.done=false;next.disabled=true;gate.reset();TTS.stop();
      await TTS.speak(d.ex1,0.8);
      if(id===playId&&!finished) gate.wait(practiceDuration(d.ex1,0.8));
    };
    mount(chrome('useRead',n,total,
      h('div',{class:'note'},'例文を読もう('+k+'回目 / 2回)'),
      h('div',{class:'card'},h('div',{class:'sent'},hl(d.ex1,d.word)),h('div',{class:'tr'},d.tr1)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:play},'🔊 聞く')),
      h('div',{class:'hint'},'音を聞いて、まねして声に出して読もう'),
      gate.el,h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
    if(wasDone) gate.complete(); else play();
  });
}
function distractors(word,pool){
  const others=shuffle(pool.filter(w=>w!==word));
  const extra=shuffle(WORDS.map(x=>x.word).filter(w=>w!==word&&!others.includes(w)));
  return others.concat(extra).slice(0,3);
}
function clozeCard(word,pool,n,total,state,canGoBack){
  const d=BYWORD[word];
  if(!state.options) state.options=shuffle([word,...distractors(word,pool)]);
  const wasSolved=state.solved;
  const responseStart=activeStepTime('useCloze');
  return waitUI(resolve=>{
    const fb=h('div',{class:'fb'}),sentEl=h('div',{class:'sent'},d.ex2.replace(wordRe(word),'_____'));
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>resolve('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!state.solved,onclick:()=>{TTS.stop();resolve(wasSolved?'next':'done');}},'つぎへ');
    const grid=h('div',{class:'choices'});
    state.options.forEach(o=>{
      const b=h('button',{class:'btn sub',disabled:state.solved||state.wrong.includes(o)},o);
      if(state.solved&&o===word) b.classList.add('good');
      if(state.wrong.includes(o)) b.classList.add('bad');
      b.addEventListener('click',()=>{
        if(state.solved||state.wrong.includes(o)) return;
        const good=o===word; if(!state.attempted){state.attempted=true;state.firstCorrect=good;state.firstResponseMs=elapsedStepTime('useCloze',responseStart);addAcc(good);}
        if(good){
          state.solved=true;b.classList.add('good');fb.className='fb ok';fb.textContent='せいかい!';
          sentEl.replaceChildren(...hl(d.ex2,d.word));next.disabled=false;TTS.speak(d.ex2,0.8);
        }else{state.wrong.push(o);b.classList.add('bad');b.disabled=true;fb.className='fb bad';fb.textContent='ちがうよ。もう一度えらんでね';}
      });
      grid.append(b);
    });
    if(state.solved){
      fb.className='fb ok';fb.textContent='せいかい!';
      sentEl.replaceChildren(...hl(d.ex2,d.word));
    }else if(state.wrong.length){fb.className='fb bad';fb.textContent='ちがうよ。もう一度えらんでね';}
    mount(chrome('useCloze',n,total,
      h('div',{class:'note'},'あてはまる単語をえらぼう'),
      h('div',{class:'card'},sentEl,h('div',{class:'tr'},d.tr2)),
      grid,fb,h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
  });
}
function orderCard(word,n,total,state,canGoBack){
  const d=BYWORD[word],tokens=d.ex1.split(' ');
  const responseStart=activeStepTime('useOrder');
  if(!state.order){
    let order=shuffle(tokens.map((t,i)=>({t,i}))),guard=0;
    while(order.every((o,i)=>o.t===tokens[i])&&guard++<10) order=shuffle(order);
    state.order=order;
  }
  const order=state.order,correctOrder=tokens.map((_,i)=>order.find(o=>o.i===i)),wasSolved=state.solved;
  return waitUI(resolve=>{
    const ans=h('div',{class:'answer'}),pool=h('div',{class:'tiles'}),fb=h('div',{class:'fb'});
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>resolve('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!state.solved,onclick:()=>{TTS.stop();resolve(wasSolved?'next':'done');}},'つぎへ');
    const clear=h('button',{class:'btn sub small',onclick:()=>{if(state.solved)return;state.picked=correctOrder.slice(0,state.revealedCount||0);state.feedback=state.revealedCount?'reveal':'';render();}},'やり直す');
    function render(){
      const pickedSet=new Set(state.picked.map(o=>o.i));
      ans.replaceChildren(...Array.from({length: order.length}, (_, i)=>{
        const selected=state.picked[i];
        if(selected){
          return h('button',{class:'tile'+(i<(state.revealedCount||0)?' fixed':''),disabled:state.solved||i<(state.revealedCount||0),
            onclick:()=>{if(state.solved||i<(state.revealedCount||0))return;state.picked.splice(i,1);render();}},selected.t);
        }
        return h('div',{class:'tile empty'},'');
      }));
      pool.replaceChildren(...order.filter(o=>!pickedSet.has(o.i)).map(o=>h('button',{class:'tile',disabled:state.solved,onclick:()=>{if(state.solved)return;state.picked.push(o);render();check();}},o.t)));
    }
    function check(){
      if(state.picked.length!==order.length) return;
      const good=state.picked.map(o=>o.t).join(' ')===d.ex1;
      if(!state.attempted){state.attempted=true;state.firstCorrect=good;state.firstResponseMs=elapsedStepTime('useOrder',responseStart);addAcc(good);}
      if(good){state.solved=true;state.feedback='';fb.className='fb ok';fb.textContent='せいかい!';next.disabled=false;TTS.speak(d.ex1,0.8);}
      else{
        let correctPrefix=0;
        while(correctPrefix<tokens.length && state.picked[correctPrefix] && state.picked[correctPrefix].t===tokens[correctPrefix]){
          correctPrefix++;
        }
        state.revealedCount=Math.max(state.revealedCount||0,correctPrefix);
        state.picked=correctOrder.slice(0,state.revealedCount);
        if(state.revealedCount===tokens.length){
          state.solved=true;state.assisted=true;state.feedback='assisted';
          fb.className='fb ok';fb.textContent='正しい順番をすべて表示しました';next.disabled=false;
        }else{
          state.feedback='reveal';fb.className='fb bad';
          fb.textContent='まちがい。先頭から正しいところまで出したよ。つづきを並べよう';render();
        }
      }
    }
    if(state.solved){fb.className='fb ok';fb.textContent=state.assisted?'正しい順番をすべて表示しました':'せいかい!';}
    else if(state.feedback==='reveal'){
      fb.className='fb bad';fb.textContent='正しい単語を'+state.revealedCount+'語入れたよ。つづきを並べよう';
    }else if(state.feedback==='bad'){fb.className='fb bad';fb.textContent='ちがうよ。タップして直してみよう';}
    render();
    mount(chrome('useOrder',n,total,
      h('div',{class:'note'},'日本語に合う英文をつくろう'),
      h('div',{class:'card'},h('div',{class:'jp',style:'font-size:22px'},d.tr1)),
      ans,pool,fb,h('div',{class:'row'},clear),h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
  });
}

/* ⑤ スペル入力 */
async function stepSpell(){
  Time.setStep('spell');
  const words=shuffle(session.newWords);
  const result={};
  for(let i=0;i<words.length;i++) result[words[i]]=await spellCard(words[i],i+1,words.length);
  return result;
}
function spellCard(word,n,total){
  const d=BYWORD[word];
  const responseStart=activeStepTime('spell');
  return waitUI(resolve=>{
    let attempted=false,solved=false,firstCorrect=false;
    const input=h('input',{class:'spell',type:'text',autocapitalize:'none',autocomplete:'off',autocorrect:'off',spellcheck:'false',enterkeyhint:'done','aria-label':'つづり'});
    const fb=h('div',{class:'fb'});
    const btn=h('button',{class:'btn',onclick:submit},'答え合わせ');
    const skipBtn=h('button',{class:'btn sub',onclick:()=>{TTS.stop();resolve('skip');}},'スキップ');
    input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
    function finalize(correct,kind='ok'){
      solved=true;firstCorrect=correct;fb.className=kind==='ok'?'fb ok':'fb bad';fb.textContent=correct?
        'せいかい!':'正しいつづりは「'+d.word+'」。次へ進めます';
      input.disabled=true;btn.textContent='つぎへ';skipBtn.disabled=true;TTS.speak(d.word);
    }
    function submit(){
      if(solved){TTS.stop();resolve(firstCorrect?'ok':'ng');return;}
      const v=input.value.trim().toLowerCase();
      if(!v){
        attempted=true;firstCorrect=false;
        const responseTimes=session.stageResponseMs.spell||(session.stageResponseMs.spell={});
        if(!Object.prototype.hasOwnProperty.call(responseTimes,word)) responseTimes[word]=elapsedStepTime('spell',responseStart);
        addAcc(false);
        finalize(false,'bad');
        return;
      }
      const good=v===d.word.toLowerCase();
      if(!attempted){
        attempted=true;firstCorrect=good;
        const responseTimes=session.stageResponseMs.spell||(session.stageResponseMs.spell={});
        if(!Object.prototype.hasOwnProperty.call(responseTimes,word)) responseTimes[word]=elapsedStepTime('spell',responseStart);
        addAcc(good);
      }
      if(good){finalize(true,'ok');}
      else{fb.className='fb bad';fb.textContent='ざんねん。正しいつづりは「'+d.word+'」。もう一度書いてみよう';input.value='';input.focus();}
    }
    mount(chrome('spell',n,total,
      h('div',{class:'note'},'つづりを書こう'),
      h('div',{class:'card'},h('div',{class:'jp'},d.meaning)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:()=>TTS.speak(d.word)},'🔊 発音を聞く')),
      input,fb,h('div',{class:'row'},skipBtn),h('div',{class:'grow'}),btn));
    setTimeout(()=>input.focus(),60);
  });
}

/* ================= セッションの開始と終了 ================= */
function endSession(){Time.stop();TTS.stop();session=null;}
function weakStageWords(result){
  return Object.entries(result||{}).filter(([,answer])=>answer===false||answer==='maybe'||answer==='ng').map(([word])=>word);
}
function stageSummaryRows(stepKey,result){
  if(stepKey==='learn') return [['練習した単語',session.newWords.length+'語'],['練習回数','3周']];
  if(stepKey==='useRead') return [['例文練習',session.useTasks.useRead.length+'回'],['単語',session.newWords.length+'語']];
  const values=Object.values(result||{});
  if(values.length&&values.every(value=>['ok','maybe','ng'].includes(value))){
    return [['対象',values.length+'語'],['◯ 言えた',values.filter(value=>value==='ok').length+'語'],
      ['△ あやしい',values.filter(value=>value==='maybe').length+'語'],['× わからない',values.filter(value=>value==='ng').length+'語']];
  }
  if(values.length&&values.every(value=>typeof value==='boolean')){
    const correct=values.filter(Boolean).length;
    return [['対象',values.length+'語'],['初回正解',correct+'語'],['初回に間違えた',values.length-correct+'語']];
  }
  return [['対象',values.length+'語']];
}
function showStageSummary(stepKey,result,weakWords){
  const activeSession=session,idx=session.steps.indexOf(stepKey),next=idx===session.steps.length-1;
  const title=stepLabel(stepKey)+'のまとめ';
  const rows=stageSummaryRows(stepKey,result);
  Time.setStep(null);
  return new Promise((resolve,reject)=>{
    let finished=false;
    const cancel=error=>{if(finished)return;finished=true;reject(error||new Error('abort'));};
    activeSession.reject=cancel;
    const choose=action=>{
      if(finished)return;
      finished=true;
      if(activeSession.reject===cancel) activeSession.reject=null;
      resolve(action);
    };
    const buttons=[
      h('button',{class:'btn',onclick:()=>choose('next')},next?'今日の結果へ':'次へ進む'),
      h('button',{class:'btn sub',onclick:()=>choose('repeat')},'このステップをやり直す')
    ];
    if(weakWords.length) buttons.push(h('button',{class:'btn sub',onclick:()=>choose('weak')},'苦手な単語だけもう一度 ('+weakWords.length+'語)'));
    mount(h('div',{class:'screen'},
      h('div',{class:'top'},
        h('button',{class:'x','aria-label':'やめる',onclick:askQuit},'×'),
        h('div',{class:'ttl'},title),h('div',{class:'pos'},'完了')),
      h('div',{class:'strip'},session.steps.map((key,i)=>h('i',{class:i<=idx?'done':''}))),
      h('div',{class:'card'},rows.map(([label,value])=>h('div',{class:'srow'},h('span',null,label),h('b',null,value)))),
      weakWords.length?h('div',{class:'hint'},'初回の回答で、もう一度練習する単語を選べます。'):
        h('div',{class:'hint'},['learn','useRead'].includes(stepKey)?'練習ステップのため、苦手判定はありません。':'初回の回答では、苦手な単語はありません。'),
      h('div',{class:'hint'},'やり直しの結果は正答率に重ねて加算しません。'),
      h('div',{class:'grow'}),buttons));
  });
}
function resetStage(stepKey){
  if(stepKey==='learn'){session.learnIndex=0;session.learnDone={};}
  else if(stepKey==='useRead'){
    session.useIndex.useRead=0;
    session.useTasks.useRead.forEach(task=>{task.state.done=false;});
  }else if(stepKey==='useCloze'){
    session.useIndex.useCloze=0;
    session.useTasks.useCloze.forEach(task=>Object.assign(task.state,{attempted:false,firstCorrect:undefined,solved:false,wrong:[]}));
  }else if(stepKey==='useOrder'){
    session.useIndex.useOrder=0;
    session.useTasks.useOrder.forEach(task=>Object.assign(task.state,{attempted:false,firstCorrect:undefined,solved:false,picked:[],revealedCount:0,assisted:false,feedback:''}));
  }
}
async function repeatWeakStage(stepKey,words){
  Time.setStep(stepKey);
  if(stepKey==='review') return runCards(stepKey,words,'meaning');
  if(stepKey==='check1') return runCards(stepKey,words,'meaning');
  if(stepKey==='check2') return runCards(stepKey,words,'sentence');
  if(stepKey==='useCloze'||stepKey==='useOrder'){
    const tasks=session.useTasks[stepKey].filter(task=>words.includes(task.word));
    tasks.forEach(task=>{
      if(stepKey==='useCloze') Object.assign(task.state,{attempted:false,firstCorrect:undefined,solved:false,wrong:[]});
      else Object.assign(task.state,{attempted:false,firstCorrect:undefined,solved:false,picked:[],revealedCount:0,assisted:false,feedback:''});
    });
    session.useIndex[stepKey]=0;
    return runUseTasks(stepKey,tasks);
  }
  if(stepKey==='spell'){
    Time.setStep('spell');
    for(let i=0;i<words.length;i++) await spellCard(words[i],i+1,words.length);
  }
}
async function runStageWithSummary(stepKey,run){
  const idx=session.steps.indexOf(stepKey);
  session.currentStepIndex=idx;session.currentStep=stepKey;
  if(session.phase!=='summary'||!Object.prototype.hasOwnProperty.call(session.stageResults,stepKey)){
    session.phase='running';session.stageStartCorrect=session.correct;session.stageStartTotal=session.total;
    if(!Object.prototype.hasOwnProperty.call(session.stageResults,stepKey)) delete session.stageResponseMs[stepKey];
    savePending();
    const result=await run();
    if(!Object.prototype.hasOwnProperty.call(session.stageResults,stepKey)){
      session.stageResults[stepKey]=result||{};
      if(stepKey==='review') session.reviewFirst=session.stageResults[stepKey];
    }
    session.phase='summary';savePending();
  }
  while(true){
    const firstResult=session.stageResults[stepKey],weak=weakStageWords(firstResult);
    const action=await showStageSummary(stepKey,firstResult,weak);
    if(action==='next'){
      session.currentStepIndex=idx+1;session.phase='running';savePending();
      return;
    }
    const activeSession=session,correct=session.correct,total=session.total;
    try{
      session.phase='running';savePending();
      if(action==='repeat'){resetStage(stepKey);await run();}
      else if(action==='weak') await repeatWeakStage(stepKey,weak);
    }finally{if(session===activeSession){session.correct=correct;session.total=total;session.phase='summary';savePending();}}
  }
}
async function start(newW,due,repeat=false,restored=null){
  TTS.unlock();
  const steps=[...(due.length?['review']:[]),...(newW.length?['learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  session={newWords:newW,reviewWords:due,steps,correct:restored&&restored.phase==='running'?restored.stageStartCorrect:num(restored&&restored.correct),
    total:restored&&restored.phase==='running'?restored.stageStartTotal:num(restored&&restored.total),reject:null,quit:false,
    repeat:restored?restored.repeat:repeat,learnCards:null,learnIndex:0,learnDone:{},useTasks:null,useIndex:{},
    stageResults:restored?restored.stageResults:{},stageResponseMs:restored?restored.stageResponseMs:{},
    reviewFirst:restored&&restored.stageResults.review||{},currentStepIndex:restored?restored.currentStepIndex:0,
    phase:restored?restored.phase:'running',stageStartCorrect:restored?restored.stageStartCorrect:0,
    stageStartTotal:restored?restored.stageStartTotal:0,pausedScreen:null};
  session.steps=[...(due.length?['review']:[]),...(newW.length?['learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  Time.start(restored?restored.timeMs:{});
  const runners={review:stepReview,learn:stepLearn,check1:stepCheck1,useRead:stepUseRead,
    useCloze:stepUseCloze,useOrder:stepUseOrder,check2:stepCheck2,spell:stepSpell};
  try{
    savePending();
    for(let i=session.currentStepIndex;i<session.steps.length;i++) await runStageWithSummary(session.steps[i],runners[session.steps[i]]);
    finishSession();
  }catch(e){
    const quit=e&&e.message==='abort';
    if(!quit) console.error(e);
    savePending();endSession(); if(!quit) toast('エラーが起きました'); showHome();
  }
}
function sessionMetrics(){
  const responseTimes=Object.values(session.stageResponseMs).flatMap(times=>Object.values(times))
    .filter(value=>Number.isFinite(value)&&value>=0);
  const avgAnswerMs=responseTimes.length?Math.round(responseTimes.reduce((sum,value)=>sum+value,0)/responseTimes.length):0;
  const accuracyScore=session.total?Math.round(session.correct/session.total*100):null;
  const responseTimeScore=responseTimes.length?Math.round(Math.max(0,Math.min(100,(avgAnswerMs-2000)/3000*100))):null;
  return {metricVersion:1,avgAnswerMs,responseTimeScore,
    effortScore:accuracyScore===null||responseTimeScore===null?null:Math.round((accuracyScore+responseTimeScore)/2)};
}
function finishSession(){
  const now=Date.now(),today=ymd();
  if(!session.repeat){
    for(const w of session.newWords) S.words[w]={box:1,due:addDays(today,1),learnedOn:today};
    for(const w of session.reviewWords){
      const st=S.words[w]; if(!st) continue;
      if(session.reviewFirst[w]==='ok'){st.box=Math.min(st.box+1,5);st.due=addDays(today,INTERVALS[st.box]);}
      else{st.box=1;st.due=addDays(today,1);}
    }
  }
  const rec={id:String(now),date:today,finishedAt:now,newN:session.newWords.length,reviewN:session.reviewWords.length,
    stepMs:Object.assign({},Time.ms),totalMs:Time.total(),correct:session.correct,total:session.total,
    ...sessionMetrics(),mode:session.repeat?'repeat':'normal',newWords:session.newWords.slice(),reviewWords:session.reviewWords.slice()};
  S.sessions.push(rec);S.sessions=S.sessions.slice(-2000);save();
  clearPending();
  endSession();showDone(rec);
}

/* ================= 完了画面・メッセージ ================= */
function buildMessage(rec){
  const d=new Date(rec.finishedAt||Date.now()),L=[];
  L.push('【英単語 完了】');
  L.push((d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes()));
  L.push((rec.mode==='repeat'?'再学習':'新しい単語')+rec.newN+'語'+(rec.reviewN?' + 復習'+rec.reviewN+'語':''));
  L.push('学習時間 '+fmtDurJp(rec.totalMs));
  if(rec.total) L.push((rec.metricVersion===1?'初回正答率 ':'正答率 ')+Math.round(rec.correct/rec.total*100)+'%('+rec.correct+'/'+rec.total+')');
  if(rec.metricVersion===1&&rec.responseTimeScore!==null){
    L.push('初回の平均回答時間 '+fmtDurJp(rec.avgAnswerMs));
    L.push('回答時間スコア '+rec.responseTimeScore+'/100');
    if(rec.effortScore!==null) L.push('取り組み度の目安 '+rec.effortScore+'/100（初回正答率と回答時間スコアの平均）');
  }
  const parts=STEP_ORDER.filter(k=>rec.stepMs[k]>0).map(k=>STEP_NAMES[k]+' '+fmtDur(rec.stepMs[k]));
  if(rec.legacyUseMs) parts.push('使ってみよう(旧記録) '+fmtDur(rec.legacyUseMs));
  if(parts.length) L.push('内訳 '+parts.join(' / '));
  const st=streak(); if(st>0) L.push('連続'+st+'日目');
  return L.join('\n');
}
function openSms(text){
  const p=S.settings.parentPhone;
  location.href='sms:'+p+(isIOS()?'&':'?')+'body='+encodeURIComponent(text);
}
async function copy(text){
  try{await navigator.clipboard.writeText(text);toast('コピーしました');}
  catch(e){
    const ta=h('textarea',{style:'position:fixed;top:0;left:0;opacity:0'});ta.value=text;document.body.append(ta);
    ta.focus();ta.select();ta.setSelectionRange(0,text.length);
    try{document.execCommand('copy');toast('コピーしました');}catch(_){toast('コピーできませんでした');}
    ta.remove();
  }
}
async function share(text){
  if(navigator.share){try{await navigator.share({text});}catch(e){}}else copy(text);
}
function showDone(rec){
  const clock=h('div',{class:'clock'});
  const upd=()=>{const d=new Date();clock.textContent=(d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
  upd();const iv=setInterval(()=>{if(!clock.isConnected){clearInterval(iv);return;}upd();},1000);
  const msg=buildMessage(rec);
  const rows=[['学習時間',fmtDurJp(rec.totalMs)],[rec.mode==='repeat'?'再学習':'新しい単語',rec.newN+'語']];
  if(rec.reviewN) rows.push(['復習',rec.reviewN+'語']);
  if(rec.total) rows.push([rec.metricVersion===1?'初回正答率':'正答率',Math.round(rec.correct/rec.total*100)+'%('+rec.correct+'/'+rec.total+')']);
  if(rec.metricVersion===1&&rec.responseTimeScore!==null){
    rows.push(['初回の平均回答時間',fmtDurJp(rec.avgAnswerMs)]);
    rows.push(['回答時間スコア',rec.responseTimeScore+'/100']);
    if(rec.effortScore!==null) rows.push(['取り組み度の目安',rec.effortScore+'/100']);
  }
  const st=streak(); if(st>0) rows.push(['連続',st+'日目']);
  const steps=STEP_ORDER.filter(k=>rec.stepMs[k]>0).map(k=>h('div',{class:'srow'},h('span',null,STEP_NAMES[k]),h('span',null,fmtDur(rec.stepMs[k]))));
  if(rec.legacyUseMs) steps.push(h('div',{class:'srow'},h('span',null,'使ってみよう(旧記録)'),h('span',null,fmtDur(rec.legacyUseMs))));
  mount(h('div',{class:'screen'},
    h('div',null,h('div',{class:'big'},h('span',{class:'mark'},'今日の学習 完了!')),clock,h('div',{class:'hint'},'この画面をおうちの人に見せよう')),
    h('div',{class:'card'},rows.map(([a,b])=>h('div',{class:'srow'},h('span',null,a),h('b',null,b)))),
    rec.metricVersion===1&&rec.responseTimeScore!==null?h('div',{class:'hint'},'取り組み度は初回正答率と回答時間から算出した目安です。時間スコアは平均2秒以下で0点、5秒以上で100点（間は比例）ですが、真剣さを断定するものではありません。'):null,
    h('div',{class:'card slim'},h('div',{class:'lbl'},'ステップごとの時間'),h('div',{class:'steps'},steps)),
    h('div',{class:'grow'}),
    h('button',{class:'btn',onclick:()=>openSms(msg)},'メッセージで送る'),
    S.settings.parentPhone?null:h('div',{class:'hint'},'送り先は「設定」で登録できます'),
    h('div',{class:'row2'},h('button',{class:'btn sub',onclick:()=>share(msg)},'共有'),h('button',{class:'btn sub',onclick:()=>copy(msg)},'コピー')),
    h('button',{class:'btn sub',onclick:showTodayStudyList},'今日の学習一覧へ'),
    h('button',{class:'link',onclick:showHome},'ホームへもどる')));
}

/* ================= ホーム・きろく・設定 ================= */
function topBack(title,onBack=showHome){return h('div',{class:'top'},h('button',{class:'x','aria-label':'もどる',onclick:onBack},'‹'),h('div',{class:'ttl'},title));}
function replayWords(rec,today){
  const newWords=rec.newWords.length?rec.newWords:WORDS.filter(w=>S.words[w.word]&&S.words[w.word].learnedOn===today).map(w=>w.word);
  return {newWords,reviewWords:rec.reviewWords};
}
function studySteps(newWords,reviewWords){
  return [...(reviewWords.length?['review']:[]),...(newWords.length?['learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
}
function resumeStudy(){
  TTS.unlock();
  if(session&&session.pausedScreen){
    const screen=session.pausedScreen;session.pausedScreen=null;
    Time.touch('k');Time.setStep(session.currentStep||null);mount(screen);return;
  }
  if(pendingSession) start(pendingSession.newWords,pendingSession.reviewWords,pendingSession.repeat,pendingSession);
}
function showStageReview(stepKey,newWords,reviewWords){
  const words=stepKey==='review'?reviewWords:newWords;
  const cards=words.map(word=>{
    const d=BYWORD[word];if(!d)return null;
    const content=[h('div',{class:'en'},word),h('div',{class:'jp'},d.meaning)];
    if(['useRead','useCloze','useOrder','check2'].includes(stepKey)){
      const sentence=stepKey==='useCloze'?d.ex2:d.ex1;
      const translation=stepKey==='useCloze'?d.tr2:d.tr1;
      content.push(h('div',{class:'sent'},hl(sentence,word)),h('div',{class:'tr'},translation));
    }
    return h('div',{class:'item'},content);
  }).filter(Boolean);
  mount(h('div',{class:'screen','data-view':'stage-review'},
    topBack(stepLabel(stepKey)+'の見直し',showTodayStudyList),
    h('div',{class:'hint'},'見直し表示です。回答や学習記録は変更されません。'),
    cards.length?h('div',null,cards):h('div',{class:'note'},'見直せる単語がありません')));
}
function showTodayStudyList(){
  if(session){
    TTS.stop();Time.setStep(null);
    const current=$('#app').firstElementChild;
    if(current&&current.dataset.view!=='study-list'&&current.dataset.view!=='stage-review') session.pausedScreen=current;
    savePending();
  }
  const today=ymd(),record=S.sessions.filter(item=>item.date===today).pop();
  let newWords,reviewWords,steps,currentIndex=0,phase='done',hasPending=false;
  if(session){
    ({newWords,reviewWords,steps,currentStepIndex:currentIndex,phase}=session);hasPending=true;
  }else if(pendingSession){
    ({newWords,reviewWords,steps,currentStepIndex:currentIndex,phase}=pendingSession);hasPending=true;
  }else if(record){
    ({newWords,reviewWords}=replayWords(record,today));steps=studySteps(newWords,reviewWords);
  }else{
    newWords=pickNew(S.settings.perDay);reviewWords=dueWords();steps=studySteps(newWords,reviewWords);
  }
  const rows=steps.map((key,index)=>{
    const status=hasPending?(index<currentIndex?'学習ずみ':index===currentIndex?(phase==='summary'?'この章のまとめ':'学習中'):'これから'):record?'学習ずみ':'予定';
    return h('div',{class:'item'},
      h('b',null,stepLabel(key)),h('small',null,status),
      h('button',{class:'btn sub small',
        onclick:hasPending&&index===currentIndex?resumeStudy:()=>showStageReview(key,newWords,reviewWords)},
        hasPending&&index===currentIndex?'この章にもどる':'この章を見直す'));
  });
  const actions=[];
  if(hasPending) actions.push(h('button',{class:'btn',onclick:resumeStudy},'つづきを学習'));
  else if(!record&&(newWords.length||reviewWords.length)){
    actions.push(h('button',{class:'btn',onclick:()=>start(newWords,reviewWords)},'今日の学習をはじめる'));
  }
  mount(h('div',{class:'screen','data-view':'study-list'},
    h('div',{class:'top'},h('button',{class:'x','aria-label':'もどる',onclick:showHome},'‹'),h('div',{class:'ttl'},'今日の学習一覧')),
    hasPending?h('div',{class:'hint'},'学習を中断しても進み具合は保存されます。章を選ぶと内容を見直せます。ページを閉じた場合は、中断中の章から再開します。'):
      h('div',{class:'hint'},record?'今日学習した章を見直せます。':'今日の学習予定です。'),
    rows.length?h('div',null,rows):h('div',{class:'note'},'今日の学習はありません。'),
    h('div',{class:'grow'}),actions));
}
function showHome(){
  const today=ymd(),rec=S.sessions.filter(s=>s.date===today).pop(),per=S.settings.perDay;
  const newW=pickNew(per),due=dueWords(),st=streak(),d=new Date();
  const seg=[10,15].map(n=>h('button',{class:'seg'+(per===n?' on':''),'aria-pressed':String(per===n),onclick:()=>{S.settings.perDay=n;save();showHome();}},n+'語'));
  let main;
  if(session||pendingSession){
    const active=session||pendingSession;
    main=[h('div',{class:'card'},h('div',{class:'big'},'学習を中断しています'),
      h('div',{class:'meta soft'},active.steps[active.currentStepIndex]?stepLabel(active.steps[active.currentStepIndex]):'今日の結果'),
      h('div',{class:'meta soft'},'ここまでの進み具合を保存しました')),
      h('button',{class:'btn',onclick:resumeStudy},'つづきを学習'),
      h('button',{class:'btn sub',onclick:showTodayStudyList},'今日の学習一覧を見る')];
  }else if(rec){
    const replay=replayWords(rec,today);
    main=[h('div',{class:'card'},h('div',{class:'big'},'今日は完了ずみ!'),h('div',{class:'meta soft'},'学習時間 '+fmtDurJp(rec.totalMs))),
      h('button',{class:'btn',onclick:()=>showDone(rec)},'完了画面を見る'),
      h('button',{class:'btn sub',onclick:showTodayStudyList},'今日の学習一覧を見る'),
      replay.newWords.length||replay.reviewWords.length?h('button',{class:'btn sub',onclick:()=>start(replay.newWords,replay.reviewWords,true)},
        replay.newWords.length?'今日の学習をもう一度':'今日の復習をもう一度'):h('div',{class:'note'},'見直せる単語がありません')];
  }
  else if(!newW.length&&!due.length) main=[h('div',{class:'card'},h('div',{class:'big'},'今日の分はおしまい'),h('div',{class:'meta soft'},'新しい単語がありません。単語リストを増やしてね。'))];
  else main=[h('div',{class:'card'},h('div',{class:'lbl'},'1日に覚える新しい単語'),h('div',{class:'seg-row'},seg),
                h('div',{class:'meta'},'今日:新しい単語 '+newW.length+'語'+(due.length?' + 復習 '+due.length+'語':'')),
                h('div',{class:'meta soft'},'目安 約'+Math.max(1,Math.round(newW.length*1.4+due.length*0.4))+'分')),
             h('button',{class:'btn',onclick:()=>start(newW,due)},'はじめる'),
             h('button',{class:'btn sub',onclick:showTodayStudyList},'今日の学習一覧を見る')];
  mount(h('div',{class:'screen'},
    h('div',null,h('div',{class:'app-title'},h('span',{class:'mark'},'えいたん')),
      h('div',{class:'meta soft'},(d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+')'+(st>0?'　連続 '+st+'日':''))),
    main,h('div',{class:'grow'}),
    h('div',{class:'row2'},h('button',{class:'btn sub',onclick:showHistory},'きろく'),h('button',{class:'btn sub',onclick:showSettings},'設定'))));
}
function showHistory(){
  const rows=S.sessions.slice().reverse().slice(0,60).map(s=>{
    const [y,m,dd]=s.date.split('-').map(Number),wd=WD[new Date(y,m-1,dd).getDay()];
    const t=s.finishedAt?new Date(s.finishedAt):null;
    return h('div',{class:'item'},
      h('b',null,m+'/'+dd+'('+wd+')'+(t?' '+pad(t.getHours())+':'+pad(t.getMinutes()):'')),
      h('small',null,(s.mode==='repeat'?'再学習':'新')+s.newN+'語'+(s.reviewN?' + 復習'+s.reviewN+'語':'')+' / '+fmtDurJp(s.totalMs)+
        (s.total?' / '+(s.metricVersion===1?'初回正答率':'正答率')+Math.round(s.correct/s.total*100)+'%':'')+
        (s.metricVersion===1&&s.effortScore!==null?' / 取り組み度 '+s.effortScore+'/100':'')));
  });
  mount(h('div',{class:'screen'},topBack('きろく'),h('div',{class:'meta'},'連続 '+streak()+'日'),
    h('button',{class:'btn sub',onclick:()=>showWordHistory('today')},'学習した単語を見る'),
    h('button',{class:'btn sub',onclick:showTestDates},'日付を選んで確認テスト'),
    rows.length?h('div',null,rows):h('div',{class:'note'},'まだ記録がありません')));
}
function weekStart(date){
  const [y,m,d]=date.split('-').map(Number),start=new Date(y,m-1,d);
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  return ymd(start);
}
function wordHistoryEntries(range){
  const today=ymd(),start=range==='today'?today:range==='week'?weekStart(today):'';
  const inRange=date=>range==='all'||(date>=start&&date<=today),entries=new Map();
  function add(word,type,date){
    if(!BYWORD[word]) return;
    if(!entries.has(word)) entries.set(word,{word,types:new Set(),dates:new Set()});
    const entry=entries.get(word);
    entry.types.add(type);
    if(DATE_RE.test(String(date||''))) entry.dates.add(date);
  }
  for(const [word,state] of Object.entries(S.words)){
    if(range==='all'||inRange(state.learnedOn)) add(word,'known',state.learnedOn);
  }
  for(const record of S.sessions){
    if(!inRange(record.date)) continue;
    const newType=record.mode==='repeat'?'repeat':'new';
    record.newWords.forEach(word=>add(word,newType,record.date));
    record.reviewWords.forEach(word=>add(word,'review',record.date));
    if(!record.newWords.length&&record.mode!=='repeat'){
      for(const [word,state] of Object.entries(S.words)){
        if(state.learnedOn===record.date) add(word,'new',record.date);
      }
    }
  }
  const order=new Map(WORDS.map((item,index)=>[item.word,index]));
  return Array.from(entries.values()).sort((a,b)=>{
    if(range==='all'){
      const aDate=S.words[a.word]&&S.words[a.word].learnedOn||'',bDate=S.words[b.word]&&S.words[b.word].learnedOn||'';
      return bDate.localeCompare(aDate)||a.word.localeCompare(b.word,'en');
    }
    return order.get(a.word)-order.get(b.word);
  });
}
function showWordHistory(range='today'){
  const names={today:'今日',week:'今週',all:'これまで'},today=ymd(),start=weekStart(today),words=wordHistoryEntries(range);
  const tabs=Object.entries(names).map(([key,label])=>h('button',{class:'seg'+(range===key?' on':''),'aria-pressed':String(range===key),onclick:()=>showWordHistory(key)},label));
  const rows=words.map(entry=>{
    const labels=[];
    if(entry.types.has('new')) labels.push('新出');
    if(entry.types.has('review')) labels.push('復習');
    if(entry.types.has('repeat')) labels.push('再学習');
    if(!labels.length) labels.push('学習済み');
    const learned=S.words[entry.word]&&S.words[entry.word].learnedOn;
    const dates=Array.from(entry.dates).sort(),date=range==='all'?(learned||dates[0]):dates[dates.length-1];
    return h('div',{class:'item'},h('b',null,entry.word),h('small',null,BYWORD[entry.word].meaning),
      h('small',null,labels.join('・')+(date?' / '+(range==='all'?'覚えた日 ':'学習日 ')+date:'')));
  });
  const detail=range==='week'?'月曜から今日まで ('+start+'〜'+today+')':range==='today'?today:'学習済みの単語';
  mount(h('div',{class:'screen'},topBack('学習単語',showHistory),
    h('div',{class:'word-tabs'},tabs),h('div',{class:'meta'},detail),
    h('div',{class:'meta soft'},words.length+'語'),
    ['today','week'].includes(range)&&words.length?h('button',{class:'btn sub',onclick:()=>startLightReview(range,words.map(entry=>entry.word)),
      'aria-label':range==='today'?'今日の単語を軽く復習':'今週の単語を軽く復習'},range==='today'?'今日の軽い復習':'今週の軽い復習'):null,
    rows.length?h('div',null,rows):h('div',{class:'note'},'この期間の学習単語はありません')));
}
let lightReview=null;
function startLightReview(range,words){
  lightReview={range,cards:shuffle(words).map(word=>({word,revealed:false,rating:null})),index:0};
  showLightReviewCard();
}
function showLightReviewCard(){
  if(!lightReview)return;
  const run=lightReview,card=run.cards[run.index],word=card.word,d=BYWORD[word],total=run.cards.length;
  const title=run.range==='today'?'今日の復習':'今週の復習';
  const choices=['ok','maybe','ng'].map((value,index)=>{
    const labels=['◯ 言えた','△ あやしい','× わからない'];
    return h('button',{class:'btn '+(value==='ok'?'good':'sub'),'aria-pressed':String(card.rating===value),onclick:()=>{
      card.rating=value;card.revealed=true;showLightReviewCard();
    }},labels[index]);
  });
  const quit=h('button',{class:'x','aria-label':'復習を終了',onclick:()=>{
    if(confirm('復習を終了しますか?\n回答は保存されません。')){lightReview=null;showWordHistory(run.range);}
  }},'×');
  const previous=run.index>0?h('button',{class:'btn sub',onclick:()=>{run.index--;showLightReviewCard();}},'‹ 前へ'):null;
  const next=h('button',{class:'btn',disabled:!card.rating,onclick:()=>{
    if(run.index===total-1) showLightReviewResult();
    else{run.index++;showLightReviewCard();}
  }},run.index===total-1?'結果を見る':'つぎへ');
  mount(h('div',{class:'screen'},
    h('div',{class:'top'},quit,h('div',{class:'ttl'},title),h('div',{class:'pos'},(run.index+1)+' / '+total)),
    h('div',{class:'strip'},run.cards.map((item,index)=>h('i',{class:item.rating?'done':index===run.index?'now':''}))),
    h('div',{class:'note'},'日本語を見て英語を思い出してから、答えを見てね'),
    h('div',{class:'card'},h('div',{class:'jp'},d.meaning)),
    card.revealed?h('div',{class:'card'},h('div',{class:'en'},h('span',{class:'mark'},word))):null,
    card.revealed?h('div',{class:'rate'},choices):h('button',{class:'btn',onclick:()=>{card.revealed=true;showLightReviewCard();}},'答えを見る'),
    h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
}
function showLightReviewResult(){
  if(!lightReview)return;
  const run=lightReview,counts={ok:0,maybe:0,ng:0};
  run.cards.forEach(card=>{if(card.rating)counts[card.rating]++;});
  mount(h('div',{class:'screen'},
    h('div',{class:'big'},'復習おわり'),
    h('div',{class:'card'},
      h('div',{class:'srow'},h('span',null,'復習した単語'),h('b',null,run.cards.length+'語')),
      h('div',{class:'srow'},h('span',null,'◯ 言えた'),h('b',null,counts.ok+'語')),
      h('div',{class:'srow'},h('span',null,'△ あやしい'),h('b',null,counts.maybe+'語')),
      h('div',{class:'srow'},h('span',null,'× わからない'),h('b',null,counts.ng+'語'))),
    h('div',{class:'hint'},'この復習で学習間隔や単語の記録は変わりません。'),
    h('div',{class:'grow'}),
    h('button',{class:'btn',onclick:()=>startLightReview(run.range,run.cards.map(card=>card.word))},'もう一度復習'),
    h('button',{class:'btn sub',onclick:()=>{lightReview=null;showWordHistory(run.range);}},'単語一覧へ戻る')));
}
function newWordsForDate(date){
  const words=new Set();
  for(const record of S.sessions){
    if(record.date===date&&record.mode!=='repeat') record.newWords.forEach(word=>words.add(word));
  }
  for(const [word,state] of Object.entries(S.words)){
    if(state.learnedOn===date) words.add(word);
  }
  return WORDS.map(item=>item.word).filter(word=>words.has(word));
}
function testableDates(){
  const dates=new Set(S.sessions.map(record=>record.date));
  for(const state of Object.values(S.words)) if(state.learnedOn) dates.add(state.learnedOn);
  return Array.from(dates).filter(date=>DATE_RE.test(date)&&newWordsForDate(date).length)
    .sort((a,b)=>b.localeCompare(a)).map(date=>({date,words:newWordsForDate(date)}));
}
function studyDateLabel(date){
  const [y,m,d]=date.split('-').map(Number),day=WD[new Date(y,m-1,d).getDay()];
  return m+'/'+d+'('+day+')';
}
function showTestDates(){
  const dates=testableDates();
  const rows=dates.map(({date,words})=>h('div',{class:'item'},
    h('b',null,studyDateLabel(date)),
    h('small',null,words.length+'語・'+(words.length*2)+'問（英語→日本語／日本語→英語）'),
    h('button',{class:'btn sub small',onclick:()=>startDateTest(date,words)},'この日のテスト')));
  mount(h('div',{class:'screen'},topBack('確認テスト',showHistory),
    h('div',{class:'hint'},'その日に新しく学習した単語を、両方向から出題します。'),
    rows.length?h('div',null,rows):h('div',{class:'note'},'テストできる学習日はありません')));
}
function startDateTest(date,words){
  const questions=shuffle(words).flatMap(word=>[{word,direction:'enToJa'},{word,direction:'jaToEn'}]);
  runDateTest(date,words,questions).catch(error=>{
    console.error(error);toast('確認テストでエラーが起きました');showTestDates();
  });
}
async function runDateTest(date,words,questions){
  let correct=0;
  for(let i=0;i<questions.length;i++){
    const result=await dateTestCard(date,questions[i],i+1,questions.length);
    if(result==='abort'){showTestDates();return;}
    if(result==='correct') correct++;
  }
  showTestResult(date,words,correct,questions.length);
}
function dateTestCard(date,question,pos,total){
  const d=BYWORD[question.word],enToJa=question.direction==='enToJa';
  return new Promise(resolve=>{
    let revealed=false,finished=false;
    const answer=h('div',{class:'card',style:'display:none'},h('div',{class:enToJa?'jp':'en'},enToJa?d.meaning:d.word));
    const marks=h('div',{class:'row2',style:'display:none'},
      h('button',{class:'btn good',onclick:()=>finish('correct')},'正解'),
      h('button',{class:'btn sub',onclick:()=>finish('incorrect')},'不正解'));
    const finish=result=>{if(finished)return;finished=true;resolve(result);};
    const reveal=h('button',{class:'btn',onclick:()=>{
      if(revealed)return;
      revealed=true;answer.style.display='';marks.style.display='';reveal.disabled=true;
    }},'答えを見る');
    mount(h('div',{class:'screen'},
      h('div',{class:'top'},
        h('button',{class:'x','aria-label':'テストを中止',onclick:()=>{
          if(confirm('確認テストを中止しますか?\nここまでの結果は表示されません。')) finish('abort');
        }},'×'),
        h('div',{class:'ttl'},'確認テスト'),h('div',{class:'pos'},pos+' / '+total)),
      h('div',{class:'note'},studyDateLabel(date)+'　'+(enToJa?'英語 → 日本語':'日本語 → 英語')),
      h('div',{class:'card'},h('div',{class:enToJa?'en':'jp'},enToJa?d.word:d.meaning)),
      answer,h('div',{class:'hint'},'答えを言ってから表示し、正解かどうかを選んでね'),
      h('div',{class:'grow'}),reveal,marks));
  });
}
function showTestResult(date,words,correct,total){
  const percent=total?Math.round(correct/total*100):0;
  mount(h('div',{class:'screen'},
    h('div',null,h('div',{class:'big'},'確認テスト 完了'),h('div',{class:'meta soft'},studyDateLabel(date)+'の新出語')),
    h('div',{class:'card'},
      h('div',{class:'srow'},h('span',null,'対象単語'),h('b',null,words.length+'語')),
      h('div',{class:'srow'},h('span',null,'正解数'),h('b',null,correct+' / '+total+'問')),
      h('div',{class:'srow'},h('span',null,'正答率'),h('b',null,percent+'%'))),
    h('div',{class:'hint'},'各単語を英語→日本語、日本語→英語の両方で確認しました。'),
    h('div',{class:'grow'}),
    h('button',{class:'btn',onclick:()=>startDateTest(date,words)},'もう一度テスト'),
    h('button',{class:'btn sub',onclick:showTestDates},'日付選択へ戻る')));
}
function exportJSON(){return JSON.stringify({app:'eitan',v:APP_V,exportedAt:new Date().toISOString(),settings:S.settings,words:S.words,sessions:S.sessions},null,1);}
async function shareBackup(){
  const json=exportJSON(),name='eitan-backup-'+ymd().replace(/-/g,'')+'.json';
  for(const type of ['application/json','text/plain']){
    try{
      const f=new File([json],name,{type});
      if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return;}
    }catch(e){if(e&&e.name==='AbortError')return;}
  }
  const a=h('a',{href:URL.createObjectURL(new Blob([json],{type:'application/json'})),download:name});
  document.body.append(a);a.click();a.remove();
}
function importFrom(text){
  if(!text.trim()) return toast('バックアップを貼り付けるか、ファイルを選んでね');
  if(text.length>3000000) return toast('データが大きすぎます');
  let o; try{o=JSON.parse(text);}catch(e){return toast('読み込めませんでした(形式がちがいます)');}
  const r=validateBackup(o); if(!r.ok) return toast(r.error);
  const n=r.state.sessions.length,m=Object.keys(r.state.words).length;
  if(!confirm('学習 '+n+'回分、単語 '+m+'語の記録を読み込みます。\n今のデータは上書きされます。よろしいですか?')) return;
  S=r.state;save();clearPending();toast('読み込みました');showHome();
}
function showSettings(){
  const tel=h('input',{class:'tel',type:'tel',inputmode:'tel',placeholder:'例: 09012345678',value:S.settings.parentPhone,'aria-label':'送り先の電話番号'});
  tel.addEventListener('input',()=>{S.settings.parentPhone=tel.value.replace(/[^0-9+]/g,'').slice(0,20);save();});
  const waitOptions=[1,1.5,2].map(n=>h('button',{class:'seg'+(Number(S.settings.practiceWaitSec)===n?' on':''),'aria-pressed':String(Number(S.settings.practiceWaitSec)===n),
    onclick:()=>{S.settings.practiceWaitSec=n;save();showSettings();}},n+'秒'));
  const ta=h('textarea',{class:'box',placeholder:'バックアップの文字をここに貼り付け','aria-label':'バックアップ'});
  const file=h('input',{type:'file',accept:'.json,application/json,text/plain'});
  file.addEventListener('change',async()=>{const f=file.files&&file.files[0];if(f){try{ta.value=await f.text();}catch(e){toast('ファイルを読めませんでした');}}});
  mount(h('div',{class:'screen'},topBack('設定・バックアップ'),
    h('div',{class:'sec'},h('h2',null,'メッセージの送り先'),tel,h('div',{class:'hint'},'完了画面の「メッセージで送る」で、この番号あてのメッセージが開きます。')),
    h('div',{class:'sec'},h('h2',null,'発音練習の待ち時間'),
      h('div',{class:'seg-row'},waitOptions),
      h('div',{class:'hint'},'音声を聞いたあと、音声の長さを目安に練習時間を確保します。短い単語ではここで選んだ時間以上待ちます。マイクは使いません。')),
    h('div',{class:'sec'},h('h2',null,'バックアップ(書き出し)'),
      h('button',{class:'btn sub',onclick:shareBackup},'ファイルとして保存・送る'),
      h('button',{class:'btn sub',onclick:()=>copy(exportJSON())},'文字としてコピー')),
    h('div',{class:'sec'},h('h2',null,'バックアップ(読み込み)'),file,ta,
      h('button',{class:'btn',onclick:()=>importFrom(ta.value)},'読み込む(今のデータは上書き)')),
    h('div',{class:'hint'},'えいたん 試作版 / 単語 '+WORDS.length+'語')));
}

showHome();
if(LOAD_WARN) toast('きろくを読み込めませんでした。設定のバックアップから戻せます');
