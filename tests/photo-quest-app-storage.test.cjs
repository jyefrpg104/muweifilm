const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../photo-quest/index.html','utf8');
const app=html.split('  <script>')[1].split('  </script>')[0];
const archiveSource=fs.readFileSync(__dirname+'/../photo-quest/quest-archive.js','utf8');
const archiveUI=fs.readFileSync(__dirname+'/../photo-quest/quest-archive-ui.js','utf8');
const source=fs.readFileSync(__dirname+'/../photo-quest/cloud-backup.js','utf8');
function boot(record){
  const elements=new Map(),storage=new Map(),timers=[],canvases=[];let id=0;
  class Element{
    constructor(){this.style={setProperty(){},removeProperty(){}};this.dataset={};this.classList={toggle(){},add(){},remove(){},contains:()=>false};this.events={};this.open=false;this.hidden=false;this.textContent='';this.innerHTML='';this.value='';}
    addEventListener(name,fn){this.events[name]=fn}setAttribute(){}removeAttribute(){}getAttribute(){return ''}
    querySelector(){return new Element()}querySelectorAll(){return []}closest(){return new Element()}getBoundingClientRect(){return {x:0,y:0,top:0,left:0,width:400,height:80,right:400,bottom:80}}focus(){}append(){}remove(){}showModal(){this.open=true}close(){this.open=false}
  }
  const document={getElementById:key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key)},querySelector:()=>new Element(),querySelectorAll:()=>[],createElement:tag=>{const node=new Element();if(tag==='canvas'){const texts=[];node.getContext=()=>({beginPath(){},moveTo(){},arcTo(){},closePath(){},fill(){},stroke(){},save(){},clip(){},restore(){},fillRect(){},lineTo(){},fillText:text=>texts.push(text),measureText:text=>({width:text.length*12})});node.toBlob=callback=>{canvases.push({width:node.width,height:node.height,texts});callback(new Blob(['png'],{type:'image/png'}));};}return node;},body:new Element(),documentElement:new Element(),addEventListener(){},fonts:{ready:Promise.resolve()},visibilityState:'visible'};
  if(record)storage.set('photo-quest:current-task:v1',JSON.stringify(record));
  const context={console,Date,Intl,JSON,Math,Map,Set,Object,Number,String,Array,RegExp,Promise,Error,URL,URLSearchParams,AbortController,DOMException,structuredClone,
    Blob,File,TextEncoder,Uint8Array,document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},navigator:{onLine:true},crypto:{subtle:require('node:crypto').webcrypto.subtle,randomUUID:()=>`id-${++id}`},
    fetch:async()=>{throw Error('Unexpected network')},matchMedia:()=>({matches:false,addEventListener(){}}),scrollY:0,scrollTo(){},addEventListener(){},location:{hash:''},history:{pushState(){},replaceState(){}},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},performance:{now:()=>0},getComputedStyle:()=>({position:'static',getPropertyValue:()=> 'sans-serif'}),google:{accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}})}}}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);vm.runInContext(archiveSource,context);vm.runInContext(archiveUI,context);vm.runInContext(app,context);
  return {context,elements,storage,canvases,run:code=>vm.runInContext(code,context),saved:()=>JSON.parse(storage.get('photo-quest:current-task:v1'))};
}
let f=boot();let saved=f.saved();assert.equal(saved.version,5);assert(saved.cloudSync);assert.equal(f.run('!!validTaskSnapshot(taskSnapshot())'),true);assert.equal(f.elements.get('cloudBadge').textContent,'未連線');
const legacy={...saved,version:4};delete legacy.cloudSync;f=boot(legacy);assert.equal(f.saved().version,5);assert.equal(f.saved().current.id,legacy.current.id);
f.run('toggleFavorite(taskSnapshot())');assert.equal(f.saved().favorites.length,1);assert.equal(f.saved().cloudSync.events.filter(x=>x.type==='favorite'&&!x.deleted).length,1);
f.run('toggleFavorite(taskSnapshot())');assert.equal(f.saved().favorites.length,0);assert.equal(f.saved().cloudSync.events.find(x=>x.type==='favorite').deleted,true);
const completed=f.run("(()=>{const t=taskSnapshot();t.id='finished-test';t.confirmedAt=new Date().toISOString();t.shotCount=100;t.completedAt=new Date().toISOString();return t})()");
f.run('archivedTasks.push('+JSON.stringify(completed)+');persistTask()');assert.equal(f.saved().archived.length,1);
f.run('deleteRecordEntries({tab:"completed",ids:['+JSON.stringify(completed.id)+']})');assert.equal(f.saved().archived.length,0);assert.equal(f.saved().cloudSync.events.find(x=>x.type==='archive').deleted,true);
f.run('undoRecordsDeletion()');assert.equal(f.saved().archived.length,1);assert.equal(f.saved().cloudSync.events.find(x=>x.type==='archive').deleted,false);
const payload=f.run('backupPayload()');assert.equal(f.run('parseBackup('+JSON.stringify(payload)+').archived.length'),1);
f.run('pendingCloudRestore='+JSON.stringify(completed));f.elements.get('cloudRestoreAccept').events.click();assert.equal(f.saved().current.completedAt,completed.completedAt);
const unsupported={...f.saved(),version:99};f=boot(unsupported);assert.equal(f.saved().version,99);assert.equal(f.run('taskStorageState'),'unsupported');
console.log('PASS actual App boot, v4 migration, favorite/delete/undo metadata, backup parsing, cloud restore, future-version protection');


module.exports=(async()=>{
  const f=boot();f.run('confirmTask();fillShotCount();finishShooting()');
  const completed=f.saved().archived[0];assert(completed.completedAt);
  f.run('renderRecords()');
  const completedRows=f.elements.get('recordsList').innerHTML;
  assert.match(completedRows,/record-quick-actions/);
  assert.match(completedRows,/data-record-share="/);
  assert.match(completedRows,/data-record-favorite="/);
  assert.match(completedRows,/record-delete-action/);
  assert.doesNotMatch(completedRows,/<span>刪除<\/span>/);
  const list=f.elements.get('recordsList');
  const action=(selector,key)=>({target:{closest:query=>query===selector?{dataset:{[key]:completed.id}}:null}});
  list.events.click(action('[data-record-favorite]','recordFavorite'));
  assert.equal(f.saved().favorites.length,1);
  f.run('recordTab="favorites";renderRecords()');
  const favoriteRows=f.elements.get('recordsList').innerHTML;
  assert.match(favoriteRows,/record-unfavorite-action/);
  assert.match(favoriteRows,/aria-label="取消收藏：/);
  assert.doesNotMatch(favoriteRows,/record-unfavorite-action[^>]*><svg[^>]*><path d="M3 6h18/);
  f.run('recordTab="completed";renderRecords()');
  list.events.click(action('[data-record-share]','recordShare'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.elements.get('sharePreview').hidden,false);
  const classes=new Set(),swipeActions={delete:{disabled:true,tabIndex:-1},share:{disabled:true,tabIndex:-1},favorite:{disabled:true,tabIndex:-1}};
  const row={dataset:{recordRow:completed.id},classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},
    querySelector:selector=>selector==='[data-record-view]'?button:selector==='[data-record-reveal]'?{setAttribute(){}}:null,
    querySelectorAll:selector=>selector==='.record-swipe-action'?Object.values(swipeActions):selector==='[data-record-delete]'?[swipeActions.delete]:[swipeActions.share,swipeActions.favorite]};
  const button={dataset:{recordView:completed.id},style:{},closest:()=>row};
  list.querySelectorAll=selector=>selector==='[data-record-row]'?[row]:classes.has('record-swipe-open')||classes.has('record-dragging')?[row]:[];
  const pointer=(x,id)=>({target:{closest:selector=>selector==='[data-record-view]'?button:null},pointerId:id,clientX:x,clientY:0,isPrimary:true,button:0});
  list.events.pointerdown(pointer(10,1));list.events.pointermove(pointer(110,1));list.events.pointerup(pointer(110,1));
  assert.equal(f.run('swipedRecordSide'),'right');assert.equal(swipeActions.share.disabled,false);assert.equal(swipeActions.favorite.disabled,false);assert.equal(swipeActions.delete.disabled,true);
  list.events.pointerdown(pointer(110,2));list.events.pointermove(pointer(-110,2));list.events.pointerup(pointer(-110,2));
  assert.equal(f.run('swipedRecordSide'),'left');assert.equal(swipeActions.delete.disabled,false);assert.equal(swipeActions.share.disabled,true);
  f.run('closeRecordSwipe()');assert.equal(classes.size,0);assert.equal(swipeActions.delete.disabled,true);
  const metadata=JSON.parse(f.storage.get('photo-quest:quest-archive:v1'));
  assert.equal(metadata.tasks[0].taskId,completed.id);assert.equal(metadata.tasks[0].status,'pending');
  f.run('showRecord(archivedTasks[0])');assert.equal(f.elements.get('archiveWorks').hidden,false);
  assert.equal(f.elements.get('archiveCount').textContent,'尚未上傳攝影作品');
  assert.match(f.elements.get('recordMeta').textContent,/拍攝紀錄/);
  const photo=new File(['original'],'photo<test>.HEIC',{type:'image/heic',lastModified:123});
  f.elements.get('archiveFiles').events.change({target:{files:[photo,photo]}});
  assert.equal((f.elements.get('archiveSelection').innerHTML.match(/archive-selected/g)||[]).length,1);
  assert(f.elements.get('archiveSelection').innerHTML.includes('photo&lt;test&gt;.HEIC'));
  assert.equal(f.elements.get('archiveUpload').hidden,false);assert.equal(f.elements.get('archiveUpload').disabled,true);
  f.elements.get('archiveClear').events.click();assert.equal(f.elements.get('archiveSelection').innerHTML,'');

  f.run('taskId="a-new-task";quest.subject=DECKS.subject[1]');
  await f.run('makeTaskImage(archivedTasks[0])');
  assert.equal(f.canvases[0].width,1080);assert.equal(f.canvases[0].height,1350);
  const title=f.run('taskCard("subject",archivedTasks[0].cards.subject).title');
  assert(f.canvases[0].texts.includes(title));assert(f.canvases[0].texts.includes('這次散步完成了'));
  assert.equal(await f.run('openTaskShare(archivedTasks[0])'),true);assert.equal(f.elements.get('sharePreview').hidden,false);
  f.run('showRecord({...archivedTasks[0],completedAt:null})');assert.equal(f.elements.get('archiveWorks').hidden,true);
  f.run('deleteRecordEntries({tab:"completed",ids:['+JSON.stringify(completed.id)+']})');
  assert.equal(f.saved().archived.length,0);assert(f.storage.has('photo-quest:quest-archive:v1'));
  console.log('PASS actual completion creates pending archive, works UI, historical 1080x1350 share image and deletion preservation');
})().catch(error=>{console.error(error);process.exitCode=1;throw error;});
