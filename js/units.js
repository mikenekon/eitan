'use strict';
//@file ユニット進捗・開始・一覧画面
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
  if(unitProgress(unit).status==='learned'){
    showUnitPreview(unit);
    return;
  }
  start(unit.words,[],unit.words.every(word=>!!S.words[word]),null,unit.id);
}
function showUnitPreview(unit){
  setActiveTab('study');
  mount(h('div',{class:'screen','data-view':'unit-preview'},
    topBack(unit.bookTitle+' / ユニット '+unit.number,showUnitStatus),
    h('div',{class:'big'},'単語一覧'),
    h('div',{class:'hint'},'このユニットで学習する単語です。学習を始める前に確認できます。'),
    h('div',null,unit.words.map(word=>{
      const item=BYWORD[word];
      return h('div',{class:'item'},h('b',null,item.word),h('small',null,item.meaning));
    })),
    h('div',{class:'grow'}),
    h('button',{class:'btn',onclick:()=>start(unit.words,[],true,null,unit.id,true)},'覚えるへ進む')));
}
function startNextUnit(){
  const unit=nextUnit();
  if(unit)startUnit(unit);
  else showUnitStatus();
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
