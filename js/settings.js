'use strict';
//@file 設定・バックアップの書き出し/読み込み
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
