'use strict';
/* ================= 基本 ================= */
const APP_V=1, KEY='eitan.v1', IDLE_MS=60000;
const PENDING_V=3;
const LEARN_ROUNDS=3;
const STEP_ORDER=['review','todayWords','learn','check1','useRead','useCloze','useOrder','check2','spell'];
const STEP_NAMES={review:'復習',todayWords:'今日の単語一覧',learn:'覚える',check1:'確認①',useRead:'例文を読もう',useCloze:'単語を選ぼう',useOrder:'英文をつくろう',check2:'確認②',spell:'スペル'};
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
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

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

/* ================= 保存データ ================= */
function defaultState(){return {app:'eitan',v:APP_V,settings:{parentPhone:'',practiceWaitSec:1.5},words:{},sessions:[]};}
function cleanSession(s){
  const sm={}; for(const k of STEP_ORDER) sm[k]=num(s.stepMs&&s.stepMs[k]);
  const metricVersion=s.metricVersion===2?2:s.metricVersion===1?1:0;
  const cleanWords=a=>Array.isArray(a)?Array.from(new Set(a.filter(w=>typeof w==='string'&&Object.prototype.hasOwnProperty.call(BYWORD,w)))).slice(0,WORDS.length):[];
  const mode=s.mode==='repeat'?'repeat':'normal',storedWords=cleanWords(s.newWords);
  const newWords=mode==='repeat'?[]:storedWords;
  const repeatWords=Array.isArray(s.repeatWords)?cleanWords(s.repeatWords):mode==='repeat'?storedWords:[];
  return {id:String(s.id||'').slice(0,40),date:s.date,finishedAt:num(s.finishedAt),newN:num(s.newN),reviewN:num(s.reviewN),
    stepMs:sm,totalMs:num(s.totalMs),correct:num(s.correct),total:num(s.total),
    legacyUseMs:num(s.legacyUseMs||s.stepMs&&s.stepMs.use),mode,
    newWords,repeatWords,reviewWords:cleanWords(s.reviewWords),unitId:BYUNIT[s.unitId]?s.unitId:null,
    skippedRounds:Math.floor(num(s.skippedRounds)),skippedWords:Math.floor(num(s.skippedWords)),
    metricVersion,avgAnswerMs:num(s.avgAnswerMs),
    responseTimeScore:metricVersion>=1&&s.responseTimeScore!=null?Math.min(100,num(s.responseTimeScore)):null,
    effortScore:metricVersion>=1&&s.effortScore!=null?Math.min(100,num(s.effortScore)):null};
}
function validateBackup(o){
  if(!o||typeof o!=='object'||Array.isArray(o)) return {ok:false,error:'データの形式が正しくありません'};
  if(o.app!=='eitan') return {ok:false,error:'えいたんのバックアップではありません'};
  if(o.v!==APP_V) return {ok:false,error:'このバックアップは読み込めません(バージョンがちがいます)'};
  const st=defaultState(), se=(o.settings&&typeof o.settings==='object')?o.settings:{};
  st.settings.parentPhone=typeof se.parentPhone==='string'?se.parentPhone.replace(/[^0-9+]/g,'').slice(0,20):'';
  st.settings.practiceWaitSec=[1,1.5,2].includes(Number(se.practiceWaitSec))?Number(se.practiceWaitSec):1.5;
  if(o.words!==undefined&&(o.words===null||typeof o.words!=='object'||Array.isArray(o.words))) return {ok:false,error:'単語の記録がこわれています'};
  for(const [k,w] of Object.entries(o.words||{})){
    if(!/^(?:[A-Za-z][A-Za-z' -]{0,39}|[A-Za-z][A-Za-z0-9-]{0,79})$/.test(k)||!w||typeof w!=='object') continue;
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
  const pendingVersion=Math.floor(num(raw.pendingVersion));
  const steps=[...(reviewWords.length?['review']:[]),...(newWords.length?['todayWords','learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  if(!steps.length) return null;
  const savedIndex=Math.floor(num(raw.currentStepIndex));
  const oldSteps=[...(reviewWords.length?['review']:[]),...(newWords.length?['learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  const oldStep=oldSteps[savedIndex];
  const currentStepIndex=pendingVersion>=2?Math.min(savedIndex,steps.length):oldStep?steps.indexOf(oldStep):steps.length;
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
  const learnCards=Array.isArray(raw.learnCards)?raw.learnCards.slice(0,WORDS.length*3).filter(card=>
    card&&BYWORD[card.word]&&Number.isInteger(card.round)&&card.round>=1&&card.round<=3)
    .map(card=>({word:card.word,round:card.round,position:Math.max(1,Math.floor(num(card.position,1))),
      roundTotal:Math.max(1,Math.floor(num(card.roundTotal,1)))})):null;
  const cardRunRaw=raw.cardRun,cardRun=cardRunRaw&&['review','check1','check2'].includes(cardRunRaw.stepKey)?(()=>{
    const queue=Array.isArray(cardRunRaw.queue)?cardRunRaw.queue.slice(0,WORDS.length*3).filter(item=>
      item&&BYWORD[item.word]).map(item=>({
        word:item.word,attempt:Math.min(3,Math.max(1,Math.floor(num(item.attempt,1)))),
        processed:item.processed===true,result:['ok','maybe','ng'].includes(item.result)?item.result:null,
        revealed:item.revealed===true,gateDone:item.gateDone===true,
        position:Math.floor(num(item.position)),responseMs:Number.isFinite(Number(item.responseMs))?num(item.responseMs):undefined
      })): [];
    const firstRaw=cardRunRaw.first&&typeof cardRunRaw.first==='object'?cardRunRaw.first:{};
    const first=Object.fromEntries(Object.entries(firstRaw).filter(([word,value])=>
      BYWORD[word]&&['ok','maybe','ng'].includes(value)));
    return {stepKey:cardRunRaw.stepKey,words:cleanWords(cardRunRaw.words),queue,first,
      done:Math.min(queue.length,Math.floor(num(cardRunRaw.done))),index:Math.min(queue.length,Math.floor(num(cardRunRaw.index))),
      total:Math.min(WORDS.length,Math.floor(num(cardRunRaw.total)))};
  })():null;
  const useTasksRaw=raw.useTasks,useTasks={useRead:[],useCloze:[],useOrder:[]};
  if(useTasksRaw&&typeof useTasksRaw==='object'&&!Array.isArray(useTasksRaw)){
    useTasks.useRead=Array.isArray(useTasksRaw.useRead)?useTasksRaw.useRead.filter(task=>task&&BYWORD[task.word]).map(task=>({
      word:task.word,round:task.round===2?2:1,state:{done:!!(task.state&&task.state.done)}
    })): [];
    useTasks.useCloze=Array.isArray(useTasksRaw.useCloze)?useTasksRaw.useCloze.filter(task=>task&&BYWORD[task.word]).map(task=>{
      const state=task.state&&typeof task.state==='object'?task.state:{},options=Array.isArray(state.options)?
        Array.from(new Set(state.options.filter(word=>BYWORD[word]))):undefined;
      return {word:task.word,state:{options,attempted:state.attempted===true,solved:state.solved===true,
        wrong:Array.isArray(state.wrong)?state.wrong.filter(word=>BYWORD[word]):[],
        firstCorrect:typeof state.firstCorrect==='boolean'?state.firstCorrect:undefined,
        firstResponseMs:Number.isFinite(Number(state.firstResponseMs))?num(state.firstResponseMs):undefined}};
    }): [];
    useTasks.useOrder=Array.isArray(useTasksRaw.useOrder)?useTasksRaw.useOrder.filter(task=>task&&BYWORD[task.word]).map(task=>{
      const tokens=BYWORD[task.word].ex1.split(' '),state=task.state&&typeof task.state==='object'?task.state:{};
      const rawOrder=Array.isArray(state.order)?state.order:[];
      const order=rawOrder.length===tokens.length&&rawOrder.every(item=>item&&Number.isInteger(item.i)&&tokens[item.i]===item.t)&&
        new Set(rawOrder.map(item=>item.i)).size===tokens.length?rawOrder.map(item=>({t:item.t,i:item.i})):tokens.map((t,i)=>({t,i}));
      const pickedIds=Array.isArray(state.picked)?state.picked.map(item=>Number.isInteger(item)?item:item&&item.i).filter(i=>Number.isInteger(i)): [];
      const picked=pickedIds.filter((id,index)=>order.some(item=>item.i===id)&&pickedIds.indexOf(id)===index)
        .map(id=>order.find(item=>item.i===id));
      return {word:task.word,state:{order,picked,attempted:state.attempted===true,solved:state.solved===true,
        revealedCount:Math.min(tokens.length,Math.floor(num(state.revealedCount))),
        assisted:state.assisted===true,feedback:['reveal','assisted','bad'].includes(state.feedback)?state.feedback:'',
        firstCorrect:typeof state.firstCorrect==='boolean'?state.firstCorrect:undefined,
        firstResponseMs:Number.isFinite(Number(state.firstResponseMs))?num(state.firstResponseMs):undefined}};
    }): [];
  }
  const useIndex={};
  for(const key of ['useRead','useCloze','useOrder']) useIndex[key]=Math.floor(num(raw.useIndex&&raw.useIndex[key]));
  const spellWords=cleanWords(raw.spellWords),spellResultsRaw=raw.spellResults&&typeof raw.spellResults==='object'?raw.spellResults:{};
  const spellResults=Object.fromEntries(Object.entries(spellResultsRaw).filter(([word,value])=>
    spellWords.includes(word)&&['ok','ng','skip'].includes(value)));
  const spellFirstRaw=raw.spellFirst&&typeof raw.spellFirst==='object'?raw.spellFirst:{};
  const spellFirst=Object.fromEntries(Object.entries(spellFirstRaw).filter(([word,value])=>
    spellWords.includes(word)&&typeof value==='boolean'));
  const ms={};for(const key of STEP_ORDER) ms[key]=num(raw.timeMs&&raw.timeMs[key]);
  const phase=raw.phase==='summary'?'summary':'running';
  let correct=num(raw.correct),total=num(raw.total);
  if(pendingVersion<PENDING_V&&phase==='running'){
    correct=num(raw.stageStartCorrect);total=num(raw.stageStartTotal);
    delete stageResponseMs[steps[currentStepIndex]];
  }
  return {newWords,reviewWords,unitId:BYUNIT[raw.unitId]?raw.unitId:null,repeat:raw.repeat===true,steps,currentStepIndex,
    phase,
    stageStartCorrect:num(raw.stageStartCorrect),stageStartTotal:num(raw.stageStartTotal),
    correct,total,stageResults,stageResponseMs,timeMs:ms,
    learnCards,learnIndex:Math.min(Math.floor(num(raw.learnIndex)),(learnCards||[]).length),
    cardRun,useTasks:useTasksRaw?useTasks:null,useIndex,
    spellWords,spellIndex:Math.min(Math.floor(num(raw.spellIndex)),spellWords.length),spellResults,spellFirst,
    skippedRounds:Math.floor(num(raw.skippedRounds)),skippedWords:Math.floor(num(raw.skippedWords))};
}
function pendingIdentity(item){return item.unitId||'legacy';}
function loadPending(){
  try{
    const raw=localStorage.getItem(PENDING_KEY);
    if(!raw)return {active:null,paused:[]};
    const parsed=JSON.parse(raw),records=Array.isArray(parsed&&parsed.sessions)?parsed.sessions:[parsed],unique=new Map();
    for(const record of records){
      const pending=cleanPending(record);
      if(!pending){LOAD_WARN=true;continue;}
      const key=pendingIdentity(pending);
      unique.delete(key);unique.set(key,pending);
    }
    const sessions=Array.from(unique.values());
    return {active:sessions.pop()||null,paused:sessions};
  }catch(e){LOAD_WARN=true;return {active:null,paused:[]};}
}
const loadedPending=loadPending();
let pendingSession=loadedPending.active,pausedSessions=loadedPending.paused;
function persistPendingSessions(){
  const unique=new Map();
  for(const item of [...pausedSessions,...(pendingSession?[pendingSession]:[])]){
    const key=pendingIdentity(item);
    unique.delete(key);unique.set(key,item);
  }
  const records=Array.from(unique.values());
  if(records.length)localStorage.setItem(PENDING_KEY,JSON.stringify({pendingStoreVersion:1,sessions:records}));
  else localStorage.removeItem(PENDING_KEY);
}
function storePendingSession(data){
  const clean=cleanPending(data);
  if(!clean)return false;
  const previousPending=pendingSession,previousPaused=pausedSessions,key=pendingIdentity(clean);
  pausedSessions=pausedSessions.filter(item=>pendingIdentity(item)!==key);
  pendingSession=clean;
  try{persistPendingSessions();return true;}
  catch(e){pendingSession=previousPending;pausedSessions=previousPaused;toast('学習の進み具合を保存できませんでした');return false;}
}
function savePending(){
  if(!session)return true;
  Time.tick();
  const data={pendingVersion:PENDING_V,newWords:session.newWords,reviewWords:session.reviewWords,unitId:session.unitId,repeat:session.repeat,
    currentStepIndex:session.currentStepIndex,phase:session.phase,stageStartCorrect:session.stageStartCorrect,
    stageStartTotal:session.stageStartTotal,correct:session.correct,total:session.total,
    stageResults:session.stageResults,stageResponseMs:session.stageResponseMs,timeMs:Time.ms,
    learnCards:session.learnCards,learnIndex:session.learnIndex,cardRun:session.cardRun,
    useTasks:session.useTasks,useIndex:session.useIndex,
    spellWords:session.spellWords,spellIndex:session.spellIndex,spellResults:session.spellResults,spellFirst:session.spellFirst,
    skippedRounds:session.skippedRounds,skippedWords:session.skippedWords};
  return storePendingSession(data);
}
function parkPendingSession(){
  if(!pendingSession)return true;
  const current=pendingSession,previousPaused=pausedSessions;
  const key=pendingIdentity(current);
  pausedSessions=pausedSessions.filter(item=>pendingIdentity(item)!==key);
  pausedSessions.push(current);pendingSession=null;
  try{persistPendingSessions();return true;}
  catch(e){pausedSessions=previousPaused;pendingSession=current;toast('学習の進み具合を保存できませんでした');return false;}
}
function takePausedSession(unitId=null){
  const index=unitId===null?pausedSessions.length-1:pausedSessions.findIndex(item=>item.unitId===unitId);
  if(index<0)return null;
  const previousPaused=pausedSessions,previousPending=pendingSession,selected=pausedSessions[index];
  pausedSessions=pausedSessions.filter((_,i)=>i!==index);pendingSession=selected;
  try{persistPendingSessions();return selected;}
  catch(e){pausedSessions=previousPaused;pendingSession=previousPending;toast('学習の進み具合を保存できませんでした');return false;}
}
let sessionGeneration=0;
function pauseCurrentSession(){
  if(session){
    const current=session;
    if(!savePending())return false;
    sessionGeneration++;
    if(current.cancelWait)current.cancelWait(new Error('switch'));
    TTS.stop();Time.stop();session=null;
  }
  return parkPendingSession();
}
function clearActivePending(){
  pendingSession=null;
  try{persistPendingSessions();}catch(e){toast('中断した学習を削除できませんでした');}
}
function clearPending(){
  try{localStorage.removeItem(PENDING_KEY);}catch(e){toast('中断した学習を削除できませんでした');}
  pendingSession=null;pausedSessions=[];
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){toast('保存できませんでした');}}

function streak(){
  const days=new Set(S.sessions.map(s=>s.date)); let d=ymd(); if(!days.has(d)) d=addDays(d,-1);
  let n=0; while(days.has(d)){n++; d=addDays(d,-1);} return n;
}
function unitProgress(unit){
  const learned=unit.words.filter(word=>S.words[word]).length;
  return {learned,total:unit.words.length,status:learned===unit.words.length?'learned':learned?'partial':'new'};
}
function nextUnit(){return WORD_UNITS.find(unit=>unitProgress(unit).status!=='learned');}
function startUnit(unit){
  if((session||pendingSession)?.unitId===unit.id){resumeStudy();return;}
  if(!pauseCurrentSession())return;
  const restored=takePausedSession(unit.id);
  if(restored===false)return;
  if(restored){
    start(restored.newWords,restored.reviewWords,restored.repeat,restored);
    return;
  }
  start(unit.words,[],unit.words.every(word=>!!S.words[word]),null,unit.id);
}
function startNextUnit(){
  const unit=nextUnit();
  if(unit)startUnit(unit);
  else showUnitStatus();
}

/* ================= 表示の道具 ================= */
let activeTab='home';
let cardModeRun=null;
const cardDisplayOptions={hideEnglish:false,hideJapanese:false,showExamples:true};
function mount(node){$('#app').replaceChildren(node);renderBottomNav();window.scrollTo(0,0);}
function renderBottomNav(){
  let nav=$('#bottom-nav');
  if(!nav){
    nav=h('nav',{id:'bottom-nav','aria-label':'メインメニュー'});
    document.body.append(nav);
  }
  const tabs=[['home','🏠','ホーム'],['study','📚','学習'],['cards','🗂️','単語帳'],['history','📈','きろく'],['settings','⚙️','設定']];
  nav.replaceChildren(...tabs.map(([key,icon,label])=>h('button',{
    class:'nav-tab'+(activeTab===key?' active':''),type:'button',
    'aria-label':label,'aria-current':activeTab===key?'page':null,
    onclick:()=>navigateTab(key)
  },h('span',{class:'nav-icon','aria-hidden':'true'},icon),h('span',null,label))));
}
function pauseActiveSessionForNavigation(){
  if(!session)return;
  const current=$('#app').firstElementChild;
  if(current&&current.dataset.sessionScreen==='true') session.pausedScreen=current;
  TTS.stop();Time.setStep(null);savePending();
}
function navigateTab(tab){
  if(lightReview){
    if(!confirm('復習を終了しますか?\n回答は保存されません。'))return;
    lightReview=null;
  }
  if(activeDateTestExit){
    if(!confirm('確認テストを中止しますか?\nここまでの結果は表示されません。'))return;
    dateTestExitTarget=tab;activeDateTestExit();return;
  }
  if(tab==='study'){showUnitStatus();return;}
  pauseActiveSessionForNavigation();
  if(tab==='home') showHome();
  else if(tab==='cards') showCardBooks();
  else if(tab==='history') showHistory();
  else showSettings();
}
function setActiveTab(tab){activeTab=tab;}
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
  const owner=session;
  if(owner.quit) return Promise.reject(new Error('abort'));
  return new Promise((resolve,reject)=>{
    let finished=false;
    const cancel=error=>{
      if(finished)return;
      finished=true;
      const cleanup=owner.cleanup;owner.cleanup=null;owner.cancelWait=null;owner.reject=null;
      if(cleanup)cleanup();
      reject(error||new Error('switch'));
    };
    owner.reject=cancel;owner.cancelWait=cancel;
    fn((value)=>{
      if(finished||session!==owner)return;
      finished=true;owner.cleanup=null;owner.cancelWait=null;owner.reject=null;
      savePending();
      resolve(value);
    },cleanup=>{owner.cleanup=cleanup;});
  });
}
function askQuit(){
  showUnitStatus();
}
function chrome(stepKey,pos,total,...body){
  const steps=session.steps,idx=steps.indexOf(stepKey);
  setActiveTab('study');
  session.currentStep=stepKey;
  return h('div',{class:'screen','data-session-screen':'true'},
    h('div',{class:'top'},
      h('button',{class:'x','aria-label':'ユニットの学習状況へ',onclick:askQuit},'×'),
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

function stepTodayWords(){
  Time.setStep('todayWords');
  return waitUI(resolve=>{
    const list=session.newWords.map(word=>{
      const d=BYWORD[word];
      return h('div',{class:'item'},h('b',null,d.word),h('small',null,d.meaning));
    });
    mount(chrome('todayWords','', '',
      h('div',{class:'hint'},'今日学習する単語を先に見ておこう。知っている単語は、周の区切りで次の周をスキップできます。'),
      h('div',null,list),h('div',{class:'grow'}),
      h('button',{class:'btn',onclick:()=>resolve('next')},'覚えるへ進む')));
  });
}

/* ② 覚える:単語+意味を、音を聞いて声に出す ×3周 */
async function stepLearn(){
  Time.setStep('learn');
  const rounds=LEARN_ROUNDS;
  if(!Array.isArray(session.learnCards)||session.learnCards.length!==session.newWords.length*rounds||
    session.learnCards.some(card=>!session.newWords.includes(card.word))){
    session.learnCards=[];
    for(let r=1;r<=rounds;r++){
      const order=r===1?session.newWords.slice():shuffle(session.newWords);
      order.forEach((word,index)=>session.learnCards.push({word,round:r,position:index+1,roundTotal:order.length}));
    }
  }
  const cards=session.learnCards,total=cards.length;
  let index=Math.min(session.learnIndex||0,total);
  while(index<total){
    session.learnIndex=index;
    savePending();
    const card=cards[index];
    const action=await learnCard(card.word,card.position,card.roundTotal,card.round,rounds,index>0);
    if(action==='prev'){index=Math.max(0,index-1);session.learnIndex=index;savePending();continue;}
    index++;
    session.learnIndex=index;
    savePending();
    if(card.round<rounds&&(!cards[index]||cards[index].round!==card.round)){
      if(await learnRoundEnd(card.round,rounds)){
        const skippedRound=card.round+1;
        while(index<total&&cards[index].round===skippedRound) index++;
        session.learnIndex=index;
        session.skippedRounds++;
        savePending();
      }
    }
  }
  session.learnIndex=total;savePending();
}
function learnRoundEnd(round,rounds){
  return waitUI(resolve=>{
    const next=h('button',{class:'btn',onclick:()=>resolve(false)},'次の周へ進む');
    const skip=h('button',{class:'btn sub',onclick:()=>resolve(true)},'次の周をスキップする');
    mount(chrome('learn','', '',
      h('div',{class:'card'},
        h('div',{class:'big'},round+'周目完了!'),
        h('div',{class:'meta'},'次は'+(round+1)+'周目です')),
      h('div',{class:'grow'}),h('div',{class:'row2'},skip,next)));
  });
}
function learnCard(word,n,total,r,rounds,canGoBack){
  const d=BYWORD[word];
  return waitUI((resolve,onCancel)=>{
    let playId=0,finished=false;
    const finish=action=>{if(finished)return;finished=true;TTS.stop();resolve(action);};
    onCancel(()=>{playId++;TTS.stop();});
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',onclick:()=>finish('next')},'つぎへ');
    const play=async()=>{
      const id=++playId;TTS.stop();
      await TTS.speak(d.word);
      if(id!==playId||finished)return;
    };
    mount(chrome('learn',n,total,
      h('div',{class:'note'},r+'周目 / '+rounds+'周　今日の単語 '+n+'/'+total),
      h('div',{class:'card'},h('div',{class:'en'},h('span',{class:'mark'},d.word)),h('div',{class:'jp'},d.meaning)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:play},'🔊 もういちど聞く')),
      h('div',{class:'hint'},'音を聞いて、英語と日本語の意味を声に出して言おう'),
      h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
    play();
  });
}

/* フラッシュカード(赤シート):日本語を見て英語を思い出す → 赤シートをタップして答え合わせ → ◯△× */
function flashCard(stepKey,word,pos,total,mode,state,canGoBack){
  const d=BYWORD[word];
  const isCheck2=stepKey==='check2';
  const responseStart=activeStepTime(stepKey);
  return waitUI((resolve,onCancel)=>{
    let finished=false;
    const fin=r=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(r);};
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>fin('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',style:'display:none',onclick:()=>fin(state.result||'next')},'つぎへ');
    const choose=r=>{if(isCheck2&&!state.gateDone)return;state.result=r;fin(r);};
    const rate=h('div',{class:'rate',style:isCheck2?'':'visibility:hidden'},
      h('button',{class:'btn good',disabled:isCheck2&&!state.gateDone,'aria-pressed':'false',onclick:()=>choose('ok')},'◯ 言えた'),
      h('button',{class:'btn sub',disabled:isCheck2&&!state.gateDone,'aria-pressed':'false',onclick:()=>choose('maybe')},'△ あやしい'),
      h('button',{class:'btn sub',disabled:isCheck2&&!state.gateDone,'aria-pressed':'false',onclick:()=>choose('ng')},'× わからない'));
    const sheet=isCheck2?h('div',{class:'sheet blank','aria-hidden':'true'}):
      h('button',{class:'sheet'},'タップして答えを見る');
    const skipGate=stepKey==='check1' || stepKey==='check2';
    const gate=makeGate(()=>{
      state.gateDone=true;rate.style.visibility='visible';previous.disabled=!canGoBack;
      if(isCheck2) [...rate.children].forEach(button=>button.disabled=false);
      savePending();
    },skipGate);
    onCancel(()=>{playId++;gate.destroy();TTS.stop();});
    gate.el.style.display='none';
    let playId=0;
    const play=async()=>{
      const id=++playId;gate.reset();gate.el.style.display=skipGate?'none':'';
      if(!isCheck2)rate.style.visibility='hidden';
      TTS.stop();
      await TTS.speak(d.word);
      let duration=practiceDuration(d.word);
      if(mode==='sentence'){
        await TTS.speak(d.ex1,0.8);duration+=practiceDuration(d.ex1,0.8);
      }
      if(id===playId&&!finished) gate.wait(duration);
    };
    function revealAnswer(){
      if(state.revealed) return;
      if(state.responseMs===undefined) state.responseMs=elapsedStepTime(stepKey,responseStart);
      state.revealed=true;previous.disabled=true;sheet.classList.add('off');
      if(revealButton)revealButton.style.display='none';
      savePending();play();
    }
    if(!isCheck2)sheet.addEventListener('click',revealAnswer);
    const revealButton=isCheck2?h('button',{class:'btn sub small',onclick:revealAnswer},'タップして答えを見る'):null;
    const front=mode==='sentence'?[h('div',{class:'jp'},d.meaning),h('div',{class:'jp2'},d.tr1)]:[h('div',{class:'jp'},d.meaning)];
    const back=mode==='sentence'?[h('div',{class:'en'},h('span',{class:'mark'},d.word)),h('div',{class:'sent'},hl(d.ex1,d.word))]
                                :[h('div',{class:'en'},h('span',{class:'mark'},d.word))];
    mount(chrome(stepKey,pos,total,
      h('div',{class:'note'},mode==='sentence'?'英語の単語と例文を声に出して思い出そう':'英語を声に出して思い出そう'),
      h('div',{class:'card'},front),
      h('div',{class:'sheet-wrap'},h('div',{class:'back'},back),sheet),
      gate.el,isCheck2?h('div',{class:'row'},revealButton):h('div',{class:'grow'}),
      rate,h('div',{class:'row2'},previous,next)));
    if(state.revealed){
      sheet.classList.add('off');gate.el.style.display=skipGate?'none':'';
      if(revealButton)revealButton.style.display='none';
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
  const saved=session.cardRun;
  const canResume=saved&&saved.stepKey===stepKey&&saved.words.length===words.length&&saved.words.every((word,index)=>word===words[index]);
  const run=canResume?saved:{
    stepKey,words:words.slice(),queue:shuffle(words).map(word=>({word,attempt:1,processed:false,result:null,revealed:false,gateDone:false,position:0})),
    first:{},total:words.length,done:0,index:0
  };
  session.cardRun=run;
  const {queue,first,total}=run,indexStart=run.index;
  const responseTimes=session.stageResponseMs[stepKey]||(session.stageResponseMs[stepKey]={});
  for(let index=indexStart;index<queue.length;){
    run.index=index;
    const item=queue[index];
    if(!item.position) item.position=Math.min(run.done+1,total);
    savePending();
    const r=await flashCard(stepKey,item.word,item.position,total,mode,item,index>0);
    if(r==='prev'){index=Math.max(0,index-1);savePending();continue;}
    if(r==='next'){index++;savePending();continue;}
    if(item.processed){index++;savePending();continue;}
    item.processed=true;
    if(first[item.word]===undefined){
      first[item.word]=r;
      if(!Object.prototype.hasOwnProperty.call(responseTimes,item.word)){
        responseTimes[item.word]=item.responseMs||0;
        addAcc(r==='ok');
      }
    }
    if(r==='ok'||item.attempt>=3) run.done++;
    else queue.splice(Math.min(queue.length,index+4),0,{word:item.word,attempt:item.attempt+1,processed:false,result:null,revealed:false,gateDone:false,position:item.position});
    index++;
    run.index=index;savePending();
  }
  session.cardRun=null;savePending();
  return first;
}
async function stepReview(){Time.setStep('review');return runCards('review',session.reviewWords,'meaning');}
async function stepCheck1(){Time.setStep('check1');return runCards('check1',session.newWords,'meaning');}
async function stepCheck2(){Time.setStep('check2');return runCards('check2',session.newWords,'sentence');}

/* ④ 使ってみよう:例文を読む → 穴埋め → 並べ替え */
function ensureUseTasks(){
  const words=session.newWords;
  if(!session.useTasks) session.useTasks={useRead:[],useCloze:[],useOrder:[]};
  let changed=false;
  if(!Array.isArray(session.useTasks.useRead)||session.useTasks.useRead.length!==words.length*2){
    session.useTasks.useRead=[];
    for(let k=1;k<=2;k++) for(const word of shuffle(words)) session.useTasks.useRead.push({word,round:k,state:{done:false}});
    changed=true;
  }
  if(!Array.isArray(session.useTasks.useCloze)||session.useTasks.useCloze.length!==words.length){
    session.useTasks.useCloze=shuffle(words).map(word=>({word,state:{attempted:false,solved:false,wrong:[]}}));
    changed=true;
  }
  if(!Array.isArray(session.useTasks.useOrder)||session.useTasks.useOrder.length!==words.length){
    session.useTasks.useOrder=shuffle(words).map(word=>({word,state:{attempted:false,solved:false,picked:[],revealedCount:0}}));
    changed=true;
  }
  if(changed) savePending();
}
async function runUseTasks(stepKey,tasks){
  const total=tasks.length;
  let index=Math.min(session.useIndex[stepKey]||0,total);
  while(index<total){
    session.useIndex[stepKey]=index;savePending();
    const task=tasks[index];
    let action;
    if(stepKey==='useRead') action=await readCard(task.word,task.round,index+1,total,task.state,index>0);
    else if(stepKey==='useCloze') action=await clozeCard(task.word,session.newWords,index+1,total,task.state,index>0);
    else action=await orderCard(task.word,index+1,total,task.state,index>0);
    if(action==='prev'){index=Math.max(0,index-1);session.useIndex[stepKey]=index;savePending();continue;}
    index++;
    session.useIndex[stepKey]=index;savePending();
  }
  session.useIndex[stepKey]=total;savePending();
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
  return waitUI((resolve,onCancel)=>{
    let playId=0,finished=false;
    const finish=action=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(action);};
    const wasDone=state.done;
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!wasDone,onclick:()=>finish(wasDone?'next':'done')},'つぎへ');
    const gate=makeGate(()=>{state.done=true;next.disabled=false;savePending();});
    onCancel(()=>{playId++;gate.destroy();TTS.stop();});
    const play=async()=>{
      const id=++playId;state.done=false;next.disabled=true;gate.reset();savePending();TTS.stop();
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
  const target=BYWORD[word].word.trim().toLowerCase(),seen=new Set([target]),result=[];
  const others=shuffle(pool.filter(id=>id!==word));
  const extra=shuffle(WORDS.map(item=>item.id).filter(id=>id!==word&&!others.includes(id)));
  for(const id of others.concat(extra)){
    const text=BYWORD[id].word.trim().toLowerCase();
    if(seen.has(text))continue;
    seen.add(text);result.push(id);
    if(result.length===3)break;
  }
  return result;
}
function clozeCard(word,pool,n,total,state,canGoBack){
  const d=BYWORD[word];
  const optionsValid=Array.isArray(state.options)&&state.options.length===4&&state.options.includes(word)&&
    state.options.every(id=>BYWORD[id])&&
    new Set(state.options.map(id=>BYWORD[id]&&BYWORD[id].word.trim().toLowerCase())).size===4;
  if(!optionsValid){
    state.options=shuffle([word,...distractors(word,pool)]);
    state.wrong=state.wrong.filter(id=>state.options.includes(id));
  }
  const wasSolved=state.solved;
  const responseStart=activeStepTime('useCloze');
  return waitUI(resolve=>{
    let finished=false;
    const finish=action=>{if(finished)return;finished=true;TTS.stop();resolve(action);};
    const fb=h('div',{class:'fb'}),sentEl=h('div',{class:'sent'},d.ex2.replace(wordRe(d.word),'_____'));
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!state.solved,onclick:()=>finish(wasSolved?'next':'done')},'つぎへ');
    const grid=h('div',{class:'choices'});
    state.options.forEach(o=>{
      const b=h('button',{class:'btn sub',disabled:state.solved||state.wrong.includes(o)},BYWORD[o].word);
      if(state.solved&&o===word) b.classList.add('good');
      if(state.wrong.includes(o)) b.classList.add('bad');
      b.addEventListener('click',()=>{
        if(state.solved||state.wrong.includes(o)) return;
        const good=o===word;
        if(!state.attempted){state.attempted=true;state.firstCorrect=good;state.firstResponseMs=elapsedStepTime('useCloze',responseStart);addAcc(good);}
        if(good){
          state.solved=true;b.classList.add('good');fb.className='fb ok';fb.textContent='せいかい!';
          sentEl.replaceChildren(...hl(d.ex2,d.word));next.disabled=true;savePending();
          TTS.speak(d.ex2,0.8).then(()=>{
            if(finished)return;
            if(Time.step==='useCloze') finish(wasSolved?'next':'done');
            else next.disabled=false;
          });
        }else{state.wrong.push(o);b.classList.add('bad');b.disabled=true;fb.className='fb bad';fb.textContent='ちがうよ。もう一度えらんでね';savePending();}
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
    let finished=false;
    const finish=action=>{if(finished)return;finished=true;TTS.stop();resolve(action);};
    const ans=h('div',{class:'answer'}),pool=h('div',{class:'tiles'}),fb=h('div',{class:'fb'});
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!state.solved,onclick:()=>finish(wasSolved?'next':'done')},'つぎへ');
    const undo=h('button',{class:'btn sub small',disabled:true,onclick:()=>{
      if(state.solved||state.picked.length<=(state.revealedCount||0))return;
      state.picked.pop();savePending();render();
    }},'ひとつだけもどす');
    const clear=h('button',{class:'btn sub small',onclick:()=>{
      if(state.solved)return;
      state.picked=correctOrder.slice(0,state.revealedCount||0);state.feedback=state.revealedCount?'reveal':'';
      savePending();render();
    }},'全部やりなおす');
    function render(){
      undo.disabled=state.solved||state.picked.length<=(state.revealedCount||0);
      clear.disabled=state.solved;
      const pickedSet=new Set(state.picked.map(o=>o.i));
      ans.replaceChildren(...Array.from({length: order.length}, (_, i)=>{
        const selected=state.picked[i];
        if(selected){
          return h('button',{class:'tile'+(i<(state.revealedCount||0)?' fixed':''),disabled:state.solved||i<(state.revealedCount||0),
            onclick:()=>{if(state.solved||i<(state.revealedCount||0))return;state.picked.splice(i,1);savePending();render();}},selected.t);
        }
        return h('div',{class:'tile empty'},'');
      }));
      pool.replaceChildren(...order.filter(o=>!pickedSet.has(o.i)).map(o=>h('button',{class:'tile',disabled:state.solved,onclick:()=>{if(state.solved)return;state.picked.push(o);savePending();render();check();}},o.t)));
    }
    function check(){
      if(state.picked.length!==order.length) return;
      const good=state.picked.map(o=>o.t).join(' ')===d.ex1;
      if(!state.attempted){state.attempted=true;state.firstCorrect=good;state.firstResponseMs=elapsedStepTime('useOrder',responseStart);addAcc(good);}
      if(good){
        state.solved=true;state.feedback='';fb.className='fb ok';fb.textContent='せいかい!';next.disabled=true;
        render();
        TTS.speak(d.ex1,0.8).then(()=>{
          if(finished)return;
          if(Time.step==='useOrder') finish(wasSolved?'next':'done');
          else next.disabled=false;
        });
      }
      else{
        let correctPrefix=0;
        while(correctPrefix<tokens.length && state.picked[correctPrefix] && state.picked[correctPrefix].t===tokens[correctPrefix]){
          correctPrefix++;
        }
        state.revealedCount=Math.max(state.revealedCount||0,correctPrefix);
        state.picked=correctOrder.slice(0,state.revealedCount);
        if(state.revealedCount===tokens.length){
          state.solved=true;state.assisted=true;state.feedback='assisted';
          fb.className='fb ok';fb.textContent='正しい順番をすべて表示しました';next.disabled=false;render();
        }else{
          state.feedback='reveal';fb.className='fb bad';
          fb.textContent='まちがい。先頭から正しいところまで出したよ。つづきを並べよう';render();
        }
      }
      savePending();
    }
    if(state.solved){fb.className='fb ok';fb.textContent=state.assisted?'正しい順番をすべて表示しました':'せいかい!';}
    else if(state.feedback==='reveal'){
      fb.className='fb bad';fb.textContent='正しい単語を'+state.revealedCount+'語入れたよ。つづきを並べよう';
    }else if(state.feedback==='bad'){fb.className='fb bad';fb.textContent='ちがうよ。タップして直してみよう';}
    render();
    mount(chrome('useOrder',n,total,
      h('div',{class:'note'},'日本語に合う英文をつくろう'),
      h('div',{class:'card'},h('div',{class:'jp',style:'font-size:22px'},d.tr1)),
      ans,pool,fb,h('div',{class:'row2'},undo,clear),h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
  });
}

/* ⑥ スペル入力 */
async function stepSpell(){
  Time.setStep('spell');
  if(!session.spellWords||session.spellWords.length!==session.newWords.length||
    session.spellWords.some(word=>!session.newWords.includes(word))){
    session.spellWords=shuffle(session.newWords);session.spellIndex=0;session.spellResults={};session.spellFirst={};
  }
  session.spellResults=session.spellResults||{};session.spellFirst=session.spellFirst||{};
  const words=session.spellWords;
  for(let i=session.spellIndex;i<words.length;i++){
    session.spellIndex=i;savePending();
    if(!session.spellResults[words[i]]) await spellCard(words[i],i+1,words.length);
    session.spellIndex=i+1;savePending();
  }
  return {...session.spellResults};
}
function spellCard(word,n,total,persist=true){
  const d=BYWORD[word];
  const responseStart=activeStepTime('spell');
  return waitUI(resolve=>{
    let attempted=persist&&Object.prototype.hasOwnProperty.call(session.spellFirst||{},word);
    let solved=false,firstCorrect=attempted?session.spellFirst[word]:false;
    const record=value=>{if(persist){session.spellResults[word]=value;savePending();}};
    const input=h('input',{class:'spell',type:'text',autocapitalize:'none',autocomplete:'off',autocorrect:'off',spellcheck:'false',enterkeyhint:'done','aria-label':'つづり'});
    const fb=h('div',{class:'fb'});
    const btn=h('button',{class:'btn',onclick:submit},'答え合わせ');
    const skipBtn=h('button',{class:'btn sub',onclick:()=>{
      if(persist)session.skippedWords++;
      record('skip');TTS.stop();resolve('skip');
    }},'スキップ');
    input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
    function finalize(correct,kind='ok'){
      solved=true;fb.className=kind==='ok'?'fb ok':'fb bad';fb.textContent=correct?
        'せいかい!':'正しいつづりは「'+d.word+'」。次へ進めます';
      input.disabled=true;btn.textContent='つぎへ';skipBtn.disabled=true;record(attempted&&firstCorrect?'ok':'ng');
      const speech=TTS.speak(d.word);
      if(correct)speech.then(()=>resolve(firstCorrect?'ok':'ng'));
    }
    function submit(){
      if(solved){TTS.stop();resolve(firstCorrect?'ok':'ng');return;}
      const v=input.value.trim().toLowerCase();
      if(!v){
        if(!attempted){
          attempted=true;firstCorrect=false;
          const responseTimes=session.stageResponseMs.spell||(session.stageResponseMs.spell={});
          if(!Object.prototype.hasOwnProperty.call(responseTimes,word)){
            responseTimes[word]=elapsedStepTime('spell',responseStart);addAcc(false);
          }
          if(persist)session.spellFirst[word]=false;
        }
        finalize(false,'bad');
        return;
      }
      const good=v===d.word.toLowerCase();
      if(!attempted){
        attempted=true;firstCorrect=good;
        const responseTimes=session.stageResponseMs.spell||(session.stageResponseMs.spell={});
        if(!Object.prototype.hasOwnProperty.call(responseTimes,word)){
          responseTimes[word]=elapsedStepTime('spell',responseStart);addAcc(good);
        }
        if(persist)session.spellFirst[word]=good;
        savePending();
      }
      if(good){finalize(true,'ok');}
      else{fb.className='fb bad';fb.textContent='ざんねん。正しいつづりは「'+d.word+'」。もう一度書いてみよう';input.value='';input.focus();savePending();}
    }
    mount(chrome('spell',n,total,
      h('div',{class:'note'},'つづりを書こう'),
      h('div',{class:'card'},h('div',{class:'jp'},d.meaning)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:()=>TTS.speak(d.word)},'🔊 発音を聞く')),
      input,fb,h('div',{class:'grow'}),h('div',{class:'row2'},skipBtn,btn)));
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
  setActiveTab('study');
  const activeSession=session,idx=session.steps.indexOf(stepKey),next=idx===session.steps.length-1;
  const title=stepLabel(stepKey)+'のまとめ';
  const rows=stageSummaryRows(stepKey,result);
  Time.setStep(null);
  return new Promise((resolve,reject)=>{
    let finished=false;
    const cancel=error=>{
      if(finished)return;
      finished=true;
      if(activeSession.reject===cancel)activeSession.reject=null;
      if(activeSession.cancelWait===cancel)activeSession.cancelWait=null;
      reject(error||new Error('abort'));
    };
    activeSession.reject=cancel;
    activeSession.cancelWait=cancel;
    const choose=action=>{
      if(finished)return;
      finished=true;
      if(activeSession.reject===cancel)activeSession.reject=null;
      if(activeSession.cancelWait===cancel)activeSession.cancelWait=null;
      resolve(action);
    };
    const buttons=[
      h('button',{class:'btn',onclick:()=>choose('next')},next?'今日の結果へ':'次へ進む'),
      h('button',{class:'btn sub',onclick:()=>choose('repeat')},'このステップをやり直す')
    ];
    if(weakWords.length) buttons.push(h('button',{class:'btn sub',onclick:()=>choose('weak')},'苦手な単語だけもう一度 ('+weakWords.length+'語)'));
    mount(h('div',{class:'screen','data-session-screen':'true'},
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
  if(stepKey==='learn') session.learnIndex=0;
  else if(stepKey==='useRead'){
    session.useIndex.useRead=0;
    session.useTasks.useRead.forEach(task=>{task.state.done=false;});
  }else if(stepKey==='useCloze'){
    session.useIndex.useCloze=0;
    session.useTasks.useCloze.forEach(task=>Object.assign(task.state,{attempted:false,firstCorrect:undefined,solved:false,wrong:[]}));
  }else if(stepKey==='useOrder'){
    session.useIndex.useOrder=0;
    session.useTasks.useOrder.forEach(task=>Object.assign(task.state,{attempted:false,firstCorrect:undefined,solved:false,picked:[],revealedCount:0,assisted:false,feedback:''}));
  }else if(stepKey==='spell'){
    session.spellWords=null;session.spellIndex=0;session.spellResults={};session.spellFirst={};
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
    for(let i=0;i<words.length;i++) await spellCard(words[i],i+1,words.length,false);
  }
}
async function runStageWithSummary(stepKey,run){
  const idx=session.steps.indexOf(stepKey);
  session.currentStepIndex=idx;session.currentStep=stepKey;
  if(session.phase!=='summary'||!Object.prototype.hasOwnProperty.call(session.stageResults,stepKey)){
    session.phase='running';session.stageStartCorrect=session.correct;session.stageStartTotal=session.total;
    savePending();
    const result=await run();
    if(stepKey==='todayWords') session.stageResults[stepKey]={};
    else if(!Object.prototype.hasOwnProperty.call(session.stageResults,stepKey)){
      session.stageResults[stepKey]=result||{};
      if(stepKey==='review') session.reviewFirst=session.stageResults[stepKey];
    }
    session.phase='summary';savePending();
  }
  if(stepKey==='todayWords'){
    session.currentStepIndex=idx+1;session.phase='running';savePending();return;
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
async function start(newW,due,repeat=false,restored=null,unitId=null){
  const generation=++sessionGeneration;
  TTS.unlock();
  const steps=[...(due.length?['review']:[]),...(newW.length?['todayWords','learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  session={newWords:newW,reviewWords:due,steps,correct:num(restored&&restored.correct),
    total:num(restored&&restored.total),reject:null,quit:false,
    repeat:restored?restored.repeat:repeat,unitId:restored?restored.unitId:unitId,
    learnCards:restored&&restored.learnCards,learnIndex:restored?restored.learnIndex:0,
    cardRun:restored&&restored.cardRun,useTasks:restored&&restored.useTasks,useIndex:restored?restored.useIndex:{},
    stageResults:restored?restored.stageResults:{},stageResponseMs:restored?restored.stageResponseMs:{},
    reviewFirst:restored&&restored.stageResults.review||{},currentStepIndex:restored?restored.currentStepIndex:0,
    phase:restored?restored.phase:'running',stageStartCorrect:restored?restored.stageStartCorrect:0,
    stageStartTotal:restored?restored.stageStartTotal:0,spellWords:restored&&restored.spellWords,
    spellIndex:restored?restored.spellIndex:0,spellResults:restored&&restored.spellResults,
    spellFirst:restored&&restored.spellFirst,skippedRounds:restored?restored.skippedRounds:0,
    skippedWords:restored?restored.skippedWords:0,pausedScreen:null};
  Time.start(restored?restored.timeMs:{});
  const runners={review:stepReview,todayWords:stepTodayWords,learn:stepLearn,check1:stepCheck1,useRead:stepUseRead,
    useCloze:stepUseCloze,useOrder:stepUseOrder,check2:stepCheck2,spell:stepSpell};
  try{
    savePending();
    for(let i=session.currentStepIndex;i<session.steps.length;i++){
      if(generation!==sessionGeneration)return;
      await runStageWithSummary(session.steps[i],runners[session.steps[i]]);
    }
    if(generation===sessionGeneration)finishSession();
  }catch(e){
    if(generation!==sessionGeneration)return;
    const quit=e&&(e.message==='abort'||e.message==='switch');
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
  const baseEffort=accuracyScore===null||responseTimeScore===null?null:(accuracyScore+responseTimeScore)/2;
  const learnCompletion=(LEARN_ROUNDS-Math.min(LEARN_ROUNDS,session.skippedRounds))/LEARN_ROUNDS;
  const spellCompletion=session.newWords.length
    ?(session.newWords.length-Math.min(session.newWords.length,session.skippedWords))/session.newWords.length:1;
  const completionRate=session.newWords.length?(learnCompletion+spellCompletion)/2:1;
  return {metricVersion:2,avgAnswerMs,responseTimeScore,
    effortScore:baseEffort===null?null:Math.round(baseEffort*completionRate)};
}
function finishSession(){
  const now=Date.now(),today=ymd();
  const newlyLearned=session.repeat?[]:session.newWords.filter(word=>!S.words[word]);
  const repeatedWords=session.newWords.filter(word=>!newlyLearned.includes(word));
  if(!session.repeat){
    for(const w of newlyLearned) S.words[w]={box:1,due:addDays(today,1),learnedOn:today};
    for(const w of session.reviewWords){
      const st=S.words[w]; if(!st) continue;
      if(session.reviewFirst[w]==='ok'){st.box=Math.min(st.box+1,5);st.due=addDays(today,INTERVALS[st.box]);}
      else{st.box=1;st.due=addDays(today,1);}
    }
  }
  const rec={id:String(now),date:today,finishedAt:now,newN:newlyLearned.length,reviewN:session.reviewWords.length,unitId:session.unitId,
    stepMs:Object.assign({},Time.ms),totalMs:Time.total(),correct:session.correct,total:session.total,
    ...sessionMetrics(),mode:newlyLearned.length?'normal':'repeat',newWords:newlyLearned,repeatWords:repeatedWords,
    reviewWords:session.reviewWords.slice(),
    skippedRounds:session.skippedRounds,skippedWords:session.skippedWords};
  S.sessions.push(rec);S.sessions=S.sessions.slice(-2000);save();
  clearActivePending();
  endSession();showDone(rec);
}

/* ================= 完了画面・メッセージ ================= */
function buildMessage(rec){
  const d=new Date(rec.finishedAt||Date.now()),L=[];
  L.push('【ユニット学習 完了】');
  L.push((d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes()));
  if(BYUNIT[rec.unitId]) L.push(BYUNIT[rec.unitId].bookTitle+' '+BYUNIT[rec.unitId].number+'ユニット');
  L.push((rec.mode==='repeat'?'再学習': '新しく学習')+(rec.mode==='repeat'?rec.repeatWords.length:rec.newN)+'語'+
    (rec.mode!=='repeat'&&rec.repeatWords.length?' + 再学習'+rec.repeatWords.length+'語':'')+
    (rec.reviewN?' + 復習'+rec.reviewN+'語':''));
  L.push('学習時間 '+fmtDurJp(rec.totalMs));
  L.push('スキップした周 '+rec.skippedRounds+'周 / 単語 '+rec.skippedWords+'語');
  if(rec.total) L.push((rec.metricVersion>=1?'初回正答率 ':'正答率 ')+Math.round(rec.correct/rec.total*100)+'%('+rec.correct+'/'+rec.total+')');
  if(rec.metricVersion>=1&&rec.responseTimeScore!==null){
    L.push('初回の平均回答時間 '+fmtDurJp(rec.avgAnswerMs));
    L.push('回答時間スコア '+rec.responseTimeScore+'/100');
    if(rec.effortScore!==null) L.push('取り組み度の目安 '+rec.effortScore+'/100'+
      (rec.metricVersion>=2?'（スキップ分を反映）':'（初回正答率と回答時間スコアの平均）'));
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
  setActiveTab('home');
  const clock=h('div',{class:'clock'});
  const upd=()=>{const d=new Date();clock.textContent=(d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
  upd();const iv=setInterval(()=>{if(!clock.isConnected){clearInterval(iv);return;}upd();},1000);
  const msg=buildMessage(rec);
  const rows=[['学習時間',fmtDurJp(rec.totalMs)]];
  if(BYUNIT[rec.unitId]) rows.push(['ユニット',BYUNIT[rec.unitId].bookTitle+' '+BYUNIT[rec.unitId].number]);
  rows.push([rec.mode==='repeat'?'再学習した単語':'新しく学習した単語',
    (rec.mode==='repeat'?rec.repeatWords.length:rec.newN)+'語']);
  if(rec.mode!=='repeat'&&rec.repeatWords.length) rows.push(['再学習した単語',rec.repeatWords.length+'語']);
  rows.push(['今回取り組んだ単語',rec.newWords.length+rec.repeatWords.length+rec.reviewWords.length+'語']);
  if(rec.reviewN) rows.push(['復習',rec.reviewN+'語']);
  rows.push(['スキップした数','周'+rec.skippedRounds+' / 単語'+rec.skippedWords+'語']);
  if(rec.total) rows.push([rec.metricVersion>=1?'初回正答率':'正答率',Math.round(rec.correct/rec.total*100)+'%('+rec.correct+'/'+rec.total+')']);
  if(rec.metricVersion>=1&&rec.responseTimeScore!==null){
    rows.push(['初回の平均回答時間',fmtDurJp(rec.avgAnswerMs)]);
    rows.push(['回答時間スコア',rec.responseTimeScore+'/100']);
    if(rec.effortScore!==null) rows.push(['取り組み度の目安',rec.effortScore+'/100']);
  }
  const st=streak(); if(st>0) rows.push(['連続',st+'日目']);
  const upcoming=nextUnit();
  const steps=STEP_ORDER.filter(k=>rec.stepMs[k]>0).map(k=>h('div',{class:'srow'},h('span',null,STEP_NAMES[k]),h('span',null,fmtDur(rec.stepMs[k]))));
  if(rec.legacyUseMs) steps.push(h('div',{class:'srow'},h('span',null,'使ってみよう(旧記録)'),h('span',null,fmtDur(rec.legacyUseMs))));
  mount(h('div',{class:'screen'},
    h('div',null,h('div',{class:'big'},h('span',{class:'mark'},'ユニット学習 完了!')),clock,h('div',{class:'hint'},'この画面をおうちの人に見せよう')),
    h('div',{class:'card'},rows.map(([a,b])=>h('div',{class:'srow'},h('span',null,a),h('b',null,b)))),
    rec.metricVersion>=1&&rec.responseTimeScore!==null?h('div',{class:'hint'},rec.metricVersion>=2?
      '取り組み度は初回正答率と回答時間から算出し、スキップした学習分を反映した目安です。時間スコアは平均2秒以下で0点、5秒以上で100点（間は比例）ですが、真剣さを断定するものではありません。':
      '取り組み度は初回正答率と回答時間から算出した目安です。時間スコアは平均2秒以下で0点、5秒以上で100点（間は比例）ですが、真剣さを断定するものではありません。'):null,
    h('div',{class:'card slim'},h('div',{class:'lbl'},'ステップごとの時間'),h('div',{class:'steps'},steps)),
    h('div',{class:'grow'}),
    h('button',{class:'btn',onclick:()=>openSms(msg)},'メッセージで送る'),
    S.settings.parentPhone?null:h('div',{class:'hint'},'送り先は「設定」で登録できます'),
    h('div',{class:'row2'},h('button',{class:'btn sub',onclick:()=>share(msg)},'共有'),h('button',{class:'btn sub',onclick:()=>copy(msg)},'コピー')),
    upcoming?h('button',{class:'btn',onclick:()=>startUnit(upcoming)},'次のユニットを学習'):null,
    h('button',{class:'btn sub',onclick:showUnitStatus},'ユニットの学習状況を見る'),
    h('button',{class:'link',onclick:showHome},'ホームへもどる')));
}

/* ================= ホーム・きろく・設定 ================= */
function topBack(title,onBack=showHome){return h('div',{class:'top'},h('button',{class:'x','aria-label':'もどる',onclick:onBack},'‹'),h('div',{class:'ttl'},title));}
function audioButton(text,label,rate){
  return h('button',{class:'audio-button','aria-label':label,title:label,onclick:()=>TTS.speak(text,rate)},
    h('svg',{class:'speaker-icon',viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false'},
      h('path',{d:'M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zm-2.5-9v2.06a7 7 0 0 1 0 13.88V21a9 9 0 0 0 0-18z'})));
}
function resumeStudy(){
  TTS.unlock();
  if(session){
    if(session.pausedScreen){
      const screen=session.pausedScreen;session.pausedScreen=null;
      setActiveTab('study');Time.touch('k');Time.setStep(session.currentStep||null);mount(screen);
    }
    return;
  }
  if(!pendingSession){
    const restored=takePausedSession();
    if(!restored||restored===false)return;
  }
  start(pendingSession.newWords,pendingSession.reviewWords,pendingSession.repeat,pendingSession);
}
function wordCard(word,options={}){
  const d=BYWORD[word];
  if(!d)return null;
  const content=[];
  if(!options.hideEnglish||options.audio)content.push(h('div',{class:'word-card-heading'},
    !options.hideEnglish?h('div',{class:'en'},d.word):null,
    options.audio?audioButton(d.word,'単語の発音を聞く'):null));
  if(!options.hideJapanese)content.push(h('div',{class:'jp'},d.meaning));
  if(options.showExamples!==false){
    for(let i=1;i<=2;i++){
      content.push(h('div',{class:'word-card-example'},
        !options.hideEnglish||options.audio?h('div',{class:'word-card-sentence'},
          !options.hideEnglish?h('div',{class:'sent'},hl(d['ex'+i],d.word)):null,
          options.audio?audioButton(d['ex'+i],'例文'+i+'の発音を聞く',0.8):null):null,
        !options.hideJapanese?h('div',{class:'tr'},d['tr'+i]):null));
    }
  }
  return h('div',{class:'card word-card'},content);
}
function cardOptionControls(onChange){
  const checkbox=(key,label)=>h('label',{class:'chk'},h('input',{type:'checkbox',checked:cardDisplayOptions[key],
    onchange:event=>{cardDisplayOptions[key]=event.target.checked;onChange();}}),label);
  return h('div',{class:'card-options'},
    checkbox('hideEnglish','英語を隠す'),checkbox('hideJapanese','日本語を隠す'),
    checkbox('showExamples','例文を表示'));
}
function showCardBooks(){
  setActiveTab('cards');cardModeRun=null;
  const rows=WORD_BOOKS.map(book=>h('div',{class:'item'},
    h('b',null,book.title),h('small',null,book.words.length+'語'),
    h('button',{class:'btn sub small',onclick:()=>showCardBook(book.id)},'この単語帳を選ぶ')));
  mount(h('div',{class:'screen'},topBack('単語カード',showHome),
    h('div',{class:'hint'},'単語帳を選んでカードをめくろう'),
    rows.length?h('div',null,rows):h('div',{class:'note'},'単語帳がありません')));
}
function showCardBook(bookId){
  setActiveTab('cards');
  const book=WORD_BOOKS.find(item=>item.id===bookId);
  if(!book){showCardBooks();return;}
  const ids=book.words.map(item=>item.id),chunks=[];
  for(let start=0;start<ids.length;start+=20){
    const chunk=ids.slice(start,start+20),first=start+1,last=start+chunk.length;
    chunks.push(h('div',{class:'item'},
      h('b',null,first+'〜'+last+'語'),
      h('div',{class:'row2'},
        h('button',{class:'btn sub small',onclick:()=>startWordCardRun(book.id,chunk,book.title)},'めくる'),
        h('button',{class:'btn sub small',onclick:()=>showWordCardList(book.id,chunk,book.title+' '+first+'〜'+last+'語')},'全部表示'))));
  }
  mount(h('div',{class:'screen'},topBack(book.title,showCardBooks),
    h('div',{class:'meta'},ids.length+'語'),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(book.id,ids,book.title)},'通しでめくる'),
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(book.id,ids,book.title,true)},'シャッフル')),
    h('button',{class:'btn sub',onclick:()=>showWordCardList(book.id,ids,book.title)},'単語帳を全部表示'),
    h('div',{class:'sec'},h('h2',null,'20語ずつ'),
      chunks.length?h('div',null,chunks):h('div',{class:'note'},'単語がありません'))));
}
function startWordCardRun(bookId,sourceWords,title,shuffled=false){
  if(!sourceWords.length){toast('単語がありません');return;}
  const words=sourceWords.slice();
  cardModeRun={bookId,sourceWords:words,words:shuffled?shuffle(words):words.slice(),title,index:0,shuffled};
  showWordCard();
}
function showWordCard(){
  if(!cardModeRun)return;
  setActiveTab('cards');
  const run=cardModeRun,word=run.words[run.index],options={...cardDisplayOptions,audio:true};
  const toggleShuffle=()=>{
    const current=run.words[run.index];
    run.shuffled=!run.shuffled;
    run.words=run.shuffled?shuffle(run.sourceWords):run.sourceWords.slice();
    run.index=Math.max(0,run.words.indexOf(current));
    showWordCard();
  };
  mount(h('div',{class:'screen'},
    h('div',{class:'top'},h('button',{class:'x','aria-label':'単語帳へ戻る',onclick:()=>showCardBook(run.bookId)},'‹'),
      h('div',{class:'ttl'},run.title),h('div',{class:'pos'},(run.index+1)+' / '+run.words.length)),
    cardOptionControls(showWordCard),wordCard(word,options),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',onclick:toggleShuffle},run.shuffled?'順番に戻す':'シャッフル'),
      h('button',{class:'btn sub',onclick:()=>showWordCardList(run.bookId,run.sourceWords,run.title)},'全部表示')),
    h('div',{class:'grow'}),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',disabled:run.index===0,onclick:()=>{run.index--;showWordCard();}},'‹ 前へ'),
      h('button',{class:'btn',disabled:run.index===run.words.length-1,onclick:()=>{run.index++;showWordCard();}},'次へ'))));
}
function showWordCardList(bookId,words,title){
  setActiveTab('cards');cardModeRun=null;
  const book=WORD_BOOKS.find(item=>item.id===bookId);
  if(!book){showCardBooks();return;}
  mount(h('div',{class:'screen'},topBack(title,()=>showCardBook(bookId)),
    h('div',{class:'meta'},words.length+'語'),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(bookId,words,title)},'順番にめくる'),
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(bookId,words,title,true)},'シャッフル')),
    cardOptionControls(()=>showWordCardList(bookId,words,title)),
    h('div',null,words.map(word=>wordCard(word,{...cardDisplayOptions,audio:true})))));
}
function showUnitStatus(){
  setActiveTab('study');
  if(session){
    TTS.stop();Time.setStep(null);
    const current=$('#app').firstElementChild;
    if(current&&current.dataset.sessionScreen==='true') session.pausedScreen=current;
    savePending();
  }
  const active=session||pendingSession,next=nextUnit();
  const books=WORD_BOOKS.map((book,index)=>{
    const units=WORD_UNITS.filter(unit=>unit.bookId===book.id);
    const learnedN=units.filter(unit=>unitProgress(unit).status==='learned').length;
    return h('details',{class:'unit-book',open:next?next.bookId===book.id:index===0},
      h('summary',null,book.title+'　'+learnedN+' / '+units.length+'ユニット学習済み'),
      h('div',{class:'unit-list'},units.map(unit=>{
        const progress=unitProgress(unit),isActive=active&&active.unitId===unit.id;
        const isPaused=!isActive&&pausedSessions.some(item=>item.unitId===unit.id);
        const status=isActive?(progress.status==='learned'?'再学習中':'学習中'):
          isPaused?(progress.status==='learned'?'再学習中断':'中断中'):
          progress.status==='learned'?'学習済み':progress.status==='partial'?'学習途中':'未学習';
        return h('button',{class:'unit-item unit-'+progress.status+(isActive?' active':'')+(isPaused?' paused':''),type:'button',
          'aria-label':unit.bookTitle+'、ユニット '+unit.number+'、'+status+'、'+progress.learned+' / '+progress.total+'語',
          onclick:()=>startUnit(unit)},
          h('b',null,unit.number),h('span',{class:'unit-status'},status),
          h('span',{class:'unit-count'},progress.learned+'/'+progress.total+'語'));
      })));
  });
  const actions=[];
  if(active) actions.push(h('button',{class:'btn',onclick:resumeStudy},'つづきから学習'));
  else if(pausedSessions.length) actions.push(h('button',{class:'btn',onclick:resumeStudy},'中断した学習をつづける'));
  else if(next) actions.push(h('button',{class:'btn',onclick:startNextUnit},'次のユニットを学習'));
  mount(h('div',{class:'screen','data-view':'study-list'},
    h('div',{class:'top'},h('button',{class:'x','aria-label':'もどる',onclick:showHome},'‹'),h('div',{class:'ttl'},'ユニットの学習状況')),
    h('div',{class:'hint'},'1ユニットは5語です。学習済みのユニットも何度でも学び直せます。'),
    actions,books,
    !next&&!active&&!pausedSessions.length?h('div',{class:'note'},'すべてのユニットを学習済みです。好きなユニットを選んで復習できます。'):null,
    h('div',{class:'grow'})));
}
function showHome(){
  setActiveTab('home');
  const today=ymd(),active=session||pendingSession||pausedSessions[pausedSessions.length-1],next=nextUnit(),st=streak(),d=new Date(),main=[];
  if(active){
    const unit=BYUNIT[active.unitId];
    main.push(h('div',{class:'card'},h('div',{class:'big'},'学習を中断しています'),
      unit?h('div',{class:'meta'},unit.bookTitle+' / ユニット '+unit.number):null,
      h('div',{class:'meta soft'},active.steps[active.currentStepIndex]?stepLabel(active.steps[active.currentStepIndex]):'学習をつづけられます')));
    main.push(h('button',{class:'btn',onclick:resumeStudy},'つづきから学習'));
  }else if(next){
    const progress=unitProgress(next);
    main.push(h('div',{class:'card'},
      h('div',{class:'lbl'},progress.status==='partial'?'学習途中のユニット':'次のユニット'),
      h('div',{class:'meta'},next.bookTitle+' / ユニット '+next.number),
      h('div',{class:'meta soft'},progress.learned+' / '+progress.total+'語 学習済み')));
    main.push(h('button',{class:'btn',onclick:startNextUnit},
      progress.status==='partial'?'学習途中のユニットをつづける':'次のユニットを学習'));
  }else{
    main.push(h('div',{class:'card'},h('div',{class:'big'},'全ユニット学習済み'),
      h('div',{class:'meta soft'},'好きなユニットを選んで何度でも復習できます。')));
  }
  main.push(h('button',{class:'btn sub',onclick:showUnitStatus},'ユニットを選んで学習'));
  const todayTestWords=newWordsForDate(today);
  if(todayTestWords.length&&!active)main.push(h('button',{class:'btn sub',onclick:()=>startDateTest(today,todayTestWords)},'今日の確認テスト'));
  mount(h('div',{class:'screen'},
    h('div',null,h('div',{class:'app-title'},h('span',{class:'mark'},'えいたん')),
      h('div',{class:'meta soft'},(d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+')'+(st>0?'　連続 '+st+'日':''))),
    main,h('div',{class:'grow'})));
}
function showHistory(){
  setActiveTab('history');
  const rows=S.sessions.slice().reverse().slice(0,60).map(s=>{
    const [y,m,dd]=s.date.split('-').map(Number),wd=WD[new Date(y,m-1,dd).getDay()];
    const t=s.finishedAt?new Date(s.finishedAt):null;
    const wordCount=s.mode==='repeat'?s.repeatWords.length:s.newN;
    return h('div',{class:'item'},
      h('b',null,m+'/'+dd+'('+wd+')'+(t?' '+pad(t.getHours())+':'+pad(t.getMinutes()):'')),
      h('small',null,(s.mode==='repeat'?'再学習':'新')+wordCount+'語'+(s.unitId&&BYUNIT[s.unitId]?' / '+BYUNIT[s.unitId].bookTitle+' '+BYUNIT[s.unitId].number+'ユニット':'')+
        (s.mode!=='repeat'&&s.repeatWords.length?' + 再学習'+s.repeatWords.length+'語':'')+
        (s.reviewN?' + 復習'+s.reviewN+'語':'')+' / '+fmtDurJp(s.totalMs)+
        (s.skippedRounds||s.skippedWords?' / スキップ 周'+s.skippedRounds+'・単語'+s.skippedWords+'語':'')+
        (s.total?' / '+(s.metricVersion>=1?'初回正答率':'正答率')+Math.round(s.correct/s.total*100)+'%':'')+
        (s.metricVersion>=1&&s.effortScore!==null?' / 取り組み度 '+s.effortScore+'/100':'')));
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
    record.newWords.forEach(word=>add(word,'new',record.date));
    record.repeatWords.forEach(word=>add(word,'repeat',record.date));
    record.reviewWords.forEach(word=>add(word,'review',record.date));
    if(!record.newWords.length&&record.mode!=='repeat'){
      for(const [word,state] of Object.entries(S.words)){
        if(state.learnedOn===record.date) add(word,'new',record.date);
      }
    }
  }
  const order=new Map(WORDS.map((item,index)=>[item.id,index]));
  return Array.from(entries.values()).sort((a,b)=>{
    if(range==='all'){
      const aDate=S.words[a.word]&&S.words[a.word].learnedOn||'',bDate=S.words[b.word]&&S.words[b.word].learnedOn||'';
      return bDate.localeCompare(aDate)||a.word.localeCompare(b.word,'en');
    }
    return order.get(a.word)-order.get(b.word);
  });
}
function showWordHistory(range='today'){
  setActiveTab('history');
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
    return h('div',{class:'item'},h('b',null,BYWORD[entry.word].word),h('small',null,BYWORD[entry.word].meaning),
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
let lightReview=null,activeDateTestExit=null,dateTestExitTarget=null;
function startLightReview(range,words){
  lightReview={range,cards:shuffle(words).map(word=>({word,revealed:false,rating:null})),index:0};
  showLightReviewCard();
}
function showLightReviewCard(){
  if(!lightReview)return;
  setActiveTab('history');
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
    card.revealed?h('div',{class:'card'},h('div',{class:'en'},h('span',{class:'mark'},d.word))):null,
    card.revealed?h('div',{class:'rate'},choices):h('button',{class:'btn',onclick:()=>{card.revealed=true;showLightReviewCard();}},'答えを見る'),
    h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
}
function showLightReviewResult(){
  if(!lightReview)return;
  setActiveTab('history');
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
  return WORDS.map(item=>item.id).filter(word=>words.has(word));
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
  setActiveTab('history');
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
    if(result==='abort'){
      const target=dateTestExitTarget;dateTestExitTarget=null;
      if(target) navigateTab(target);else showTestDates();
      return;
    }
    if(result==='correct') correct++;
  }
  showTestResult(date,words,correct,questions.length);
}
function dateTestCard(date,question,pos,total){
  setActiveTab('history');
  const d=BYWORD[question.word],enToJa=question.direction==='enToJa';
  return new Promise(resolve=>{
    let revealed=false,finished=false;
    const answer=h('div',{class:'card',style:'display:none'},h('div',{class:enToJa?'jp':'en'},enToJa?d.meaning:d.word));
    const marks=h('div',{class:'row2',style:'display:none'},
      h('button',{class:'btn good',onclick:()=>finish('correct')},'正解'),
      h('button',{class:'btn sub',onclick:()=>finish('incorrect')},'不正解'));
    const exit=()=>finish('abort');
    const finish=result=>{
      if(finished)return;
      finished=true;
      if(activeDateTestExit===exit) activeDateTestExit=null;
      resolve(result);
    };
    activeDateTestExit=exit;
    const reveal=h('button',{class:'btn',onclick:()=>{
      if(revealed)return;
      revealed=true;answer.style.display='';marks.style.display='';reveal.disabled=true;
    }},'答えを見る');
    mount(h('div',{class:'screen'},
      h('div',{class:'top'},
        h('button',{class:'x','aria-label':'テストを中止',onclick:()=>{
          if(confirm('確認テストを中止しますか?\nここまでの結果は表示されません。')) exit();
        }},'×'),
        h('div',{class:'ttl'},'確認テスト'),h('div',{class:'pos'},pos+' / '+total)),
      h('div',{class:'note'},studyDateLabel(date)+'　'+(enToJa?'英語 → 日本語':'日本語 → 英語')),
      h('div',{class:'card'},h('div',{class:enToJa?'en':'jp'},enToJa?d.word:d.meaning)),
      answer,h('div',{class:'hint'},'答えを言ってから表示し、正解かどうかを選んでね'),
      h('div',{class:'grow'}),reveal,marks));
  });
}
function showTestResult(date,words,correct,total){
  setActiveTab('history');
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
  setActiveTab('settings');
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
