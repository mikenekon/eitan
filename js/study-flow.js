'use strict';
//@file 学習セッションの骨組み(待機UI・ゲート・ステージ要約・開始/終了)
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
async function start(newW,due,repeat=false,restored=null,unitId=null,previewComplete=false){
  const generation=++sessionGeneration;
  TTS.unlock();
  const steps=[...(due.length?['review']:[]),...(newW.length?['todayWords','learn','check1','useRead','useCloze','useOrder','check2','spell']:[])];
  session={newWords:newW,reviewWords:due,steps,correct:num(restored&&restored.correct),
    total:num(restored&&restored.total),reject:null,quit:false,
    repeat:restored?restored.repeat:repeat,unitId:restored?restored.unitId:unitId,
    learnCards:restored&&restored.learnCards,learnIndex:restored?restored.learnIndex:0,
    cardRun:restored&&restored.cardRun,useTasks:restored&&restored.useTasks,useIndex:restored?restored.useIndex:{},
    stageResults:restored?restored.stageResults:{},stageResponseMs:restored?restored.stageResponseMs:{},
    reviewFirst:restored&&restored.stageResults.review||{},currentStepIndex:restored?restored.currentStepIndex:previewComplete?1:0,
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
