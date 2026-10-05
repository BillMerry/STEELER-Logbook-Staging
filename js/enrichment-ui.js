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
  if(!cfg.url||!cfg.token){alert('Set up the AI connection in Settings → Narratives & AI.');return;}
  if(!navigator.onLine){alert('You are offline. Saved narratives and manual editing still work; try drafting when connected.');return;}
  const before=JSON.stringify(STEELER.enrichment.memory(p));
  narrativeBusy=true;
  const button=document.getElementById('narrativeGenerate');button.disabled=true;
  document.getElementById('narrativeMessage').textContent='Preparing draft…';
  try{
    const url=new URL(cfg.url);if(url.protocol!=='https:')throw new Error('The AI service must use HTTPS.');
    const body=JSON.stringify({passage:STEELER.enrichment.aiContext(p),preferences:narrativePreferences()});
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
  const summary=document.createElement('p');summary.textContent='Preview only: choose narratives/tags and new log entries below. Existing entries, passage totals and deleted records are preserved. Possible corrections are review notes only.';host.appendChild(summary);
  const choices=[];
  for(const row of rows){
    const div=document.createElement('div');div.className='enrichment-preview-row';
    const heading=document.createElement('h4');heading.textContent=`${row.date} ${row.from} → ${row.to}`;div.appendChild(heading);
    const memory=document.createElement('input');memory.type='checkbox';memory.checked=row.memoryStatus==='ready';memory.disabled=['unavailable','unchanged'].includes(row.memoryStatus);
    const label=document.createElement('label');label.append(memory,document.createTextNode(row.memoryStatus==='conflict'?' Replace different narrative and merge tags':row.memoryStatus==='unavailable'?' Passage unavailable — nothing will be imported':row.memoryStatus==='unchanged'?' Narrative/tags already present':' Import narrative and tags'));div.appendChild(label);
    const details=document.createElement('details'),title=document.createElement('summary');title.textContent='Compare narrative and tags';details.appendChild(title);const text=document.createElement('pre');text.textContent='Current:\n'+(row.current?.narrative||'(none)')+'\n\nIncoming:\n'+(row.narrative||'(none)')+'\n\nTags: '+row.tags.join(', ');details.appendChild(text);div.appendChild(details);
    const entries=[];
    for(const item of row.entryPreview){
      const check=document.createElement('input');check.type='checkbox';check.checked=item.status==='new';check.disabled=item.status!=='new';
      const el=document.createElement('label');el.append(check,document.createTextNode(`${item.entry.time} · leg ${item.entry.leg+1} · ${item.status==='new'?'New entry':item.reason}`));div.appendChild(el);
      const preview=document.createElement('pre');preview.textContent=Object.entries(item.entry).filter(([key])=>!['id','enrichment','leg','time'].includes(key)).map(([key,value])=>`${key}: ${value}`).join('\n');div.appendChild(preview);entries.push({check,id:item.entry.id});
    }
    for(const correction of row.possibleCorrections){const note=document.createElement('p');note.className='hint';note.textContent='Possible correction — review only: '+correction;div.appendChild(note);}
    host.appendChild(div);choices.push({row,memory,entries});
  }
  if(!choices.some(c=>!c.memory.disabled||c.entries.some(e=>!e.check.disabled)))return;
  const apply=document.createElement('button');apply.type='button';apply.className='btn btn-primary';apply.textContent='Apply selected enrichment';
  apply.onclick=()=>{
    const selected=choices.map(c=>({...c,options:{memory:!c.memory.disabled&&c.memory.checked,entryIds:c.entries.filter(e=>!e.check.disabled&&e.check.checked).map(e=>e.id)}})).filter(c=>c.options.memory||c.options.entryIds.length);if(!selected.length)return;
    if(!confirm(`Apply enrichment to ${selected.length} passages, including ${selected.reduce((n,c)=>n+c.options.entryIds.length,0)} new log entries? A safety backup will download first. Existing entries and passage totals will not be replaced.`))return;
    try{
      // Flush the current form before checking stale previews, then validate all changes on a copy.
      const backup=createDataBackupPayload();
      const copy=JSON.parse(JSON.stringify(passages));
      const additions=selected.map(c=>{const p=copy.find(p=>p.id===c.row.id);return {p,added:STEELER.enrichment.apply(c.row,p,c.options)};});
      downloadJsonPayload(backup,'STEELER-Before-enrichment-backup');
      for(const {p,added} of additions){for(const e of added)markLogEntryDirty(e,p);markPassageDirty(p,nowIso(),'enrichment-batch');}
      const old=passages;passages=copy;if(!savePassages()){passages=old;throw new Error('The batch could not be saved. Nothing was applied.');}
      loadPassageIntoUI();refreshHomePassageList();host.textContent=`Applied to ${selected.length} passages. Undo is available.`;
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

const NARRATIVE_PREFS_KEY='steeler_narrative_preferences_v1';
const suggestedNarrativePreferences={
  background:'My name is Bill and my boat is STEELER. The logbook is both a passage record and a personal account of our time aboard. People and boats mentioned in our records include Frank and Sandi aboard ST34 Skylark, and Martin and Janet aboard ST34 Inca. Include them only when the passage records establish that they were present. STEELER received lithium battery upgrades in October 2025. Her fuel gauge can remain full for several readings before dropping and then settling; do not infer unusual consumption from that alone.',
  style:'Write in natural British English, using I or we as supported by the entry. Keep the tone informal and personal; never call me “the owner”. Use flowing prose in short paragraphs separated by a blank line. Bring together the passage and the whole stay, using the Daily Summaries for visits, meals, people and memorable events. Mention weather and tides where relevant, distinguishing experienced conditions from forecasts. Keep short records concise. Do not invent feelings, encounters or events, and preserve uncertainty.',
  terminology:'STW means speed through water; GPS log readings are distance over ground. In paired paper-log distance readings the upper is usually through water and the lower GPS, but do not reinterpret existing structured readings. RDV means rendezvous/encounter in my notes. ERU refers to an engine run without a passage. Use the recorded passage timezone. Do not infer dates of maintenance or participants from background knowledge. No preferred example narrative has been selected yet.'
};
function narrativePreferences(){try{const p=JSON.parse(localStorage.getItem(NARRATIVE_PREFS_KEY)||'null');return p&&typeof p==='object'?{background:String(p.background||''),style:String(p.style||''),terminology:String(p.terminology||'')}:null;}catch{return null;}}
function loadNarrativePreferences(){
  const saved=narrativePreferences(),p=saved||suggestedNarrativePreferences;
  for(const key of ['background','style','terminology'])document.getElementById('narrativePref_'+key).value=p[key];
  document.getElementById('narrativePrefsStatus').textContent=saved?'Saved preferences are included with each AI draft.':'Suggested starting text — review and save before it is used by the AI.';
}
document.getElementById('saveNarrativePreferences').addEventListener('click',()=>{
  const p={};for(const key of ['background','style','terminology'])p[key]=document.getElementById('narrativePref_'+key).value.trim();
  if(Object.values(p).some(v=>v.length>6000)){alert('Keep each preferences section below 6,000 characters.');return;}
  if(saveLocalStorageItem(NARRATIVE_PREFS_KEY,JSON.stringify(p),'narrative preferences'))document.getElementById('narrativePrefsStatus').textContent='Saved. These preferences will accompany future AI drafts and are included in backup and sync.';
});
loadNarrativePreferences();
