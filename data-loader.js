'use strict';

const app=document.querySelector('#app');
// 依存関係の順に読み込む(後ろのファイルは前のファイルの定義を使う)
const APP_SCRIPTS=[
  'core','storage','pending','platform','shell','units',
  'study-flow','study-steps','done','cards','history','settings','main'
].map(name=>'js/'+name+'.js');

function showLoadError(error){
  console.error(error);
  const message=document.createElement('div');
  message.className='screen';
  message.setAttribute('role','alert');
  message.textContent='単語データを読み込めませんでした。ページを再読み込みしてください。 ('+error.message+')';
  app.replaceChildren(message);
}
async function loadJson(url){
  const response=await fetch(url);
  if(!response.ok)throw new Error(url+' の読み込みに失敗しました ('+response.status+')');
  return response.json();
}
// async=false の動的scriptは、挿入順に実行される
function loadScripts(urls){
  for(const url of urls){
    const script=document.createElement('script');
    script.src=url;
    script.async=false;
    script.onerror=()=>showLoadError(new Error(url+' の読み込みに失敗しました'));
    document.body.append(script);
  }
}
async function startApp(){
  app.textContent='単語データを読み込んでいます…';
  const manifest=await loadJson('data/manifest.json');
  if(!manifest||!Array.isArray(manifest.books)||!manifest.books.length)throw new Error('manifest.json の単語帳一覧が空です');
  const bookIds=new Set();
  const books=await Promise.all(manifest.books.map(async book=>{
    if(!book||typeof book.id!=='string'||!/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(book.id)||bookIds.has(book.id)||
      typeof book.title!=='string'||!book.title||typeof book.file!=='string'||!book.file)throw new Error('単語帳の設定が正しくありません');
    bookIds.add(book.id);
    const data=await loadJson(book.file);
    if(!data||!Array.isArray(data.words))throw new Error(book.file+' に単語一覧がありません');
    return {...book,words:data.words.map(word=>({...word,bookId:book.id,bookTitle:book.title}))};
  }));
  const ids=new Set(),words=[];
  for(const book of books)for(const word of book.words){
    if(typeof word.id!=='string'||!/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(word.id)||ids.has(word.id))throw new Error('単語IDが不正または重複しています: '+word.id);
    if(['word','meaning','ex1','tr1','ex2','tr2'].some(key=>typeof word[key]!=='string'||!word[key]))throw new Error('単語データの項目が不足しています: '+word.id);
    ids.add(word.id);words.push(word);
  }
  window.EITAN_BOOKS=books;
  window.EITAN_WORDS=words;
  loadScripts(APP_SCRIPTS);
}

startApp().catch(showLoadError);
