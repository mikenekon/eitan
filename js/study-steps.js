'use strict';
//@file 各学習ステップ(覚える/確認/例文/穴埋め/並べ替え/スペル)
function stepTodayWords(){
  Time.setStep('todayWords');
  return waitUI(resolve=>{
    const unit=BYUNIT[session.unitId];
    const list=session.newWords.map(word=>{
      const d=BYWORD[word];
      return h('div',{class:'item'},h('b',null,d.word),h('small',null,d.meaning));
    });
    mount(chrome('todayWords','', '',
      h('div',{class:'hint'},unit?unit.bookTitle+' / ユニット '+unit.number+' で学習する単語です。知っている単語は周の区切りでスキップできます。':
        '今回学習する単語です。知っている単語は周の区切りでスキップできます。'),
      h('div',null,list),h('div',{class:'grow'}),
      h('button',{class:'btn',onclick:()=>resolve('next')},'覚えるへ進む')));
  });
}

/* ② 覚える:単語+意味を、音を聞いて声に出す ×3周 */
async function stepLearn(){
  Time.setStep('learn');
  const rounds=LEARN_ROUNDS;
  if(!Array.isArray(session.learnCards)||session.learnCards.length!==session.newWords.length*rounds||
    session.learnCards.some(card=>!session.newWords.includes(card.word))){
    session.learnCards=[];
    for(let r=1;r<=rounds;r++){
      const order=r===1?session.newWords.slice():shuffle(session.newWords);
      order.forEach((word,index)=>session.learnCards.push({word,round:r,position:index+1,roundTotal:order.length}));
    }
  }
  const cards=session.learnCards,total=cards.length;
  let index=Math.min(session.learnIndex||0,total);
  while(index<total){
    session.learnIndex=index;
    savePending();
    const card=cards[index];
    const action=await learnCard(card.word,card.position,card.roundTotal,card.round,rounds,index>0);
    if(action==='prev'){index=Math.max(0,index-1);session.learnIndex=index;savePending();continue;}
    index++;
    session.learnIndex=index;
    savePending();
    if(card.round<rounds&&(!cards[index]||cards[index].round!==card.round)){
      if(await learnRoundEnd(card.round,rounds)){
        const skippedRound=card.round+1;
        while(index<total&&cards[index].round===skippedRound) index++;
        session.learnIndex=index;
        session.skippedRounds++;
        savePending();
      }
    }
  }
  session.learnIndex=total;savePending();
}
function learnRoundEnd(round,rounds){
  return waitUI(resolve=>{
    const next=h('button',{class:'btn',onclick:()=>resolve(false)},'次の周へ進む');
    const skip=h('button',{class:'btn sub',onclick:()=>resolve(true)},'次の周をスキップする');
    mount(chrome('learn','', '',
      h('div',{class:'card'},
        h('div',{class:'big'},round+'周目完了!'),
        h('div',{class:'meta'},'次は'+(round+1)+'周目です')),
      h('div',{class:'grow'}),h('div',{class:'row2'},skip,next)));
  });
}
function learnCard(word,n,total,r,rounds,canGoBack){
  const d=BYWORD[word];
  return waitUI((resolve,onCancel)=>{
    let playId=0,finished=false;
    const finish=action=>{if(finished)return;finished=true;TTS.stop();resolve(action);};
    onCancel(()=>{playId++;TTS.stop();});
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',onclick:()=>finish('next')},'つぎへ');
    const play=async()=>{
      const id=++playId;TTS.stop();
      await TTS.speak(d.word);
      if(id!==playId||finished)return;
    };
    mount(chrome('learn',n,total,
      h('div',{class:'note'},r+'周目 / '+rounds+'周　今日の単語 '+n+'/'+total),
      h('div',{class:'card'},h('div',{class:'en'},h('span',{class:'mark'},d.word)),h('div',{class:'jp'},d.meaning)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:play},'🔊 もういちど聞く')),
      h('div',{class:'hint'},'音を聞いて、英語と日本語の意味を声に出して言おう'),
      h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
    play();
  });
}

/* フラッシュカード(赤シート):日本語を見て英語を思い出す → 赤シートをタップして答え合わせ → ◯△× */
function flashCard(stepKey,word,pos,total,mode,state,canGoBack){
  const d=BYWORD[word];
  const isCheck2=stepKey==='check2';
  const responseStart=activeStepTime(stepKey);
  return waitUI((resolve,onCancel)=>{
    let finished=false;
    const fin=r=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(r);};
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>fin('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',style:'display:none',onclick:()=>fin(state.result||'next')},'つぎへ');
    const choose=r=>{if(isCheck2&&!state.gateDone)return;state.result=r;fin(r);};
    const rate=h('div',{class:'rate',style:isCheck2?'':'visibility:hidden'},
      h('button',{class:'btn good',disabled:isCheck2&&!state.gateDone,'aria-pressed':'false',onclick:()=>choose('ok')},'◯ 言えた'),
      h('button',{class:'btn sub',disabled:isCheck2&&!state.gateDone,'aria-pressed':'false',onclick:()=>choose('maybe')},'△ あやしい'),
      h('button',{class:'btn sub',disabled:isCheck2&&!state.gateDone,'aria-pressed':'false',onclick:()=>choose('ng')},'× わからない'));
    const sheet=isCheck2?h('div',{class:'sheet blank','aria-hidden':'true'}):
      h('button',{class:'sheet'},'タップして答えを見る');
    const skipGate=stepKey==='check1' || stepKey==='check2';
    const gate=makeGate(()=>{
      state.gateDone=true;rate.style.visibility='visible';previous.disabled=!canGoBack;
      if(isCheck2) [...rate.children].forEach(button=>button.disabled=false);
      savePending();
    },skipGate);
    onCancel(()=>{playId++;gate.destroy();TTS.stop();});
    gate.el.style.display='none';
    let playId=0;
    const play=async()=>{
      const id=++playId;gate.reset();gate.el.style.display=skipGate?'none':'';
      if(!isCheck2)rate.style.visibility='hidden';
      TTS.stop();
      await TTS.speak(d.word);
      let duration=practiceDuration(d.word);
      if(mode==='sentence'){
        await TTS.speak(d.ex1,0.8);duration+=practiceDuration(d.ex1,0.8);
      }
      if(id===playId&&!finished) gate.wait(duration);
    };
    function revealAnswer(){
      if(state.revealed) return;
      if(state.responseMs===undefined) state.responseMs=elapsedStepTime(stepKey,responseStart);
      state.revealed=true;previous.disabled=true;sheet.classList.add('off');
      if(revealButton)revealButton.style.display='none';
      savePending();play();
    }
    if(!isCheck2)sheet.addEventListener('click',revealAnswer);
    const revealButton=isCheck2?h('button',{class:'btn sub small',onclick:revealAnswer},'タップして答えを見る'):null;
    const front=mode==='sentence'?[h('div',{class:'jp'},d.meaning),h('div',{class:'jp2'},d.tr1)]:[h('div',{class:'jp'},d.meaning)];
    const back=mode==='sentence'?[h('div',{class:'en'},h('span',{class:'mark'},d.word)),h('div',{class:'sent'},hl(d.ex1,d.word))]
                                :[h('div',{class:'en'},h('span',{class:'mark'},d.word))];
    mount(chrome(stepKey,pos,total,
      h('div',{class:'note'},mode==='sentence'?'英語の単語と例文を声に出して思い出そう':'英語を声に出して思い出そう'),
      h('div',{class:'card'},front),
      h('div',{class:'sheet-wrap'},h('div',{class:'back'},back),sheet),
      gate.el,isCheck2?h('div',{class:'row'},revealButton):h('div',{class:'grow'}),
      rate,h('div',{class:'row2'},previous,next)));
    if(state.revealed){
      sheet.classList.add('off');gate.el.style.display=skipGate?'none':'';
      if(revealButton)revealButton.style.display='none';
      if(state.gateDone) gate.complete(); else play();
    }
    if(state.result){
      [...rate.children].forEach((button,i)=>{
        const selected=['ok','maybe','ng'][i]===state.result;
        button.disabled=true;button.setAttribute('aria-pressed',String(selected));
      });
      rate.style.visibility='visible';next.style.display='';
      previous.disabled=!canGoBack;
    }
  });
}
async function runCards(stepKey,words,mode){
  const saved=session.cardRun;
  const canResume=saved&&saved.stepKey===stepKey&&saved.words.length===words.length&&saved.words.every((word,index)=>word===words[index]);
  const run=canResume?saved:{
    stepKey,words:words.slice(),queue:shuffle(words).map(word=>({word,attempt:1,processed:false,result:null,revealed:false,gateDone:false,position:0})),
    first:{},total:words.length,done:0,index:0
  };
  session.cardRun=run;
  const {queue,first,total}=run,indexStart=run.index;
  const responseTimes=session.stageResponseMs[stepKey]||(session.stageResponseMs[stepKey]={});
  for(let index=indexStart;index<queue.length;){
    run.index=index;
    const item=queue[index];
    if(!item.position) item.position=Math.min(run.done+1,total);
    savePending();
    const r=await flashCard(stepKey,item.word,item.position,total,mode,item,index>0);
    if(r==='prev'){index=Math.max(0,index-1);savePending();continue;}
    if(r==='next'){index++;savePending();continue;}
    if(item.processed){index++;savePending();continue;}
    item.processed=true;
    if(first[item.word]===undefined){
      first[item.word]=r;
      if(!Object.prototype.hasOwnProperty.call(responseTimes,item.word)){
        responseTimes[item.word]=item.responseMs||0;
        addAcc(r==='ok');
      }
    }
    if(r==='ok'||item.attempt>=3) run.done++;
    else queue.splice(Math.min(queue.length,index+4),0,{word:item.word,attempt:item.attempt+1,processed:false,result:null,revealed:false,gateDone:false,position:item.position});
    index++;
    run.index=index;savePending();
  }
  session.cardRun=null;savePending();
  return first;
}
async function stepReview(){Time.setStep('review');return runCards('review',session.reviewWords,'meaning');}
async function stepCheck1(){Time.setStep('check1');return runCards('check1',session.newWords,'meaning');}
async function stepCheck2(){Time.setStep('check2');return runCards('check2',session.newWords,'sentence');}

/* ④ 使ってみよう:例文を読む → 穴埋め → 並べ替え */
function ensureUseTasks(){
  const words=session.newWords;
  if(!session.useTasks) session.useTasks={useRead:[],useCloze:[],useOrder:[]};
  let changed=false;
  if(!Array.isArray(session.useTasks.useRead)||session.useTasks.useRead.length!==words.length*2){
    session.useTasks.useRead=[];
    for(let k=1;k<=2;k++) for(const word of shuffle(words)) session.useTasks.useRead.push({word,round:k,state:{done:false}});
    changed=true;
  }
  if(!Array.isArray(session.useTasks.useCloze)||session.useTasks.useCloze.length!==words.length){
    session.useTasks.useCloze=shuffle(words).map(word=>({word,state:{attempted:false,solved:false,wrong:[]}}));
    changed=true;
  }
  if(!Array.isArray(session.useTasks.useOrder)||session.useTasks.useOrder.length!==words.length){
    session.useTasks.useOrder=shuffle(words).map(word=>({word,state:{attempted:false,solved:false,picked:[],revealedCount:0}}));
    changed=true;
  }
  if(changed) savePending();
}
async function runUseTasks(stepKey,tasks){
  const total=tasks.length;
  let index=Math.min(session.useIndex[stepKey]||0,total);
  while(index<total){
    session.useIndex[stepKey]=index;savePending();
    const task=tasks[index];
    let action;
    if(stepKey==='useRead') action=await readCard(task.word,task.round,index+1,total,task.state,index>0);
    else if(stepKey==='useCloze') action=await clozeCard(task.word,session.newWords,index+1,total,task.state,index>0);
    else action=await orderCard(task.word,index+1,total,task.state,index>0);
    if(action==='prev'){index=Math.max(0,index-1);session.useIndex[stepKey]=index;savePending();continue;}
    index++;
    session.useIndex[stepKey]=index;savePending();
  }
  session.useIndex[stepKey]=total;savePending();
}
async function stepUseRead(){
  Time.setStep('useRead');ensureUseTasks();await runUseTasks('useRead',session.useTasks.useRead);
}
async function stepUseCloze(){
  Time.setStep('useCloze');ensureUseTasks();await runUseTasks('useCloze',session.useTasks.useCloze);
  if(!session.stageResponseMs.useCloze){
    session.stageResponseMs.useCloze=Object.fromEntries(session.useTasks.useCloze.map(task=>[task.word,task.state.firstResponseMs||0]));
  }
  return Object.fromEntries(session.useTasks.useCloze.map(task=>[task.word,!!task.state.firstCorrect]));
}
async function stepUseOrder(){
  Time.setStep('useOrder');ensureUseTasks();await runUseTasks('useOrder',session.useTasks.useOrder);
  if(!session.stageResponseMs.useOrder){
    session.stageResponseMs.useOrder=Object.fromEntries(session.useTasks.useOrder.map(task=>[task.word,task.state.firstResponseMs||0]));
  }
  return Object.fromEntries(session.useTasks.useOrder.map(task=>[task.word,!!task.state.firstCorrect]));
}
function readCard(word,k,n,total,state,canGoBack){
  const d=BYWORD[word];
  return waitUI((resolve,onCancel)=>{
    let playId=0,finished=false;
    const finish=action=>{if(finished)return;finished=true;gate.destroy();TTS.stop();resolve(action);};
    const wasDone=state.done;
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!wasDone,onclick:()=>finish(wasDone?'next':'done')},'つぎへ');
    const gate=makeGate(()=>{state.done=true;next.disabled=false;savePending();});
    onCancel(()=>{playId++;gate.destroy();TTS.stop();});
    const play=async()=>{
      const id=++playId;state.done=false;next.disabled=true;gate.reset();savePending();TTS.stop();
      await TTS.speak(d.ex1,0.8);
      if(id===playId&&!finished) gate.wait(practiceDuration(d.ex1,0.8));
    };
    mount(chrome('useRead',n,total,
      h('div',{class:'note'},'例文を読もう('+k+'回目 / 2回)'),
      h('div',{class:'card'},h('div',{class:'sent'},hl(d.ex1,d.word)),h('div',{class:'tr'},d.tr1)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:play},'🔊 聞く')),
      h('div',{class:'hint'},'音を聞いて、まねして声に出して読もう'),
      gate.el,h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
    if(wasDone) gate.complete(); else play();
  });
}
function distractors(word,pool){
  const target=BYWORD[word].word.trim().toLowerCase(),seen=new Set([target]),result=[];
  const others=shuffle(pool.filter(id=>id!==word));
  const extra=shuffle(WORDS.map(item=>item.id).filter(id=>id!==word&&!others.includes(id)));
  for(const id of others.concat(extra)){
    const text=BYWORD[id].word.trim().toLowerCase();
    if(seen.has(text))continue;
    seen.add(text);result.push(id);
    if(result.length===3)break;
  }
  return result;
}
function clozeCard(word,pool,n,total,state,canGoBack){
  const d=BYWORD[word];
  const optionsValid=Array.isArray(state.options)&&state.options.length===4&&state.options.includes(word)&&
    state.options.every(id=>BYWORD[id])&&
    new Set(state.options.map(id=>BYWORD[id]&&BYWORD[id].word.trim().toLowerCase())).size===4;
  if(!optionsValid){
    state.options=shuffle([word,...distractors(word,pool)]);
    state.wrong=state.wrong.filter(id=>state.options.includes(id));
  }
  const wasSolved=state.solved;
  const responseStart=activeStepTime('useCloze');
  return waitUI(resolve=>{
    let finished=false;
    const finish=action=>{if(finished)return;finished=true;TTS.stop();resolve(action);};
    const fb=h('div',{class:'fb'}),sentEl=h('div',{class:'sent'},d.ex2.replace(wordRe(d.word),'_____'));
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!state.solved,onclick:()=>finish(wasSolved?'next':'done')},'つぎへ');
    const grid=h('div',{class:'choices'});
    state.options.forEach(o=>{
      const b=h('button',{class:'btn sub',disabled:state.solved||state.wrong.includes(o)},BYWORD[o].word);
      if(state.solved&&o===word) b.classList.add('good');
      if(state.wrong.includes(o)) b.classList.add('bad');
      b.addEventListener('click',()=>{
        if(state.solved||state.wrong.includes(o)) return;
        const good=o===word;
        if(!state.attempted){state.attempted=true;state.firstCorrect=good;state.firstResponseMs=elapsedStepTime('useCloze',responseStart);addAcc(good);}
        if(good){
          state.solved=true;b.classList.add('good');fb.className='fb ok';fb.textContent='せいかい!';
          sentEl.replaceChildren(...hl(d.ex2,d.word));next.disabled=true;savePending();
          TTS.speak(d.ex2,0.8).then(()=>{
            if(finished)return;
            if(Time.step==='useCloze') finish(wasSolved?'next':'done');
            else next.disabled=false;
          });
        }else{state.wrong.push(o);b.classList.add('bad');b.disabled=true;fb.className='fb bad';fb.textContent='ちがうよ。もう一度えらんでね';savePending();}
      });
      grid.append(b);
    });
    if(state.solved){
      fb.className='fb ok';fb.textContent='せいかい!';
      sentEl.replaceChildren(...hl(d.ex2,d.word));
    }else if(state.wrong.length){fb.className='fb bad';fb.textContent='ちがうよ。もう一度えらんでね';}
    mount(chrome('useCloze',n,total,
      h('div',{class:'note'},'あてはまる単語をえらぼう'),
      h('div',{class:'card'},sentEl,h('div',{class:'tr'},d.tr2)),
      grid,fb,h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
  });
}
function orderCard(word,n,total,state,canGoBack){
  const d=BYWORD[word],tokens=d.ex1.split(' ');
  const responseStart=activeStepTime('useOrder');
  if(!state.order){
    let order=shuffle(tokens.map((t,i)=>({t,i}))),guard=0;
    while(order.every((o,i)=>o.t===tokens[i])&&guard++<10) order=shuffle(order);
    state.order=order;
  }
  const order=state.order,correctOrder=tokens.map((_,i)=>order.find(o=>o.i===i)),wasSolved=state.solved;
  return waitUI(resolve=>{
    let finished=false;
    const finish=action=>{if(finished)return;finished=true;TTS.stop();resolve(action);};
    const ans=h('div',{class:'answer'}),pool=h('div',{class:'tiles'}),fb=h('div',{class:'fb'});
    const previous=h('button',{class:'btn sub',disabled:!canGoBack,onclick:()=>finish('prev')},'‹ 前へ');
    const next=h('button',{class:'btn',disabled:!state.solved,onclick:()=>finish(wasSolved?'next':'done')},'つぎへ');
    const undo=h('button',{class:'btn sub small',disabled:true,onclick:()=>{
      if(state.solved||state.picked.length<=(state.revealedCount||0))return;
      state.picked.pop();savePending();render();
    }},'ひとつだけもどす');
    const clear=h('button',{class:'btn sub small',onclick:()=>{
      if(state.solved)return;
      state.picked=correctOrder.slice(0,state.revealedCount||0);state.feedback=state.revealedCount?'reveal':'';
      savePending();render();
    }},'全部やりなおす');
    function render(){
      undo.disabled=state.solved||state.picked.length<=(state.revealedCount||0);
      clear.disabled=state.solved;
      const pickedSet=new Set(state.picked.map(o=>o.i));
      ans.replaceChildren(...Array.from({length: order.length}, (_, i)=>{
        const selected=state.picked[i];
        if(selected){
          return h('button',{class:'tile'+(i<(state.revealedCount||0)?' fixed':''),disabled:state.solved||i<(state.revealedCount||0),
            onclick:()=>{if(state.solved||i<(state.revealedCount||0))return;state.picked.splice(i,1);savePending();render();}},selected.t);
        }
        return h('div',{class:'tile empty'},'');
      }));
      // 選んだ単語は消さずにグレーで残し、並び順が変わらないようにする
      pool.replaceChildren(...order.map(o=>{
        const used=pickedSet.has(o.i);
        return h('button',{class:'tile'+(used?' used':''),disabled:state.solved||used,
          onclick:()=>{if(state.solved||used)return;state.picked.push(o);savePending();render();check();}},o.t);
      }));
    }
    function check(){
      if(state.picked.length!==order.length) return;
      const good=state.picked.map(o=>o.t).join(' ')===d.ex1;
      if(!state.attempted){state.attempted=true;state.firstCorrect=good;state.firstResponseMs=elapsedStepTime('useOrder',responseStart);addAcc(good);}
      if(good){
        state.solved=true;state.feedback='';fb.className='fb ok';fb.textContent='せいかい!';next.disabled=true;
        render();
        TTS.speak(d.ex1,0.8).then(()=>{
          if(finished)return;
          if(Time.step==='useOrder') finish(wasSolved?'next':'done');
          else next.disabled=false;
        });
      }
      else{
        let correctPrefix=0;
        while(correctPrefix<tokens.length && state.picked[correctPrefix] && state.picked[correctPrefix].t===tokens[correctPrefix]){
          correctPrefix++;
        }
        state.revealedCount=Math.max(state.revealedCount||0,correctPrefix);
        state.picked=correctOrder.slice(0,state.revealedCount);
        if(state.revealedCount===tokens.length){
          state.solved=true;state.assisted=true;state.feedback='assisted';
          fb.className='fb ok';fb.textContent='正しい順番をすべて表示しました';next.disabled=false;render();
        }else{
          state.feedback='reveal';fb.className='fb bad';
          fb.textContent='まちがい。先頭から正しいところまで出したよ。つづきを並べよう';render();
        }
      }
      savePending();
    }
    if(state.solved){fb.className='fb ok';fb.textContent=state.assisted?'正しい順番をすべて表示しました':'せいかい!';}
    else if(state.feedback==='reveal'){
      fb.className='fb bad';fb.textContent='正しい単語を'+state.revealedCount+'語入れたよ。つづきを並べよう';
    }else if(state.feedback==='bad'){fb.className='fb bad';fb.textContent='ちがうよ。タップして直してみよう';}
    render();
    mount(chrome('useOrder',n,total,
      h('div',{class:'note'},'日本語に合う英文をつくろう'),
      h('div',{class:'card'},h('div',{class:'jp',style:'font-size:22px'},d.tr1)),
      ans,pool,fb,h('div',{class:'row2'},undo,clear),h('div',{class:'grow'}),h('div',{class:'row2'},previous,next)));
  });
}

/* ⑥ スペル入力 */
async function stepSpell(){
  Time.setStep('spell');
  if(!session.spellWords||session.spellWords.length!==session.newWords.length||
    session.spellWords.some(word=>!session.newWords.includes(word))){
    session.spellWords=shuffle(session.newWords);session.spellIndex=0;session.spellResults={};session.spellFirst={};
  }
  session.spellResults=session.spellResults||{};session.spellFirst=session.spellFirst||{};
  const words=session.spellWords;
  for(let i=session.spellIndex;i<words.length;i++){
    session.spellIndex=i;savePending();
    if(!session.spellResults[words[i]]) await spellCard(words[i],i+1,words.length);
    session.spellIndex=i+1;savePending();
  }
  return {...session.spellResults};
}
function spellCard(word,n,total,persist=true){
  const d=BYWORD[word];
  const responseStart=activeStepTime('spell');
  return waitUI(resolve=>{
    let attempted=persist&&Object.prototype.hasOwnProperty.call(session.spellFirst||{},word);
    let solved=false,firstCorrect=attempted?session.spellFirst[word]:false;
    const record=value=>{if(persist){session.spellResults[word]=value;savePending();}};
    const input=h('input',{class:'spell',type:'text',autocapitalize:'none',autocomplete:'off',autocorrect:'off',spellcheck:'false',enterkeyhint:'done','aria-label':'つづり'});
    const fb=h('div',{class:'fb'});
    const btn=h('button',{class:'btn',onclick:submit},'答え合わせ');
    const skipBtn=h('button',{class:'btn sub',onclick:()=>{
      if(persist)session.skippedWords++;
      record('skip');TTS.stop();resolve('skip');
    }},'スキップ');
    input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
    function finalize(correct,kind='ok'){
      solved=true;fb.className=kind==='ok'?'fb ok':'fb bad';fb.textContent=correct?
        'せいかい!':'正しいつづりは「'+d.word+'」。次へ進めます';
      input.disabled=true;btn.textContent='つぎへ';skipBtn.disabled=true;record(attempted&&firstCorrect?'ok':'ng');
      const speech=TTS.speak(d.word);
      if(correct)speech.then(()=>resolve(firstCorrect?'ok':'ng'));
    }
    function submit(){
      if(solved){TTS.stop();resolve(firstCorrect?'ok':'ng');return;}
      const v=input.value.trim().toLowerCase();
      if(!v){
        if(!attempted){
          attempted=true;firstCorrect=false;
          const responseTimes=session.stageResponseMs.spell||(session.stageResponseMs.spell={});
          if(!Object.prototype.hasOwnProperty.call(responseTimes,word)){
            responseTimes[word]=elapsedStepTime('spell',responseStart);addAcc(false);
          }
          if(persist)session.spellFirst[word]=false;
        }
        finalize(false,'bad');
        return;
      }
      const good=v===d.word.toLowerCase();
      if(!attempted){
        attempted=true;firstCorrect=good;
        const responseTimes=session.stageResponseMs.spell||(session.stageResponseMs.spell={});
        if(!Object.prototype.hasOwnProperty.call(responseTimes,word)){
          responseTimes[word]=elapsedStepTime('spell',responseStart);addAcc(good);
        }
        if(persist)session.spellFirst[word]=good;
        savePending();
      }
      if(good){finalize(true,'ok');}
      else{fb.className='fb bad';fb.textContent='ざんねん。正しいつづりは「'+d.word+'」。もう一度書いてみよう';input.value='';input.focus();savePending();}
    }
    mount(chrome('spell',n,total,
      h('div',{class:'note'},'つづりを書こう'),
      h('div',{class:'card'},h('div',{class:'jp'},d.meaning)),
      h('div',{class:'row'},h('button',{class:'btn sub small',onclick:()=>TTS.speak(d.word)},'🔊 発音を聞く')),
      input,fb,h('div',{class:'grow'}),h('div',{class:'row2'},skipBtn,btn)));
    setTimeout(()=>input.focus(),60);
  });
}
