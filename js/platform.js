'use strict';
//@file 学習時間計測(Time)と読み上げ(TTS)
/* ================= 学習時間(画面が見えていて、操作がある間だけ数える) ================= */
const Time={
  step:null,ms:{},last:0,lastActive:0,paused:false,timer:null,
  start(initial={}){this.ms={};for(const k of STEP_ORDER)this.ms[k]=num(initial[k]);this.last=this.lastActive=performance.now();this.paused=false;
    clearInterval(this.timer);this.timer=setInterval(()=>this.tick(),500);},
  setStep(k){this.tick();this.step=k;},
  touch(src){this.lastActive=performance.now();this.paused=false;if(src!=='p')hideIdle();},
  tick(){
    const now=performance.now(),dt=Math.min(now-this.last,1000);this.last=now;
    if(!this.step) return;
    const vis=document.visibilityState==='visible',idle=(now-this.lastActive)>IDLE_MS;
    if(vis&&!idle) this.ms[this.step]+=dt;
    else if(vis&&idle&&!this.paused){this.paused=true;showIdle();}
  },
  total(){return STEP_ORDER.reduce((a,k)=>a+(this.ms[k]||0),0);},
  stop(){clearInterval(this.timer);this.timer=null;this.step=null;this.paused=false;hideIdle();}
};
document.addEventListener('pointerdown',()=>Time.touch('p'),true);
document.addEventListener('keydown',()=>Time.touch('k'),true);

/* ================= 読み上げ ================= */
const TTS={
  pick(){
    const vs=speechSynthesis.getVoices(); if(!vs.length) return null;
    const en=vs.filter(v=>/^en[-_]US/i.test(v.lang));
    return en.find(v=>/samantha|ava|allison|nicky|karen/i.test(v.name))||en[0]||vs.find(v=>/^en/i.test(v.lang))||null;
  },
  unlock(){try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}catch(e){}},
  stop(){try{speechSynthesis.cancel();}catch(e){}},
  speak(text,rate=0.85){
    return new Promise(res=>{
      if(!('speechSynthesis' in window)){res();return;}
      try{
        if(speechSynthesis.speaking||speechSynthesis.pending) speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=rate;
        const v=this.pick();if(v)u.voice=v;
        let done=false;
        const fin=()=>{if(done)return;done=true;clearTimeout(tm);res();};
        u.onend=fin;u.onerror=fin;
        const tm=setTimeout(fin,2000+text.length*150);
        speechSynthesis.speak(u);
      }catch(e){res();}
    });
  }
};
if('speechSynthesis' in window) speechSynthesis.onvoiceschanged=()=>{};
