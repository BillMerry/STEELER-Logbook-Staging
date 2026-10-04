// Store only changed passages, and ignore sync/audit bookkeeping when deciding what is undoable.
const passageUndoState={undo:[],redo:[],applying:false,coalescing:false,limit:40,bytes:24*1024*1024};
function resetPassageUndo(){passageUndoState.undo=[];passageUndoState.redo=[];passageUndoState.coalescing=false;updateUndoButtons();}
function updateUndoButtons(){
  const u=document.getElementById('undoPassageBtn'),r=document.getElementById('redoPassageBtn');
  if(u)u.disabled=!passageUndoState.undo.length;if(r)r.disabled=!passageUndoState.redo.length;
}
function undoComparable(value){
  if(value?.deleted===true)return null;
  if(Array.isArray(value))return value.filter(v=>v?.deleted!==true).map(undoComparable);
  if(value&&typeof value==='object'){
    const result={};
    for(const key of Object.keys(value).sort()){
      if(['syncDirty','syncStatus','dirtyAt','updatedAt','lastModifiedDeviceId','deletedAt','schemaVersion'].includes(key))continue;
      if(key==='deleted'&&value[key]===false)continue;
      result[key]=undoComparable(value[key]);
    }
    return result;
  }
  return value??null;
}
function sameUndoValue(a,b){return JSON.stringify(undoComparable(a))===JSON.stringify(undoComparable(b));}
function recordPassageUndo(before,after){
  if(passageUndoState.applying||suppressLocalSyncTracking||before===after)return;
  const old=new Map(JSON.parse(before||'[]').map(p=>[p.id,p]));
  const next=new Map(JSON.parse(after).map(p=>[p.id,p]));
  const changes=[...new Set([...old.keys(),...next.keys()])].filter(id=>!sameUndoValue(old.get(id),next.get(id))).map(id=>({id,before:old.get(id)||null,after:next.get(id)||null}));
  if(!changes.length)return;
  const previous=passageUndoState.undo.at(-1);
  if(passageUndoState.coalescing&&previous){
    for(const change of changes){const prior=previous.changes.find(c=>c.id===change.id);if(prior)prior.after=change.after;else previous.changes.push(change);}
    previous.changes=previous.changes.filter(c=>!sameUndoValue(c.before,c.after));
    if(!previous.changes.length)passageUndoState.undo.pop();
  }else passageUndoState.undo.push({changes});
  passageUndoState.coalescing=true;queueMicrotask(()=>{passageUndoState.coalescing=false;});
  passageUndoState.redo=[];
  while(passageUndoState.undo.length>passageUndoState.limit||(passageUndoState.undo.length>1&&JSON.stringify(passageUndoState.undo).length>passageUndoState.bytes))passageUndoState.undo.shift();
  updateUndoButtons();
}
function applyPassageUndo(redo=false){
  const source=redo?passageUndoState.redo:passageUndoState.undo,target=redo?passageUndoState.undo:passageUndoState.redo;
  const item=source.at(-1);if(!item)return;
  const saved=JSON.parse(storage.getItem(STORAGE_KEY)||'[]'),byId=new Map(saved.map(p=>[p.id,p]));
  if(item.changes.some(c=>!sameUndoValue(byId.get(c.id),c.after))){resetPassageUndo();alert('A passage has changed since this action. Undo history has been cleared.');return;}
  const restored=JSON.parse(JSON.stringify(saved));const selectedBefore=currentPassageId;
  passageUndoState.applying=true;
  try{
    for(const c of item.changes){
      const old=byId.get(c.id),p=c.before?JSON.parse(JSON.stringify(c.before)):{...old,deleted:true,deletedAt:nowIso()};
      // Preserve tombstones for entries introduced by the action being undone.
      const oldEntries=new Map((old?.entries||[]).map(e=>[e.id,e]));
      p.entries=p.entries||[];const ids=new Set(p.entries.map(e=>e.id));
      for(const e of old?.entries||[])if(!ids.has(e.id))p.entries.push({...e,deleted:true,deletedAt:nowIso()});
      for(const e of p.entries)if(!sameUndoValue(e,oldEntries.get(e.id)))markLogEntryDirty(e,p,{deleted:e.deleted===true});
      markPassageDirty(p,nowIso(),redo?'redo':'undo');
      const idx=restored.findIndex(r=>r.id===p.id);if(idx<0)restored.push(p);else restored[idx]=p;
      if(old?.deleted&&!p.deleted)currentPassageId=p.id;
    }
    passages=restored;
    if(!passages.some(p=>p.id===currentPassageId&&!p.deleted))currentPassageId=getFirstActivePassage()?.id||null;
    if(!savePassages()){passages=saved;currentPassageId=selectedBefore;throw new Error('Undo could not be saved. Free device storage and retry.');}
    loadPassageIntoUI();refreshHomePassageList();
    const persisted=new Map(JSON.parse(storage.getItem(STORAGE_KEY)).map(p=>[p.id,p]));
    source.pop();target.push({changes:item.changes.map(c=>({id:c.id,before:byId.get(c.id)||null,after:persisted.get(c.id)||null}))});
  }catch(e){alert(e.message);}
  finally{passageUndoState.applying=false;updateUndoButtons();}
}
function validatedEngineHoursText(start,end){
  const a=String(start??'').trim(),b=String(end??'').trim();
  if(!a||!b||a==='–'||b==='–')return '–';
  if(/^\d+\.\d$/.test(a)&&/^\d+\.\d$/.test(b)&&Number(b)>=Number(a))return `${(Number(b)-Number(a)).toFixed(1)} h`;
  return `${a}→${b}`;
}
function loadNarrativeEditor(p){
  const n=document.getElementById('captainsNarrative'),t=document.getElementById('passageTags');
  if(!n||!t)return;n.value=p?.captainsNarrative?.text||'';t.value=(p?.tags||[]).join(', ');
  n.dataset.passageId=p?.id||'';
  document.getElementById('narrativeStatus').textContent=p?.captainsNarrative?.status==='reviewed'?'Reviewed':n.value?'Draft for review':'';
  document.getElementById('narrativeMessage').textContent='';
  const host=document.getElementById('narrativeSources');host.replaceChildren();
  for(const source of p?.enrichmentSources||[]){const el=document.createElement('pre');el.textContent=[source.date,...(source.sources||[]),source.originalNotes].filter(Boolean).join('\n');host.appendChild(el);}
}
function saveNarrativeEditor(reviewed=false){
  const p=getCurrentPassage(),n=document.getElementById('captainsNarrative'),t=document.getElementById('passageTags');if(!p||n.dataset.passageId!==p.id)return;
  const text=n.value.trim(),tags=STEELER.enrichment.tags(t.value),previous=STEELER.enrichment.memory(p);
  if(!reviewed&&previous.narrative===text&&JSON.stringify(previous.tags)===JSON.stringify(tags))return;
  p.captainsNarrative={...p.captainsNarrative,text,status:reviewed?'reviewed':'draft',updatedAt:nowIso()};p.tags=tags;
  markPassageDirty(p,nowIso(),'narrative-edit');savePassages();
  document.getElementById('narrativeStatus').textContent=reviewed?'Reviewed':'Draft for review';
  updatePlanSummaryPanel();refreshHomePassageList();
}
const NARRATIVE_CONFIG_KEY='steeler_narrative_connection_v1';
function narrativeConfig(){try{return JSON.parse(localStorage.getItem(NARRATIVE_CONFIG_KEY)||'{}');}catch{return {};}}
let narrativeBusy=false;
async function generateNarrative(p){
  if(!p||p.deleted||narrativeBusy)return;
  const cfg=narrativeConfig();
  if(!cfg.url||!cfg.token){alert('Set up the AI connection in Settings → Data & Backup → Narratives and enrichment batches.');return;}
  if(!navigator.onLine){alert('You are offline. Saved narratives and manual editing still work; try drafting when connected.');return;}
  const before=JSON.stringify(STEELER.enrichment.memory(p));
  narrativeBusy=true;
  const button=document.getElementById('narrativeGenerate');button.disabled=true;
  document.getElementById('narrativeMessage').textContent='Preparing draft…';
  try{
    const url=new URL(cfg.url);if(url.protocol!=='https:')throw new Error('The AI service must use HTTPS.');
    const body=JSON.stringify({passage:STEELER.enrichment.aiContext(p)});
    if(body.length>120000)throw new Error('This passage has too much context for one draft. Use a reviewed batch instead.');
    const res=await fetch(url.origin+url.pathname.replace(/\/$/,'')+'/v1/narrative',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.token},body,signal:AbortSignal.timeout(60000)});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'The AI service could not create a draft.');
    if(typeof data.narrative!=='string'||!Array.isArray(data.tags)||!data.tags.every(t=>typeof t==='string'))throw new Error('The AI returned an invalid draft.');
    if(!passages.includes(p)||p.deleted||JSON.stringify(STEELER.enrichment.memory(p))!==before)throw new Error('The passage changed while drafting. Nothing was replaced; try again.');
    showNarrativeDraft(p,data,before);
  }catch(e){alert(e.message||'Drafting failed; your existing narrative is unchanged.');}
  finally{narrativeBusy=false;button.disabled=false;document.getElementById('narrativeMessage').textContent='';}
}
function showNarrativeDraft(p,data,before){
  const dialog=document.createElement('dialog');dialog.className='narrative-draft-dialog';
  const h=document.createElement('h3');h.textContent='Review AI draft — '+(p.plan?.date||'');dialog.appendChild(h);
  const textarea=document.createElement('textarea');textarea.rows=12;textarea.value=data.narrative;textarea.setAttribute('aria-label','AI narrative draft');dialog.appendChild(textarea);
  const tagInput=document.createElement('input');tagInput.value=STEELER.enrichment.tags(data.tags).join(', ');tagInput.setAttribute('aria-label','Draft tags');dialog.appendChild(tagInput);
  const save=document.createElement('button');save.type='button';save.className='btn btn-primary';save.textContent='Use this draft';
  save.onclick=()=>{
    if(!passages.includes(p)||p.deleted||JSON.stringify(STEELER.enrichment.memory(p))!==before){alert('The passage changed. Generate a fresh draft before replacing it.');return;}
    p.captainsNarrative={text:textarea.value.trim(),status:'draft',origin:'ai',updatedAt:nowIso()};p.tags=STEELER.enrichment.tags([...(p.tags||[]),...STEELER.enrichment.tags(tagInput.value)]);
    markPassageDirty(p,nowIso(),'ai-draft');savePassages();if(currentPassageId===p.id){loadNarrativeEditor(p);updatePlanSummaryPanel();}refreshHomePassageList();dialog.close();
  };
  const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-secondary';cancel.textContent='Keep existing narrative';cancel.onclick=()=>dialog.close();
  dialog.append(save,cancel);dialog.onclose=()=>dialog.remove();document.body.appendChild(dialog);dialog.showModal();
}
function offerPreviousNarrative(previous){
  if(!previous||previous.deleted||!activeLogEntries(previous).length||narrativeConfig().offer===false)return;
  if(!narrativeConfig().url)return;
  if(confirm('Draft the narrative and tags for '+(previous.plan?.date||'the previous passage')+', including its whole stay? You can review the draft before using it.'))generateNarrative(previous);
}
function renderEnrichmentPreview(rows){
  const host=document.getElementById('enrichmentPreview');host.replaceChildren();
  const summary=document.createElement('p');summary.textContent=`${rows.filter(r=>r.status==='ready').length} ready, ${rows.filter(r=>r.status==='conflict').length} different narratives, ${rows.filter(r=>r.status==='unchanged').length} already present, ${rows.filter(r=>r.status==='unavailable').length} unavailable. Deleted passages are never restored.`;host.appendChild(summary);
  const choices=[];
  for(const row of rows.filter(r=>r.status==='ready'||r.status==='conflict')){
    const div=document.createElement('div');div.className='enrichment-preview-row';const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=row.status==='ready';label.append(check,document.createTextNode(` ${row.date} ${row.from} → ${row.to}${row.status==='conflict'?' — replace different narrative':''}`));
    const details=document.createElement('details'),title=document.createElement('summary');title.textContent='Compare narrative and tags';details.appendChild(title);const text=document.createElement('pre');text.textContent='Current:\n'+(row.current?.narrative||'(none)')+'\n\nIncoming:\n'+row.narrative+'\n\nTags: '+row.tags.join(', ');details.appendChild(text);div.append(label,details);host.appendChild(div);choices.push({row,check});
  }
  if(!choices.length)return;
  const apply=document.createElement('button');apply.type='button';apply.className='btn btn-primary';apply.textContent='Apply selected enrichment';apply.onclick=()=>{
    const selected=choices.filter(c=>c.check.checked).map(c=>c.row);if(!selected.length)return;
    if(!confirm(`Apply narrative/tag enrichment to ${selected.length} passages? A safety backup will download first. Selected different narratives will be replaced; readings and entries stay unchanged.`))return;
    try{
      const copy=JSON.parse(JSON.stringify(passages));for(const row of selected)STEELER.enrichment.apply(row,copy.find(p=>p.id===row.id));
      exportBackup();
      for(const row of selected){const p=passages.find(p=>p.id===row.id);STEELER.enrichment.apply(row,p);markPassageDirty(p,nowIso(),'enrichment-batch');}
      savePassages();loadPassageIntoUI();refreshHomePassageList();host.textContent=`Applied to ${selected.length} passages. Undo is available.`;
    }catch(e){alert(e.message);}
  };host.appendChild(apply);
}
document.getElementById('undoPassageBtn')?.addEventListener('click',()=>applyPassageUndo());
document.getElementById('redoPassageBtn')?.addEventListener('click',()=>applyPassageUndo(true));
document.addEventListener('keydown',e=>{
  if(!(e.metaKey||e.ctrlKey)||e.key.toLowerCase()!=='z'||e.altKey)return;
  if(e.target.closest('input,textarea,[contenteditable=true],dialog,.modal:not(.hidden)'))return;
  e.preventDefault();applyPassageUndo(e.shiftKey);
});
document.getElementById('captainsNarrative')?.addEventListener('change',()=>saveNarrativeEditor());
document.getElementById('passageTags')?.addEventListener('change',()=>saveNarrativeEditor());
document.getElementById('narrativeReviewed')?.addEventListener('click',()=>saveNarrativeEditor(true));
document.getElementById('narrativeGenerate')?.addEventListener('click',()=>{saveNarrativeEditor();generateNarrative(getCurrentPassage());});
document.getElementById('enrichmentImportBtn')?.addEventListener('click',()=>document.getElementById('enrichmentFile').click());
document.getElementById('enrichmentFile')?.addEventListener('change',async e=>{
  try{const file=e.target.files[0];if(!file)return;if(file.size>25000000)throw new Error('Choose a backup smaller than 25 MB.');renderEnrichmentPreview(STEELER.enrichment.preview(JSON.parse(await file.text()),passages));}catch(err){alert(err.message);}finally{e.target.value='';}
});
const initialNarrativeConfig=narrativeConfig();
document.getElementById('narrativeServiceUrl').value=initialNarrativeConfig.url||'';
document.getElementById('narrativeServiceToken').value=initialNarrativeConfig.token||'';
document.getElementById('narrativeOffer').checked=initialNarrativeConfig.offer!==false;
document.getElementById('narrativeConfigSave')?.addEventListener('click',()=>{
  const url=document.getElementById('narrativeServiceUrl').value.trim(),token=document.getElementById('narrativeServiceToken').value.trim();
  try{if(url&&new URL(url).protocol!=='https:')throw new Error('Use an HTTPS service URL.');
    if(/^sk-/.test(token))throw new Error('This is an OpenAI API key. Put it on the server, not in this field.');
    localStorage.setItem(NARRATIVE_CONFIG_KEY,JSON.stringify({url,token,offer:document.getElementById('narrativeOffer').checked}));document.getElementById('narrativeConnectionStatus').textContent='Connection saved on this device.';
  }catch(e){alert(e.message);}
});
