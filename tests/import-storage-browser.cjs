const fs=require('fs'),assert=require('node:assert/strict'),{webkit}=require('@playwright/test');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765/';
(async()=>{const browser=await webkit.launch();try{
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const page=await context.newPage();const alerts=[],errors=[];page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 let backup,batch;
 if(process.env.STEELER_TEST_BACKUP){backup=JSON.parse(fs.readFileSync(process.env.STEELER_TEST_BACKUP));batch=JSON.parse(fs.readFileSync(process.env.STEELER_TEST_BATCH));}
 else {
  backup={format:'steeler-data-backup',data:{passages:Array.from({length:503},(_,i)=>({id:'p'+i,plan:{date:'2024-09-28',from:'Lymington',to:'Lymington',timeZone:'Europe/London',transitPorts:[{name:'Keyhaven Lake'}],dailySummaries:[{id:'d'+i,date:'2024-09-28',notes:'Historical observation. '.repeat(110)}]},entries:Array.from({length:6},(_,j)=>({id:`e${i}-${j}`,leg:0,time:`2024-09-28T10:0${j}`,notes:'Recorded conditions. '.repeat(18),waterLog:String(j)}))}))}};
  batch={format:'steeler-enrichment-batch',version:1,batchId:'storage-test',passages:[{id:'p0',narrative:'We enjoyed a quiet passage.',tags:['sea'],entries:[{sourceId:'weather-test',leg:0,time:'2024-09-28T10:30',notes:'Wind SW3',windDir:'SW',windBft:'3'}],enrichmentSources:[{originalNotes:'Seals at the entrance. Forecast was rain; visibility was good.'}]}]};
 }
 const id=batch.passages[0].id;
 await page.evaluate(({backup,id})=>{restoreDataBackupObject(backup,{skipConfirm:true,silent:true});selectHomePassage(passages.find(p=>p.id===id));switchToTab('settingsTab');resetPassageUndo();}, {backup,id});
 const before=await page.evaluate(()=>({raw:storage.getItem(STORAGE_KEY),passages:JSON.stringify(passages),compressed:localStorage.getItem(STORAGE_KEY).length,plain:storage.getItem(STORAGE_KEY).length}));
 assert.ok(before.compressed<before.plain/2);assert.deepEqual(alerts,[]);
 await page.locator('#settingsNarrativesCard [data-settings-toggle]').click();await page.locator('.enrichment-settings > summary').click();
 const preview=async()=>page.locator('#enrichmentFile').setInputFiles({name:'batch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(batch))});await preview();
 // Simulate a stale hidden form and a genuine failed canonical save.
 await page.evaluate(()=>{planFrom.value='';planTo.value='';window.testOriginalSetItem=storage.setItem;storage.setItem=function(k,v){if(k===STORAGE_KEY)throw new DOMException('Test storage full','QuotaExceededError');return window.testOriginalSetItem(k,v);};});
 await page.getByRole('button',{name:'Apply selected enrichment',exact:true}).click();
 assert.ok(alerts.some(t=>/could not be saved/.test(t)));assert.equal(await page.evaluate(()=>storage.getItem(STORAGE_KEY)),before.raw);
 assert.equal(await page.evaluate(()=>JSON.stringify(passages)),before.passages);assert.equal(await page.evaluate(()=>getCurrentPassage().plan.from),JSON.parse(before.passages).find(p=>p.id===id).plan.from);
 await page.evaluate(()=>{storage.setItem=window.testOriginalSetItem;});alerts.length=0;await preview();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Apply selected enrichment',exact:true}).click();await dl;
 assert.match(await page.locator('#enrichmentPreview').textContent(),/Applied to/);assert.deepEqual(alerts,[]);
 const after=await page.evaluate(()=>({passages,context:STEELER.enrichment.aiContext(getCurrentPassage()),backup:createDataBackupPayload({flush:false,normalize:false})}));
 const old=JSON.parse(before.passages);for(const p of old){const q=after.passages.find(q=>q.id===p.id);assert.deepEqual(q.plan,p.plan);assert.deepEqual(q.finish,p.finish);assert.deepEqual(q.legEnds,p.legEnds);assert.deepEqual(q.entries.slice(0,p.entries.length),p.entries);}
 assert.ok(after.context.historicalSourceNotes.length);assert.deepEqual(after.context.historicalSourceNotes.map(s=>s.transcription),after.passages.find(p=>p.id===id).enrichmentSources.map(s=>s.originalNotes));
 assert.equal(after.backup.data.passages.length,503);assert.equal(after.backup.data.passages.find(p=>p.id===id).captainsNarrative.text,batch.passages[0].narrative);
 await page.locator('#undoPassageBtn').click();assert.equal(await page.evaluate(()=>getCurrentPassage().captainsNarrative?.text||''),'');await page.locator('#redoPassageBtn').click();
 await page.reload();await page.evaluate(id=>{selectHomePassage(passages.find(p=>p.id===id));},id);assert.equal(await page.evaluate(()=>getCurrentPassage().captainsNarrative.text),batch.passages[0].narrative);
 assert.deepEqual(errors,[]);console.log('PASS: 503-record dataset, compressed storage',before.compressed,'vs',before.plain,'characters; failed import rollback, hidden form protection, successful import, preserved records, AI source context, undo/redo and reload');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
