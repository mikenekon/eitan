'use strict';
//@file 中断した学習(pending)の保存・復元・切り替え
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
function isUnstartedRepeatPreview(pending){
  return pending.repeat&&pending.unitId&&pending.currentStepIndex===0&&pending.steps[0]==='todayWords'&&
    Object.keys(pending.stageResults).length===0;
}
function pendingIdentity(item){return item.unitId||'legacy';}
function loadPending(){
  try{
    const raw=localStorage.getItem(PENDING_KEY);
    if(!raw)return {active:null,paused:[],removedRepeatPreview:false};
    const parsed=JSON.parse(raw),records=Array.isArray(parsed&&parsed.sessions)?parsed.sessions:[parsed],unique=new Map();
    let removedRepeatPreview=false;
    for(const record of records){
      const pending=cleanPending(record);
      if(!pending){LOAD_WARN=true;continue;}
      if(isUnstartedRepeatPreview(pending)){removedRepeatPreview=true;continue;}
      const key=pendingIdentity(pending);
      unique.delete(key);unique.set(key,pending);
    }
    const sessions=Array.from(unique.values());
    return {active:sessions.pop()||null,paused:sessions,removedRepeatPreview};
  }catch(e){LOAD_WARN=true;return {active:null,paused:[],removedRepeatPreview:false};}
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
if(loadedPending.removedRepeatPreview){
  try{persistPendingSessions();}catch(e){toast('中断した学習を整理できませんでした');}
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
