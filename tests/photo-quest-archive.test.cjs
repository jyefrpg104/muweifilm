const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(__dirname+'/../photo-quest/quest-archive.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const task=id=>({id,createdAt:'2026-10-11T09:00:00Z',confirmedAt:'2026-10-12T04:00:00Z',completedAt:'2026-10-12T06:00:00Z',shotCount:5,pairingEnabled:true,
  cards:{camera:'C01',frame:'F01',time:'T01',subject:'S01',story:'T02',output:'O03'},locked:{camera:true,frame:false,time:false,subject:false,story:false,output:false},covered:{camera:false,frame:false,time:false,subject:false,story:false,output:false}});
const card=(key,id)=>({id,title:{subject:'街角',story:'剛剛離開'}[key]||key+' '+id,hint:'保留原始提示'});
const response=(value,status=200,headers={})=>({status,ok:status>=200&&status<300,headers:{get:key=>headers[key]||null},json:async()=>clone(value),blob:async()=>new Blob([JSON.stringify(value)]),text:async()=>JSON.stringify(value)});
function server(){
  const files=new Map(),sessions=new Map(),calls=[];let next=0,hook=null,lostFolder=false,lostChunk=false;
  const add=meta=>{files.set(meta.id,{createdTime:'2026-10-12T06:00:00Z',...meta});return meta.id;};
  add({id:'root',name:'Photo Quest',mimeType:'application/vnd.google-apps.folder',appProperties:{photoQuest:'v1',kind:'folder'}});
  async function request(url,opt={},accepted=[]){
    calls.push({url,opt});const u=new URL(url),id=u.pathname.split('/').pop();
    if(hook){const injected=await hook(url,opt,accepted);if(injected)return injected;}
    if(u.pathname.endsWith('/generateIds'))return response({ids:['file-'+ ++next]});
    if(u.pathname.endsWith('/files')&&opt.method==='POST'&&!u.searchParams.has('uploadType')){
      const metadata=JSON.parse(opt.body);if(files.has(metadata.id))return response({},409);
      add(metadata);if(lostFolder&&metadata.appProperties.kind==='quest-folder'){lostFolder=false;throw Error('lost create response');}
      return response(files.get(metadata.id));
    }
    if(u.searchParams.get('uploadType')==='resumable'){
      const metadata=JSON.parse(opt.body),fileId=opt.method==='PATCH'?id:metadata.id;
      if(opt.method==='POST'&&files.has(fileId))return response({},409);
      const location='https://www.googleapis.com/upload/drive/v3/files/session-'+ ++next;
      sessions.set(location,{metadata:{...files.get(fileId),...metadata,id:fileId},offset:0,total:Number(opt.headers['X-Upload-Content-Length']),parts:[]});
      return response({},200,{Location:location});
    }
    if(opt.method==='PUT'){
      const session=sessions.get(url);assert(session,'known resumable session');
      if(opt.headers['Content-Range'].startsWith('bytes */')){
        if(session.offset===session.total)return response(files.get(session.metadata.id));
        return response({},308,session.offset?{Range:`bytes=0-${session.offset-1}`}:{ });
      }
      const range=opt.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/);assert(range);
      assert.equal(Number(range[1]),session.offset);assert.equal(opt.body.size,Number(range[2])-Number(range[1])+1);
      if(Number(range[2])+1<session.total)assert.equal(opt.body.size%(256*1024),0);
      session.parts.push(Buffer.from(await opt.body.arrayBuffer()));session.offset+=opt.body.size;
      if(session.offset===session.total){add({...session.metadata,size:String(session.total),bytes:Buffer.concat(session.parts)});}
      if(lostChunk){lostChunk=false;throw Error('chunk accepted but response lost');}
      return session.offset===session.total?response(files.get(session.metadata.id)):response({},308,{Range:`bytes=0-${session.offset-1}`});
    }
    if(u.pathname.endsWith('/files')){
      const q=u.searchParams.get('q'),kind=q.match(/key='kind' and value='([^']+)'/)[1],taskId=q.match(/key='taskId' and value='([^']+)'/)?.[1],parent=q.match(/and '([^']+)' in parents/)?.[1];
      return response({files:[...files.values()].filter(file=>!file.trashed&&file.appProperties?.kind===kind&&(!taskId||file.appProperties.taskId===taskId)&&(!parent||file.parents?.includes(parent))).map(({bytes,...file})=>file)});
    }
    if(u.searchParams.get('alt')==='media')return {...response({}),blob:async()=>new Blob([files.get(id)?.bytes||'private'])};
    if(opt.method==='PATCH'&&files.has(id)){
      const changed={...files.get(id),...JSON.parse(opt.body)};files.set(id,changed);return response(changed);
    }
    const file=files.get(id);return file?response(file):response({},404);
  }
  return {files,calls,request,add,setHook:value=>hook=value,loseFolder:()=>lostFolder=true,loseChunk:()=>lostChunk=true};
}
function fixture(tasks=[task('one')],srv=server(),savedStore=new Map()){
  let connected=true,canWrite=true,images=[];const listeners=[],timers=[];
  const storage={getItem:key=>savedStore.get(key)||null,setItem:(key,value)=>savedStore.set(key,value)};
  const context={console,Intl,Date,JSON,Map,Set,URL,URLSearchParams,Blob,TextEncoder,Uint8Array,crypto:webcrypto,navigator:{},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){}};
  vm.createContext(context);vm.runInContext(source,context);
  const drive={ready:()=>connected,rootFolder:()=>connected?'root':null,subscribe:fn=>{listeners.push(fn);return ()=>{}},request:async(...args)=>{if(!connected)throw Error('重新連線');return srv.request(...args);},thumbnail:async()=>new Blob(['private'],{type:'image/png'})};
  const archive=context.PhotoQuestArchive.create({storage,drive,tasks:()=>tasks,canWrite:()=>canWrite,card,makePreview:async blob=>blob,makeTaskImage:async t=>{images.push(clone(t));return new Blob(['PNG '+t.id],{type:'image/png'});}});
  archive.observe();
  return {archive,srv,store:savedStore,tasks,images,api:context.PhotoQuestArchive,drive,setOnline:value=>{connected=value;listeners.forEach(fn=>fn());},setWritable:value=>canWrite=value};
}
const selected=(name,content='original binary',type='image/jpeg')=>({file:new File([content],name,{type,lastModified:12345}),status:'selected',progress:0});
module.exports=(async()=>{
  let f=fixture();await f.archive.ensure('one');
  assert.equal(f.archive.state('one').status,'completed');assert.equal(f.images[0].id,'one');
  const files=kind=>[...f.srv.files.values()].filter(file=>file.appProperties?.kind===kind);
  assert.equal(files('quest-folder').length,1);assert.equal(files('quest-card').length,1);assert.equal(files('quest-json').length,1);
  assert.equal(files('walks')[0].parents[0],'root');assert.equal(files('quest-folder')[0].name,'2026-10-12_街角_剛剛離開');
  assert.equal(files('quest-card')[0].name,'261012_1400_quest card.png');
  assert.equal(f.api.cardFileName({...task('one'),completedAt:'2026-10-12T15:39:00Z'}),'261012_2339_quest card.png');
  assert.equal(f.api.cardFileName({...task('one'),completedAt:'2026-10-12T16:01:00Z'}),'261013_0001_quest card.png');
  const document=()=>JSON.parse(files('quest-json')[0].bytes.toString());
  assert.equal(document().taskId,'one');assert.deepEqual(document().snapshot,task('one'));assert.equal(document().lens.id,'F01');assert.equal(document().camera.name,'camera C01');
  await Promise.all([f.archive.ensure('one'),f.archive.ensure('one')]);assert.equal(files('quest-folder').length,1);assert.equal(files('quest-card').length,1);assert.equal(f.images.length,1);
  const originalCardId=files('quest-card')[0].id;
  files('quest-card')[0].name='quest-card.png';
  const oldMetadata=JSON.parse(f.store.get(f.api.STORAGE_KEY));delete oldMetadata.tasks[0].cardName;f.store.set(f.api.STORAGE_KEY,JSON.stringify(oldMetadata));
  const migrated=fixture([task('one')],f.srv,f.store);await migrated.archive.flush();
  assert.equal(files('quest-card').length,1);assert.equal(files('quest-card')[0].id,originalCardId);
  assert.equal(files('quest-card')[0].name,'261012_1400_quest card.png');assert.equal(migrated.images.length,0);
  assert.equal(migrated.archive.state('one').status,'completed');
  assert.equal(migrated.archive.state('one').cardName,'261012_1400_quest card.png');
  console.log('PASS task folder, complete snapshot, original IDs and names, PNG reuse and single-flight archive');

  const first=selected('DSC0001.JPG'),second=selected('IMG_1001.HEIC','heic original','image/heic');
  await f.archive.uploadPhotos('one',[first]);await f.archive.uploadPhotos('one',[second]);
  assert.equal(document().photos.length,2);assert.equal(document().shotCount,5);assert.equal(files('quest-photo')[0].bytes.toString(),'original binary');assert.equal(document().photos[1].mimeType,'image/heic');
  assert.deepEqual(document().photos.map(p=>p.order),[0,1]);assert.equal(document().photos[0].originalName,'DSC0001.JPG');assert.equal(first.progress,100);
  const before=files('quest-photo').length;await f.archive.uploadPhotos('one',[first]);assert.equal(files('quest-photo').length,before);
  const remote=fixture([task('one')],f.srv);await remote.archive.ensure('one');assert.equal(remote.archive.state('one').folderId,f.archive.state('one').folderId);assert.equal(remote.archive.state('one').photos.length,2);
  const reopened=fixture([task('one')],f.srv,f.store);await reopened.archive.uploadPhotos('one',[selected('DSC0001.JPG')]);assert.equal(files('quest-photo').length,2);
  console.log('PASS repeated photo additions, original bytes, HEIC, order, cross-device discovery and reselect-after-reload dedupe');

  f=fixture([task('one'),task('two')]);await f.archive.ensure('one');await f.archive.ensure('two');
  await f.archive.uploadPhotos('one',[selected('same.JPG')]);await f.archive.uploadPhotos('two',[selected('same.JPG')]);
  assert.notEqual(f.archive.state('one').folderId,f.archive.state('two').folderId);assert.notEqual(f.archive.state('one').photos[0].fileId,f.archive.state('two').photos[0].fileId);
  f.tasks.reverse();assert.equal(f.archive.state('one').photos.length,1);
  const badParent=f.srv.add({id:'foreign',name:'foreign.JPG',mimeType:'image/jpeg',size:'10',parents:['wrong-folder'],appProperties:{photoQuest:'v1',kind:'quest-photo',taskId:'one'}});
  await f.archive.ensure('one');assert(!f.archive.state('one').photos.some(p=>p.fileId===badParent));
  await assert.rejects(f.archive.thumbnail('two',f.archive.state('one').photos[0]),/不符/);
  assert.equal((await f.archive.thumbnail('one',f.archive.state('one').photos[0])).size,'original binary'.length);
  assert(f.srv.calls.some(call=>call.url.includes('alt=media')));
  console.log('PASS same-name tasks isolated, reordered records, parent verification and private thumbnail ownership');

  f=fixture();f.setOnline(false);assert.equal(f.archive.state('one').status,'pending');await f.archive.flush();assert.equal(f.srv.files.size,1);
  f.setOnline(true);await f.archive.flush();assert.equal(f.archive.state('one').status,'completed');
  f.setOnline(false);await assert.rejects(f.archive.ensure('one'));assert.equal(f.archive.state('one').status,'pending');f.setOnline(true);await f.archive.flush();
  assert.equal(f.archive.state('one').status,'completed');
  const stored=JSON.parse(f.store.get(f.api.STORAGE_KEY));stored.tasks[0].status='uploading';f.store.set(f.api.STORAGE_KEY,JSON.stringify(stored));
  let restart=fixture([task('one')],f.srv,f.store);assert.equal(restart.archive.state('one').status,'pending');await restart.archive.flush();assert.equal(restart.archive.state('one').status,'completed');
  console.log('PASS offline task pending, reconnect, expired authorization, interrupted uploading state recovery');

  f=fixture();f.srv.loseFolder();await assert.rejects(f.archive.ensure('one'),/lost create/);assert.equal(f.archive.state('one').status,'failed');
  // Even if the local folderId was never written, taskId tags recover that folder.
  await f.archive.ensure('one');assert.equal([...f.srv.files.values()].filter(file=>file.appProperties?.kind==='quest-folder').length,1);
  console.log('PASS lost folder creation response does not create a duplicate');

  f=fixture([task('one'),task('two')]);await Promise.all([f.archive.ensure('one'),f.archive.ensure('two')]);
  assert.equal([...f.srv.files.values()].filter(file=>file.appProperties?.kind==='walks').length,1);
  // Drive has no unique-property constraint across independent devices. If a cold
  // device race leaves two folders, canonical selection and photo union stay safe.
  const canonical=f.archive.state('one').folderId;
  f.srv.add({id:'duplicate-folder',name:'same display name',mimeType:'application/vnd.google-apps.folder',parents:[f.archive.state('two').folderId],createdTime:'2026-10-13T00:00:00Z',appProperties:{photoQuest:'v1',kind:'quest-folder',taskId:'one'}});
  f.srv.add({id:'recovered-photo',name:'secondary.JPG',mimeType:'image/jpeg',size:'100',parents:['duplicate-folder'],appProperties:{photoQuest:'v1',kind:'quest-photo',taskId:'one'}});
  await f.archive.ensure('one');assert.equal(f.archive.state('one').folderId,canonical);assert.equal(f.archive.state('one').photos.length,1);
  console.log('PASS concurrent local tasks share Photo Walks; cold-device duplicate-folder reconciliation retains photos');

  f=fixture();await f.archive.ensure('one');let failPhoto=true;
  f.srv.setHook((url,opt)=>{if(failPhoto&&opt.method==='POST'&&opt.body?.includes('bad.JPG')){const error=Error('storage quota');error.status=403;throw error;}});
  const good=selected('good.JPG'),bad=selected('bad.JPG');await f.archive.uploadPhotos('one',[good,bad]);
  assert.equal(good.status,'completed');assert.equal(bad.status,'failed');assert.equal(f.archive.state('one').photos.length,1);assert.equal(f.tasks.length,1);
  failPhoto=false;await f.archive.uploadPhotos('one',[good,bad]);assert.equal(f.archive.state('one').photos.length,2);
  let failJSON=true;f.srv.setHook((url,opt)=>{if(failJSON&&[...f.srv.files.values()].some(file=>file.name==='recovered.PNG')&&opt.method==='PATCH'&&opt.body?.includes('quest.json'))throw Error('JSON write failed');});
  const recovered=selected('recovered.PNG','png bytes','image/png');await f.archive.uploadPhotos('one',[recovered]);assert.equal(recovered.status,'completed');assert.equal(f.archive.state('one').status,'failed');
  failJSON=false;await f.archive.ensure('one');assert.equal(f.archive.state('one').photos.length,3);
  assert.equal(JSON.parse([...f.srv.files.values()].find(file=>file.appProperties?.kind==='quest-json').bytes.toString()).photos.length,3);
  console.log('PASS partial photo success, quota failure, retry only failed files, binary success with interrupted JSON index repair');

  f=fixture();await f.archive.ensure('one');f.srv.loseChunk();const big=selected('large.JPG',new Uint8Array(9*1024*1024));const progress=[];
  const a=f.archive.uploadPhotos('one',[big],item=>progress.push(item.progress)),b=f.archive.uploadPhotos('one',[big]);assert.equal(a,b);await a;
  assert.equal(big.status,'completed');assert(progress.some(value=>value>0&&value<100));assert.equal(f.archive.state('one').photos.length,1);
  assert(f.srv.calls.some(call=>call.opt.headers?.['Content-Range']?.startsWith('bytes */')));
  assert.equal([...f.srv.files.values()].find(file=>file.appProperties?.kind==='quest-photo').bytes.length,9*1024*1024);
  console.log('PASS large binary chunks, acknowledged progress, lost-chunk offset recovery and double-click suppression');

  const savedPhotos=[...f.srv.files.values()].filter(file=>file.appProperties?.kind==='quest-photo').map(file=>file.id);f.tasks.splice(0);f.archive.observe();await f.archive.flush();
  assert(savedPhotos.every(id=>f.srv.files.has(id)));assert(!f.srv.calls.some(call=>call.opt.method==='DELETE'||call.opt.body?.includes?.('"trashed":true')));
  f=fixture();f.setWritable(false);await assert.rejects(f.archive.ensure('one'));assert.equal(f.srv.files.size,1);
  const invalid=new Map([[f.api.STORAGE_KEY,'not JSON']]);f=fixture([task('one')],server(),invalid);assert(f.archive.state('one').halted);assert.equal(invalid.get(f.api.STORAGE_KEY),'not JSON');
  const cleaned=f.api.folderName(task('one'),(key,id)=>({id,title:'bad/\\:*?"<>|'+ '很'.repeat(150)}));assert(!/[\\/:*?"<>|]/.test(cleaned));assert(cleaned.length<110);
  assert.equal(f.api.mimeType({name:'test.HEIC',type:''}),'image/heic');assert.equal(f.api.mimeType({name:'test.RAW',type:''}),null);
  console.log('PASS delete leaves originals untouched, unavailable/corrupt storage protection, safe folder names and file format validation');
})().catch(error=>{console.error(error);process.exitCode=1;throw error;});
