/* Quest Archive: local-first metadata, Drive-owned original images. No OAuth of its own. */
(function(root){
  'use strict';
  const STORAGE_KEY='photo-quest:quest-archive:v1';
  const API='https://www.googleapis.com/drive/v3';
  const UPLOAD='https://www.googleapis.com/upload/drive/v3';
  const FOLDER='application/vnd.google-apps.folder';
  const FIELDS='id,name,mimeType,size,createdTime,parents,appProperties,trashed';
  const CHUNK=4*1024*1024; // multiple of Drive's 256 KiB requirement
  const copy=value=>JSON.parse(JSON.stringify(value));
  const quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const tags=(kind,taskId)=>({photoQuest:'v1',kind,...(taskId?{taskId}:{})});
  const query=(kind,taskId)=>`trashed = false and appProperties has { key='photoQuest' and value='v1' } and appProperties has { key='kind' and value='${quote(kind)}' }${taskId?` and appProperties has { key='taskId' and value='${quote(taskId)}' }`:''}`;
  const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
  function folderName(task,card){
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(task.completedAt));
    const clean=value=>Array.from(String(value).normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g,'_').replace(/\s+/g,' ').trim()).slice(0,45).join('')||'自由';
    return `${day}_${clean(task.covered.subject?'不限':card('subject',task.cards.subject).title)}_${clean(task.covered.story?'不限':card('story',task.cards.story).title)}`;
  }
  function cardFileName(task){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(task.completedAt)).map(part=>[part.type,part.value]));
    return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}_quest card.png`;
  }
  function mimeType(file){
    const extension=String(file.name||'').split('.').pop().toLowerCase();
    const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'};
    return types[extension]||(['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)?file.type:null);
  }
  function questDocument(task,photos,card){
    const readable=key=>{const value=card(key,task.cards[key]);return {id:value.id,name:value.title,hint:value.hint||'',covered:task.covered[key]};};
    return {schemaVersion:1,taskId:task.id,createdAt:task.createdAt,confirmedAt:task.confirmedAt,completedAt:task.completedAt,
      camera:readable('camera'),lens:readable('frame'),time:readable('time'),subject:readable('subject'),story:readable('story'),output:readable('output'),
      shotCount:task.shotCount,locked:copy(task.locked),covered:copy(task.covered),pairingEnabled:task.pairingEnabled,
      snapshot:copy(task),photos:copy(photos),updatedAt:new Date().toISOString(),extensions:{}};
  }
  async function makePreview(blob){
    let image,url;
    try{
      if(root.createImageBitmap){try{image=await root.createImageBitmap(blob);}catch(error){/* HEIC may decode through Image on Safari */}}
      if(!image){
        url=root.URL.createObjectURL(blob);image=new root.Image();
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('此格式無法預覽'));image.src=url;});
      }
      const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
      if(!width||!height)throw Error('預覽尺寸無法讀取');
      const scale=Math.min(1,360/Math.max(width,height)),canvas=root.document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const context=canvas.getContext('2d');if(!context)throw Error('無法建立預覽');
      context.fillStyle='#FFFEFA';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!preview)throw Error('無法產生預覽');return preview;
    }finally{image?.close?.();if(url)root.URL.revokeObjectURL(url);}
  }
  function create(adapter){
    const storage=adapter.storage||root.localStorage,drive=adapter.drive;
    let records=new Map(),walksId=null,walksPromise=null,halted=false,pumping=false,scheduled=null;
    const busy=new Map(),batches=new Map();
    try{
      const saved=JSON.parse(storage.getItem(STORAGE_KEY)||'null');
      if(saved){
        if(saved.version!==1||!Array.isArray(saved.tasks))throw Error('封存資訊版本無法讀取');
        saved.tasks.forEach(value=>{
          if(!value||typeof value.taskId!=='string'||!value.taskId||value.taskId.length>100||!['pending','uploading','completed','failed'].includes(value.status)||!Array.isArray(value.photos)||!value.photos.every(photo=>validId(photo.fileId)&&typeof photo.originalName==='string'&&typeof photo.mimeType==='string'&&Number.isSafeInteger(photo.size)&&photo.size>=0))throw Error('封存資訊無法讀取');
          // Interrupted work becomes retryable. Files/session URLs are never persisted.
          records.set(value.taskId,{...value,status:value.status==='uploading'?'pending':value.status,phase:null,error:value.status==='uploading'?'上次上傳中斷；未完成照片請重新選取。':value.error||''});
        });
      }
    }catch(error){halted=true;}
    function persist(){
      if(halted)throw Error('本機封存資訊無法安全保存，請保留備份後重新整理。');
      try{storage.setItem(STORAGE_KEY,JSON.stringify({version:1,tasks:[...records.values()]}));}
      catch(error){halted=true;throw Error('本機封存資訊無法保存；任務仍保留，照片上傳已暫停。');}
    }
    const notify=id=>adapter.changed?.(id);
    function entry(id){
      if(!records.has(id))records.set(id,{taskId:id,status:'pending',phase:null,folderId:null,cardId:null,jsonId:null,photos:[],reserved:{},updatedAt:null,error:''});
      return records.get(id);
    }
    function state(id){const value=copy(entry(id));return {...value,busy:busy.has(id),batchBusy:batches.has(id),halted,connected:drive.ready()};}
    function update(id,patch){Object.assign(entry(id),patch);persist();notify(id);}
    const taskFor=id=>adapter.tasks().find(task=>task.id===id&&task.completedAt);
    function check(id){if(halted||adapter.canWrite?.()===false)throw Error('本機資料無法安全保存，已暫停封存。');if(!taskFor(id))throw Error('任務紀錄已移除，Drive 作品會保留。');if(!drive.ready())throw Error('目前離線或 Google 授權已到期，請重新連線後補傳。');}
    async function json(path,options={},accepted=[]){return (await drive.request(API+path,options,accepted)).json();}
    async function list(q){
      const files=[];let pageToken='';
      do{const result=await json('/files?'+new URLSearchParams({q,pageSize:'1000',fields:`nextPageToken,files(${FIELDS})`,...(pageToken?{pageToken}:{})}));files.push(...result.files);pageToken=result.nextPageToken||'';}while(pageToken);
      return files.sort((a,b)=>String(a.appProperties?.uploadedAt||a.createdTime).localeCompare(String(b.appProperties?.uploadedAt||b.createdTime))||a.id.localeCompare(b.id));
    }
    async function reserve(id,key){
      const value=entry(id);value.reserved=value.reserved||{};
      if(!validId(value.reserved[key])){const result=await json('/files/generateIds?count=1&space=drive&type=files');value.reserved[key]=result.ids[0];persist();}
      return value.reserved[key];
    }
    async function createFolder(name,properties,parent,id){
      const response=await drive.request(API+'/files?fields='+encodeURIComponent(FIELDS),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name,mimeType:FOLDER,parents:[parent],appProperties:properties})},[409]);
      if(response.status===409){
        const existing=await json('/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent(FIELDS));
        if(existing.trashed||existing.mimeType!==FOLDER||existing.appProperties?.kind!==properties.kind||existing.appProperties?.taskId!==properties.taskId||!existing.parents?.includes(parent))throw Error('原本封存資料夾已變更，請至 Drive 確認後再試。');
        return existing;
      }
      return response.json();
    }
    async function ensureWalks(task,parent){
      if(walksId)return walksId;
      if(walksPromise)return walksPromise;
      const run=async()=>{
        const walks=await list(query('walks')+` and '${quote(parent)}' in parents and mimeType = '${FOLDER}'`);
        if(walks.length)walksId=walks[0].id;
        else{const id=await reserve(task.id,'walks');walksId=(await createFolder('Photo Walks',tags('walks'),parent,id)).id;}
        return walksId;
      };
      walksPromise=Promise.resolve().then(()=>root.navigator?.locks?root.navigator.locks.request('photo-quest-archive-walks',run):run()).finally(()=>{walksPromise=null;});
      return walksPromise;
    }
    async function folders(task){
      const parent=drive.rootFolder();
      if(!parent)throw Error('請先完成 Google Drive 備份連線。');
      await ensureWalks(task,parent);
      let found=await list(query('quest-folder',task.id)+` and mimeType = '${FOLDER}'`);
      if(!found.length){
        const id=await reserve(task.id,'folder');
        const folder=await createFolder(folderName(task,adapter.card),tags('quest-folder',task.id),walksId,id);
        // Recovery uses tags, including a create whose response was lost before writing ID.
        found=[folder];
      }
      const canonical=found[0];
      update(task.id,{folderId:canonical.id,folderIds:found.map(value=>value.id)});
      return canonical.id;
    }
    function asPhoto(file,index){return {fileId:file.id,originalName:file.name,mimeType:file.mimeType,size:Number(file.size)||0,uploadedAt:file.appProperties?.uploadedAt||file.createdTime,order:index};}
    async function refreshFiles(task){
      const value=entry(task.id),files=await list(query('quest-photo',task.id));
      // appProperties alone aren't enough: require a matching task folder parent too.
      const photos=files.filter(file=>file.parents?.some(id=>value.folderIds.includes(id))&&Number(file.size)>0).map(asPhoto);
      update(task.id,{photos});return photos;
    }
    async function findFile(kind,task){
      const value=entry(task.id),files=await list(query(kind,task.id));
      return files.find(file=>file.parents?.some(id=>value.folderIds.includes(id))&&Number(file.size)>0)||null;
    }
    async function uploadedFile(id){
      const response=await drive.request(API+'/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent(FIELDS),{},[404]);
      return response.status===404?null:response.json();
    }
    // All media uses binary resumable chunks. Query offset after ambiguous delivery.
    async function upload(task,blob,metadata,id,existing=false,progress=()=>{}){
      const ready=await uploadedFile(id);
      if(!existing&&ready&&Number(ready.size)===blob.size){
        if(ready.trashed||ready.appProperties?.taskId!==task.id||ready.appProperties?.kind!==metadata.appProperties.kind||!ready.parents?.some(parent=>entry(task.id).folderIds.includes(parent)))throw Error('檔案 ID 與任務不符，已停止上傳。');
        progress(blob.size,blob.size);return ready;
      }
      const response=await drive.request(UPLOAD+'/files'+(existing?'/'+encodeURIComponent(id):'')+'?uploadType=resumable&fields='+encodeURIComponent(FIELDS),{
        method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':metadata.mimeType,'X-Upload-Content-Length':String(blob.size)},
        body:JSON.stringify({...metadata,...(!existing?{id,parents:[entry(task.id).folderId]}:{})})},[409]);
      if(response.status===409){const file=await uploadedFile(id);if(file&&Number(file.size)===blob.size)return file;throw Error('檔案 ID 衝突，請重新整理後再試。');}
      const session=response.headers.get('Location');if(!session)throw Error('Drive 未提供分段上傳位置。');
      let offset=0,retries=0;progress(0,blob.size);
      while(offset<blob.size){
        check(task.id);
        const end=Math.min(offset+CHUNK,blob.size);
        let result;
        try{result=await drive.request(session,{method:'PUT',headers:{'Content-Type':metadata.mimeType,'Content-Range':`bytes ${offset}-${end-1}/${blob.size}`},body:blob.slice(offset,end)},[308]);}
        catch(error){
          if(error.status&&error.status<500||!drive.ready()||++retries>3)throw error;
          result=await drive.request(session,{method:'PUT',headers:{'Content-Range':`bytes */${blob.size}`},body:new Blob([])},[308]);
        }
        if(result.status===200||result.status===201){progress(blob.size,blob.size);return result.json();}
        const range=result.headers.get('Range'),next=range?Number(range.split('-').pop())+1:0;
        if(!Number.isSafeInteger(next)||next<0||next>blob.size)throw Error('Drive 回傳的上傳進度無法讀取。');
        if(next<=offset&&++retries>3)throw Error('上傳沒有進展，請重試此照片。');
        offset=next;progress(offset,blob.size);
      }
      const file=await uploadedFile(id);if(!file||Number(file.size)!==blob.size)throw Error('尚未確認檔案完整上傳，請重試。');return file;
    }
    async function writeQuest(task){
      await refreshFiles(task);
      const existing=await findFile('quest-json',task),id=existing?.id||await reserve(task.id,'json');
      const document=questDocument(task,entry(task.id).photos,adapter.card);
      const blob=new Blob([JSON.stringify(document,null,2)],{type:'application/json'});
      const file=await upload(task,blob,{name:'quest.json',mimeType:'application/json',appProperties:tags('quest-json',task.id)},id,!!existing);
      update(task.id,{jsonId:file.id,updatedAt:document.updatedAt});
    }
    async function prepare(task){
      check(task.id);update(task.id,{status:'uploading',phase:'archive',error:''});
      await folders(task);check(task.id);
      const existing=await findFile('quest-card',task),name=cardFileName(task);
      let cardId=existing?.id;
      if(cardId&&existing.name!==name){
        const renamed=await json('/files/'+encodeURIComponent(cardId)+'?fields='+encodeURIComponent(FIELDS),{
          method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
        if(renamed.id!==cardId)throw Error('任務卡更名結果無法確認，請重試。');
      }else if(!cardId){
        const blob=await adapter.makeTaskImage(copy(task));check(task.id);
        const id=await reserve(task.id,'card');
        cardId=(await upload(task,blob,{name,mimeType:'image/png',appProperties:tags('quest-card',task.id)},id)).id;
      }
      update(task.id,{cardId,cardName:name});await writeQuest(task);check(task.id);
      update(task.id,{status:'completed',phase:null,error:''});
      return state(task.id);
    }
    function exclusive(id,run){
      if(busy.has(id))return busy.get(id);
      const work=async()=>{
        try{return await run();}
        catch(error){if(!halted){try{update(id,{status:drive.ready()?'failed':'pending',phase:null,error:error.message});}catch(savedError){notify(id);}}throw error;}
        finally{busy.delete(id);notify(id);}
      };
      // Prevent same-origin tabs racing; Drive tags recover cold-device/reload work.
      const promise=Promise.resolve().then(()=>root.navigator?.locks?root.navigator.locks.request('photo-quest-archive:'+id,work):work());
      busy.set(id,promise);notify(id);return promise;
    }
    function ensure(id){return exclusive(id,()=>{const task=taskFor(id);check(id);return prepare(copy(task));});}
    function observe(){
      if(halted)return;
      let changed=false;adapter.tasks().forEach(task=>{if(task.completedAt&&!records.has(task.id)){entry(task.id);changed=true;}});
      if(changed){try{persist();}catch(error){notify(null);}}
      schedule();
    }
    function schedule(){
      if(scheduled!==null||pumping||halted||!drive.ready())return;
      scheduled=setTimeout(()=>{scheduled=null;flush();},0);
    }
    async function flush(){
      if(pumping||halted||!drive.ready())return;pumping=true;
      try{for(const task of adapter.tasks()){
        if(!drive.ready())break;
        const value=entry(task.id);if(!task.completedAt||busy.has(task.id)||(value.status==='completed'&&value.cardName===cardFileName(task)))continue;
        try{await ensure(task.id);}catch(error){/* visible retry state; completion is never undone */}
      }}finally{pumping=false;}
    }
    function uploadPhotos(id,items,onProgress=()=>{}){
      if(batches.has(id))return batches.get(id);
      const promise=(async()=>{
        await ensure(id);
        for(const item of items){
          if(item.status==='completed')continue;
          try{
            await exclusive(id,async()=>{
              check(id);const task=copy(taskFor(id)),type=mimeType(item.file);
              if(!type||!item.file.size)throw Error('請選擇 JPEG、PNG、WebP 或 HEIC 原始照片。');
              item.status='uploading';item.error='';onProgress(item);
              update(id,{status:'uploading',phase:'photos',error:''});
              if(!item.fileId){
                // A reselected original after reload reuses its reserved ID. No file bytes
                // are stored locally; this identifies retries by name/size/lastModified.
                const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([item.file.name,item.file.size,item.file.lastModified||0])));
                const key=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
                item.fileId=await reserve(id,'photo-'+key);
              }
              const uploadedAt=new Date(entry(id).photos.reduce((at,photo)=>Math.max(at,(Date.parse(photo.uploadedAt)||0)+1),Date.now())).toISOString();
              const file=await upload(task,item.file,{name:item.file.name,mimeType:type,appProperties:{...tags('quest-photo',id),uploadedAt}},item.fileId,false,(loaded,total)=>{item.progress=Math.floor(loaded/total*100);onProgress(item);});
              if(file.appProperties?.taskId!==id)throw Error('Drive 檔案與任務不符，已停止更新索引。');
              item.status='completed';item.progress=100;onProgress(item);
              // A completed binary is discoverable even if the JSON write fails.
              await writeQuest(task);check(id);update(id,{status:'completed',phase:null,error:''});
            });
          }catch(error){if(item.status!=='completed')item.status='failed';item.error=error.message;onProgress(item);if(!drive.ready()||halted)break;}
        }
        if(!halted&&items.some(item=>item.status!=='completed'))update(id,{status:drive.ready()?'failed':'pending',phase:null,error:'部分照片尚未上傳；已成功的作品會保留，請重試剩餘檔案。'});
        return state(id);
      })().finally(()=>{batches.delete(id);notify(id);});
      batches.set(id,promise);notify(id);return promise;
    }
    async function thumbnail(id,photo){
      check(id);if(!entry(id).photos.some(value=>value.fileId===photo.fileId))throw Error('作品與任務不符');
      // Drive thumbnailLink is not intended for browser CORS use. Download a bounded
      // original via authenticated Drive media, then keep only a small local preview.
      if(photo.size>20*1024*1024)throw Error('較大的原圖請至 Google Drive 查看');
      const blob=await (await drive.request(API+'/files/'+encodeURIComponent(photo.fileId)+'?alt=media')).blob();
      if(blob.size>20*1024*1024)throw Error('較大的原圖請至 Google Drive 查看');
      check(id);return (adapter.makePreview||makePreview)(blob);
    }
    const unsubscribe=drive.subscribe(()=>{schedule();notify(null);});
    function stop(){halted=true;clearTimeout(scheduled);scheduled=null;unsubscribe();notify(null);}
    return {observe,state,ensure,flush,uploadPhotos,thumbnail,stop,storageKey:STORAGE_KEY};
  }
  root.PhotoQuestArchive={create,folderName,cardFileName,questDocument,mimeType,STORAGE_KEY};
})(typeof window==='undefined'?globalThis:window);
