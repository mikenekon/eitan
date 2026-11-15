'use strict';
//@file きろく・学習単語・軽い復習・日付テスト
function showHistory(){
  setActiveTab('history');
  const rows=S.sessions.slice().reverse().slice(0,60).map(s=>{
    const [y,m,dd]=s.date.split('-').map(Number),wd=WD[new Date(y,m-1,dd).getDay()];
    const t=s.finishedAt?new Date(s.finishedAt):null;
    const wordCount=s.mode==='repeat'?s.repeatWords.length:s.newN;
    const title=m+'/'+dd+'('+wd+')'+(t?' '+pad(t.getHours())+':'+pad(t.getMinutes()):'');
    return h('button',{class:'item history-record',type:'button','aria-label':title+'の学習記録の詳細を表示',
      onclick:()=>showDone(s,true)},
      h('b',null,title),
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
    rows.length?h('div',{class:'hint'},'記録を選ぶと、完了画面を再表示できます。'):null,
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
