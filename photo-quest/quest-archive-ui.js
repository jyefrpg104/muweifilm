/* Task details only: previews and File objects stay in memory, never in backups. */
(function(root){
  'use strict';
  function create(adapter){
    const {archive,drive,el,escapeHTML:escape}=adapter;
    const selections=new Map(),thumbnails=new Map();
    const visible=new Set();
    let active=null,limit=24,galleryKey='',notice='',view=0,lastConnected=false,loading=0;
    const observer=root.IntersectionObserver?new root.IntersectionObserver(entries=>{entries.forEach(value=>{if(value.isIntersecting)visible.add(value.target.dataset.fileId);});render();},{root:el('recordDialog'),rootMargin:'100px'}):null;
    function items(id){if(!selections.has(id))selections.set(id,[]);return selections.get(id);}
    function clearThumbnails(){view++;observer?.disconnect();visible.clear();thumbnails.forEach(value=>{if(value.url)URL.revokeObjectURL(value.url)});thumbnails.clear();galleryKey='';}
    function clearSelection(id){items(id).forEach(value=>URL.revokeObjectURL(value.url));selections.delete(id);}
    function renderSelection(){
      if(!active)return;
      const values=items(active.id),state=archive.state(active.id);
      el('archiveSelection').innerHTML=values.map((value,index)=>`<div class="archive-selected"><img src="${escape(value.url)}" alt="" data-preview="${index}"><div><strong>${escape(value.file.name)}</strong><small>${(value.file.size/1024/1024).toFixed(1)} MB · ${value.status==='completed'?'已上傳':value.status==='uploading'?`上傳中 ${value.progress||0}%`:value.status==='failed'?'上傳失敗':'等待確認'}</small>${value.error?`<small class="archive-error">${escape(value.error)}</small>`:''}<progress max="100" value="${value.progress||0}" aria-label="${escape(value.file.name)}上傳進度" ${value.status==='uploading'?'':'hidden'}></progress>${value.status==='failed'?`<button class="btn btn-outline" type="button" data-retry="${index}">重試此照片</button>`:''}</div></div>`).join('');
      el('archiveSelection').querySelectorAll('img').forEach(image=>{image.onerror=()=>{image.hidden=true;};});
      el('archiveSelection').querySelectorAll('[data-retry]').forEach(button=>button.disabled=state.batchBusy||state.busy||!state.connected||state.halted);
      const waiting=values.some(value=>value.status!=='completed');
      el('archiveUpload').hidden=!waiting;el('archiveUpload').disabled=state.batchBusy||state.busy||!state.connected||state.halted;
      el('archiveClear').hidden=!values.length;el('archiveClear').disabled=state.batchBusy||state.busy;
      el('archiveUpload').textContent=values.some(value=>value.status==='failed')?'重試未完成照片':'確認上傳';
    }
    function render(){
      el('archiveWorks').hidden=!active?.completedAt;if(!active?.completedAt)return;
      const id=active.id,state=archive.state(id);
      if(state.connected&&!lastConnected)thumbnails.forEach((value,key)=>{if(value.failed)thumbnails.delete(key);});
      lastConnected=state.connected;
      const status=state.status==='uploading'?state.phase==='photos'?'正在上傳照片':'正在建立任務檔案':state.status==='completed'?'已保存至 Google Drive':state.status==='failed'?'上傳失敗':'尚未同步 · 待雲端封存';
      el('archiveStatus').textContent=state.halted?'封存已暫停':status;
      el('archiveNotice').textContent=notice||state.error||(!state.connected?'任務已保存在本機；連接 Google Drive 後可補傳。':'照片保留原始檔案，不壓縮。HEIC 預覽依瀏覽器支援。');
      el('archiveCount').textContent=state.photos.length?`已保存 ${state.photos.length} 張攝影作品`:'尚未上傳攝影作品';
      el('archivePick').textContent=state.photos.length?'＋ 新增照片':'＋ 上傳照片';
      el('archivePick').disabled=state.batchBusy||state.halted;
      el('archiveConnect').hidden=state.connected;el('archiveConnect').disabled=state.halted;
      el('archiveRetry').hidden=state.status==='completed'||state.status==='uploading';el('archiveRetry').disabled=!state.connected||state.busy||state.batchBusy||state.halted;
      el('archiveDrive').hidden=!state.folderId;
      if(state.folderId)el('archiveDrive').href='https://drive.google.com/drive/folders/'+encodeURIComponent(state.folderId);
      const shown=state.photos.slice(0,limit),key=JSON.stringify([id,shown.map(value=>value.fileId)]);
      if(key!==galleryKey){
        galleryKey=key;
        observer?.disconnect();
        el('archiveGallery').innerHTML=shown.map(photo=>`<a class="archive-photo" href="https://drive.google.com/file/d/${encodeURIComponent(photo.fileId)}/view" target="_blank" rel="noopener noreferrer"><span class="archive-thumb" data-file-id="${escape(photo.fileId)}">預覽載入中</span><span>${escape(photo.originalName)}</span><small>開啟 Google Drive ↗</small></a>`).join('');
        el('archiveGallery').querySelectorAll('.archive-thumb').forEach(node=>observer?.observe(node));
      }
      el('archiveMore').hidden=state.photos.length<=limit;
      const nodes=el('archiveGallery').querySelectorAll('.archive-thumb');
      shown.forEach((photo,index)=>{
        const node=nodes[index];if(!node)return;
        let cache=thumbnails.get(photo.fileId);
        if(cache?.url){if(!node.querySelector('img')){const image=document.createElement('img');image.src=cache.url;image.alt=photo.originalName;image.loading='lazy';image.onerror=()=>{node.textContent='無法預覽';};node.replaceChildren(image);}return;}
        if(cache?.failed){node.textContent='無法預覽';return;}
        if(!state.connected){node.textContent='連線後顯示預覽';return;}
        if(cache||loading>=2||(observer&&!visible.has(photo.fileId)))return;
        cache={};thumbnails.set(photo.fileId,cache);const generation=view;
        loading++;
        archive.thumbnail(id,photo).then(blob=>{if(generation!==view)return;cache.url=URL.createObjectURL(blob);}).catch(()=>{if(generation!==view)return;cache.failed=true;}).finally(()=>{loading--;render();});
      });
      renderSelection();
    }
    function show(task){
      clearThumbnails();active=task;limit=24;notice='';render();
      if(task.completedAt&&archive.state(task.id).connected)archive.ensure(task.id).catch(()=>{});
    }
    async function upload(values){
      if(!active?.completedAt)return;const id=active.id;
      notice='';render();
      try{
        await archive.uploadPhotos(id,values,()=>{if(active?.id===id)renderSelection();});
        if(active?.id===id){const all=values.every(value=>value.status==='completed');notice=all&&archive.state(id).status==='completed'?'照片已保存至 Google Drive。':'部分上傳未完成；已上傳的照片會保留，可重試剩餘檔案。';}
      }catch(error){if(active?.id===id)notice=error.message;}
      if(active?.id!==id)clearSelection(id);
      render();
    }
    el('archivePick').addEventListener('click',()=>{if(!active)return;el('archiveFiles').value='';el('archiveFiles').click();});
    el('archiveFiles').addEventListener('change',event=>{
      if(!active)return;const values=items(active.id);let rejected=0;
      Array.from(event.target.files||[]).forEach(file=>{
        if(!root.PhotoQuestArchive.mimeType(file)||!file.size){rejected++;return;}
        // Prevent double selecting a still-pending file. Completed files may be added again deliberately.
        if(values.some(value=>value.status!=='completed'&&value.file.name===file.name&&value.file.size===file.size&&value.file.lastModified===file.lastModified))return;
        values.push({file,url:URL.createObjectURL(file),status:'selected',progress:0,error:'',fileId:null});
      });notice=rejected?'部分檔案格式不支援；請選擇 JPEG、PNG、WebP 或 HEIC。':'';render();
    });
    el('archiveUpload').addEventListener('click',()=>active&&upload(items(active.id)));
    el('archiveSelection').addEventListener('click',event=>{const button=event.target.closest('[data-retry]');if(button&&active){const item=items(active.id)[Number(button.dataset.retry)];if(item)upload([item]);}});
    el('archiveClear').addEventListener('click',()=>{if(active){clearSelection(active.id);notice='';render();}});
    el('archiveConnect').addEventListener('click',()=>drive.connect());
    el('archiveRetry').addEventListener('click',()=>{if(active){notice='';archive.ensure(active.id).catch(()=>{});}});
    el('archiveMore').addEventListener('click',()=>{limit+=24;render();});
    el('recordDialog').addEventListener('close',()=>{const id=active?.id;active=null;clearThumbnails();if(id&&!archive.state(id).batchBusy)clearSelection(id);});
    function changed(){if(active&&el('recordDialog').open)render();}
    return {show,changed};
  }
  root.PhotoQuestArchiveUI={create};
})(typeof window==='undefined'?globalThis:window);
