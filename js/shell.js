'use strict';
//@file 画面マウント・下部ナビ・トースト・待機表示・戻るバー
let activeTab='home';
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
function topBack(title,onBack=showHome){return h('div',{class:'top'},h('button',{class:'x','aria-label':'もどる',onclick:onBack},'‹'),h('div',{class:'ttl'},title));}
