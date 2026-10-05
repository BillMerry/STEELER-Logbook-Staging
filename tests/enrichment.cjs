const assert=require('node:assert/strict');
const fs=require('node:fs');
const E=require('../js/enrichment.js');
const clone=v=>JSON.parse(JSON.stringify(v));
const legacy={id:'p',plan:{date:'2025-04-01',dailySummaries:[{id:'d',date:'2025-04-01',notes:'Lunch with friends.\n\nDeck-log enrichment — Batch 01\nCaptain’s Narrative: We went for lunch.\nSuggested tags: friends; Lunch.\nSource: Book 6 / April.pdf.\nBill added a note afterwards.'}]},entries:[{id:'e',engineHoursEnd:'123.4',waterLog:'9.2'}],finish:{engineHoursEnd:'123.4'}};
const conditions=E.aiContext({entries:[{windDir:'SW',windBft:'0',seaState:'0'}]}).observations[0].environment;
assert.deepEqual(conditions,{windDir:'SW',windBft:'0',seaStateDouglas:'0'});
const saved=clone(legacy);assert.equal(E.migrate(legacy),true);assert.equal(legacy.captainsNarrative.text,'We went for lunch.');assert.deepEqual(legacy.tags,['friends','Lunch']);assert.match(legacy.plan.dailySummaries[0].notes,/Lunch with friends/);assert.match(legacy.plan.dailySummaries[0].notes,/Bill added a note afterwards/);assert.equal(legacy.enrichmentSources[0].originalNotes,saved.plan.dailySummaries[0].notes);assert.deepEqual(legacy.entries,saved.entries);assert.equal(E.migrate(legacy),false);
const deleted={...clone(saved),deleted:true};assert.equal(E.migrate(deleted),false);assert.deepEqual(deleted.plan,saved.plan);
const edited=clone(saved);edited.captainsNarrative={text:'My edited version',status:'reviewed'};assert.equal(E.migrate(edited),false);assert.match(edited.plan.dailySummaries[0].notes,/Captain’s Narrative/);
const cleanup={id:'p_hist_steeler_2025-03-27',plan:{dailySummaries:[{id:'d',notes:'Paper return logs read 0.98 through water and 1.11 GPS, unlike the backup’s 1 and 0.55; held for review, not changed.\nMy own note.'}]},entries:[{groundLog:'1.11'}]};E.migrate(cleanup);assert.equal(cleanup.plan.dailySummaries[0].notes,'My own note.');assert.equal(cleanup.entries[0].groundLog,'1.11');
const file={format:'steeler-data-backup',data:{passages:[legacy,clone(legacy)]}};assert.throws(()=>E.preview(file,[]),/duplicate/);file.data.passages=[legacy];
const local={id:'p',plan:{date:'2025-04-01'},entries:[{engineHoursEnd:'555.5'}],captainsNarrative:{text:'Locally edited',status:'reviewed'},tags:['mine']};
let preview=E.preview(file,[local]);assert.equal(preview[0].status,'conflict');assert.equal(E.preview(file,[{...local,deleted:true}])[0].status,'unavailable');
const beforeLocal=clone(local);E.apply(preview[0],local);assert.deepEqual(local.entries,beforeLocal.entries);assert.deepEqual(local.tags,['mine','friends','Lunch']);assert.equal(E.preview(file,[local])[0].status,'unchanged');
preview=E.preview(file,[local]);local.captainsNarrative.text='Edited during preview';assert.throws(()=>E.apply(preview[0],local),/changed after preview/);
(async()=>{
 const browser=await require('./dom-harness.cjs').launch();const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765');
 const result=await page.evaluate(()=>{
   const eru={id:'eru',plan:{date:'2026-01-01',timeZone:'UTC',engineHoursStart:'100.1',dailySummaries:[]},entries:[{id:'start',time:'2026-01-01T10:00',entryType:'engine-start'},{id:'end',time:'2026-01-01T10:30',entryType:'shutdown'}],finish:{engineHoursEnd:'100.6',shutdownLogged:true},legEnds:[{engineHoursEnd:'100.6'}]};
   const m=computeLegMetricsFromEntries(eru,0),s=computePassageLogSummary(eru),l=computeLegLogSummary(eru,0);
   eru.finish.shutdownLogged=false;const status=getPassageDashboardStatus(eru);
   const underway={...eru,entries:[{time:'2026-01-01T10:10',entryType:'slip'},{time:'2026-01-01T10:40',entryType:'dock'}]};
   passages=[eru];currentPassageId='eru';savePassages();resetPassageUndo();loadPassageIntoUI();
   document.getElementById('captainsNarrative').value='An engine run alongside.';document.getElementById('passageTags').value='maintenance, NMEA';saveNarrativeEditor(true);
   const marked=passages[0].captainsNarrative.status;const backup=createDataBackupPayload();
   applyPassageUndo();const undone=!passages[0].captainsNarrative?.text;applyPassageUndo(true);const redone=passages[0].captainsNarrative.text;
   homePassageSearch.value='NMEA';const search=passageMatchesHomeSearch(passages[0]);
   const persisted=JSON.parse(storage.getItem(STORAGE_KEY))[0].captainsNarrative.text;
   return {duration:m.durationMinutes,summary:s.durationText,eh:s.ehText,legEh:l.ehText,status,underway:computeLegMetricsFromEntries(underway,0).durationMinutes,whole:validatedEngineHoursText('100','101'),zero:validatedEngineHoursText('100.0','100.0'),marked,backup:backup.data.passages[0].captainsNarrative.text,undone,redone,search,persisted};
 });
 assert.equal(result.duration,null);assert.equal(result.summary,'–');assert.equal(result.eh,'0.5 h');assert.equal(result.legEh,'0.5 h');assert.equal(result.status,'ERU');assert.equal(result.underway,30);assert.equal(result.whole,'100→101');assert.equal(result.zero,'0.0 h');assert.equal(result.marked,'reviewed');assert.ok(result.undone);assert.equal(result.redone,'An engine run alongside.');assert.equal(result.backup,result.redone);assert.equal(result.persisted,result.redone);assert.ok(result.search);
 const preferences=await page.evaluate(async()=>{
   const initial=narrativePreferences();document.getElementById('narrativePref_background').value='Bill and STEELER';document.getElementById('saveNarrativePreferences').click();
   const backup=JSON.parse(JSON.stringify(createDataBackupPayload()));
   localStorage.setItem(NARRATIVE_PREFS_KEY,JSON.stringify({background:'Changed locally',style:'',terminology:''}));
   await applyFullDataCloudCopy({backup,record:{payload:{backup}}},nowIso());
   return {initial,backup:backup.data.settings.narrativePreferences.background,restored:narrativePreferences().background,field:document.getElementById('narrativePref_background').value};
 });
 assert.equal(preferences.initial,null);assert.equal(preferences.backup,'Bill and STEELER');assert.equal(preferences.restored,preferences.backup);assert.equal(preferences.field,preferences.backup);
 const cloudMigration=await page.evaluate(async()=>{
   // A legacy cloud copy must verify before migration changes its notes.
   const backup=JSON.parse(JSON.stringify(createDataBackupPayload()));
   delete backup.data.passages[0].captainsNarrative;delete backup.data.passages[0].tags;
   backup.data.passages[0].plan.dailySummaries=[{id:'cloud-day',date:'2026-01-01',fee:'',overnightOnBoard:false,notes:'Deck-log enrichment — Batch 01\nCaptain’s Narrative: An engine run alongside.\nSuggested tags: maintenance.'}];
   await applyFullDataCloudCopy({backup,record:{payload:{backup}}},nowIso());
   return {text:passages[0].captainsNarrative.text,dirty:passages[0].syncDirty};
 });
 assert.equal(cloudMigration.text,'An engine run alongside.');assert.equal(cloudMigration.dirty,true);
 await page.reload();assert.equal(await page.evaluate(()=>passages[0].captainsNarrative.text),'An engine run alongside.');assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: enrichment migration, source preservation, deletion exclusion, conflict checks, numeric preservation, ERU, validated hours, narrative editing/search/backup/reload and undo/redo');
})().catch(e=>{console.error(e);process.exitCode=1;});
