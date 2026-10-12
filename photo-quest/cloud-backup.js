/* Photo Quest personal Drive backup. Access tokens remain in memory only. */
(function(root){
  'use strict';
  const CLIENT_ID='579396068050-tl6uftta9310m7mh4t8fas3l6s3gg7do.apps.googleusercontent.com';
  const SCOPE='https://www.googleapis.com/auth/drive.file';
  // Pin the personal account without publishing its email address in the site.
  const ACCOUNT_HASH='361ae93b206b1070d6a5d0cfa08bece7c503e85ceac86cc4fab144828d04eff5';
  const CONNECTION_KEY='photo-quest:drive:connection:v1';
  const API='https://www.googleapis.com/drive/v3';
  const UPLOAD='https://www.googleapis.com/upload/drive/v3';
  const fingerprint=task=>JSON.stringify([task.pairingEnabled,task.cards,task.covered]);
  const stableBackup=value=>JSON.stringify([value.current,value.archived,value.favorites,value.deletedArchives]);
  const eventKey=event=>JSON.stringify([event.type,event.id]);
  const newer=(a,b)=>!b||a.at>b.at||(a.at===b.at&&String(a.by)>String(b.by));
  const clone=value=>JSON.parse(JSON.stringify(value));
  async function accountMatches(email){
    const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(email||'').trim().toLowerCase()));
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')===ACCOUNT_HASH;
  }
  function backupDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function validMeta(value){
    if(!value||typeof value.deviceId!=='string'||!value.deviceId||value.deviceId.length>100||!Array.isArray(value.events)||value.events.length>30000)throw Error('雲端同步資訊無法讀取，尚未覆寫任何資料。');
    if(![value.currentAt,value.updatedAt].every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('雲端同步時間無法讀取。');
    const seen=new Set();
    const events=value.events.map(event=>{
      if(!event||!['archive','favorite'].includes(event.type)||typeof event.id!=='string'||!event.id||event.id.length>2048||!Number.isSafeInteger(event.at)||event.at<0||typeof event.by!=='string'||event.by.length>100||typeof event.deleted!=='boolean'||seen.has(eventKey(event)))throw Error('雲端刪除或復原資訊無法讀取。');
      seen.add(eventKey(event));return {type:event.type,id:event.id,at:event.at,by:event.by,deleted:event.deleted};
    });
    return {deviceId:value.deviceId,currentAt:value.currentAt,updatedAt:value.updatedAt,events};
  }
  function seedMeta(backup,deviceId,currentAt=0){
    const at=Date.parse(backup.exportedAt)||currentAt;
    const events=[
      ...backup.archived.map(task=>({type:'archive',id:task.id,at:Date.parse(task.completedAt)||0,by:deviceId,deleted:false})),
      ...backup.favorites.map(entry=>({type:'favorite',id:fingerprint(entry.task),at:Date.parse(entry.savedAt)||0,by:deviceId,deleted:false})),
      ...backup.deletedArchives.filter(id=>!backup.archived.some(task=>task.id===id)).map(id=>({type:'archive',id,at,by:deviceId,deleted:true}))
    ];
    const unique=new Map();events.forEach(event=>{if(newer(event,unique.get(eventKey(event))))unique.set(eventKey(event),event)});
    return {deviceId,currentAt,updatedAt:at,events:[...unique.values()]};
  }
  // Per-device files retain concurrent writes even if two devices race on latest.json.
  function mergeBundles(bundles){
    const events=new Map(),archives=new Map(),favorites=new Map();let current=null,currentAt=-1,currentBy='';
    bundles.forEach(bundle=>{
      bundle.cloudSync.events.forEach(event=>{const key=eventKey(event);if(newer(event,events.get(key)))events.set(key,event)});
      bundle.archived.forEach(task=>{const old=archives.get(task.id);if(!old||Date.parse(task.completedAt)>Date.parse(old.completedAt))archives.set(task.id,task)});
      bundle.favorites.forEach(entry=>{const key=fingerprint(entry.task),old=favorites.get(key);if(!old||Date.parse(entry.savedAt)>Date.parse(old.savedAt))favorites.set(key,entry)});
      const at=bundle.cloudSync.currentAt,by=bundle.cloudSync.deviceId;
      if(bundle.current&&(at>currentAt||(at===currentAt&&by>currentBy))){current=bundle.current;currentAt=at;currentBy=by;}
    });
    const deletedArchives=[];
    events.forEach(event=>{if(event.deleted){if(event.type==='archive'){archives.delete(event.id);deletedArchives.push(event.id)}else favorites.delete(event.id)}});
    return {current,currentAt,archived:[...archives.values()].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)),favorites:[...favorites.values()].sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt)),deletedArchives,events:[...events.values()]};
  }
  function create(adapter){
    const storage=adapter.storage||root.localStorage,net=adapter.fetch||root.fetch.bind(root);
    const uuid=()=>root.crypto?.randomUUID?.()||`pq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let meta=adapter.initialMeta?validMeta(adapter.initialMeta):null;
    const deviceId=meta?.deviceId||uuid();
    let baseline=adapter.initialBackup?clone(adapter.initialBackup):null;
    if(!meta&&baseline)meta=seedMeta(baseline,deviceId,adapter.initialSavedAt||0);
    if(!meta)meta={deviceId,currentAt:0,updatedAt:0,events:[]};
    let remembered=false,lastSyncedAt=null;
    try{const saved=JSON.parse(storage.getItem(CONNECTION_KEY)||'null');remembered=saved?.enabled===true;lastSyncedAt=saved?.lastSyncedAt||null}catch(error){}
    let accessToken=null,expiresAt=0,authClient=null,authPending=false,libraryLoading=false,ready=false,authGeneration=0;
    let syncing=false,dirty=true,timer=null,retryTimer=null,retries=0,epoch=0,controller=null,revision=0,blocked=false;
    let message='',folderId=null,latestFileId=null,ownFileId=null,cloudCurrent=null;
    const archiveControllers=new Set(),listeners=new Set();
    let accountVerified=false;
    const isOnline=()=>adapter.online?adapter.online():root.navigator.onLine!==false;
    const persistConnection=()=>{try{storage.setItem(CONNECTION_KEY,JSON.stringify({enabled:remembered,lastSyncedAt}))}catch(error){}};
    const usableToken=()=>accessToken&&Date.now()<expiresAt;
    function render(){
      let status='未連線',detail='任務先保存在此裝置。連接後，自動備份到你的 Google Drive。';
      if(blocked){status='同步已暫停';detail='另一個頁面已更新資料，請重新整理後再同步。'}
      else if(message){status='尚未同步';detail=message;}
      else if(authPending){status='等待 Google 授權';detail='請在 Google 視窗完成連線。'}
      else if(syncing){status='同步中';detail='正在合併雲端紀錄並備份最新資料…';}
      else if(remembered&&!isOnline()){status='尚未同步 · 離線';detail='資料已保存在此裝置，連線後會補傳。';}
      else if(remembered&&!usableToken()){status='需要重新連線';detail='按「重新連線」後，會補傳此裝置的最新資料。';}
      else if(remembered&&dirty){status='尚未同步';detail='資料已保存在此裝置，準備同步到 Google Drive。';}
      else if(remembered){status='已同步';detail=lastSyncedAt?`上次同步：${new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(lastSyncedAt))}`:'已連接 Google Drive。';}
      adapter.render({status,detail,remembered,connected:!!usableToken(),busy:authPending||syncing,loading:libraryLoading,restoreAvailable:!!cloudCurrent&&!syncing&&!authPending,folderId});
      listeners.forEach(listener=>listener());
    }
    function metadata(){return clone(meta)}
    function stamp(){return Math.max(Date.now(),meta.updatedAt+1,...meta.events.map(event=>event.at+1))}
    function observe(backup,fromCloud=false){
      if(!baseline){baseline=clone(backup);meta=seedMeta(backup,deviceId,0);return metadata();}
      if(stableBackup(backup)!==stableBackup(baseline)){
        if(!fromCloud){
          const at=stamp(),events=new Map(meta.events.map(event=>[eventKey(event),event]));
          if(JSON.stringify(backup.current)!==JSON.stringify(baseline.current))meta.currentAt=at;
          ['archive','favorite'].forEach(type=>{
            const list=value=>type==='archive'?value.archived.map(task=>task.id):value.favorites.map(entry=>fingerprint(entry.task));
            const before=new Set(list(baseline)),after=new Set(list(backup));
            new Set([...before,...after]).forEach(id=>{if(before.has(id)!==after.has(id)){const event={type,id,at,by:deviceId,deleted:!after.has(id)};events.set(eventKey(event),event)}});
            if(type==='archive')backup.deletedArchives.forEach(id=>{if(!baseline.deletedArchives.includes(id)&&!after.has(id)){const event={type,id,at,by:deviceId,deleted:true};events.set(eventKey(event),event)}});
          });
          meta.events=[...events.values()];meta.updatedAt=at;
        }
        revision++;dirty=true;baseline=clone(backup);
      }
      if(ready&&!fromCloud)schedule();render();return metadata();
    }
    function schedule(delay=1200){
      clearTimeout(timer);if(!ready||!remembered||!usableToken()||!isOnline()||blocked||syncing)return;
      timer=setTimeout(()=>sync(),delay);
    }
    function guard(generation){if(generation!==epoch)throw new DOMException('已停止同步','AbortError')}
    async function request(path,options={},generation=epoch,upload=false){
      guard(generation);
      const timeout=setTimeout(()=>controller?.abort(),30000);
      let response;
      try{response=await net((upload?UPLOAD:API)+path,{...options,headers:{...options.headers,Authorization:`Bearer ${accessToken}`},signal:controller?.signal})}finally{clearTimeout(timeout)}
      guard(generation);
      if(response.status===401){accessToken=null;expiresAt=0;throw Error('Google 連線已到期，請按「重新連線」後補傳。');}
      if(!response.ok){if(response.status===403)throw Error('Google Drive 尚未允許存取。請確認授權與 Drive 儲存空間，再重新連線。');throw Error(`Google Drive 暫時無法同步（${response.status}），資料仍保存在此裝置。`);}
      const body=await response.text();guard(generation);
      if(body.length>10*1024*1024)throw Error('雲端備份超過 10 MB，已停止合併。');
      return body?JSON.parse(body):null;
    }
    async function list(q,generation){
      const files=[];let pageToken='';
      do{const value=await request('/files?'+new URLSearchParams({q,pageSize:'1000',fields:'nextPageToken,files(id,name,appProperties,modifiedTime,createdTime)',...(pageToken?{pageToken}:{})}),{},generation);files.push(...value.files);pageToken=value.nextPageToken||'';if(files.length>2000)throw Error('雲端備份檔案過多，已暫停同步。')}while(pageToken);
      return files;
    }
    const tagQuery=kind=>`trashed = false and appProperties has { key='photoQuest' and value='v1' } and appProperties has { key='kind' and value='${kind}' }`;
    async function upload(id,name,kind,payload,generation,extra={}){
      const boundary='pq_'+uuid().replace(/[^a-z0-9]/gi,'');
      const metadata={name,mimeType:'application/json',appProperties:{photoQuest:'v1',kind,...extra},...(!id?{parents:[folderId]}:{})};
      const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
      return request(`/files${id?'/'+encodeURIComponent(id):''}?uploadType=multipart&fields=id`,{method:id?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body},generation,true);
    }
    async function dailySnapshot(payload,generation){
      const day=backupDay(),files=await list(tagQuery('snapshot'),generation);
      // One immutable copy on the first successful sync of each active day.
      if(!files.some(file=>file.appProperties?.day===day))await upload(null,`photo-quest-${day}.json`,'snapshot',payload,generation,{day});
      const cutoff=new Date(Date.parse(day+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
      for(const file of files){const date=file.appProperties?.day;if(/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&date<cutoff)await request(`/files/${encodeURIComponent(file.id)}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})},generation);}
    }
    function parseCloud(raw){
      const parsed=adapter.parseBackup(raw),backup={...raw,...parsed};
      const cloudSync=raw.cloudSync?validMeta(raw.cloudSync):seedMeta(backup,'legacy',Date.parse(raw.exportedAt)||0);
      // Every present record must have a non-deleted event or a newer deletion.
      const keys=new Set(cloudSync.events.map(event=>eventKey(event)));
      const seeded=seedMeta(backup,cloudSync.deviceId,cloudSync.currentAt);
      seeded.events.forEach(event=>{if(!keys.has(eventKey(event)))cloudSync.events.push(event)});
      return {...backup,cloudSync};
    }
    async function sync(){
      if(syncing||blocked||authPending)return false;
      if(!remembered||!usableToken()||!isOnline()){render();return false;}
      if(!adapter.canSync()){message='此裝置目前無法安全保存資料，請先匯出本機備份。';render();return false;}
      clearTimeout(timer);clearTimeout(retryTimer);syncing=true;message='';controller=new AbortController();const generation=epoch;
      render();
      const run=async()=>{
        guard(generation);
        const folders=await list(tagQuery('folder'),generation);folderId=folders.sort((a,b)=>String(a.createdTime).localeCompare(String(b.createdTime)))[0]?.id;
        if(!folderId){const folder=await request('/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Photo Quest',mimeType:'application/vnd.google-apps.folder',appProperties:{photoQuest:'v1',kind:'folder'}})},generation);folderId=folder.id;}
        const deviceFiles=await list(tagQuery('device'),generation),latestFiles=await list(tagQuery('latest'),generation);
        if(deviceFiles.length>50)throw Error('同步來源超過 50 個裝置，已暫停合併。');
        latestFileId=latestFiles[0]?.id||null;ownFileId=deviceFiles.find(file=>file.appProperties?.deviceId===deviceId)?.id||null;
        const remote=[];
        for(const file of [...deviceFiles,...latestFiles])remote.push(parseCloud(await request(`/files/${encodeURIComponent(file.id)}?alt=media`,{},generation)));
        guard(generation);
        // Read live local state after downloads: edits made during a request must win.
        const local={...adapter.getBackup(),cloudSync:metadata()},merged=mergeBundles([...remote,local]);
        meta.events=merged.events;meta.updatedAt=Math.max(meta.updatedAt,...merged.events.map(event=>event.at));
        cloudCurrent=merged.current;
        adapter.applyMerged(merged);guard(generation);
        if(!adapter.canSync())throw Error('合併後無法保存在此裝置，已暫停上傳；請先匯出備份。');
        const own={...adapter.getBackup(),cloudSync:metadata()},writeRevision=revision;
        const result=await upload(ownFileId,`device-${deviceId}.json`,'device',own,generation,{deviceId});ownFileId=result.id;
        const latest={...own,current:merged.current||own.current,cloudSync:{...own.cloudSync,currentAt:merged.currentAt>=0?merged.currentAt:own.cloudSync.currentAt}};
        latestFileId=(await upload(latestFileId,'latest.json','latest',latest,generation)).id;
        await dailySnapshot(latest,generation);
        lastSyncedAt=new Date().toISOString();dirty=writeRevision!==revision;retries=0;persistConnection();adapter.saveMetadata();return true;
      };
      try{return await (root.navigator?.locks?root.navigator.locks.request('photo-quest-drive-sync',run):run())}
      catch(error){if(generation===epoch){dirty=true;message=error.name==='AbortError'?'網路回應逾時，最新資料仍在此裝置，稍後會重試。':error.message;if(usableToken()&&isOnline()&&retries<3){retryTimer=setTimeout(()=>sync(),[5000,15000,45000][retries++])}}return false;}
      finally{if(generation===epoch){syncing=false;controller=null;render();if(dirty&&!message)schedule();}}
    }
    function initializeAuth(){
      if(!root.google?.accounts?.oauth2)return false;
      authClient=root.google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,include_granted_scopes:false,
        callback:async response=>{
          const generation=authGeneration;if(generation!==epoch)return;authPending=false;
          if(response.error||!response.access_token){message='Google 未完成授權，任務仍保存在此裝置。';render();return;}
          accessToken=response.access_token;expiresAt=Date.now()+Math.max(0,Number(response.expires_in)-60)*1000;controller=new AbortController();
          try{
            if(!root.google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE))throw Error('需要允許 Photo Quest 使用自己的 Drive 檔案，才能同步。');
            const about=await request('/about?fields=user(emailAddress)',{},generation);
            if(!await accountMatches(about.user?.emailAddress))throw Error('這是你的個人版本，請使用設定時的 Google 帳號連線。');
            guard(generation);
            accountVerified=true;remembered=true;message='';persistConnection();controller=null;render();await sync();
          }catch(error){if(generation===epoch){accessToken=null;expiresAt=0;controller=null;message=error.message;render();}}
        },error_callback:error=>{if(authGeneration!==epoch)return;authPending=false;message=error.type==='popup_failed_to_open'?'Google 視窗未開啟，請允許此網站的彈出視窗，再按一次連線。':'Google 連線已取消，任務仍保存在此裝置。';render();}
      });return true;
    }
    function loadAuth(){
      if(initializeAuth())return;
      libraryLoading=true;render();
      const script=root.document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      script.onload=()=>{libraryLoading=false;if(!initializeAuth())message='Google 連線工具尚未載入，請重新整理後再試。';render()};
      script.onerror=()=>{libraryLoading=false;message='Google 連線工具無法載入，請確認網路後重新整理。';render()};
      root.document.head.append(script);
    }
    function connect(){
      if(blocked||authPending||syncing)return;
      if(!isOnline()){message='目前沒有網路，請連線後再連接 Google Drive。';render();return;}
      if(!authClient&&!initializeAuth()){message='Google 連線工具尚未載入，請稍後再按一次。';render();return;}
      epoch++;authGeneration=epoch;accountVerified=false;message='';authPending=true;render();
      try{authClient.requestAccessToken({prompt:remembered?'':'consent'})}catch(error){authPending=false;message='無法開啟 Google 連線，請稍後再試。';render();}
    }
    function disconnect(){
      accountVerified=false;archiveControllers.forEach(value=>value.abort());
      epoch++;controller?.abort();controller=null;clearTimeout(timer);clearTimeout(retryTimer);
      accessToken=null;expiresAt=0;remembered=false;authPending=false;syncing=false;message='';folderId=null;cloudCurrent=null;persistConnection();render();
    }
    function start(){ready=true;render();loadAuth();}
    function networkChanged(){message='';render();if(isOnline())schedule(0);}
    function externalChange(){blocked=true;epoch++;controller?.abort();archiveControllers.forEach(value=>value.abort());syncing=false;clearTimeout(timer);clearTimeout(retryTimer);render();}
    function restoreCurrent(){if(cloudCurrent)adapter.requestRestore(clone(cloudCurrent));}
    // Archive requests share verified OAuth, but never share the backup AbortController.
    // No token is exposed to the archive module or persisted in browser storage.
    function archiveReady(){return !!(accountVerified&&remembered&&usableToken()&&isOnline()&&!blocked&&folderId);}
    async function archiveRequest(url,options={},accepted=[]){
      const target=new URL(url,API+'/');
      if(target.origin!=='https://www.googleapis.com'||!/^\/(?:upload\/)?drive\/v3\//.test(target.pathname))throw Error('不支援的 Drive 請求');
      if(!archiveReady())throw Error(blocked?'另一個頁面已更新資料，請重新整理。':!isOnline()?'目前離線，任務已保存在本機。':'請先重新連接 Google Drive。');
      const generation=epoch,abort=new AbortController();archiveControllers.add(abort);
      const timeout=setTimeout(()=>abort.abort(),60000);
      try{
        const response=await net(target.href,{...options,headers:{...options.headers,Authorization:`Bearer ${accessToken}`},signal:abort.signal});
        guard(generation);
        if(response.status===401){accessToken=null;expiresAt=0;accountVerified=false;message='Google 連線已到期，請重新連線後補傳。';render();throw Error(message);}
        if(!response.ok&&!accepted.includes(response.status)){const error=Error(`Google Drive 上傳失敗（${response.status}）`);error.status=response.status;throw error;}
        // Materialize the body before clearing timeout; binary images remain binary.
        const blob=await response.blob();guard(generation);
        return {status:response.status,ok:response.ok,headers:response.headers,blob:async()=>blob,text:()=>blob.text(),json:async()=>JSON.parse(await blob.text())};
      }finally{clearTimeout(timeout);archiveControllers.delete(abort);}
    }
    const archiveTransport={ready:archiveReady,rootFolder:()=>archiveReady()?folderId:null,request:archiveRequest,
      subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener)}};
    return {observe,metadata,start,connect,disconnect,sync,networkChanged,externalChange,restoreCurrent,archiveTransport};
  }
  root.PhotoQuestDrive={create,mergeBundles,validMeta,seedMeta,fingerprint};
})(typeof window==='undefined'?globalThis:window);

