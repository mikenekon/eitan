'use strict';
//@file ホーム画面と起動処理
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
showHome();
if(LOAD_WARN) toast('きろくを読み込めませんでした。設定のバックアップから戻せます');
