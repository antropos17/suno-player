const $ = id => document.getElementById(id);
const audio = $('audio');
let songs=[], selected=null, dirty=false, saving=null, importing=false, shuffled=false;
const drafts=new Map();
function fail(message){$('error').textContent=message;$('error').hidden=false;}
$('error').onclick=()=>{$('error').hidden=true;};
async function api(url,options){const res=await fetch(url,options);const body=await res.json();if(!res.ok)throw new Error(body.error||'Ошибка запроса');return body;}
function time(value){return Number.isFinite(value)?`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`:'0:00';}
function current(){return songs.find(s=>s.id===selected);}
function renderList(){
  $('count').textContent=songs.length;
  const q=$('search').value.toLocaleLowerCase().trim();
  const visible=songs.filter(s=>[s.title,s.styles,s.lyrics].some(v=>v.toLocaleLowerCase().includes(q)));
  $('songs').replaceChildren();
  if(!visible.length){const p=document.createElement('p');p.className='empty-list';p.textContent=q?'Ничего не найдено. Попробуй другой запрос.':'Здесь будут твои песни.';$('songs').append(p);}
  visible.forEach(s=>{
    const b=document.createElement('button');b.className='song'+(s.id===selected?' selected':'');b.setAttribute('aria-pressed',String(s.id===selected));
    const art=document.createElement('span');art.className='song-art';art.textContent=s.id===selected&&!audio.paused?'Ⅱ':'♫';art.setAttribute('aria-hidden','true');
    const text=document.createElement('span');text.className='song-text';const title=document.createElement('strong');title.textContent=s.title;const sub=document.createElement('small');sub.textContent=s.styles||'Без стиля';text.append(title,sub);b.append(art,text);
    b.onclick=()=>select(s.id,true);$('songs').append(b);
  });
}
function showTags(){ $('style-tags').replaceChildren();$('styles').value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean).slice(0,30).forEach(t=>{const span=document.createElement('span');span.textContent=t;$('style-tags').append(span);}); }
function markDirty(){if(!selected)return;dirty=true;drafts.set(selected,{title:$('title').value,styles:$('styles').value,lyrics:$('lyrics').value});$('save').disabled=false;$('save').textContent='Сохранить';$('status').textContent='Есть несохранённые изменения';showTags();}
async function save(){
  if(saving) await saving;
  if(!dirty||!selected)return true;
  const id=selected;const update={title:$('title').value.trim(),styles:$('styles').value,lyrics:$('lyrics').value};
  if(!update.title){fail('Добавь название песни перед сохранением.');$('title').focus();return false;}
  $('save').textContent='Сохраняю…';$('save').disabled=true;
  saving=(async()=>{try{
    const result=await api('/api/songs/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(update)});
    songs[songs.findIndex(s=>s.id===id)]=result;
    const unchanged=selected===id&&$('title').value.trim()===update.title&&$('styles').value===update.styles&&$('lyrics').value===update.lyrics;
    if(unchanged){drafts.delete(id);dirty=false;$('title').value=result.title;$('save').textContent='Сохранено';$('save').disabled=true;$('status').textContent='Изменения сохранены';}else{$('save').textContent='Сохранить';$('save').disabled=false;}
    renderList();updateNow();return true;
  }catch(e){fail(e.message);$('save').textContent='Повторить сохранение';$('save').disabled=false;$('status').textContent='Изменения не сохранены';return false;}finally{saving=null;}})();
  return saving;
}
async function select(id,autoplay=false){
  if(id===selected){if(autoplay)toggle();return;}
  if(!(await save())||dirty)return;
  const s=songs.find(s=>s.id===id);if(!s)return;
  selected=id;dirty=false;$('welcome').hidden=true;$('editor').hidden=false;
  const values=drafts.get(id)||s;for(const field of ['title','styles','lyrics'])$(field).value=values[field];
  $('file-info').textContent=s.file.split('.').pop().toUpperCase()+' · локальный файл';
  $('save').disabled=true;$('save').textContent='Сохранено';$('play').disabled=false;
  $('seek').disabled=true;$('seek').value=0;$('elapsed').textContent='0:00';$('duration').textContent='0:00';
  audio.src='/audio/'+s.file;renderList();showTags();updateNow();if(autoplay)play();
}
function updateNow(){const s=current();if(!s)return;$('now-title').textContent=s.title;$('now-style').textContent=s.styles||'Без стиля';document.title=s.title+' — Suno Player';}
async function play(){try{await audio.play();}catch{fail('Не удалось воспроизвести файл. Попробуй другой аудиоформат или выбери песню ещё раз.');}}
function toggle(){if(!selected)return;audio.paused?play():audio.pause();}
function playState(){const playing=!audio.paused;for(const id of ['play','play-main']){$(id).textContent=playing?'Ⅱ':'▶';$(id).setAttribute('aria-label',playing?'Пауза':'Воспроизвести');}renderList();}
async function step(direction){if(!songs.length)return;let i=songs.findIndex(s=>s.id===selected);if(shuffled&&songs.length>1){let n;do{n=Math.floor(Math.random()*songs.length);}while(n===i);i=n;}else{i=(i+direction+songs.length)%songs.length;}if(songs[i].id===selected){audio.currentTime=0;play();}else await select(songs[i].id,true);}
async function importFiles(files){
  if(importing)return;importing=true;$('import').disabled=true;$('first-import').disabled=true;$('error').hidden=true;
  let first=null,added=0,failed=0;
  for(const file of files){
    $('status').textContent=`Добавляю: ${file.name}`;
    try{if(file.size>200*1024*1024)throw new Error('Максимальный размер файла — 200 МБ.');const s=await api('/api/songs',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});songs.push(s);first??=s.id;added++;renderList();}
    catch(e){failed++;fail(`${file.name}: ${e.message}`);}
  }
  importing=false;$('import').disabled=false;$('first-import').disabled=false;$('files').value='';$('status').textContent=`Добавлено песен: ${added}${failed?`. Ошибок: ${failed}`:''}`;
  if(!selected&&first)await select(first);
}
$('import').onclick=$('first-import').onclick=()=>$('files').click();$('files').onchange=e=>importFiles([...e.target.files]);
$('search').oninput=renderList;for(const field of ['title','styles','lyrics'])$(field).oninput=markDirty;$('save').onclick=save;
document.addEventListener('keydown',e=>{const editing=['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName);if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save();}else if(e.code==='Space'&&!editing){e.preventDefault();toggle();}});
window.addEventListener('beforeunload',e=>{if(dirty||saving||importing){e.preventDefault();e.returnValue='';}});
for(const id of ['play','play-main'])$(id).onclick=toggle;$('next').onclick=()=>step(1);$('prev').onclick=()=>{if(audio.currentTime>3)audio.currentTime=0;else step(-1);};
$('repeat').onclick=()=>{audio.loop=!audio.loop;$('repeat').setAttribute('aria-pressed',String(audio.loop));};$('shuffle').onclick=()=>{shuffled=!shuffled;$('shuffle').setAttribute('aria-pressed',String(shuffled));};
audio.volume=.8;$('volume').oninput=e=>{audio.volume=Number(e.target.value);};
audio.onplay=audio.onpause=playState;audio.onended=()=>{if(!audio.loop)step(1);};audio.onerror=()=>{fail('Аудиофайл недоступен или этот формат не поддерживается браузером.');playState();};
audio.onloadedmetadata=()=>{$('duration').textContent=time(audio.duration);$('seek').max=Number.isFinite(audio.duration)?audio.duration:100;$('seek').disabled=!Number.isFinite(audio.duration);};
audio.ontimeupdate=()=>{$('elapsed').textContent=time(audio.currentTime);$('seek').value=audio.currentTime;};$('seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value);};
function tab(which,focus=false){for(const name of ['lyrics','styles']){const active=which===name;$(name+'-tab').setAttribute('aria-selected',String(active));$(name+'-tab').tabIndex=active?0:-1;$(name+'-panel').hidden=!active;}if(focus)$(which+'-tab').focus();}
for(const name of ['lyrics','styles']){$(name+'-tab').onclick=()=>tab(name);$(name+'-tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'lyrics':e.key==='End'?'styles':name==='lyrics'?'styles':'lyrics',true);}};}
let dragDepth=0;document.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();dragDepth++;$('drop').hidden=false;}});document.addEventListener('dragover',e=>{e.preventDefault();});document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').hidden=true;}});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop').hidden=true;importFiles([...e.dataTransfer.files]);});
api('/api/songs').then(async result=>{songs=result;renderList();if(songs.length)await select(songs[0].id);}).catch(e=>{fail(e.message);$('status').textContent='Библиотека недоступна';});
