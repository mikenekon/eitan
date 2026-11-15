'use strict';
//@file きろく(カレンダー)・軽い復習・日付テスト
/* きろく画面: 月カレンダーで日を選ぶと、その日のログ・単語・軽い復習が下に出る */
const historyView={date:null,month:null};
function historyStudyDates(){
  const dates=new Set(S.sessions.map(record=>record.date));
  for(const state of Object.values(S.words)) if(DATE_RE.test(String(state.learnedOn||''))) dates.add(state.learnedOn);
  return dates;
}
function shiftMonth(month,delta){
  const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+delta,1);
  return d.getFullYear()+'-'+pad(d.getMonth()+1);
}
function monthLabel(month){const [y,m]=month.split('-');return y+'年'+Number(m)+'月';}
function wordEntriesForDate(date){
  const entries=new Map();
  function add(word,type){
    if(!BYWORD[word]) return;
    if(!entries.has(word)) entries.set(word,{word,types:new Set()});
    entries.get(word).types.add(type);
  }
  for(const [word,state] of Object.entries(S.words)) if(state.learnedOn===date) add(word,'known');
  for(const record of S.sessions){
    if(record.date!==date) continue;
    record.newWords.forEach(word=>add(word,'new'));
    record.repeatWords.forEach(word=>add(word,'repeat'));
    record.reviewWords.forEach(word=>add(word,'review'));
    if(!record.newWords.length&&record.mode!=='repeat'){
      for(const [word,state] of Object.entries(S.words)) if(state.learnedOn===date) add(word,'new');
    }
  }
  const order=new Map(WORDS.map((item,index)=>[item.id,index]));
  return Array.from(entries.values()).sort((a,b)=>order.get(a.word)-order.get(b.word));
}
function historyRecordCard(s){
  const [,m,dd]=s.date.split('-').map(Number),t=s.finishedAt?new Date(s.finishedAt):null;
  const wordCount=s.mode==='repeat'?s.repeatWords.length:s.newN;
  const title=m+'/'+dd+(t?' '+pad(t.getHours())+':'+pad(t.getMinutes()):'');
  return h('button',{class:'item history-record',type:'button','aria-label':title+'の学習記録の詳細を表示',
    onclick:()=>showDone(s,true)},
    h('b',null,title),
    h('small',null,(s.mode==='repeat'?'再学習':'新')+wordCount+'語'+(s.unitId&&BYUNIT[s.unitId]?' / '+BYUNIT[s.unitId].bookTitle+' '+BYUNIT[s.unitId].number+'ユニット':'')+
      (s.mode!=='repeat'&&s.repeatWords.length?' + 再学習'+s.repeatWords.length+'語':'')+
      (s.reviewN?' + 復習'+s.reviewN+'語':'')+' / '+fmtDurJp(s.totalMs)+
      (s.skippedRounds||s.skippedWords?' / スキップ 周'+s.skippedRounds+'・単語'+s.skippedWords+'語':'')+
      (s.total?' / '+(s.metricVersion>=1?'初回正答率':'正答率')+Math.round(s.correct/s.total*100)+'%':'')+
      (s.metricVersion>=1&&s.effortScore!==null?' / 取り組み度 '+s.effortScore+'/100':'')));
}
function historyCalendar(studied,today){
  const month=historyView.month,[y,m]=month.split('-').map(Number);
  const lead=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate(),cells=[];
  for(let i=0;i<lead;i++) cells.push(h('div',{class:'cal-blank','aria-hidden':'true'}));
  for(let day=1;day<=days;day++){
    const date=y+'-'+pad(m)+'-'+pad(day),isStudied=studied.has(date),selected=historyView.date===date;
    cells.push(h('button',{type:'button',
      class:'cal-day'+(isStudied?' studied':'')+(selected?' selected':'')+(date===today?' today':''),
      'aria-label':studyDateLabel(date)+(isStudied?' 学習あり':' 学習なし'),'aria-pressed':String(selected),
      onclick:()=>{historyView.date=date;showHistory();}},
      h('span',{class:'cal-num'},day),h('span',{class:'cal-mark','aria-hidden':'true'},isStudied?'●':'')));
  }
  return h('div',{class:'calendar'},
    h('div',{class:'cal-head'},
      h('button',{class:'btn sub small','aria-label':'前の月',onclick:()=>{historyView.month=shiftMonth(month,-1);showHistory();}},'‹'),
      h('b',{class:'cal-title'},monthLabel(month)),
      h('button',{class:'btn sub small','aria-label':'次の月',onclick:()=>{historyView.month=shiftMonth(month,1);showHistory();}},'›')),
    h('div',{class:'cal-grid'},WD.map((label,i)=>h('div',{class:'cal-wd'+(i===0?' sun':i===6?' sat':'')},label)),cells));
}
function showHistory(date){
  setActiveTab('history');
  const today=ymd();
  if(typeof date==='string'&&DATE_RE.test(date)){historyView.date=date;historyView.month=date.slice(0,7);}
  if(!historyView.date){historyView.date=today;historyView.month=today.slice(0,7);}
  const selected=historyView.date,studied=historyStudyDates();
  const records=S.sessions.filter(record=>record.date===selected).sort((a,b)=>b.finishedAt-a.finishedAt);
  const words=wordEntriesForDate(selected);
  const wordRows=words.map(entry=>{
    const labels=[];
    if(entry.types.has('new')) labels.push('新出');
    if(entry.types.has('review')) labels.push('復習');
    if(entry.types.has('repeat')) labels.push('再学習');
    if(!labels.length) labels.push('学習済み');
    return h('div',{class:'item'},h('b',null,BYWORD[entry.word].word),h('small',null,BYWORD[entry.word].meaning),
      h('small',null,labels.join('・')));
  });
  const reviewLabel=selected===today?'今日の軽い復習':studyDateLabel(selected)+'の軽い復習';
  mount(h('div',{class:'screen','data-view':'history'},topBack('きろく'),h('div',{class:'meta'},'連続 '+streak()+'日'),
    historyCalendar(studied,today),
    h('div',{class:'sec'},h('h2',null,studyDateLabel(selected)+'の学習'),
      records.length?h('div',{class:'hint'},'記録を選ぶと、完了画面を再表示できます。'):null,
      records.length?h('div',null,records.map(historyRecordCard)):h('div',{class:'note'},'この日の学習記録はありません')),
    words.length?h('div',{class:'sec'},h('h2',null,'学習した単語 '+words.length+'語'),
      h('div',null,wordRows),
      h('button',{class:'btn sub',onclick:()=>startLightReview(selected,words.map(entry=>entry.word)),'aria-label':reviewLabel},reviewLabel)):null,
    h('button',{class:'btn sub',onclick:showTestDates},'日付を選んで確認テスト')));
}
let lightReview=null,activeDateTestExit=null,dateTestExitTarget=null;
function startLightReview(date,words){
  lightReview={date,cards:shuffle(words).map(word=>({word,revealed:false,rating:null})),index:0};
  showLightReviewCard();
}
function showLightReviewCard(){
  if(!lightReview)return;
  setActiveTab('history');
  const run=lightReview,card=run.cards[run.index],word=card.word,d=BYWORD[word],total=run.cards.length;
  const title=run.date===ymd()?'今日の復習':studyDateLabel(run.date)+'の復習';
  const choices=['ok','maybe','ng'].map((value,index)=>{
    const labels=['◯ 言えた','△ あやしい','× わからない'];
    return h('button',{class:'btn '+(value==='ok'?'good':'sub'),'aria-pressed':String(card.rating===value),onclick:()=>{
      card.rating=value;card.revealed=true;showLightReviewCard();
    }},labels[index]);
  });
  const quit=h('button',{class:'x','aria-label':'復習を終了',onclick:()=>{
    if(confirm('復習を終了しますか?\n回答は保存されません。')){lightReview=null;showHistory(run.date);}
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
    h('button',{class:'btn',onclick:()=>startLightReview(run.date,run.cards.map(card=>card.word))},'もう一度復習'),
    h('button',{class:'btn sub',onclick:()=>{lightReview=null;showHistory(run.date);}},'きろくへ戻る')));
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
