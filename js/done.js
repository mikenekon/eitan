'use strict';
//@file 完了画面・メッセージ送信・共有
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
  const groups=completionWordGroups(rec);
  if(groups.length){
    L.push('学習した単語');
    for(const group of groups){
      L.push('【'+group.label+'】');
      L.push(group.words.map(word=>BYWORD[word].word+'（'+BYWORD[word].meaning+'）').join('、'));
    }
  }
  return L.join('\n');
}
function openSms(text){
  const ios=isIOS(),recipients=[S.settings.parentPhone,S.settings.parentPhone2].filter(Boolean);
  if(ios&&recipients.length>1){
    const addresses=recipients.map(encodeURIComponent).join(',');
    location.href='sms://open?addresses='+addresses+'&body='+encodeURIComponent(text);
    return;
  }
  const addresses=recipients.join(ios?',':';');
  location.href='sms:'+addresses+(ios?'&':'?')+'body='+encodeURIComponent(text);
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
function completionWordGroups(rec){
  const seen=new Set(),groups=[];
  for(const [label,words] of [
    ['新しく学習した単語',rec.newWords],
    ['再学習した単語',rec.repeatWords],
    ['復習した単語',rec.reviewWords]
  ]){
    const unique=(words||[]).filter(word=>{
      if(!BYWORD[word]||seen.has(word))return false;
      seen.add(word);return true;
    });
    if(unique.length)groups.push({label,words:unique});
  }
  if(!groups.length&&BYUNIT[rec.unitId])groups.push({label:'学習した単語',words:BYUNIT[rec.unitId].words});
  return groups;
}
function showDone(rec,fromHistory=false){
  setActiveTab(fromHistory?'history':'home');
  const clock=h('div',{class:'clock'});
  const completedAt=rec.finishedAt?new Date(rec.finishedAt):DATE_RE.test(String(rec.date||''))?
    new Date(rec.date+'T00:00:00'):null;
  const upd=()=>{
    const d=fromHistory&&completedAt?completedAt:new Date();
    clock.textContent=(d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes())+
      (fromHistory?'':':'+pad(d.getSeconds()));
  };
  upd();
  if(!fromHistory){
    const iv=setInterval(()=>{if(!clock.isConnected){clearInterval(iv);return;}upd();},1000);
  }
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
  const wordGroups=completionWordGroups(rec);
  mount(h('div',{class:'screen'},
    fromHistory?topBack('学習記録の詳細',showHistory):null,
    h('div',null,h('div',{class:'big'},h('span',{class:'mark'},'ユニット学習 完了!')),clock,
      h('div',{class:'hint'},fromHistory?'学習した単語と結果を確認できます。':'この画面をおうちの人に見せよう')),
    h('div',{class:'card'},rows.map(([a,b])=>h('div',{class:'srow'},h('span',null,a),h('b',null,b)))),
    wordGroups.length?h('div',{class:'card completion-words'},
      h('div',{class:'lbl'},'今回学習した単語'),
      wordGroups.map(group=>h('div',{class:'record-word-group'},
        h('div',{class:'record-word-kind'},group.label),
        group.words.map(word=>{
          const item=BYWORD[word];
          return h('div',{class:'record-word-row'},h('b',{class:'record-word-en'},item.word),
            h('span',{class:'record-word-meaning'},item.meaning));
        })))):
      h('div',{class:'card completion-words'},h('div',{class:'lbl'},'この記録に単語データがありません')),
    rec.metricVersion>=1&&rec.responseTimeScore!==null?h('div',{class:'hint'},rec.metricVersion>=2?
      '取り組み度は初回正答率と回答時間から算出し、スキップした学習分を反映した目安です。時間スコアは平均2秒以下で0点、5秒以上で100点（間は比例）ですが、真剣さを断定するものではありません。':
      '取り組み度は初回正答率と回答時間から算出した目安です。時間スコアは平均2秒以下で0点、5秒以上で100点（間は比例）ですが、真剣さを断定するものではありません。'):null,
    h('div',{class:'card slim'},h('div',{class:'lbl'},'ステップごとの時間'),h('div',{class:'steps'},steps)),
    h('div',{class:'grow'}),
    h('button',{class:'btn',onclick:()=>openSms(msg)},'メッセージで送る'),
    S.settings.parentPhone||S.settings.parentPhone2?null:h('div',{class:'hint'},'送り先は「設定」で登録できます'),
    h('div',{class:'row2'},h('button',{class:'btn sub',onclick:()=>share(msg)},'共有'),h('button',{class:'btn sub',onclick:()=>copy(msg)},'コピー')),
    fromHistory?h('button',{class:'btn sub',onclick:showHistory},'きろくへもどる'):null,
    !fromHistory&&upcoming?h('button',{class:'btn',onclick:()=>startUnit(upcoming)},'次のユニットを学習'):null,
    !fromHistory?h('button',{class:'btn sub',onclick:showUnitStatus},'ユニットの学習状況を見る'):null,
    !fromHistory?h('button',{class:'link',onclick:showHome},'ホームへもどる'):null));
}
