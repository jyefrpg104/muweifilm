const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const account='owner@example.com';
const source=readFileSync(__dirname+'/../photo-quest/cloud-backup.js','utf8').replace(/const ACCOUNT_HASH='[a-f0-9]+'/,"const ACCOUNT_HASH='"+require('node:crypto').createHash('sha256').update(account).digest('hex')+"'");
const task=(id,completed=false)=>({id,createdAt:'2026-10-10T08:00:00.000Z',confirmedAt:null,completedAt:completed?'2026-10-10T09:00:00.000Z':null,shotCount:completed?3:0,pairingEnabled:true,cards:{subject:id},locked:{},covered:{}});
const backup=(current=task('current'),archived=[],favorites=[],deletedArchives=[])=>({format:'photo-quest-backup',version:2,exportedAt:'2026-10-12T06:00:00.000Z',current,archived,favorites,deletedArchives});
const clone=x=>JSON.parse(JSON.stringify(x));
function server(){
  const files=new Map();let next=1;const calls=[];let email=account,fail=0,hook=null;
  function add(kind,payload,extra={}){const id=String(next++);files.set(id,{id,name:kind,appProperties:{photoQuest:'v1',kind,...extra},createdTime:'2026-10-12T00:00:00Z',payload:clone(payload)});return id;}
  const response=(data,status=200)=>({ok:status===200,status,text:async()=>JSON.stringify(data)});
  async function fetch(url,opt={}){
    calls.push({url,opt});if(hook)await hook(url,opt);if(fail)return response({},fail);
    const parsed=new URL(url),path=parsed.pathname;
    if(path.endsWith('/about'))return response({user:{emailAddress:email}});
    if(opt.method==='POST'||opt.method==='PATCH'){
      if(parsed.hostname!=='www.googleapis.com')throw Error('Unexpected destination');
      let data,payload;
      if(parsed.searchParams.get('uploadType')){
        const parts=opt.body.split('\r\n\r\n');data=JSON.parse(parts[1].split('\r\n--')[0]);payload=JSON.parse(parts[2].split('\r\n--')[0]);
      }else data=JSON.parse(opt.body);
      const id=opt.method==='PATCH'?path.split('/').pop():String(next++);
      const old=files.get(id)||{};files.set(id,{...old,...data,id,payload:payload||old.payload,createdTime:old.createdTime||'2026-10-12T00:00:00Z'});return response({id});
    }
    if(parsed.searchParams.get('alt')==='media')return response(files.get(path.split('/').pop()).payload);
    const q=parsed.searchParams.get('q')||'',kind=q.match(/key='kind' and value='([^']+)'/)[1];
    return response({files:[...files.values()].filter(file=>file.appProperties.kind===kind&&!file.trashed).map(({payload,...file})=>file)});
  }
  return {files,calls,add,fetch,setEmail:x=>email=x,setFailure:x=>fail=x,setHook:x=>hook=x};
}
function fixture(value=backup(),srv=server(),options={}){
  let local=clone(value),state={},auth,authPromise,clock=Date.parse('2026-10-12T06:00:00Z'),online=true,saved=true,restored=null;
  const store=new Map(),timers=new Map();let timerId=0;
  if(options.remembered)store.set('photo-quest:drive:connection:v1',JSON.stringify({enabled:true}));
  const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  class TestDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock}}
  const context={console,Date:TestDate,Intl,JSON,Map,Set,URL,URLSearchParams,AbortController,DOMException,TextEncoder,Uint8Array,crypto:{subtle:require('node:crypto').webcrypto.subtle,randomUUID:()=>options.device||'device-local'},navigator:{onLine:true},setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),google:{accounts:{oauth2:{initTokenClient:config=>{auth=config;return {requestAccessToken:()=>{if(options.manualAuth)return;authPromise=config.callback({access_token:'test-token',expires_in:3600})}}},hasGrantedAllScopes:()=>true}}}};
  vm.createContext(context);vm.runInContext(source,context);
  let drive;
  drive=context.PhotoQuestDrive.create({storage,fetch:srv.fetch,online:()=>online,initialBackup:options.fresh?null:local,initialSavedAt:clock-100,initialMeta:options.meta,
    getBackup:()=>clone(local),parseBackup:raw=>{if(raw.format!=='photo-quest-backup'||!Array.isArray(raw.archived)||!Array.isArray(raw.favorites)||!Array.isArray(raw.deletedArchives))throw Error('invalid backup');return clone(raw)},canSync:()=>saved,
    applyMerged:data=>{local={...local,archived:clone(data.archived),favorites:clone(data.favorites),deletedArchives:clone(data.deletedArchives)};drive.observe(local,true)},saveMetadata:()=>{},render:data=>state=data,requestRestore:value=>restored=value});
  drive.observe(local);drive.start();
  return {drive,srv,context,store,timers,get state(){return state},get local(){return local},get auth(){return auth},get restored(){return restored},setOnline:value=>online=value,setSaved:value=>saved=value,
    change:fn=>{clock+=10;fn(local);drive.observe(local)},connect:async()=>{drive.connect();await authPromise},tick:delay=>{for(const [id,item]of timers){if(item.delay===delay){timers.delete(id);item.fn();return true}}return false},api:context.PhotoQuestDrive};
}
(async()=>{
  let f=fixture(backup(task('current'),[task('old',true)]));
  await f.connect();assert.equal(f.state.status,'已同步');assert.equal(f.srv.files.size,4);assert(![...f.store.values()].join().includes('test-token'));
  const latest=()=>[...f.srv.files.values()].find(x=>x.appProperties.kind==='latest').payload;
  f.change(value=>{value.archived=[];value.deletedArchives=['old']});assert.equal(f.state.status,'尚未同步');await f.drive.sync();assert.equal(latest().archived.length,0);assert(latest().deletedArchives.includes('old'));
  f.change(value=>{value.archived=[task('old',true)];value.deletedArchives=[]});await f.drive.sync();assert.equal(latest().archived.length,1);assert.equal(latest().deletedArchives.length,0);
  const favorite={id:'fav',savedAt:'2026-10-12T06:00:00Z',task:task('favorite')};f.change(value=>value.favorites=[favorite]);await f.drive.sync();f.change(value=>value.favorites=[]);await f.drive.sync();assert.equal(latest().favorites.length,0);
  f.setOnline(false);f.change(value=>value.current.shotCount=2);assert.equal(f.state.status,'尚未同步 · 離線');const count=f.srv.calls.length;await f.drive.sync();assert.equal(f.srv.calls.length,count);
  f.setOnline(true);f.drive.networkChanged();assert(f.tick(0));await new Promise(resolve=>setImmediate(resolve));assert.equal(latest().current.shotCount,2);
  f.srv.setFailure(401);await f.drive.sync();assert.equal(f.state.connected,false);assert.match(f.state.detail,/到期/);f.srv.setFailure(0);await f.connect();assert.equal(f.state.status,'已同步');
  f.drive.disconnect();const writes=f.srv.calls.length;f.change(value=>value.current.shotCount=3);await f.drive.sync();assert.equal(f.srv.calls.length,writes);assert.equal(f.srv.files.size,4);
  console.log('PASS initial backup, deletion, undo, favorites, offline retry, expiry, disconnect; no persisted access token');

  const srv=server();srv.setEmail('someone-else@gmail.com');f=fixture(backup(),srv);await f.connect();assert.equal(srv.files.size,0);assert.match(f.state.detail,/個人版本/);
  f=fixture(backup(),server(),{manualAuth:true});f.drive.connect();f.drive.disconnect();await f.auth.callback({access_token:'late-token',expires_in:3600});assert.equal(f.srv.files.size,0);
  f=fixture();f.setSaved(false);await f.connect();assert.equal(f.srv.files.size,0);assert.match(f.state.detail,/安全保存/);
  f=fixture();await f.connect();f.drive.externalChange();const before=f.srv.calls.length;await f.drive.sync();assert.equal(f.srv.calls.length,before);assert.match(f.state.detail,/另一個頁面/);
  console.log('PASS wrong account, cancelled OAuth, unavailable local storage, multi-tab pause');

  f=fixture();const api=f.api;const a=backup(task('A'),[task('one',true)]),b=backup(task('B'),[task('two',true)]);
  a.cloudSync=api.seedMeta(a,'A',100);b.cloudSync=api.seedMeta(b,'B',200);
  let merged=api.mergeBundles([a,b]);assert.equal(merged.archived.length,2);assert.equal(merged.current.id,'B');
  const deletion=clone(a);deletion.archived=[];deletion.cloudSync.events=[{type:'archive',id:'one',at:Date.now()+1000,by:'A',deleted:true}];
  merged=api.mergeBundles([a,b,deletion]);assert.deepEqual(Array.from(merged.archived,x=>x.id),['two']);
  const undo=clone(a);undo.cloudSync.events=[{type:'archive',id:'one',at:Date.now()+2000,by:'A',deleted:false}];merged=api.mergeBundles([a,b,deletion,undo]);assert.equal(merged.archived.length,2);
  assert.throws(()=>api.validMeta({...a.cloudSync,events:[{type:'archive',id:'bad',at:'invalid'}]}));
  console.log('PASS concurrent-device union, current selection, remote deletion/undo, malformed metadata');

  const remoteServer=server();remoteServer.add('folder',null);const remote=backup(task('remote'),[task('remote-archive',true)]);remote.cloudSync=api.seedMeta(remote,'remote',200);remoteServer.add('device',remote,{deviceId:'remote'});
  f=fixture(backup(task('local'),[task('local-archive',true)]),remoteServer,{fresh:true});
  let edited=false;remoteServer.setHook(async(url,opt)=>{if(url.includes('alt=media')&&!edited){edited=true;f.change(value=>value.current.shotCount=4)}});await f.connect();assert.equal(f.local.archived.length,2);assert.equal(f.local.current.id,'local');assert.equal(f.local.current.shotCount,4);
  f.drive.restoreCurrent();assert.equal(f.restored.shotCount,4);
  const own=[...remoteServer.files.values()].find(x=>x.appProperties.deviceId==='device-local');assert.equal(own.payload.current.shotCount,4);
  assert.equal(remoteServer.files.get('2').payload.current.id,'remote');
  console.log('PASS edits during download, local current preservation, per-device backup, explicit cloud restore');

  f=fixture();const old=f.srv.add('snapshot',backup(),{day:'2026-09-01'}),recent=f.srv.add('snapshot',backup(),{day:'2026-10-11'}),unrelated=f.srv.add('manual',backup());
  await f.connect();assert.equal(f.srv.files.get(old).trashed,true);assert(!f.srv.files.get(recent).trashed);assert(!f.srv.files.get(unrelated).trashed);
  const snapshot=[...f.srv.files.values()].find(x=>x.appProperties.kind==='snapshot'&&x.appProperties.day==='2026-10-12');const content=JSON.stringify(snapshot.payload);
  f.change(value=>value.current.shotCount=9);await f.drive.sync();assert.equal(JSON.stringify(snapshot.payload),content);assert.equal([...f.srv.files.values()].filter(x=>x.appProperties.day==='2026-10-12').length,1);
  console.log('PASS immutable daily copy, 30-calendar-day retention, no unrelated file deletion');
})().catch(error=>{console.error(error);process.exitCode=1});
