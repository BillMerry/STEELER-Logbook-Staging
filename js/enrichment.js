// Enrichment adds reviewed memories and new observations; existing operational fields are preserved.
(function(root){
  const clone = value => JSON.parse(JSON.stringify(value));
  function tags(value){
    const seen=new Set();
    return (Array.isArray(value)?value:String(value||'').split(/[,;\n]/)).map(v=>String(v).trim()).filter(v=>v&&!seen.has(v.toLowerCase())&&seen.add(v.toLowerCase()));
  }
  function extract(notes){
    const text=String(notes||'');
    if(!/(?:Deck-log|Logbook) enrichment — Batch \d+/.test(text)) return null;
    const match=text.match(/Captain[’']s Narrative(?: \(AI draft\))?:\s*([\s\S]*?)\nSuggested tags:\s*([^\n]*)/);
    if(!match||!match[1].trim())return null;
    const sources=[...text.matchAll(/^Sources?:\s*(.*)$/gm)].map(m=>m[1]);
    return {text:match[1].trim(),tags:tags(match[2].replace(/\.$/,'')),sources,
      clean:stripSources(text.replace(match[0],'').replace(/^(?:Deck-log|Logbook) enrichment — Batch \d+\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trim())};
  }
  function migrate(p){
    if(!p||p.deleted)return false;
    let changed=false;
    for(const ds of p.plan?.dailySummaries||[]){
      if(ds.deleted)continue;
      if(p.id==='p_hist_steeler_2025-03-27'){
        const cleaned=String(ds.notes||'').replace(/Paper return logs read 0\.98 through water and 1\.11 GPS, unlike the backup’s 1 and 0\.55; held for review, not changed\.?/g,'').trim();
        if(cleaned!==String(ds.notes||'').trim()){ds.notes=cleaned;changed=true;}
      }
      const found=extract(ds.notes);
      if(!found){if(p.enrichmentSources?.length){const clean=stripSources(ds.notes);if(clean!==ds.notes){p.enrichmentSources.push({dailySummaryId:ds.id,date:ds.date,sources:[],originalNotes:ds.notes});ds.notes=clean;changed=true;}}continue;}
      // Never discard a second or edited narrative in the notes if a dedicated one differs.
      if(p.captainsNarrative?.text && p.captainsNarrative.text!==found.text)continue;
      p.captainsNarrative=p.captainsNarrative||{text:found.text,status:'draft',origin:'legacy-enrichment'};
      p.tags=tags([...(p.tags||[]),...found.tags]);
      p.enrichmentSources=p.enrichmentSources||[];
      if(!p.enrichmentSources.some(s=>s.dailySummaryId===ds.id&&s.originalNotes===ds.notes)){
        p.enrichmentSources.push({dailySummaryId:ds.id,date:ds.date,sources:found.sources,originalNotes:ds.notes});
      }
      ds.notes=found.clean;changed=true;
    }
    for(const e of p.entries||[]){
      if(e.deleted||!e.notes)continue;
      const cleaned=stripSources(e.notes);
      if(cleaned!==e.notes){e.enrichment={...e.enrichment,originalNotes:e.enrichment?.originalNotes||e.notes};e.notes=cleaned;changed=true;}
    }
    return changed;
  }
  function memory(p){return {narrative:p.captainsNarrative?.text||'',tags:tags(p.tags||[])};}
  function stripSources(text){
    const original=String(text||'');
    const clean=original.replace(/\bSources?:\s*(?:Book|Deck[ -]log|Logbook)[^\n]*?\.pdf\b\.?/gi,'').replace(/^Sources?:[^\n]*(?:\bbook\b|\blog\b|\.pdf)[^\n]*$/gmi,'');
    return clean===original?original:clean.replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  }
  const entryFields=['time','leg','entryType','notes','lat','lon','course','cog','speed','rpm','engTP','waterLog','groundLog','fuelUsed','engineHours','engineHoursStart','engineHoursEnd','fuelStartPercentR','fuelStartPercentC','fuelEndPercentR','fuelEndPercentC','pob'];
  function cleanEntry(raw){
    if(!raw||typeof raw.sourceId!=='string'||!raw.sourceId.trim()||raw.sourceId.length>300)throw new Error('Each batch log entry needs a stable sourceId.');
    if(typeof raw.time!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)?$/.test(raw.time)||!Number.isFinite(Date.parse(raw.time)))throw new Error('Each batch log entry needs a complete, valid date and time.');
    if(new Date(raw.time.slice(0,10)).toISOString().slice(0,10)!==raw.time.slice(0,10)||Number(raw.time.slice(11,13))>23||Number(raw.time.slice(14,16))>59)throw new Error('Invalid entry date or time.');
    if(!Number.isInteger(raw.leg)||raw.leg<0)throw new Error('Each batch log entry needs a zero-based leg number.');
    if(raw.entryType&&!['manual','engine-start','slip','dock','shutdown'].includes(raw.entryType))throw new Error('Unsupported batch entry type.');
    for(const field of entryFields){if(raw[field]!=null&&!['string','number'].includes(typeof raw[field]))throw new Error('Invalid entry field: '+field);}
    for(const [field,limit] of [['lat',90],['lon',180]])if(raw[field]!=null&&raw[field]!==''&&(!Number.isFinite(Number(raw[field]))||Math.abs(Number(raw[field]))>limit))throw new Error('Invalid '+field+' coordinate; use decimal degrees.');
    for(const field of ['course','cog','speed','rpm','waterLog','groundLog','fuelUsed','engineHours','engineHoursStart','engineHoursEnd','fuelStartPercentR','fuelStartPercentC','fuelEndPercentR','fuelEndPercentC','pob'])if(raw[field]!=null&&raw[field]!==''&&!Number.isFinite(Number(raw[field])))throw new Error('Uncertain '+field+' reading: keep it in notes for review.');
    const e={};for(const field of entryFields)if(raw[field]!=null)e[field]=raw[field];
    e.entryType=e.entryType||'manual';e.notes=stripSources(e.notes);
    e.id='enriched:'+encodeURIComponent(raw.sourceId);
    e.enrichment={sourceId:raw.sourceId,originalNotes:String(raw.notes||'')};
    return e;
  }
  function candidates(file){
    const compact=file?.format==='steeler-enrichment-batch';
    if(compact&&(file.version!==1||typeof file.batchId!=='string'||!file.batchId.trim()))throw new Error('Unsupported enrichment batch version or missing batchId.');
    const records=compact?file.passages:file?.format==='steeler-data-backup'?file.data?.passages:null;
    if(!Array.isArray(records))throw new Error('Choose a STEELER enrichment batch or data backup.');
    const seen=new Set();
    return records.filter(p=>p&&!p.deleted).map(raw=>{
      if(typeof raw.id!=='string'||!raw.id||seen.has(raw.id))throw new Error('The file contains missing or duplicate passage identifiers.');seen.add(raw.id);
      const p=clone(raw);if(!compact)migrate(p);
      if(compact&&p.narrative!=null&&typeof p.narrative!=='string')throw new Error('Narrative must be text.');
      if(compact&&p.entries!=null&&!Array.isArray(p.entries))throw new Error('Batch entries must be a list.');
      if(p.possibleCorrections!=null&&(!Array.isArray(p.possibleCorrections)||!p.possibleCorrections.every(v=>typeof v==='string')))throw new Error('Possible corrections must be review notes.');
      const ids=new Set();const entries=compact?(p.entries||[]).map(raw=>{const e=cleanEntry(raw);if(ids.has(e.id))throw new Error('Duplicate sourceId within a passage.');ids.add(e.id);e.enrichment.batchId=file.batchId;return e;}):[];
      return {id:p.id,date:compact?p.date||'':p.plan?.date||'',from:compact?p.from||'':p.plan?.from||'',to:compact?p.to||'':p.plan?.to||'',narrative:compact?stripSources(p.narrative):memory(p).narrative,tags:tags(p.tags||[]),sources:Array.isArray(p.enrichmentSources)?p.enrichmentSources:[],entries,possibleCorrections:p.possibleCorrections||[]};
    }).filter(p=>p.narrative||p.tags.length||p.entries.length||p.possibleCorrections.length);
  }
  function entryClock(t,zone='Europe/London'){
    const value=String(t||'');
    if(!/(?:Z|[+-]\d\d:\d\d)$/.test(value))return value.slice(0,16);
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }
  function sameTime(a,b,zone){return entryClock(a,zone)===entryClock(b,zone);}
  function eventType(e){return e.entryType||(/^engine start/i.test(e.notes||'')?'engine-start':/^slipped lines/i.test(e.notes||'')?'slip':/^(alongside|docked)/i.test(e.notes||'')?'dock':/^shutdown/i.test(e.notes||'')?'shutdown':'manual');}
  function passageContextGuard(p){return JSON.stringify([p?.plan?.date,p?.plan?.timeZone,p?.plan?.from,p?.plan?.to,p?.plan?.transitPorts]);}
  function preview(file,passages){
    const byId=new Map(passages.map(p=>[p.id,p]));
    return candidates(file).map(c=>{
      const p=byId.get(c.id),current=p&&!p.deleted?memory(p):null;
      const mergedTags=tags([...(current?.tags||[]),...c.tags]);
      const memoryStatus=!current?'unavailable':current.narrative&&c.narrative&&current.narrative!==c.narrative?'conflict':current.narrative===(c.narrative||current.narrative)&&JSON.stringify(current.tags)===JSON.stringify(mergedTags)?'unchanged':'ready';
      const legs=Math.max(1,(p?.plan?.transitPorts||[]).filter(t=>String(t?.name??t??'').trim()).length+(p?.plan?.to?1:0));
      const entries=c.entries.map((e,i)=>{
        const existing=(p?.entries||[]).find(old=>old.id===e.id||old.enrichment?.sourceId===e.enrichment.sourceId);
        let status=!current?'unavailable':existing?'present':e.leg>=legs?'conflict':'new';
        let reason=existing?(existing.deleted?'Previously deleted; will not be restored.':'Already imported; current edits are preserved.'):e.leg>=legs?'Leg number is outside the existing passage.':'';
        if(status==='new'&&((p.entries||[]).some(old=>(old.leg??0)===e.leg&&sameTime(old.time,e.time,p?.plan?.timeZone))||c.entries.slice(0,i).some(old=>old.leg===e.leg&&sameTime(old.time,e.time,p?.plan?.timeZone)))){status='conflict';reason='An entry already uses this time and leg; review manually to avoid duplication.';}
        if(status==='new'&&e.entryType!=='manual'&&[...(p.entries||[]),...c.entries.slice(0,i)].some(old=>(old.leg??0)===e.leg&&eventType(old)===e.entryType)){status='conflict';reason='This leg already has this movement event; review any timing difference separately.';}
        if(status==='new')for(const field of ['groundLog','waterLog','fuelUsed','engineHours','engineHoursEnd']){
          if(e[field]==null||e[field]==='')continue;
          const last=(p.entries||[]).filter(old=>!old.deleted&&(old.leg??0)===e.leg&&old[field]!=null&&old[field]!=='').sort((a,b)=>entryClock(a.time,p.plan?.timeZone).localeCompare(entryClock(b.time,p.plan?.timeZone))).at(-1);
          if(last&&entryClock(e.time,p.plan?.timeZone)>=entryClock(last.time,p.plan?.timeZone)&&Number(e[field])!==Number(last[field])){status='conflict';reason='Would replace the final '+field+' reading in the calculated summary; review as a possible correction.';break;}
        }
        return {entry:e,status,reason};
      });
      return {...c,current,memoryStatus,status:memoryStatus==='unchanged'&&entries.some(e=>e.status==='new')?'ready':memoryStatus,entryPreview:entries,entriesGuard:JSON.stringify(p?.entries||[]),contextGuard:passageContextGuard(p)};
    });
  }
  function apply(row,p,options={}){
    if(!p||p.deleted||p.id!==row.id)throw new Error('Passage unavailable.');
    if(JSON.stringify(memory(p))!==JSON.stringify(row.current)||JSON.stringify(p.entries||[])!==row.entriesGuard||passageContextGuard(p)!==row.contextGuard)throw new Error('This passage changed after preview. Preview the batch again.');
    if(options.memory!==false){
      if(row.narrative){p.captainsNarrative={text:row.narrative,status:'draft',origin:'batch',updatedAt:new Date().toISOString()};}
      p.tags=tags([...(p.tags||[]),...row.tags]);
      p.enrichmentSources=p.enrichmentSources||[];
      for(const s of row.sources){if(!p.enrichmentSources.some(old=>JSON.stringify(old)===JSON.stringify(s)))p.enrichmentSources.push(clone(s));}
    }
    const requested=options.entryIds||row.entryPreview.filter(e=>e.status==='new').map(e=>e.entry.id);
    const allowed=new Map(row.entryPreview.filter(e=>e.status==='new').map(e=>[e.entry.id,e.entry]));
    if(requested.some(id=>!allowed.has(id)))throw new Error('An entry needs review and cannot be imported.');
    p.entries=p.entries||[];
    const added=requested.map(id=>clone(allowed.get(id)));p.entries.push(...added);
    return added;
  }
  function aiContext(p){
    return {date:p.plan?.date,timeZone:p.plan?.timeZone,route:{from:p.plan?.from,via:p.plan?.transitPorts,to:p.plan?.to},crew:p.plan?.crew,
      dailySummaries:(p.plan?.dailySummaries||[]).filter(d=>!d.deleted).map(d=>({date:d.date,notes:d.notes})),
      observations:(p.entries||[]).filter(e=>!e.deleted).map(e=>({time:e.time,leg:e.leg,notes:e.notes,environment:e.engineStartEnv})),
      recordedDeparture:p.plan?.engineStartEnv,planningOnly:{weather:p.plan?.weather,tides:p.plan?.tideStations,currents:p.plan?.currents},completionNotes:p.finish?.notes};
  }
  const api={tags,extract,migrate,memory,preview,apply,aiContext,stripSources};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.STEELER=root.STEELER||{};root.STEELER.enrichment=api;
})(typeof window==='undefined'?globalThis:window);
