'use strict';
//@file 保存データ(状態・バックアップ検証・読込/保存・連続日数)
/* ================= 保存データ ================= */
function defaultState(){return {app:'eitan',v:APP_V,settings:{practiceWaitSec:1.5},words:{},sessions:[]};}
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
  st.settings.practiceWaitSec=[0,1,1.5,2].includes(Number(se.practiceWaitSec))?Number(se.practiceWaitSec):1.5;
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
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){toast('保存できませんでした');}}

function streak(){
  const days=new Set(S.sessions.map(s=>s.date)); let d=ymd(); if(!days.has(d)) d=addDays(d,-1);
  let n=0; while(days.has(d)){n++; d=addDays(d,-1);} return n;
}
