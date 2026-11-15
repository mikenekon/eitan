'use strict';
//@file 単語カード(単語帳)画面
let cardModeRun=null;
const cardDisplayOptions={hideEnglish:false,hideJapanese:false,showExamples:true};
function audioButton(text,label,rate){
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('class','speaker-icon');
  icon.setAttribute('viewBox','0 0 24 24');
  icon.setAttribute('aria-hidden','true');
  icon.setAttribute('focusable','false');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zm-2.5-9v2.06a7 7 0 0 1 0 13.88V21a9 9 0 0 0 0-18z');
  icon.append(path);
  return h('button',{class:'audio-button','aria-label':label,title:label,onclick:()=>TTS.speak(text,rate)},
    icon);
}
function wordCard(word,options={}){
  const d=BYWORD[word];
  if(!d)return null;
  const content=[];
  if(!options.hideEnglish||options.audio)content.push(h('div',{class:'word-card-heading'},
    !options.hideEnglish?h('div',{class:'en'},d.word):null,
    options.audio?audioButton(d.word,'単語の発音を聞く'):null));
  if(!options.hideJapanese)content.push(h('div',{class:'jp'},d.meaning));
  if(options.showExamples!==false){
    for(let i=1;i<=2;i++){
      content.push(h('div',{class:'word-card-example'},
        !options.hideEnglish||options.audio?h('div',{class:'word-card-sentence'},
          !options.hideEnglish?h('div',{class:'sent'},hl(d['ex'+i],d.word)):null,
          options.audio?audioButton(d['ex'+i],'例文'+i+'の発音を聞く',0.8):null):null,
        !options.hideJapanese?h('div',{class:'tr'},d['tr'+i]):null));
    }
  }
  return h('div',{class:'card word-card'},content);
}
function cardOptionControls(onChange){
  const checkbox=(key,label)=>h('label',{class:'chk'},h('input',{type:'checkbox',checked:cardDisplayOptions[key],
    onchange:event=>{cardDisplayOptions[key]=event.target.checked;onChange();}}),label);
  return h('div',{class:'card-options'},
    checkbox('hideEnglish','英語を隠す'),checkbox('hideJapanese','日本語を隠す'),
    checkbox('showExamples','例文を表示'));
}
function showCardBooks(){
  setActiveTab('cards');cardModeRun=null;
  const rows=WORD_BOOKS.map(book=>h('div',{class:'item'},
    h('b',null,book.title),h('small',null,book.words.length+'語'),
    h('button',{class:'btn sub small',onclick:()=>showCardBook(book.id)},'この単語帳を選ぶ')));
  mount(h('div',{class:'screen'},topBack('単語カード',showHome),
    h('div',{class:'hint'},'単語帳を選んでカードをめくろう'),
    rows.length?h('div',null,rows):h('div',{class:'note'},'単語帳がありません')));
}
function showCardBook(bookId){
  setActiveTab('cards');
  const book=WORD_BOOKS.find(item=>item.id===bookId);
  if(!book){showCardBooks();return;}
  const ids=book.words.map(item=>item.id);
  const units=WORD_UNITS.filter(unit=>unit.bookId===book.id).map(unit=>{
    const progress=unitProgress(unit);
    const status=progress.status==='learned'?'学習済み':progress.status==='partial'?'学習途中':'未学習';
    const title=book.title+' / ユニット '+unit.number;
    return h('div',{class:'card-unit unit-'+progress.status},
      h('div',{class:'card-unit-head'},
        h('b',null,'ユニット '+unit.number),
        h('span',{class:'unit-status'},status+' '+progress.learned+'/'+progress.total+'語')),
      h('div',{class:'row2'},
        h('button',{class:'btn sub small',onclick:()=>startWordCardRun(book.id,unit.words,title)},'めくる'),
        h('button',{class:'btn sub small',onclick:()=>showWordCardList(book.id,unit.words,title)},'全部表示')));
  });
  mount(h('div',{class:'screen'},topBack(book.title,showCardBooks),
    h('div',{class:'meta'},ids.length+'語'),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(book.id,ids,book.title)},'通しでめくる'),
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(book.id,ids,book.title,true)},'シャッフル')),
    h('button',{class:'btn sub',onclick:()=>showWordCardList(book.id,ids,book.title)},'単語帳を全部表示'),
    h('div',{class:'sec'},h('h2',null,'学習ユニット'),
      units.length?h('div',{class:'card-unit-grid'},units):h('div',{class:'note'},'ユニットがありません'))));
}
function startWordCardRun(bookId,sourceWords,title,shuffled=false){
  if(!sourceWords.length){toast('単語がありません');return;}
  const words=sourceWords.slice();
  cardModeRun={bookId,sourceWords:words,words:shuffled?shuffle(words):words.slice(),title,index:0,shuffled};
  showWordCard();
}
function showWordCard(){
  if(!cardModeRun)return;
  setActiveTab('cards');
  const run=cardModeRun,word=run.words[run.index],options={...cardDisplayOptions,audio:true};
  const toggleShuffle=()=>{
    const current=run.words[run.index];
    run.shuffled=!run.shuffled;
    run.words=run.shuffled?shuffle(run.sourceWords):run.sourceWords.slice();
    run.index=Math.max(0,run.words.indexOf(current));
    showWordCard();
  };
  mount(h('div',{class:'screen'},
    h('div',{class:'top'},h('button',{class:'x','aria-label':'単語帳へ戻る',onclick:()=>showCardBook(run.bookId)},'‹'),
      h('div',{class:'ttl'},run.title),h('div',{class:'pos'},(run.index+1)+' / '+run.words.length)),
    cardOptionControls(showWordCard),wordCard(word,options),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',onclick:toggleShuffle},run.shuffled?'順番に戻す':'シャッフル'),
      h('button',{class:'btn sub',onclick:()=>showWordCardList(run.bookId,run.sourceWords,run.title)},'全部表示')),
    h('div',{class:'grow'}),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',disabled:run.index===0,onclick:()=>{run.index--;showWordCard();}},'‹ 前へ'),
      h('button',{class:'btn',disabled:run.index===run.words.length-1,onclick:()=>{run.index++;showWordCard();}},'次へ'))));
}
function showWordCardList(bookId,words,title){
  setActiveTab('cards');cardModeRun=null;
  const book=WORD_BOOKS.find(item=>item.id===bookId);
  if(!book){showCardBooks();return;}
  mount(h('div',{class:'screen'},topBack(title,()=>showCardBook(bookId)),
    h('div',{class:'meta'},words.length+'語'),
    h('div',{class:'row2'},
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(bookId,words,title)},'順番にめくる'),
      h('button',{class:'btn sub',onclick:()=>startWordCardRun(bookId,words,title,true)},'シャッフル')),
    cardOptionControls(()=>showWordCardList(bookId,words,title)),
    h('div',null,words.map(word=>wordCard(word,{...cardDisplayOptions,audio:true})))));
}
