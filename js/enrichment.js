// Passage memories are additive to the operational log. No numeric data is imported here.
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
      clean:text.replace(match[0],'').replace(/^(?:Deck-log|Logbook) enrichment — Batch \d+\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trim()};
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
      const found=extract(ds.notes);if(!found)continue;
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
    return changed;
  }
  function memory(p){return {narrative:p.captainsNarrative?.text||'',tags:tags(p.tags||[])};}
  function candidates(file){
    if(file?.format!=='steeler-data-backup'||!Array.isArray(file.data?.passages))throw new Error('Choose a STEELER data backup containing enrichment.');
    const seen=new Set();
    return file.data.passages.filter(p=>p&&!p.deleted).map(raw=>{
      if(!raw.id||seen.has(raw.id))throw new Error('The file contains missing or duplicate passage identifiers.');seen.add(raw.id);
      const p=clone(raw);migrate(p);
      return {id:p.id,date:p.plan?.date||'',from:p.plan?.from||'',to:p.plan?.to||'',...memory(p),sources:p.enrichmentSources||[]};
    }).filter(p=>p.narrative||p.tags.length);
  }
  function preview(file,passages){
    const byId=new Map(passages.map(p=>[p.id,p]));
    return candidates(file).map(c=>{
      const p=byId.get(c.id);const current=p&&!p.deleted?memory(p):null;
      const mergedTags=tags([...(current?.tags||[]),...c.tags]);
      const status=!current?'unavailable':current.narrative&&c.narrative&&current.narrative!==c.narrative?'conflict':current.narrative===(c.narrative||current.narrative)&&JSON.stringify(current.tags)===JSON.stringify(mergedTags)?'unchanged':'ready';
      return {...c,current,status};
    });
  }
  function apply(row,p){
    if(!p||p.deleted||p.id!==row.id)throw new Error('Passage unavailable.');
    if(JSON.stringify(memory(p))!==JSON.stringify(row.current))throw new Error('This passage changed after preview. Preview the batch again.');
    if(row.narrative){p.captainsNarrative={text:row.narrative,status:'draft',origin:'batch',updatedAt:new Date().toISOString()};}
    p.tags=tags([...(p.tags||[]),...row.tags]);
    p.enrichmentSources=p.enrichmentSources||[];
    for(const s of row.sources){if(!p.enrichmentSources.some(old=>JSON.stringify(old)===JSON.stringify(s)))p.enrichmentSources.push(clone(s));}
  }
  function aiContext(p){
    return {date:p.plan?.date,timeZone:p.plan?.timeZone,route:{from:p.plan?.from,via:p.plan?.transitPorts,to:p.plan?.to},crew:p.plan?.crew,
      dailySummaries:(p.plan?.dailySummaries||[]).filter(d=>!d.deleted).map(d=>({date:d.date,notes:d.notes})),
      observations:(p.entries||[]).filter(e=>!e.deleted).map(e=>({time:e.time,leg:e.leg,notes:e.notes,environment:e.engineStartEnv})),
      recordedDeparture:p.plan?.engineStartEnv,planningOnly:{weather:p.plan?.weather,tides:p.plan?.tideStations,currents:p.plan?.currents},completionNotes:p.finish?.notes};
  }
  const api={tags,extract,migrate,memory,preview,apply,aiContext};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.STEELER=root.STEELER||{};root.STEELER.enrichment=api;
})(typeof window==='undefined'?globalThis:window);
